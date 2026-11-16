const { chromium } = require('playwright'); const { execFileSync } = require('child_process');
const S = process.argv[2] || '/tmp', BASE = process.argv[3] || 'http://127.0.0.1:8765/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', acceptDownloads: true });
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('  pageerror:', e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-07-01', emoji: '🌙' }));
    localStorage.setItem('bloom_nightMode', '"off"'); localStorage.setItem('bloom_tempUnit', '"F"');
    const H = 3600e3, now = Date.now();
    const r = (hAgo, f, note) => { const c = Math.round((f - 32) * 5 / 9 * 10) / 10; const fever = f >= 100.4;
      return { id: 't' + hAgo, type: 'temp', icon: '🌡️', title: 'Temperature', detail: [f.toFixed(1) + ' °F', fever ? 'Fever' : '', note].filter(Boolean).join(' · '), time: new Date(now - hAgo * H).toISOString(), tempF: f, tempC: c, unit: 'F', fever }; };
    localStorage.setItem('bloom_logs', JSON.stringify([
      r(2, 99.1), r(10, 100.9, 'Tylenol given'), r(20, 101.6), r(30, 99.8), r(100, 98.6), r(200, 98.4), r(400, 103.0) /* 16+ days: outside window */]));
  });
  await p.reload({ waitUntil: 'networkidle' });
  await p.evaluate(() => document.getElementById('auth-screen').classList.contains('visible') && skipAuth());
  await sleep(800);
  await p.click('.nav-btn[data-screen="insights"]'); await sleep(600);
  const card = p.locator('#temp-insights');
  const text = (await card.innerText()).replace(/\s+/g, ' ');
  check('Insights has a Temperature card', await card.count() === 1);
  check('latest 99.1 °F · 2h ago', /99\.1°F Latest · 2h ago/.test(text), text.slice(0, 160));
  check('highest this week 101.6 °F (ignores the 103.0 from 16 days ago)', text.includes('101.6°F Highest this week'));
  check('2 fever readings, last 10h ago', /2 Fever readings · last 10h ago/.test(text));
  check('chart: 6 points, 2 in fever red, threshold line', (await card.locator('.tc-pt').count()) === 6 && (await card.locator('.tc-pt.fever').count()) === 2 && (await card.locator('.tc-fever-line').count()) === 1);
  check('list of recent readings with fever labels', (await card.locator('.temp-row').count()) === 5 && (await card.locator('.temp-row .fever-tag').count()) === 2);
  await card.scrollIntoViewIfNeeded();
  await card.locator('.tc-hit').nth(4).hover(); await sleep(150);
  const tip = await card.locator('.tc-tip').innerText();
  check('hovering a point shows its value and time', /^100\.9 °F · Fever — /.test(tip), tip);
  await card.screenshot({ path: `${S}/temp-insights.png` });
  await p.evaluate(() => { nightMode = 'on'; applyNightMode(); }); await sleep(200);
  await card.screenshot({ path: `${S}/temp-insights-night.png` });
  await p.evaluate(() => { nightMode = 'off'; applyNightMode(); setTempUnit('C'); renderInsights(); }); await sleep(300);
  check('switches to °C with the unit setting', (await p.locator('#temp-insights').innerText()).includes('37.3°C'));
  await p.evaluate(() => { tempUnit = 'F'; STORE.set('tempUnit', 'F'); });

  // pediatrician report
  await p.evaluate(() => { isPremium = true; showPediReport(); }); await sleep(400);
  const rep = (await p.locator('#pedi-modal-body').innerText()).replace(/\s+/g, ' ');
  check('report: Temperature section with summary', /temperature · last 14 days/i.test(rep) && rep.includes('6 readings · highest this week 101.6 °F · 2 fever readings'), JSON.stringify(rep.slice(rep.toLowerCase().indexOf('temperature ·'), rep.toLowerCase().indexOf('temperature ·') + 140)));
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.evaluate(() => generatePediPDF())]);
  const pdfPath = `${S}/luna-report.pdf`; await dl.saveAs(pdfPath);
  const pdf = execFileSync('pdftotext', ['-layout', pdfPath, '-']).toString();
  check('PDF has the temperature section and summary', pdf.includes('Temperature (last 14 days)') && /6 readings · highest this week 101\.6 °F · 2 fever readings/.test(pdf));
  check('PDF table: 101.6 °F marked Yes, note "Tylenol given"', /101\.6 °F\s+Yes/.test(pdf) && /100\.9 °F\s+Yes\s+Tylenol given/.test(pdf));
  check('PDF footer shows the real site', pdf.includes('lumabyy.netlify.app') && !pdf.includes('bloom-app'));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
