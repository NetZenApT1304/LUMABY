const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(process.argv[2], { waitUntil: 'networkidle' });
  await p.evaluate(() => { localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-07-01', emoji: '🌙' })); });
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  await ctx.setOffline(true);
  await p.reload({ waitUntil: 'load' }).catch(e => errs.push('reload: ' + e.message));
  await p.evaluate(() => document.getElementById('auth-screen')?.classList.contains('visible') && skipAuth()).catch(() => {});
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => ({ app: typeof launchApp === 'function', home: document.body.innerText.includes('Log something'), files: performance.getEntriesByType('resource').filter(e => /\/js\//.test(e.name)).length })).catch(e => ({ error: e.message }));
  console.log('offline reload:', JSON.stringify(r), 'errors:', errs.length ? errs.slice(0, 3) : 'none');
  await b.close();
})();
