// Store screenshots for Google Play and the App Store, from a demo baby.
//   python3 -m http.server 8765 --bind 127.0.0.1 &   (from the repo root)
//   node tools/store-screenshots.js store/screenshots
// Writes play-*.png (1080x1920) and appstore-*.png (1290x2796).
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || 'store/screenshots';
const URL = process.argv[3] || 'http://127.0.0.1:8765/index.html';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Two weeks of a calm, realistic routine for a 6-month-old.
function seed() {
  const H = 3600000, now = Date.now(), id = currentBabyId(), out = [];
  const at = (daysAgo, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d; };
  const add = e => out.push({ id: uid(), babyId: id, ...e, time: e.time.toISOString() });
  for (let day = 13; day >= 0; day--) {
    [[6, 40], [9, 50], [13, 5], [16, 20], [19, 15], [23, 30], [3, 10]].forEach(([h, m], i) => {
      const t = at(h < 5 ? day - 1 : day, h, m + (day % 3) * 4); if (t > now || day - (h < 5 ? 1 : 0) < 0) return;
      if (i % 3 === 1) add({ type: 'feed', icon: '🍼', title: 'Bottle', detail: 'Bottle · 5 oz · Breast milk', time: t, feedType: 'bottle', oz: 5 });
      else { const l = 8 + (day % 4), r = 7 + (i % 3); add({ type: 'feed', icon: '🤱', title: 'Nursing', detail: `Nursing · L ${l}m · R ${r}m`, time: t, feedType: 'breast-both', leftMin: l, rightMin: r, durationMin: l + r, lastSide: i % 2 ? 'left' : 'right' }); }
    });
    [[7, 10, 'wet'], [9, 30, 'dirty'], [11, 45, 'wet'], [14, 20, 'both'], [16, 50, 'wet'], [19, 40, 'wet']].forEach(([h, m, k]) => {
      const t = at(day, h, m); if (t < now) add({ type: 'diaper', icon: '🌿', title: 'Diaper change', detail: k === 'both' ? 'Wet + Dirty' : k[0].toUpperCase() + k.slice(1), time: t, diaperType: k });
    });
    [[8, 30, 75], [12, 0, 90], [15, 40, 45], [19, 45, 610]].forEach(([h, m, dur]) => {
      const t = at(day, h, m); if (t < now - 30 * 60000) add({ type: 'sleep', icon: '😴', title: 'Sleep', detail: `${Math.floor(dur / 60) ? Math.floor(dur / 60) + 'h ' : ''}${dur % 60}m${dur > 300 ? ' · 1 wake-up' : ''}`, time: t, durationMin: dur, wakeUps: dur > 300 ? 1 : 0 });
    });
    if (day % 2 === 0) { const t = at(day, 18, 30); if (t < now) add({ type: 'bath', icon: '🛁', title: 'Bath', detail: 'Bath time', time: t }); }
  }
  add({ type: 'milestone', icon: '😊', title: 'First real laugh', detail: 'At the peekaboo game', time: at(40, 10), milestoneEmoji: '😊' });
  add({ type: 'milestone', icon: '🔄', title: 'Rolled over', detail: 'Tummy to back!', time: at(20, 16), milestoneEmoji: '🔄' });
  add({ type: 'milestone', icon: '🪑', title: 'Sat up without help', detail: '', time: at(2, 11), milestoneEmoji: '🪑' });
  add({ type: 'solids', icon: '🥕', title: 'Solids · new food', detail: 'Avocado · Some · 😋 Liked it', time: at(1, 12, 15), food: 'Avocado', amount: 'some', reaction: 'liked', firstTry: true });
  const ap = at(-3, 9, 30);
  add({ type: 'appointment', icon: '📅', title: 'Checkup', time: ap, apptKind: 'checkup', provider: 'Dr. Lee', notes: '6-month visit', remind: ['1d', '1h'], detail: 'Dr. Lee · 6-month visit' });
  allLogs = out.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  allGrowth = [['2026-05-01', 7.4, 19.5], ['2026-06-01', 9.6, 21.2], ['2026-07-01', 11.5, 22.8], ['2026-08-01', 13.1, 24], ['2026-09-01', 14.4, 25], ['2026-10-01', 15.5, 25.8], ['2026-11-01', 16.4, 26.5]]
    .map(([date, weight, heightIn]) => ({ id: uid(), babyId: id, date, weight, heightIn, head: 0, notes: '' }));
  refreshBabyView(); saveLogs(); saveGrowth(); renderHome();
}

const SHOTS = [
  ['home', async p => {}],
  ['feeding', async p => { await p.evaluate(() => openLogModal('feed')); await sleep(500); }],
  ['insights', async p => { await p.evaluate(() => switchScreen('insights', document.querySelector('[data-screen=insights]'))); await sleep(800); }],
  ['growth', async p => { await p.evaluate(() => switchScreen('growth', document.querySelector('[data-screen=growth]'))); await sleep(1000); }],
  ['book', async p => { await p.evaluate(() => switchScreen('book', document.querySelector('[data-screen=book]'))); await sleep(800); }],
  ['appointment', async p => { await p.evaluate(() => { healthTab = 'appt'; openLogModal('health'); }); await sleep(500); }],
  ['night', async p => { await p.evaluate(() => { document.documentElement.classList.add('night'); }); await sleep(600); }],
];

(async () => {
  const b = await chromium.launch();
  for (const [prefix, vp, scale] of [['play', { width: 360, height: 640 }, 3], ['appstore', { width: 430, height: 932 }, 3]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: scale, locale: 'en-US' });
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('pageerror', e.message));
    for (const [name, prep] of SHOTS) {
      await p.goto(URL, { waitUntil: 'domcontentloaded' });
      await p.evaluate(() => { localStorage.clear(); localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-05-01', emoji: '🌙' })); localStorage.setItem('bloom_nightMode', '"off"'); });
      await p.reload({ waitUntil: 'networkidle' });
      await p.evaluate(() => document.getElementById('auth-screen').classList.contains('visible') && skipAuth()); await sleep(500);
      await p.evaluate(seed); await sleep(300);
      await p.evaluate(() => { isPremium = true; if (typeof applyPremiumGates === 'function') applyPremiumGates(); renderHome(); });
      await prep(p);
      await p.evaluate(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); });
      await sleep(300);
      await p.screenshot({ path: `${OUT}/${prefix}-${SHOTS.findIndex(s => s[0] === name) + 1}-${name}.png` });
    }
    await ctx.close();
  }
  await b.close();
  console.log('done', fs.readdirSync(OUT).join(' '));
})();
