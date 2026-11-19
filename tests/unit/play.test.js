// Google Play billing server (play-verify, play-refresh) against the real
// Supabase project, with Google's APIs simulated.
//   node tests/unit/play.test.js
// Needs the Supabase management token (env SUPABASE_ACCESS_TOKEN, or the
// session proxy injects it), used to read the service key for this run.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const REF = 'pduixzudfizustabthwu', URL = `https://${REF}.supabase.co`;
let pass = 0, fail = 0;
const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); };
const DAY = 86400000, stamp = Date.now();

// ── Simulated Google ──
const google = {}; const acks = [];
const realFetch = global.fetch;
global.fetch = async (url, init = {}) => {
  url = String(url);
  if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
  const m = url.match(/applications\/com\.lumaby\.app\/purchases\/(subscriptionsv2\/tokens\/([^/:]+)|subscriptions\/([^/]+)\/tokens\/([^:]+):acknowledge)$/);
  if (m) {
    if (m[3]) { acks.push(decodeURIComponent(m[4])); return new Response('{}', { status: 200 }); }
    const sub = google[decodeURIComponent(m[2])];
    return sub ? new Response(JSON.stringify(sub), { status: 200 }) : new Response('{"error":{"code":404}}', { status: 404 });
  }
  return realFetch(url, init);
};
const playSub = ({ state = 'SUBSCRIPTION_STATE_ACTIVE', product = 'premium_monthly', days = 30, renew = true, ack = 'ACKNOWLEDGEMENT_STATE_PENDING', offer } = {}) => ({
  subscriptionState: state, acknowledgementState: ack, startTime: new Date().toISOString(),
  lineItems: [{ productId: product, expiryTime: new Date(Date.now() + days * DAY).toISOString(),
    autoRenewingPlan: { autoRenewEnabled: renew }, offerDetails: offer ? { offerId: offer, offerTags: [] } : { basePlanId: 'monthly' } }],
});

(async () => {
  // service key for this run (never printed)
  const keys = await (await realFetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, { headers: process.env.SUPABASE_ACCESS_TOKEN ? { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN } : {} })).json();
  const service = keys.find(k => k.name === 'service_role')?.api_key, anon = keys.find(k => k.name === 'anon')?.api_key;
  if (!service) { console.log('could not read the service key'); process.exit(1); }
  process.env.SUPABASE_URL = URL; process.env.SUPABASE_SERVICE_KEY = service;
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT = JSON.stringify({ client_email: 'lumaby-test@example.iam.gserviceaccount.com', private_key: privateKey });

  const admin = createClient(URL, service, { auth: { persistSession: false } });
  const users = [];
  async function newUser(tag) {
    const email = `lumaby-e2e-play-${tag}-${stamp}@mailinator.com`, password = 'Play-test-123';
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    const c = createClient(URL, anon, { auth: { persistSession: false } });
    const s = await c.auth.signInWithPassword({ email, password });
    users.push(data.user.id);
    return { id: data.user.id, jwt: s.data.session.access_token, client: c };
  }
  const { handler } = require('../../netlify/functions/play-verify.js');
  const call = (jwt, body) => handler({ httpMethod: 'POST', headers: jwt ? { authorization: 'Bearer ' + jwt } : {}, body: JSON.stringify(body) })
    .then(r => ({ ...JSON.parse(r.body), http: r.statusCode }));
  const row = async id => (await admin.from('subscriptions').select('*').eq('user_id', id).maybeSingle()).data;
  const hasPremium = async u => (await u.client.rpc('has_premium', { uid: u.id })).data;

  try {
    const A = await newUser('a'), B = await newUser('b');
    const tA = `tok-a-${stamp}`; google[tA] = playSub();

    check('no sign-in -> 401', (await call(null, { purchaseToken: tA })).http === 401);
    check('missing token -> 400', (await call(A.jwt, {})).http === 400);
    let r = await call(A.jwt, { purchaseToken: tA });
    check('valid monthly purchase -> Premium', r.http === 200 && r.premium === true, JSON.stringify(r));
    let a = await row(A.id);
    const buffer = Date.parse(a.expires_at) - Date.parse(a.current_period_end);
    check('row: play, active, monthly, renewing, 3-day buffer past the period', a.provider === 'play' && a.status === 'active' && a.plan === 'monthly' && a.cancel_at_period_end === false && Math.abs(buffer - 3 * DAY) < 1000, JSON.stringify({ p: a.provider, s: a.status, buffer }));
    check('database agrees (has_premium)', await hasPremium(A) === true);
    check('purchase acknowledged with Google', acks.includes(tA));
    const w = await A.client.from('subscriptions').update({ status: 'active', expires_at: null }).eq('user_id', A.id).select();
    check('user can read their row', (await A.client.from('subscriptions').select('provider').eq('user_id', A.id).maybeSingle()).data?.provider === 'play');
    check('...but not change it', !!w.error || !w.data?.length, w.error?.message);

    r = await call(B.jwt, { purchaseToken: tA });
    check('same purchase on another account -> refused (409)', r.http === 409 && r.error === 'token_in_use', JSON.stringify(r));
    check('...and B has no Premium', await hasPremium(B) === false);

    google[`tok-wrong-${stamp}`] = playSub({ product: 'some_other_app_item' });
    check('other product -> 400', (await call(B.jwt, { purchaseToken: `tok-wrong-${stamp}` })).http === 400);
    check('unknown purchase -> 400', (await call(B.jwt, { purchaseToken: 'tok-made-up' })).http === 400);

    // cancelled: keeps Premium until the period ends
    google[tA] = playSub({ state: 'SUBSCRIPTION_STATE_CANCELED', renew: false, days: 10, ack: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' });
    r = await call(A.jwt, { purchaseToken: tA }); a = await row(A.id);
    check('cancelled -> Premium until the period ends, no buffer', r.premium === true && a.status === 'cancelled' && a.cancel_at_period_end && a.expires_at === a.current_period_end, JSON.stringify({ s: a.status }));
    // expired
    google[tA] = playSub({ state: 'SUBSCRIPTION_STATE_EXPIRED', renew: false, days: -1, ack: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' });
    r = await call(A.jwt, { purchaseToken: tA });
    check('expired -> no Premium', r.premium === false && await hasPremium(A) === false);
    // on hold (payment failed)
    google[tA] = playSub({ state: 'SUBSCRIPTION_STATE_ON_HOLD', ack: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' });
    r = await call(A.jwt, { purchaseToken: tA });
    check('payment on hold -> no Premium', r.premium === false && (await row(A.id)).status === 'past_due');
    // grace period keeps access
    google[tA] = playSub({ state: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', ack: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' });
    check('grace period -> Premium', (await call(A.jwt, { purchaseToken: tA })).premium === true);

    // trial
    const tB = `tok-b-${stamp}`; google[tB] = playSub({ product: 'premium_yearly', days: 7, offer: 'free-trial-7d' });
    r = await call(B.jwt, { purchaseToken: tB }); let b = await row(B.id);
    check('yearly free trial -> trialing, Premium', r.premium === true && b.status === 'trialing' && b.plan === 'yearly', JSON.stringify({ s: b.status, p: b.plan }));

    // a valid Lemon Squeezy subscription is never replaced by a dead Play purchase
    const C = await newUser('c');
    await admin.from('subscriptions').insert({ user_id: C.id, provider: 'lemonsqueezy', ls_subscription_id: 'ls-' + stamp, status: 'active', plan: 'monthly' });
    google[`tok-c-${stamp}`] = playSub({ state: 'SUBSCRIPTION_STATE_EXPIRED', days: -5, renew: false });
    r = await call(C.jwt, { purchaseToken: `tok-c-${stamp}` });
    check('Lemon Squeezy Premium kept over an expired Play purchase', r.premium === true && (await row(C.id)).provider === 'lemonsqueezy', JSON.stringify(r));

    // daily refresh: renewal extends, revoked purchase expires
    google[tB] = playSub({ product: 'premium_yearly', days: 365, ack: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' });
    // both near the end of their period, so the daily refresh picks them up
    const soon = new Date(Date.now() + DAY).toISOString();
    await admin.from('subscriptions').update({ expires_at: soon }).in('user_id', [A.id, B.id]);
    const before = Date.parse(soon);
    google[tA] = undefined; delete google[tA]; // revoked: Google no longer knows it
    const { run } = require('../../netlify/functions/play-refresh.js');
    const res = await run();
    b = await row(B.id); a = await row(A.id);
    check('refresh: renewal moves the end date a year out', Date.parse(b.expires_at) > before + 300 * DAY && b.status === 'active', JSON.stringify(res));
    check('refresh: purchase Google no longer knows -> expired', a.status === 'expired');

    // delete_my_account still blocks while a Play subscription renews
    const del = await B.client.rpc('delete_my_account');
    check('renewing Play subscription blocks account deletion', /active_subscription/.test(del.error?.message || ''), del.error?.message);

    delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT; require('../../netlify/lib/play')._reset();
    check('not set up yet -> 503, not a crash', (await call(B.jwt, { purchaseToken: tB })).http === 503);
  } finally {
    for (const id of users) await admin.auth.admin.deleteUser(id);
    console.log(`test accounts deleted: ${users.length}`);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
