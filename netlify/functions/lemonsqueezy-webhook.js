// netlify/functions/lemonsqueezy-webhook.js
// Handles Lemon Squeezy webhook events and updates Supabase.
//
// Any failure to record an event returns a non-2xx status so Lemon Squeezy
// retries it, and so it shows as failed in the Lemon Squeezy dashboard where
// it can be resent by hand.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SUBSCRIPTION_EVENTS = [
  'subscription_created',
  'subscription_updated',
  'subscription_resumed',
  'subscription_unpaused',
  'subscription_paused',
  'subscription_cancelled',
  'subscription_expired',
];

const INVOICE_EVENTS = [
  'subscription_payment_success',
  'subscription_payment_failed',
];

// Lemon Squeezy subscription status -> subscriptions.status
const STATUS_MAP = {
  on_trial: 'trialing',
  active: 'active',
  paused: 'paused',
  past_due: 'past_due',
  unpaid: 'unpaid',
  cancelled: 'cancelled', // will not renew; premium lasts until expires_at
  expired: 'expired',
};

// Variant names are often just "Default", so look at the product name too.
function planFrom(attrs) {
  const label = `${attrs.product_name || ''} ${attrs.variant_name || ''}`.toLowerCase();
  return /year|annual/.test(label) ? 'yearly' : 'monthly';
}

const json = (statusCode, body) => ({ statusCode, body: JSON.stringify(body) });

function verifySignature(rawBody, signature, secret) {
  if (!signature || typeof signature !== 'string') return false;
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex'),
    'utf8'
  );
  const received = Buffer.from(signature, 'utf8');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Throws if Supabase returned an error, so the handler answers 500 and
// Lemon Squeezy retries instead of the event being lost.
function check({ error }, what) {
  if (error) {
    const err = new Error(`${what}: ${error.message}`);
    err.cause = error;
    throw err;
  }
}

async function findUserIdBySubscription(lsSubscriptionId) {
  if (!lsSubscriptionId) return null;
  const res = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('ls_subscription_id', lsSubscriptionId)
    .maybeSingle();
  check(res, 'Lookup by ls_subscription_id failed');
  return res.data?.user_id || null;
}

// Same rule the app uses to decide whether a user has Premium.
function grantsPremium(status, expiresAt) {
  const notExpired = !expiresAt || new Date(expiresAt) > new Date();
  if (status === 'active' || status === 'trialing') return notExpired;
  if (status === 'cancelled') return !!expiresAt && notExpired;
  return false;
}

async function getCurrentSubscription(userId) {
  const res = await supabase
    .from('subscriptions')
    .select('ls_subscription_id, provider, status, expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  check(res, 'Lookup of current subscription failed');
  return res.data || null;
}

// Each user has one subscription row. An event about a *different*
// subscription than the one on file must not take Premium away while the
// one on file still grants it, e.g. an old monthly plan expiring after the
// user has switched to yearly.
function isStaleEvent(current, lsSubscriptionId, incomingGrantsPremium) {
  if (!current) return false;
  // Premium bought through Google Play is never replaced by a Lemon Squeezy
  // event that doesn't grant Premium.
  if (current.provider === 'play') return grantsPremium(current.status, current.expires_at) && !incomingGrantsPremium;
  if (!current.ls_subscription_id) return false;
  if (current.ls_subscription_id === lsSubscriptionId) return false;
  return grantsPremium(current.status, current.expires_at) && !incomingGrantsPremium;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Lumaby] WEBHOOK_SECRET is not set');
    return json(500, { error: 'Webhook not configured' });
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : event.body || '';
  const headers = event.headers || {};
  const signature = headers['x-signature'] || headers['X-Signature'];

  if (!verifySignature(rawBody, signature, secret)) {
    console.error('[Lumaby] Invalid webhook signature');
    return { statusCode: 401, body: 'Invalid signature' };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const eventName = payload.meta?.event_name;
  const attrs = payload.data?.attributes || {};

  if (!SUBSCRIPTION_EVENTS.includes(eventName) && !INVOICE_EVENTS.includes(eventName)) {
    // Includes order_created: for subscription products the subscription_*
    // events carry the state we need, and the order id is not a subscription id.
    console.log('[Lumaby] Ignored event:', eventName);
    return json(200, { received: true, ignored: true });
  }

  // For subscription events data.id is the subscription; for invoice events
  // the subscription id is an attribute of the invoice.
  const lsSubscriptionId = (
    SUBSCRIPTION_EVENTS.includes(eventName) ? payload.data?.id : attrs.subscription_id
  )?.toString();

  try {
    let userId = payload.meta?.custom_data?.user_id || null;
    if (!userId) userId = await findUserIdBySubscription(lsSubscriptionId);

    console.log('[Lumaby] Webhook event:', eventName, 'userId:', userId, 'subscription:', lsSubscriptionId);

    if (!userId) {
      // Non-2xx so the event is marked failed in Lemon Squeezy and can be
      // resent once the subscription is linked to a user.
      console.error('[Lumaby] Could not resolve user for subscription', lsSubscriptionId);
      return json(422, { error: 'No user_id for this subscription' });
    }

    if (SUBSCRIPTION_EVENTS.includes(eventName)) {
      const status = STATUS_MAP[attrs.status];
      if (!status) throw new Error(`Unknown Lemon Squeezy status: ${attrs.status}`);

      // ends_at is set once the subscription is cancelled (end of the paid
      // period) or expired; while it renews normally it is null.
      const endsAt = attrs.ends_at || null;

      const current = await getCurrentSubscription(userId);
      if (isStaleEvent(current, lsSubscriptionId, grantsPremium(status, endsAt))) {
        console.log('[Lumaby] Ignored', eventName, 'for old subscription', lsSubscriptionId,
          '- user has active subscription', current.ls_subscription_id);
        return json(200, { received: true, ignored: 'stale_subscription' });
      }

      const res = await supabase.from('subscriptions').upsert({
        user_id: userId,
        provider: 'lemonsqueezy',
        play_purchase_token: null,
        play_product_id: null,
        ls_subscription_id: lsSubscriptionId,
        ls_customer_id: attrs.customer_id?.toString() || null,
        status,
        plan: planFrom(attrs),
        current_period_start: attrs.created_at || null,
        current_period_end: endsAt || attrs.renews_at || null,
        expires_at: endsAt,
        cancel_at_period_end: status === 'cancelled' || attrs.cancelled === true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      check(res, 'Subscription upsert failed');
      console.log('[Lumaby] Subscription', status, 'for user:', userId);
    } else {
      // Invoice events. subscription_updated follows with the full state,
      // so only the status is touched here.
      // Invoice events only carry a status, so never let one for a different
      // subscription replace the one on file while that one grants Premium.
      const current = await getCurrentSubscription(userId);
      if (isStaleEvent(current, lsSubscriptionId, false)) {
        console.log('[Lumaby] Ignored', eventName, 'for old subscription', lsSubscriptionId,
          '- user has active subscription', current.ls_subscription_id);
        return json(200, { received: true, ignored: 'stale_subscription' });
      }
      // Invoice events never touch a Google Play subscription row.
      if (current?.provider === 'play') return json(200, { received: true, ignored: 'play_subscription' });

      // A successful payment only changes the status when it recovers a
      // failed one. Otherwise it would mark trials as active: Lemon Squeezy
      // sends payment_success for the $0 invoice that starts a trial.
      let status;
      if (eventName === 'subscription_payment_failed') {
        status = 'past_due';
      } else if (current && ['past_due', 'unpaid'].includes(current.status)) {
        status = 'active';
      } else {
        console.log('[Lumaby] Payment success, status unchanged for user:', userId);
        return json(200, { received: true });
      }

      const res = await supabase.from('subscriptions').upsert({
        user_id: userId,
        ls_subscription_id: lsSubscriptionId,
        status,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      check(res, 'Payment status upsert failed');
      console.log('[Lumaby] Payment', status, 'for user:', userId);
    }

    return json(200, { received: true });
  } catch (err) {
    console.error('[Lumaby] Webhook error:', err);
    return json(500, { error: 'Failed to process webhook' });
  }
};
