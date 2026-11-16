const { chromium } = require('playwright'); const { execFileSync } = require('child_process');
const S = process.argv[2] || '/tmp', URL = process.argv[3] || 'http://127.0.0.1:8765/index.html';
const sql = q => JSON.parse(execFileSync(require('path').join(__dirname, '..', 'q.sh'), [q]).toString().trim().split('\n').slice(0, -1).join('\n'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.grantPermissions(['notifications'], { origin: new globalThis.URL(URL).origin });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('  pageerror:', e.message));
  const logs = []; p.on('console', m => { if (/Push|reminder/i.test(m.text())) logs.push(m.text()); });
  await p.goto(URL, { waitUntil: 'networkidle' });
  const email = `lumaby-e2e-remui-${Date.now()}@mailinator.com`;
  await p.click('text=Create Account'); await p.fill('#auth-email', email); await p.fill('#auth-password', 'Remind-test-123'); await p.click('#auth-submit-btn');
  await sleep(4000);
  const uid = await p.evaluate(() => currentUser.id);
  sql(`insert into public.subscriptions (user_id, status, plan) values ('${uid}', 'trialing', 'monthly')`);
  await p.reload({ waitUntil: 'networkidle' }); await sleep(4000);
  await p.fill('#ob-parent', 'Sam'); await p.fill('#ob-baby', 'Luna'); await p.click('text=Start tracking'); await sleep(2000);

  // Headless Chromium has no real push service, so stand in for the browser's subscribe().
  const realSubscribe = await p.evaluate(async () => {
    try { const reg = await navigator.serviceWorker.ready; await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }); return 'ok'; }
    catch (e) { return e.name + ': ' + e.message; }
  });
  console.log('  real subscribe in headless Chromium:', realSubscribe);
  if (realSubscribe !== 'ok') {
    await p.evaluate(() => {
      const fake = { endpoint: 'https://push.example/fake-' + Date.now(), toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BFAKEKEY', auth: 'FAKEAUTH' } }; }, unsubscribe: async () => true };
      let current = null;
      PushManager.prototype.subscribe = async () => (current = fake);
      PushManager.prototype.getSubscription = async () => current;
    });
  }

  await p.evaluate(() => showRemindersModal()); await sleep(500);
  const modalText = await p.locator('#reminders-modal-body').innerText();
  check('reminders screen says they work when the app is closed', modalText.includes('even when the app is closed'));
  // turn medicine on, then save
  await p.evaluate(() => { reminders.medsEnabled = true; reminders.medsTime = '07:30'; saveReminders(); });
  await p.click('text=Save & Enable Reminders'); await sleep(3000);
  const toast = await p.evaluate(() => document.querySelector('.toast')?.textContent || '');
  check('confirmation shown', /Reminders on/.test(toast), toast);
  const subs = sql(`select endpoint from public.push_subscriptions where user_id='${uid}'`);
  check('this device is registered for push', subs.length === 1, JSON.stringify(subs));
  const set = sql(`select settings->>'medsEnabled' meds, settings->>'medsTime' t, settings->>'feedEnabled' feed, tz from public.reminder_settings where user_id='${uid}'`)[0] || {};
  check('settings and time zone saved', set.meds === 'true' && set.t === '07:30' && set.feed === 'true' && !!set.tz, JSON.stringify(set));
  // toggle in the UI updates the server copy
  await p.evaluate(() => { reminders.feedEnabled = false; saveReminders(); }); await sleep(1800);
  const feed = sql(`select settings->>'feedEnabled' feed from public.reminder_settings where user_id='${uid}'`)[0].feed;
  check('turning a reminder off updates the server', feed === 'false', feed);
  const targets = sql(`select baby_name from public.reminder_targets() where user_id='${uid}'`);
  check('the scheduler now sees this user + baby', targets.length === 1 && targets[0].baby_name === 'Luna', JSON.stringify(targets));
  // sign out removes the device
  await p.evaluate(() => signOut()); await sleep(4000);
  const after = sql(`select count(*) n from public.push_subscriptions where user_id='${uid}'`)[0].n;
  check('signing out unregisters this device', after == 0, String(after));
  console.log(`\n${pass} passed, ${fail} failed`); if (logs.length) console.log('  console:', logs.slice(0, 3));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
