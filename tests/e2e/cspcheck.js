const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
  const msgs = []; p.on('console', m => { if (/Content Security Policy|Refused to load/i.test(m.text())) msgs.push(m.text().slice(0, 170)); });
  await p.goto('https://lumabyy.netlify.app/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-07-01', emoji: '🌙' })));
  await p.reload({ waitUntil: 'networkidle' });
  await p.evaluate(() => document.getElementById('auth-screen').classList.contains('visible') && skipAuth());
  await p.evaluate(() => { isPremium = true; return generatePediPDF().catch(() => {}); }); await p.waitForTimeout(1500);
  console.log(msgs.length ? msgs.join('\n') : 'no CSP message');
  await b.close();
})();
