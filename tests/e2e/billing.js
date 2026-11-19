// Google Play billing in the app (js/billing.js), with Google Play simulated
// in the page (Digital Goods API + PaymentRequest) and play-verify answered
// by the test, which writes the subscription like the real function would.
//   node tests/e2e/billing.js <screenshot dir> [url]
const { chromium } = require('playwright'); const { execFileSync } = require('child_process');
const S = process.argv[2] || '/tmp', BASE = process.argv[3] || 'http://127.0.0.1:8765/';
const URL = BASE.endsWith('/') ? BASE + (BASE.includes('127.0.0.1') ? 'index.html' : '') : BASE;
const sql = q => { const out = execFileSync(require('path').join(__dirname, '..', 'q.sh'), [q]).toString().trim().split('\n'); out.pop(); return JSON.parse(out.join('\n')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); };
const stamp = Date.now();

// Google Play inside the page. window.__play controls it from the test.
const fakePlay = ({ dga = true, purchases = [] } = {}) => {
  sessionStorage.setItem('lumaby_play_app', '1');
  window.__play = { requests: [], completed: [], purchases };
  if (dga) window.getDigitalGoodsService = async method => {
    if (method !== 'https://play.google.com/billing') throw new Error('unsupported');
    return {
      getDetails: async ids => ids.map(id => id === 'premium_monthly'
        ? { itemId: id, title: 'Premium monthly', price: { currency: 'USD', value: '5.49' }, freeTrialPeriod: 'P1W' }
        : { itemId: id, title: 'Premium yearly', price: { currency: 'USD', value: '39.99' } }),
      listPurchases: async () => window.__play.purchases,
    };
  };
  window.PaymentRequest = class {
    constructor(methods) { this.methods = methods; window.__play.requests.push(methods); }
    async show() { return { details: { purchaseToken: 'tok-' + this.methods[0].data.sku }, complete: async r => { window.__play.completed.push(r); } }; }
  };
};

(async () => {
  const b = await chromium.launch();
  const verifyCalls = [];
  async function page({ play = true, dga = true, purchases = [], answer = 'ok' } = {}) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    if (play) await ctx.addInitScript(fakePlay, { dga, purchases });
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('  pageerror:', e.message));
    await p.route('**/.netlify/functions/play-verify', async route => {
      const req = route.request(); const body = JSON.parse(req.postData() || '{}');
      verifyCalls.push({ auth: req.headers()['authorization'] || '', ...body });
      if (answer === 'in_use') return route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"token_in_use"}' });
      const uid = await p.evaluate(() => currentUser?.id);
      sql(`insert into public.subscriptions (user_id, provider, play_purchase_token, play_product_id, status, plan, expires_at)
           values ('${uid}', 'play', '${body.purchaseToken}-${stamp}', 'premium_monthly', 'active', 'monthly', now() + interval '33 days')
           on conflict (user_id) do update set provider='play', status='active', expires_at=excluded.expires_at, play_product_id='premium_monthly'`);
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"premium":true,"status":"active"}' });
    });
    return p;
  }
  async function signUp(p, tag) {
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.click('text=Create Account'); await p.fill('#auth-email', `lumaby-e2e-bill-${tag}-${stamp}@mailinator.com`);
    await p.fill('#auth-password', 'Billing-test-123'); await p.click('#auth-submit-btn'); await sleep(5000);
    if (await p.locator('#ob-parent').isVisible()) { await p.fill('#ob-parent', 'Sam'); await p.fill('#ob-baby', 'Luna'); await p.click("text=Let's begin"); await sleep(1500); }
  }
  const upgrade = async p => { await p.evaluate(() => openModal('modal-upgrade')); await sleep(600); };
  const text = (p, sel) => p.locator(sel).innerText();
  // remember every toast the page shows (they fade after a few seconds)
  const toasts = p => p.evaluate(() => window.__toasts || []);
  const watchToasts = p => p.evaluate(() => { window.__toasts = []; const o = showToast; showToast = m => { window.__toasts.push(String(m)); o(m); }; });

  // ── In the Play app: Google Play prices and purchase ──
  const P = await page();
  await signUp(P, 'play');
  await upgrade(P);
  check('monthly price from Google Play', (await text(P, '#plan-monthly .amount')) === '$5.49');
  check('yearly shown per month, with the yearly price and saving', (await text(P, '#plan-yearly .amount')) === '$3.33' && (await text(P, '#plan-yearly .save')) === 'Save 39% · $39.99/year', await text(P, '#plan-yearly .save'));
  check('says billed through Google Play, no Lemon Squeezy', /Google Play/.test(await text(P, '#upgrade-note')) && !/Lemon Squeezy/i.test(await text(P, '#modal-upgrade')));
  check('trial button uses Google Play\'s trial and price', (await text(P, '#upgrade-btn')) === 'Start 7-day free trial · then $5.49/mo', await text(P, '#upgrade-btn'));
  await P.screenshot({ path: `${S}/billing-play.png` });
  await watchToasts(P);
  await P.click('#upgrade-btn'); await sleep(3500);
  const play = await P.evaluate(() => window.__play);
  check('opens Google Play for premium_monthly', play.requests[0]?.[0]?.supportedMethods === 'https://play.google.com/billing' && play.requests[0][0].data.sku === 'premium_monthly');
  const v = verifyCalls[verifyCalls.length - 1];
  check('server asked to confirm it, signed in', v?.purchaseToken === 'tok-premium_monthly' && /^Bearer ey/.test(v.auth));
  check('purchase completed as success', play.completed[0] === 'success');
  const st = await P.evaluate(() => ({ isPremium, open: document.getElementById('modal-upgrade').classList.contains('open') }));
  check('Premium on, Premium screen closed, welcome shown', st.isPremium && !st.open && (await toasts(P)).some(t => /Welcome to Lumaby Premium/.test(t)), JSON.stringify({ ...st, toasts: await toasts(P) }));
  await P.evaluate(() => { window.__opened = []; window.open = u => window.__opened.push(u); manageSubscription(); }); await sleep(1500);
  check('Manage subscription opens Google Play subscriptions', /^https:\/\/play\.google\.com\/store\/account\/subscriptions\?package=com\.lumaby\.app&sku=premium_monthly$/.test((await P.evaluate(() => window.__opened[0])) || ''), await P.evaluate(() => window.__opened[0]));
  await P.evaluate(() => selectPlan('yearly'));
  check('yearly without a trial: "Subscribe · $39.99/yr"', (await text(P, '#upgrade-btn')) === 'Subscribe · $39.99/yr');

  // ── Restore: a purchase from another phone is picked up on sign-in ──
  const R = await page({ purchases: [{ itemId: 'premium_yearly', purchaseToken: 'tok-restore' }] });
  const before = verifyCalls.length;
  await signUp(R, 'restore'); await sleep(2500);
  check('existing Google Play purchase sent to the server on sign-in', verifyCalls.slice(before).some(c => c.purchaseToken === 'tok-restore'));
  check('...and Premium turns on', await R.evaluate(() => isPremium));

  // ── Purchase already linked to another account ──
  const T = await page({ answer: 'in_use' });
  await signUp(T, 'inuse'); await upgrade(T); await watchToasts(T); await T.click('#upgrade-btn'); await sleep(2500);
  check('linked to another account: explained, not Premium', (await toasts(T)).some(t => /already linked to another Lumaby account/.test(t)) && !(await T.evaluate(() => isPremium)), JSON.stringify(await toasts(T)));

  // ── Play app with an old Chrome (no Google Play billing) ──
  const O = await page({ dga: false });
  await O.goto(URL, { waitUntil: 'networkidle' });
  await O.evaluate(() => { skipAuth(); }); await sleep(500);
  await O.evaluate(() => { currentUser = { id: 'x', email: 'x@example.com' }; }); await upgrade(O); await watchToasts(O);
  let nav = null; O.on('framenavigated', f => { if (f === O.mainFrame()) nav = f.url(); });
  await O.click('#upgrade-btn'); await sleep(800);
  check('no Google Play billing: asks to update Chrome, never opens Lemon Squeezy', (await toasts(O)).some(t => /Update Chrome/.test(t)) && !/lemonsqueezy/.test(nav || ''), JSON.stringify(await toasts(O)));

  // ── Website: unchanged, Lemon Squeezy ──
  const W = await page({ play: false });
  await W.goto(URL, { waitUntil: 'networkidle' });
  await W.evaluate(() => { skipAuth(); }); await sleep(500);
  await W.evaluate(() => { currentUser = { id: '00000000-0000-0000-0000-000000000000', email: 'web@example.com' }; }); await upgrade(W);
  check('website keeps Lemon Squeezy prices and note', (await text(W, '#plan-monthly .amount')) === '$4.99' && /Lemon Squeezy/.test(await text(W, '#upgrade-note')));
  await W.route('https://lumaby.lemonsqueezy.com/**', r => r.fulfill({ body: 'checkout' }));
  await W.click('#upgrade-btn'); await sleep(1500);
  check('website checkout goes to Lemon Squeezy', /lumaby\.lemonsqueezy\.com\/checkout/.test(W.url()), W.url());

  sql(`delete from auth.users where email like 'lumaby-e2e-bill-%-${stamp}@mailinator.com'`);
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
