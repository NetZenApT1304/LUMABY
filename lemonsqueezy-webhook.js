// netlify/functions/lemonsqueezy-webhook.js
// Handles Lemon Squeezy webhook events and updates Supabase

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Verify Lemon Squeezy webhook signature
  const secret = process.env.WEBHOOK_SECRET;
  const signature = event.headers['x-signature'];
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(event.body).digest('hex');

  if (signature !== digest) {
    console.error('[Lumaby] Invalid webhook signature');
    return { statusCode: 401, body: 'Invalid signature' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const eventName = payload.meta?.event_name;
  const data = payload.data?.attributes;
  const userId = payload.meta?.custom_data?.user_id;

  console.log('[Lumaby] Webhook event:', eventName, 'userId:', userId);

  if (!userId) {
    console.warn('[Lumaby] No user_id in webhook payload');
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  // Strict allowlist of accepted events
  const ALLOWED_EVENTS = [
    'order_created',
    'subscription_created',
    'subscription_updated',
    'subscription_resumed',
    'subscription_cancelled',
    'subscription_expired',
    'subscription_payment_success',
    'subscription_payment_failed',
  ];

  if (!ALLOWED_EVENTS.includes(eventName)) {
    console.log('[Lumaby] Ignored event:', eventName);
    return { statusCode: 200, body: JSON.stringify({ received: true, ignored: true }) };
  }

  try {
    switch (eventName) {
      case 'order_created':
      case 'subscription_created':
      case 'subscription_updated':
      case 'subscription_resumed': {
        const status = data?.status === 'active' || data?.status === 'on_trial' ? 'active' : data?.status;
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          ls_subscription_id: payload.data?.id?.toString(),
          ls_customer_id: data?.customer_id?.toString(),
          status: status || 'active',
          plan: data?.variant_name?.toLowerCase().includes('year') ? 'yearly' : 'monthly',
          current_period_start: data?.created_at || new Date().toISOString(),
          current_period_end: data?.ends_at || data?.renews_at || null,
          cancel_at_period_end: data?.cancelled || false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        console.log('[Lumaby] Premium activated for user:', userId);
        break;
      }

      case 'subscription_cancelled':
      case 'subscription_expired': {
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        console.log('[Lumaby] Premium cancelled for user:', userId);
        break;
      }

      case 'subscription_payment_success': {
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          status: 'active',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        break;
      }

      case 'subscription_payment_failed': {
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          status: 'past_due',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        break;
      }

      default:
        console.log('[Lumaby] Unhandled event:', eventName);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('[Lumaby] Webhook error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
