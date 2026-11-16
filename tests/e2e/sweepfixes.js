const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); };
async function app(b, napsPerDay) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', e => console.log('  pageerror:', e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.evaluate(n => {
    localStorage.clear();
    localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-07-01', emoji: '🌙' }));
    const H = 3600e3, now = Date.now(), L = [];
    for (let d = 0; d < 6; d++) {
      L.push({ id: 'f' + d + 'a', type: 'feed', icon: '🍼', title: 'Bottle', detail: '', feedType: 'formula', oz: 4, time: new Date(now - (d * 24 + 3) * H).toISOString() });
      L.push({ id: 'f' + d + 'b', type: 'feed', icon: '🍼', title: 'Bottle', detail: '', feedType: 'formula', oz: 4, time: new Date(now - (d * 24 + 6) * H).toISOString() });
      for (let k = 0; k < n; k++) { const t = new Date(now - d * 24 * H); t.setHours(8 + k * 2, 0, 0, 0); L.push({ id: `s${d}${k}`, type: 'sleep', icon: '😴', title: 'Sleep', detail: '', durationMin: 50, time: t.toISOString() }); }
    }
    localStorage.setItem('bloom_logs', JSON.stringify(L));
  }, napsPerDay);
  await p.reload({ waitUntil: 'networkidle' });
  await p.evaluate(() => document.getElementById('auth-screen').classList.contains('visible') && skipAuth());
  await sleep(600);
  return p;
}
(async () => {
  const b = await chromium.launch();
  let p = await app(b, 1);
  await p.evaluate(() => switchScreen('schedule', document.querySelector('.nav-btn[data-screen=schedule]'))); await sleep(400);
  const sched = (await p.locator('#scheduleContent').innerText()).replace(/\s+/g, ' ');
  check('Schedule: "Based on 3.0h average" (overnight gaps ignored)', sched.includes('Based on 3.0h average'), sched.slice(0, 120));
  await p.evaluate(() => { isPremium = true; showSleepCoach(); }); await sleep(400);
  const coach1 = await p.locator('#modal-sleep-coach').innerText();
  check('Sleep Coach: 1 nap a day at 4 months -> no "too many naps"', !coach1.includes('Too many naps'));
  check('upgrade screen lists "Smart reminders" once', (await p.locator('#modal-upgrade').innerText()).split('Smart reminders').length - 1 === 1);
  p = await app(b, 6);
  await p.evaluate(() => { isPremium = true; showSleepCoach(); }); await sleep(400);
  const coach6 = (await p.locator('#modal-sleep-coach').innerText()).replace(/\s+/g, ' ');
  check('Sleep Coach: 6 naps a day at 4 months -> "averaging 6.0 naps a day"', coach6.includes('Too many naps') && coach6.includes('averaging 6.0 naps a day'), coach6.slice(coach6.indexOf('Too many'), coach6.indexOf('Too many') + 110));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close();
})();
