// Google Play billing: check a subscription with Google and turn it into
// Lumaby's subscriptions row. Used by play-verify (after a purchase / on app
// open) and play-refresh (daily).
//
// Needs env GOOGLE_PLAY_SERVICE_ACCOUNT: the JSON key of a Google Cloud
// service account that has access to the app in Play Console (Users and
// permissions → invite the service account → "View financial data" and
// "Manage orders and subscriptions").
const crypto = require('crypto');

const PACKAGE = 'com.lumaby.app';
const PRODUCTS = { premium_monthly: 'monthly', premium_yearly: 'yearly' };
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const DAY = 86400000;
// While a subscription renews, Premium lasts this long past the current
// period, so a renewal never lapses before the daily refresh sees it.
const RENEW_BUFFER = 3 * DAY;

// ── Google auth (service account → access token) ──
let cachedToken = null;
const b64url = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
async function googleAccessToken(sa = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT || 'null')) {
  if (!sa) throw Object.assign(new Error('GOOGLE_PLAY_SERVICE_ACCOUNT is not set'), { code: 'not_configured' });
  if (cachedToken && cachedToken.exp > Date.now() + 60000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = b64url(crypto.createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${sig}` }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Google auth failed: ' + (j.error_description || j.error || r.status));
  cachedToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

async function playFetch(path, init = {}) {
  const token = await googleAccessToken();
  const r = await fetch(API + path, { ...init, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text ? JSON.parse(text) : {} };
}
// https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2
const getSubscription = token => playFetch(`/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`);
const acknowledge = (productId, token) =>
  playFetch(`/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`, { method: 'POST', body: '{}' });

// ── Google's subscription → our row ──
const STATE = {
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'active',   // payment retrying; Google says keep access
  SUBSCRIPTION_STATE_ON_HOLD: 'past_due',          // payment failed; no access
  SUBSCRIPTION_STATE_PAUSED: 'paused',
  SUBSCRIPTION_STATE_CANCELED: 'cancelled',        // access until the end of the period
  SUBSCRIPTION_STATE_EXPIRED: 'expired',
  SUBSCRIPTION_STATE_PENDING: 'free',              // payment not finished yet
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'expired',
};
function ourLineItem(sub) { return (sub.lineItems || []).find(li => PRODUCTS[li.productId]); }
function toRow(sub, token) {
  const li = ourLineItem(sub);
  if (!li) return null;
  const status = STATE[sub.subscriptionState] || 'expired';
  const expiry = li.expiryTime ? Date.parse(li.expiryTime) : null;
  const renews = !!li.autoRenewingPlan?.autoRenewEnabled;
  const trial = /trial/i.test(li.offerDetails?.offerId || '') || (li.offerDetails?.offerTags || []).some(t => /trial/i.test(t));
  return {
    provider: 'play',
    play_purchase_token: token,
    play_product_id: li.productId,
    ls_subscription_id: null,
    ls_customer_id: null,
    status: status === 'active' && trial ? 'trialing' : status,
    plan: PRODUCTS[li.productId],
    current_period_start: sub.startTime || null,
    current_period_end: expiry ? new Date(expiry).toISOString() : null,
    expires_at: expiry ? new Date(expiry + (status === 'active' && renews ? RENEW_BUFFER : 0)).toISOString() : null,
    cancel_at_period_end: !renews,
    updated_at: new Date().toISOString(),
  };
}
// Same rule as has_premium() in the database.
function grantsPremium(row) {
  const exp = row.expires_at ? Date.parse(row.expires_at) : null;
  return (['active', 'trialing'].includes(row.status) && (!exp || exp > Date.now())) || (row.status === 'cancelled' && exp > Date.now());
}

// Check `token` with Google and save it for `userId`.
// Returns { premium, status } or throws { code } for the caller to report.
async function verifyAndSave(supabase, userId, token) {
  const r = await getSubscription(token);
  if (r.status === 404 || r.status === 400 || r.status === 410) throw Object.assign(new Error('Unknown purchase'), { code: 'invalid_token' });
  if (!r.ok) throw new Error('Google Play API ' + r.status + ': ' + JSON.stringify(r.body).slice(0, 200));
  const sub = r.body;
  const row = toRow(sub, token);
  if (!row) throw Object.assign(new Error('Not a Lumaby subscription'), { code: 'wrong_product' });

  // One purchase, one account.
  const owner = await supabase.from('subscriptions').select('user_id').eq('play_purchase_token', token).maybeSingle();
  if (owner.error) throw owner.error;
  if (owner.data && owner.data.user_id !== userId) throw Object.assign(new Error('Purchase belongs to another account'), { code: 'token_in_use' });

  // Never replace a Lemon Squeezy subscription that still gives Premium.
  const cur = await supabase.from('subscriptions').select('*').eq('user_id', userId).maybeSingle();
  if (cur.error) throw cur.error;
  if (cur.data && cur.data.provider !== 'play' && grantsPremium(cur.data) && !grantsPremium(row)) {
    return { premium: true, status: cur.data.status, kept: 'lemonsqueezy' };
  }
  // An older Play purchase replaced by this one (upgrade/resubscribe) is fine;
  // a different, still-valid Play purchase is kept if the new one isn't valid.
  if (cur.data && cur.data.provider === 'play' && cur.data.play_purchase_token !== token && grantsPremium(cur.data) && !grantsPremium(row)) {
    return { premium: true, status: cur.data.status, kept: 'play' };
  }

  const up = await supabase.from('subscriptions').upsert({ user_id: userId, ...row }, { onConflict: 'user_id' });
  if (up.error) throw up.error;

  // Google refunds purchases not acknowledged within 3 days.
  const li = ourLineItem(sub);
  if (sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' && ['active', 'trialing'].includes(row.status)) {
    const ack = await acknowledge(li.productId, token);
    if (!ack.ok) console.error('[Lumaby] Play acknowledge failed:', ack.status, JSON.stringify(ack.body).slice(0, 200));
  }
  return { premium: grantsPremium(row), status: row.status };
}

module.exports = { PACKAGE, PRODUCTS, toRow, grantsPremium, verifyAndSave, getSubscription, googleAccessToken, _reset: () => { cachedToken = null; } };
