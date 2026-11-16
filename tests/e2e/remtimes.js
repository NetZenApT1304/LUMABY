const { chromium } = require('playwright'); const { execFileSync } = require('child_process');
const S = process.argv[2] || '/tmp', URL = process.argv[3] || 'http://127.0.0.1:8765/index.html';
const sql = q => JSON.parse(execFileSync(require('path').join(__dirname, '..', 'q.sh'), [q]).toString().trim().split('\n').slice(0, -1).join('\n'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', e => console.log('  pageerror:', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  // an older device's saved settings (single medsTime) must carry over
  await p.evaluate(() => localStorage.setItem('bloom_reminders', JSON.stringify({ feedEnabled: true, feedInterval: 3, napEnabled: true, napWindow: 2, medsEnabled: false, medsTime: '09:15', bathEnabled: false, bathDays: 2, growthEnabled: true, growthWeeks: 4 })));
  await p.reload({ waitUntil: 'networkidle' });
  await p.click('text=Create Account'); await p.fill('#auth-email', `lumaby-e2e-remt-${Date.now()}@mailinator.com`); await p.fill('#auth-password', 'Remtimes-123'); await p.click('#auth-submit-btn');
  await sleep(4000);
  const uid = await p.evaluate(() => currentUser.id);
  sql(`insert into public.subscriptions (user_id, status, plan) values ('${uid}', 'trialing', 'monthly')`);
  await p.reload({ waitUntil: 'networkidle' }); await sleep(4000);
  await p.fill('#ob-parent', 'Sam'); await p.fill('#ob-baby', 'Luna'); await p.click('text=Start tracking'); await sleep(1500);
  check('old single medicine time carried over', JSON.stringify(await p.evaluate(() => reminders.medsTimes)) === '["09:15"]');

  await p.evaluate(() => showRemindersModal()); await sleep(400);
  await p.screenshot({ path: `${S}/rem-1-default.png` });
  const body = () => p.locator('#reminders-modal-body');
  // feed: every 2h, no overnight
  await body().locator('select').first().selectOption('2');
  await body().locator('text=Remind me overnight').click();
  // nap: 1½ h
  await body().locator('select').nth(1).selectOption('1.5');
  // medicine: on, 08:00 + add an evening time
  await body().locator('label.toggle-switch:has(input[aria-label="Medicine reminder"])').click();
  await sleep(200);
  await body().locator('input[type=time]').first().fill('08:00');
  await body().locator('input[type=time]').first().dispatchEvent('change');
  await body().locator('text=+ Add another time').click();
  // bath: on, every 3 days
  await body().locator('label.toggle-switch:has(input[aria-label="Bath reminder"])').click();
  await sleep(200);
  await body().locator('select').nth(2).selectOption('3');
  await sleep(300);
  await p.screenshot({ path: `${S}/rem-2-edited.png`, fullPage: false });
  const text = await body().innerText();
  check('feed summary shows "Every 2 h"', text.includes('Every 2 h after the last feed'), text.split('\n').find(l => l.includes('feed')) || '');
  check('medicine summary lists both times', text.includes('Daily at 8:00 AM, 8:00 PM'));
  check('nap summary shows 1½ h', text.includes('After 1½ h awake'));
  check('bath summary shows every 3 days', text.includes('Every 3 days'));
  const r = await p.evaluate(() => reminders);
  check('settings object updated', r.feedMode === 'fixed' && r.feedInterval === 2 && r.feedNight === false && r.napWindow === 1.5 && r.medsEnabled && JSON.stringify(r.medsTimes) === '["08:00","20:00"]' && r.bathEnabled && r.bathDays === 3, JSON.stringify(r));
  await sleep(1500);
  const srv = sql(`select settings from public.reminder_settings where user_id='${uid}'`)[0]?.settings || {};
  check('server copy matches (used by the scheduler)', srv.feedMode === 'fixed' && srv.feedInterval === 2 && srv.feedNight === false && JSON.stringify(srv.medsTimes) === '["08:00","20:00"]' && srv.bathDays === 3, JSON.stringify(srv));
  // remove a time; max 4
  await body().locator('text=Remove').first().click(); await sleep(200);
  check('removing a time works', JSON.stringify(await p.evaluate(() => reminders.medsTimes)) === '["20:00"]');
  for (let i = 0; i < 5; i++) { const add = body().locator('text=+ Add another time'); if (await add.count()) await add.click(); }
  check('at most 4 medicine times', (await p.evaluate(() => reminders.medsTimes.length)) === 4 && !(await body().locator('text=+ Add another time').count()));
  // persists across reload
  await p.reload({ waitUntil: 'networkidle' }); await sleep(3000);
  check('settings survive a reload', (await p.evaluate(() => reminders.feedInterval)) === 2);
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
