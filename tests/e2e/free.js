const { chromium } = require('playwright'); const { execFileSync } = require('child_process');
const S = process.argv[2]; const sql = q => JSON.parse(execFileSync(require('path').join(__dirname, '..', 'q.sh'), [q]).toString().trim().split('\n').slice(0, -1).join('\n'));
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || /Sync failed/.test(m.text())) errs.push(m.text()); });
  await p.goto(process.argv[3] || 'http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await p.click('text=Create Account');
  await p.fill('#auth-email', `lumaby-e2e-free-${Date.now()}@mailinator.com`); await p.fill('#auth-password', 'Free-pass-12345'); await p.click('#auth-submit-btn');
  await new Promise(r => setTimeout(r, 4000));
  await p.fill('#ob-parent', 'Free Parent'); await p.fill('#ob-baby', 'Milo'); await p.click('text=Start tracking');
  await new Promise(r => setTimeout(r, 2000));
  await p.evaluate(() => pushLog({ id: uid(), type: 'feed', icon: '🍼', title: 'Free feed', detail: '3oz', time: new Date().toISOString() }));
  await new Promise(r => setTimeout(r, 3000));
  const st = await p.evaluate(() => ({ isPremium, logs: logs.length, babies: babies.length, screen: document.body.innerText.includes('Free feed') }));
  const uid = await p.evaluate(() => currentUser.id);
  const db = sql(`select (select count(*) from logs where user_id='${uid}') logs, (select count(*) from babies where user_id='${uid}') babies`)[0];
  console.log(JSON.stringify({ ...st, db, errors: errs }));
  await b.close();
})();
