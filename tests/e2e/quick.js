// One-tap logging from the home-screen icon shortcuts (/?quick=…): repeat a
// bottle, start the next breast side, diapers, sleep timer, and Undo.
// Usage: node tests/e2e/quick.js [output folder] [url]
const { chromium } = require('playwright');
const S = process.argv[2] || '/tmp', BASE = process.argv[3] || 'http://127.0.0.1:8765/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); };
const seed = feedType => `(() => {
  localStorage.clear();
  localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-07-01', emoji: '🌙' }));
  localStorage.setItem('bloom_nightMode', JSON.stringify('off'));
  localStorage.setItem('bloom_logs', JSON.stringify([{ id: 'f1', type: 'feed', icon: '🍼', title: 'Feed', detail: 'x', feedType: '${feedType}', oz: 4, lastSide: '${feedType === 'breast-left' ? 'left' : ''}', time: new Date(Date.now() - 3*3600e3).toISOString() }]));
})()`;
async function open(ctx, query, feedType) {
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('  pageerror:', e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.evaluate(seed(feedType));
  await p.goto(BASE + query, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.getElementById('auth-screen').classList.contains('visible') && skipAuth());
  await sleep(1200);
  return p;
}
const last = p => p.evaluate(() => { const l = logs[0]; return l && { type: l.type, detail: l.detail, feedType: l.feedType, oz: l.oz, diaperType: l.diaperType, recent: Date.now() - Date.parse(l.time) < 60000 }; });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });

  let p = await open(ctx, '', 'formula');
  check('the home screen has no Quick log row', !(await p.locator('#quickLog').count()) && !(await p.locator('body').innerText()).includes('Quick log'));
  await p.close();

  p = await open(ctx, '?quick=feed', 'formula');
  let l = await last(p);
  check('"Repeat last feed" shortcut logs Formula 4 oz now', l.type === 'feed' && l.feedType === 'formula' && l.oz === 4 && l.detail === 'Bottle · Formula · 4 oz' && l.recent, JSON.stringify(l));
  check('...with an Undo toast', (await p.locator('.toast-undo').innerText()).includes('Formula · 4 oz'));
  await p.click('.toast-undo button'); await sleep(300);
  check('Undo removes it', (await p.evaluate(() => logs.length)) === 1);
  check('the address is cleaned up', !(await p.evaluate(() => location.search.includes('quick'))));
  await p.reload({ waitUntil: 'networkidle' }); await sleep(900);
  check('reloading does not log it again', (await p.evaluate(() => logs.length)) === 1);
  await p.close();

  p = await open(ctx, '?quick=feed', 'breast-left');
  check('after a Left feed, the shortcut starts a nursing session on the Right', await p.evaluate(() => activeTimers.feed?.extra?.nursing?.running === 'right'));
  check('the timer bar shows it, so it can be stopped', (await p.locator('#timersBar').innerText()).includes('Nursing · Right'));
  await p.evaluate(() => { activeTimers.feed.extra.nursing.runStart -= 12 * 60000; activeTimers.feed.startMs -= 12 * 60000; saveTimers(); });
  await p.locator('#timersBar button', { hasText: 'Stop' }).click(); await sleep(400);
  l = await last(p);
  check('stopping saves Nursing · R 12m', l.type === 'feed' && l.feedType === 'breast-right' && l.detail === 'Nursing · R 12m', JSON.stringify(l));
  await p.close();

  for (const [q, kind] of [['diaper-wet', 'wet'], ['diaper-dirty', 'dirty']]) {
    p = await open(ctx, '?quick=' + q, 'formula');
    l = await last(p);
    check(`"${kind} diaper" shortcut logs a ${kind} diaper now`, l.type === 'diaper' && l.diaperType === kind && l.recent, JSON.stringify(l));
    await p.close();
  }

  p = await open(ctx, '?quick=sleep', 'formula');
  check('"Start sleep timer" shortcut starts the timer', await p.evaluate(() => !!activeTimers.sleep));
  check('the timer bar shows it', (await p.locator('#timersBar').innerText()).includes('Sleep'));
  await p.evaluate(() => { activeTimers.sleep.startMs -= 25 * 60000; saveTimers(); });
  await p.locator('#timersBar button', { hasText: 'Stop' }).click(); await sleep(400);
  l = await last(p);
  check('stopping saves a 25 min sleep', l.type === 'sleep' && /^25:0\d$/.test(l.detail), JSON.stringify(l));
  await p.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
