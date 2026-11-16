const { chromium } = require('playwright');
const S = process.argv[2] || '/tmp', BASE = process.argv[3] || 'http://127.0.0.1:8765/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('  pageerror:', e.message)); p.on('dialog', d => d.accept());
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { localStorage.clear();
    localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-07-01', emoji: '🌙' }));
    localStorage.setItem('bloom_nightMode', JSON.stringify('off')); });
  await p.reload({ waitUntil: 'networkidle' });
  await p.evaluate(() => document.getElementById('auth-screen').classList.contains('visible') && skipAuth());
  await sleep(800);
  const last = () => p.evaluate(() => { const l = logs[0]; return l && { type: l.type, title: l.title, detail: l.detail, feedType: l.feedType, leftMin: l.leftMin, rightMin: l.rightMin, lastSide: l.lastSide, oz: l.oz, unit: l.unit, tempF: l.tempF, tempC: l.tempC, fever: l.fever }; });
  const body = () => p.locator('#log-modal-body');

  // ── Nursing ──
  await p.evaluate(() => openLogModal('feed')); await sleep(300);
  check('feeding opens on Nursing with LEFT and RIGHT buttons', (await body().locator('.seg button.active').first().innerText()) === 'Nursing' && (await body().locator('.nurse-side').count()) === 2);
  check('first time hint: "Tap a side to start"', (await body().locator('#nr-summary').innerText()).includes('Tap a side'));
  await body().locator('.nurse-side', { hasText: 'LEFT' }).click(); await sleep(200);
  check('tap LEFT starts it (shows pause, running)', await body().locator('.nurse-side.running', { hasText: 'LEFT' }).count() === 1);
  await p.evaluate(() => { const n = activeTimers.feed.extra.nursing; n.runStart -= 8 * 60000; activeTimers.feed.startMs -= 8 * 60000; saveTimers(); });
  await body().locator('.nurse-side', { hasText: 'RIGHT' }).click(); await sleep(1200);
  check('tap RIGHT switches sides (LEFT keeps its 8 min)', await body().locator('.nurse-side.running', { hasText: 'RIGHT' }).count() === 1 && (await p.locator('#nr-left-time').innerText()).startsWith('8:0'), await p.locator('#nr-left-time').innerText());
  await p.screenshot({ path: `${S}/feed-1-nursing.png` });
  // close the form; session keeps running; reopen
  await p.evaluate(() => closeModal('modal-log')); await sleep(200);
  check('closing the form keeps the session (timer pill shows it)', (await p.locator('#timersBar').innerText()).includes('Nursing · Right'));
  await p.evaluate(() => { const n = activeTimers.feed.extra.nursing; n.runStart -= 5 * 60000; saveTimers(); });
  await p.evaluate(() => openLogModal('feed')); await sleep(300);
  check('reopening shows the running session', await body().locator('.nurse-side.running', { hasText: 'RIGHT' }).count() === 1);
  await body().locator('text=Save').first().click(); await sleep(400);
  let l = await last();
  check('Save: Nursing · L 8m · R 5m, both sides, ended on Right', l.type === 'feed' && l.detail === 'Nursing · L 8m · R 5m' && l.feedType === 'breast-both' && l.leftMin === 8 && l.rightMin === 5 && l.lastSide === 'right', JSON.stringify(l));
  check('undo offered', (await p.locator('.toast-undo').count()) === 1);
  await p.evaluate(() => openLogModal('feed')); await sleep(300);
  check('next time it suggests starting with Left', (await body().locator('#nr-summary').innerText()).includes('start with Left'));
  check('home quick log says "Start Left side"', (await p.locator('#quickLog').innerText()).includes('Start Left side'));
  // manual entry
  await body().locator('text=Manual entry').click(); await sleep(200);
  await p.fill('#nr-left-min', '12'); await p.selectOption('#nr-last', 'left');
  await body().locator('text=Save nursing').click(); await sleep(300);
  l = await last();
  check('manual entry: Left 12 min', l.detail === 'Nursing · L 12m' && l.feedType === 'breast-left' && l.lastSide === 'left', JSON.stringify(l));

  // ── Bottle ──
  await p.evaluate(() => openLogModal('feed')); await sleep(300);
  await body().locator('.seg button', { hasText: 'Bottle' }).click(); await sleep(200);
  check('Bottle tab: Formula | Breast milk, amount 4 oz', (await body().locator('#bt-amount').innerText()).replace(/\s/g, '') === '4oz');
  await body().locator('button[aria-label=More]').click(); await body().locator('button[aria-label=More]').click(); await sleep(100);
  await body().locator('.seg button', { hasText: 'Breast milk' }).click(); await sleep(100);
  check('+ + makes 5 oz', (await body().locator('#bt-amount').innerText()).replace(/\s/g, '') === '5oz');
  await p.screenshot({ path: `${S}/feed-2-bottle.png` });
  await body().locator('.seg.small button', { hasText: 'ml' }).click(); await sleep(100);
  check('switching to ml converts (5 oz -> 150 ml)', (await body().locator('#bt-amount').innerText()).replace(/\s/g, '') === '150ml');
  await body().locator('text=Save bottle').click(); await sleep(300);
  l = await last();
  check('saved: Bottle · Breast milk · 150 ml (stored as oz too)', l.detail === 'Bottle · Breast milk · 150 ml' && l.feedType === 'breastmilk' && Math.abs(l.oz - 5.07) < 0.05 && l.unit === 'ml', JSON.stringify(l));
  check('quick log offers "Repeat feed · Breast milk · 150 ml"', (await p.locator('#quickLog').innerText()).includes('Breast milk · 150 ml'));
  await p.evaluate(() => openLogModal('feed')); await sleep(300);
  check('form remembers ml and last amount', (await body().locator('#bt-amount').innerText()).replace(/\s/g, '') === '150ml');
  await p.evaluate(() => closeModal('modal-log'));

  // ── Temperature ──
  await p.evaluate(() => openLogModal('temp')); await sleep(400);
  const bubble = () => p.locator('#thermo-bubble').innerText();
  check('thermometer starts at 98.6 °F (US)', (await bubble()) === '98.6 °F', await bubble());
  await p.screenshot({ path: `${S}/temp-1-normal.png` });
  // drag to ~101 °F
  const box = await p.locator('#thermo-track').boundingBox();
  const yFor = v => box.y + box.height * (1 - (v - 93) / 12);
  await p.mouse.move(box.x + box.width / 2, yFor(98.6)); await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2, yFor(100), { steps: 5 }); await p.mouse.move(box.x + box.width / 2, yFor(101.2), { steps: 5 }); await p.mouse.up();
  const dragged = parseFloat(await bubble());
  check('dragging up moves to ~101.2 °F', Math.abs(dragged - 101.2) <= 0.15, String(dragged));
  check('fever shown in red with a note', (await p.locator('#thermo.fever').count()) === 1 && (await p.locator('#temp-note').innerText()).startsWith('Fever'));
  await p.screenshot({ path: `${S}/temp-2-fever.png` });
  await p.locator('#thermo-track').focus(); for (let i = 0; i < 3; i++) await p.keyboard.press('ArrowDown');
  check('keyboard arrows adjust by 0.1', Math.abs(parseFloat(await bubble()) - (dragged - 0.3)) < 0.01, await bubble());
  await p.evaluate(() => { tempValue = 100.4; drawTemp(); });
  check('slider reports its value to screen readers', (await p.getAttribute('#thermo-track', 'aria-valuetext')) === '100.4 degrees Fahrenheit, fever');
  await body().locator('.seg.small button', { hasText: '°C' }).click(); await sleep(200);
  check('°C converts 100.4 °F -> 38.0 °C', (await bubble()) === '38.0 °C', await bubble());
  await body().locator('button[aria-label="Down 0.1"]').click();
  check('37.9 °C is not a fever', (await p.locator('#thermo.fever').count()) === 0);
  await body().locator('button[aria-label="Up 0.1"]').click(); await body().locator('button[aria-label="Up 0.1"]').click();
  await body().locator('text=Save').last().click(); await sleep(300);
  l = await last();
  check('saved 38.1 °C · Fever (also stores °F)', l.type === 'temp' && l.detail === '38.1 °C · Fever' && l.tempC === 38.1 && l.tempF === 100.6 && l.fever === true, JSON.stringify(l));
  check('timeline shows it', (await p.locator('#timeline').innerText()).includes('38.1 °C'));
  await p.evaluate(() => { nightMode = 'on'; applyNightMode(); openLogModal('temp'); }); await sleep(400);
  check('reopens in °C at last reading', (await bubble()) === '38.1 °C', await bubble());
  await p.screenshot({ path: `${S}/temp-3-night.png` });
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
