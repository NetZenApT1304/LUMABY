// 200% zoom (≈195 px wide): every screen and popup must fit without content
// running off the right edge (rows meant to scroll sideways are excepted).
// Usage: node tests/e2e/zoom.js [url]
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://127.0.0.1:8765/index.html';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 195, height: 422 } })).newPage();
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-06-01', emoji: '🌙' })); localStorage.setItem('bloom_nightMode', '"off"'); });
  await p.reload({ waitUntil: 'networkidle' }); await p.evaluate(() => skipAuth()); await p.waitForTimeout(500);
  const offEdge = scope => p.evaluate(sel => {
    const W = window.innerWidth, out = new Set();
    document.querySelectorAll(sel + ' *').forEach(el => {
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || !el.offsetParent && cs.position !== 'fixed') return;
      if (el.closest('.quick-log, .day-strip, #dayStrip, .baby-switcher, .book-preview-strip, .chip-row, .teeth-row')) return;
      // (screens scroll vertically, which makes overflow-x compute to auto too, so only the rows above are exempt)
      const r = el.getBoundingClientRect();
      if (r.width && r.right > W + 2 && (el.children.length === 0 || el.innerText.trim())) out.add(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.innerText || '').trim().slice(0, 20)}" +${Math.round(r.right - W)}px`);
    });
    return [...out].slice(0, 5);
  }, scope);
  let total = 0;
  for (const scr of ['home', 'insights', 'schedule', 'growth', 'book']) {
    await p.evaluate(n => switchScreen(n, document.querySelector(`.nav-btn[data-screen="${n}"]`)), scr); await p.waitForTimeout(300);
    const r = await offEdge('#screen-' + scr); total += r.length; console.log(`${r.length ? 'FAIL' : 'PASS'} ${scr}${r.length ? ': ' + r.join('; ') : ''}`);
  }
  for (const t of ['feed', 'temp', 'diaper', 'health', 'solids', 'tooth']) {
    await p.evaluate(t => { document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); openLogModal(t); }, t); await p.waitForTimeout(300);
    const r = await offEdge('#modal-log'); total += r.length; console.log(`${r.length ? 'FAIL' : 'PASS'} form ${t}${r.length ? ': ' + r.join('; ') : ''}`);
  }
  console.log(total ? `\n${total} things run off the edge` : '\n0 things run off the edge');
  await b.close();
})();
