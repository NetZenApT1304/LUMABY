const { chromium } = require('playwright');
const S = process.argv[2] || '/tmp', BASE = process.argv[3] || 'http://127.0.0.1:8765/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); };
async function open(ctx, url, seed) {
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('  pageerror:', e.message));
  if (seed) { await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.evaluate(seed); }
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.getElementById('auth-screen').classList.contains('visible') && skipAuth());
  await sleep(900);
  return p;
}
const seed = feedType => `(() => {
  localStorage.clear();
  localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-07-01', emoji: '🌙' }));
  localStorage.setItem('bloom_nightMode', JSON.stringify('off'));
  localStorage.setItem('bloom_logs', JSON.stringify([{ id: 'f1', type: 'feed', icon: '🍼', title: 'Feed', detail: 'x', feedType: '${feedType}', oz: 4, time: new Date(Date.now() - 3*3600e3).toISOString() }]));
})()`;
const q = (p, text) => p.locator('#quickLog .ql-btn', { hasText: text });
const lastLog = p => p.evaluate(() => { const l = logs[0]; return l && { type: l.type, detail: l.detail, feedType: l.feedType, oz: l.oz, diaperType: l.diaperType, lastSide: l.lastSide, recent: Date.now() - Date.parse(l.time) < 60000 }; });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  // ── bottle feeder ──
  let p = await open(ctx, BASE, seed('formula'));
  const labels = (await p.locator('#quickLog .ql-btn').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  check('quick row: sleep, repeat feed (Formula · 4oz), wet, dirty, both', labels.length === 5 && labels[0].includes('Start sleep') && labels[1].endsWith('Repeat feed Formula · 4 oz') && /Wet Diaper.*\|.*Dirty Diaper.*\|.*Both Diaper/.test(labels.slice(2).join('|')), JSON.stringify(labels));
  await p.screenshot({ path: `${S}/quick-1.png` });

  const n0 = await p.evaluate(() => logs.length);
  await q(p, 'Wet').click(); await sleep(300);
  let l = await lastLog(p);
  check('one tap "Wet" logs a wet diaper now', l.type === 'diaper' && l.diaperType === 'wet' && l.recent && (await p.evaluate(() => logs.length)) === n0 + 1, JSON.stringify(l));
  check('timeline shows it', (await p.locator('#timeline').innerText()).includes('wet'));
  check('undo toast shown', (await p.locator('.toast-undo').innerText()).includes('Wet diaper logged'));
  await p.screenshot({ path: `${S}/quick-2-undo.png` });
  await p.click('.toast-undo button'); await sleep(300);
  check('Undo removes it', (await p.evaluate(() => logs.length)) === n0 && !(await p.evaluate(() => allLogs.some(x => x.diaperType === 'wet'))));

  await q(p, 'Repeat feed').click(); await sleep(300);
  l = await lastLog(p);
  check('"Repeat feed" logs Formula 4oz now', l.type === 'feed' && l.feedType === 'formula' && l.oz === 4 && l.detail === 'Bottle · Formula · 4 oz' && l.recent, JSON.stringify(l));

  await q(p, 'Start sleep').click(); await sleep(300);
  check('"Start sleep" starts the timer; button becomes "Stop sleep"', await p.evaluate(() => !!activeTimers.sleep) && (await q(p, 'Stop sleep').count()) === 1);
  await p.evaluate(() => { activeTimers.sleep.startMs -= 25 * 60000; saveTimers(); });
  await q(p, 'Stop sleep').click(); await sleep(300);
  l = await lastLog(p);
  check('"Stop sleep" saves a 25 min sleep', l.type === 'sleep' && /^25:0\d$/.test(l.detail) && !(await p.evaluate(() => !!activeTimers.sleep)), JSON.stringify(l));
  await p.close();

  // ── breastfeeding: suggests the other side ──
  p = await open(ctx, BASE, seed('breast-left'));
  check('after Left, it offers "Start Right side"', (await q(p, 'Start Right side').count()) === 1);
  await q(p, 'Start Right side').click(); await sleep(300);
  check('nursing session running on Right; button shows "Save nursing · Nursing · Right"', (await q(p, 'Save nursing').innerText()).includes('Nursing · Right'));
  await p.evaluate(() => { activeTimers.feed.extra.nursing.runStart -= 12 * 60000; activeTimers.feed.startMs -= 12 * 60000; saveTimers(); });
  await q(p, 'Save nursing').click(); await sleep(300);
  l = await lastLog(p);
  check('saving records Right, 12 min', l.type === 'feed' && l.feedType === 'breast-right' && l.detail === 'Nursing · R 12m' && l.lastSide === 'right', JSON.stringify(l));
  check('next suggestion flips to Left', (await q(p, 'Start Left side').count()) === 1);
  await p.close();

  // ── home-screen shortcut ──
  p = await open(ctx, BASE + '?quick=diaper-dirty', seed('formula'));
  await sleep(800);
  l = await lastLog(p);
  check('shortcut ?quick=diaper-dirty logs a dirty diaper on open', l.type === 'diaper' && l.diaperType === 'dirty' && l.recent, JSON.stringify(l));
  check('shortcut parameter removed from the address', !(await p.evaluate(() => location.search.includes('quick'))));
  await p.reload({ waitUntil: 'networkidle' }); await sleep(800);
  check('reloading does not log it again', (await p.evaluate(() => logs.filter(x => x.diaperType === 'dirty').length)) === 1);
  await p.evaluate(() => { nightMode = 'on'; applyNightMode(); document.querySelector('.toast')?.remove(); });
  await sleep(200); await p.screenshot({ path: `${S}/quick-3-night.png` });
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
