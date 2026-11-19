// netlify/functions/play-verify.js
// The Android app calls this after a Google Play purchase, and on every app
// open for existing purchases (renewals, restoring on a new phone). It checks
// the purchase with Google and saves it as the user's subscription.
//   POST { purchaseToken, productId }   Authorization: Bearer <Supabase access token>
const { createClient } = require('@supabase/supabase-js');
const { verifyAndSave } = require('../lib/play');

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  const jwt = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { error: 'Sign in first' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad JSON' }); }
  const token = typeof body.purchaseToken === 'string' ? body.purchaseToken.trim() : '';
  if (!token || token.length > 4096) return json(400, { error: 'purchaseToken required' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: { user } = {}, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return json(401, { error: 'Sign in first' });

  try {
    const result = await verifyAndSave(supabase, user.id, token);
    console.log('[Lumaby] Play purchase', result.status, 'for user', user.id);
    return json(200, result);
  } catch (e) {
    const map = { invalid_token: 400, wrong_product: 400, token_in_use: 409, not_configured: 503 };
    if (map[e.code]) return json(map[e.code], { error: e.code });
    console.error('[Lumaby] play-verify failed:', e.message || e);
    return json(502, { error: 'Could not check the purchase with Google Play' });
  }
}
exports.handler = handler;
