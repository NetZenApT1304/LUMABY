const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const ext = []; p.on('request', r => { if (/fonts\.(googleapis|gstatic)/.test(r.url())) ext.push(r.url()); });
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); }); p.on('pageerror', e => errs.push(e.message));
  await p.goto(process.argv[2], { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-07-01', emoji: '🌙' })); localStorage.setItem('bloom_nightMode', '"off"'); });
  await p.reload({ waitUntil: 'networkidle' });
  await p.evaluate(() => document.getElementById('auth-screen').classList.contains('visible') && skipAuth());
  await p.waitForTimeout(1200);
  const r = await p.evaluate(async () => { await document.fonts.ready; return {
    dmSans: document.fonts.check('16px "DM Sans"'), playfair: document.fonts.check('600 28px "Playfair Display"'), playfairItalic: document.fonts.check('italic 28px "Playfair Display"'),
    loaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family} ${f.style} ${f.weight}`).filter((v, i, a) => a.indexOf(v) === i),
    supabaseReady: !!window.supabase && !!supabaseClient }; });
  console.log(JSON.stringify(r), '| requests to Google Fonts:', ext.length, '| errors:', errs.length ? errs : 'none');
  await p.screenshot({ path: process.argv[3] });
  await b.close();
})();
