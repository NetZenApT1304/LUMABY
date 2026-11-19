// Upcoming doctor appointments: the form, the pink days on the home day
// strip, the "next appointment" card, and the Reminders switch.
//   node tests/e2e/appointments.js <screenshot dir> [url]
const { chromium } = require('playwright');
const S = process.argv[2] || '/tmp', BASE = process.argv[3] || 'http://127.0.0.1:8765/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' })).newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-05-01', emoji: '🌙' })); localStorage.setItem('bloom_nightMode', '"off"'); });
  await p.reload({ waitUntil: 'networkidle' });
  await p.evaluate(() => document.getElementById('auth-screen').classList.contains('visible') && skipAuth()); await sleep(700);
  const body = () => p.locator('#log-modal-body');
  const dateIn = days => p.evaluate(n => { const d = new Date(Date.now() + n * 864e5); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }, days);
  const strip = () => p.evaluate(() => [...document.querySelectorAll('.day-chip')].map(c => ({ day: Math.round((new Date(c.dataset.date) - new Date().setHours(0, 0, 0, 0)) / 864e5), appt: c.classList.contains('appt'), active: c.classList.contains('active'), bg: getComputedStyle(c).backgroundColor })));
  const openUpcoming = async () => { await p.evaluate(() => openLogModal('health')); await sleep(300); await body().locator('.seg button', { hasText: 'Upcoming' }).click(); await sleep(200); };

  check('strip starts as 4 days back to 3 ahead', JSON.stringify((await strip()).map(c => c.day)) === '[-4,-3,-2,-1,0,1,2,3]');

  // ── the form ──
  await openUpcoming();
  check('date defaults to tomorrow, no past dates', await p.inputValue('#hl-date') === await dateIn(1) && await p.getAttribute('#hl-date', 'min') === await dateIn(0));
  check('"Day before" and "1 hour before" picked by default', (await body().locator('#hl-remind .chip.on').allInnerTexts()).join() === 'Day before,1 hour before');
  check('free users told notifications are Premium', (await body().innerText()).includes('Notifications are part of Premium'));
  await p.fill('#hl-date', await dateIn(0)); await p.fill('#hl-time', '00:01');
  await body().locator('text=Save appointment').click(); await sleep(200);
  check('a time in the past is refused', (await p.locator('.toast').innerText()).includes('in the future'));

  await p.fill('#hl-date', await dateIn(2)); await p.fill('#hl-time', '10:30');
  await body().locator('#hl-appt-kind .chip', { hasText: 'Vaccines' }).click();
  await p.fill('#hl-provider', 'Dr. Lee'); await p.fill('#hl-notes', 'Bring the shot record');
  await body().locator('#hl-remind .chip', { hasText: '2 hours before' }).click();
  await p.screenshot({ path: `${S}/appt-form.png` });
  await body().locator('text=Save appointment').click(); await sleep(400);
  const saved = await p.evaluate(() => { const a = logs.find(l => l.type === 'appointment'); const d = new Date(a.time); return { title: a.title, provider: a.provider, remind: a.remind, hm: d.getHours() + ':' + d.getMinutes(), days: Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5) }; });
  check('saved: Vaccine appointment, Dr. Lee, in 2 days at 10:30, reminders 1d/2h/1h',
    saved.title === 'Vaccine appointment' && saved.provider === 'Dr. Lee' && saved.hm === '10:30' && saved.days === 2 && saved.remind.join() === '1d,2h,1h', JSON.stringify(saved));

  // ── pink day ──
  let s = await strip();
  check('that day is pink, the others are not', s.filter(c => c.appt).map(c => c.day).join() === '2', JSON.stringify(s.filter(c => c.appt)));
  check('pink colour', s.find(c => c.day === 2).bg === 'rgb(251, 211, 224)', s.find(c => c.day === 2).bg);
  check('today still selected', s.find(c => c.active).day === 0);
  check('screen readers hear it', (await p.locator('.day-chip.appt').getAttribute('aria-label')).endsWith(', doctor appointment'));

  // ── next-appointment card ──
  const banner = await p.locator('.appt-banner').innerText();
  check('home card shows the next appointment', /Vaccine appointment · Dr\. Lee/.test(banner) && /at 10:30 AM/.test(banner), JSON.stringify(banner));
  await p.screenshot({ path: `${S}/appt-home.png` });
  await p.locator('.appt-banner').click(); await sleep(400);
  s = await strip();
  check('tapping the card opens that day', s.find(c => c.active).day === 2);
  check('selected appointment day is deep pink', s.find(c => c.active).bg === 'rgb(184, 69, 107)', s.find(c => c.active).bg);
  check('timeline lists the appointment', (await p.locator('#timeline').innerText()).includes('Vaccine appointment'));

  // ── far-off appointment stretches the strip ──
  await openUpcoming();
  await p.fill('#hl-date', await dateIn(20)); await body().locator('text=Save appointment').click(); await sleep(400);
  s = await strip();
  check('strip reaches 20 days ahead with both days pink', s[s.length - 1].day === 20 && s.filter(c => c.appt).map(c => c.day).join() === '2,20');
  check('card still shows the nearest one', (await p.locator('.appt-banner').innerText()).includes('Vaccine appointment'));

  // ── night mode ──
  await p.evaluate(() => { document.documentElement.classList.add('night'); }); await sleep(500);
  s = await strip();
  check('night mode pink is a dark rose', s.find(c => c.day === 20).bg === 'rgb(90, 42, 59)', s.find(c => c.day === 20).bg);
  await p.screenshot({ path: `${S}/appt-night.png` });
  await p.evaluate(() => { document.documentElement.classList.remove('night'); });

  // ── delete ──
  await p.evaluate(() => logs.filter(l => l.type === 'appointment').forEach(a => deleteLog(a.id))); await sleep(300);
  s = await strip();
  check('deleting them removes the pink and shrinks the strip', !s.some(c => c.appt) && s[s.length - 1].day === 3);
  check('and the card goes away', await p.locator('.appt-banner').count() === 0);

  // ── Reminders switch (Premium) ──
  await p.evaluate(() => { isPremium = true; showRemindersModal(); }); await sleep(300);
  check('Reminders has a Doctor appointments switch, on by default',
    (await p.locator('#reminders-modal-body').innerText()).includes('Doctor appointments') && await p.evaluate(() => reminders.apptEnabled === true));

  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
