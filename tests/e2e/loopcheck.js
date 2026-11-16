const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
  await p.goto(process.argv[2], { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-07-01', emoji: '🌙' })); });
  await p.reload({ waitUntil: 'networkidle' });
  await p.evaluate(() => document.getElementById('auth-screen').classList.contains('visible') && skipAuth());
  await p.waitForTimeout(500);
  console.log(await p.evaluate(() => { isPremium = true; try { switchScreen('insights', document.querySelector('.nav-btn[data-screen=insights]')); return 'ok'; } catch (e) { return e.name + ': ' + e.message; } }));
  await b.close();
})();
