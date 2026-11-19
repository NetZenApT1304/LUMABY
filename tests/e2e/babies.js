const { chromium } = require('playwright'); const { execFileSync } = require('child_process');
const S = process.argv[2] || '/tmp', URL = process.argv[3] || 'http://127.0.0.1:8765/index.html';
const sql = q => JSON.parse(execFileSync(require('path').join(__dirname, '..', 'q.sh'), [q]).toString().trim().split('\n').slice(0, -1).join('\n'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (label, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + label + (extra ? '  ' + extra : '')); };
const view = p => p.evaluate(() => ({ active: profile?.baby, logs: logs.map(l => l.title).sort(), growth: growthLogs.length, all: allLogs.length, babies: babies.map(b => b.baby) }));
// check the timeline itself; the 'saved' toast can still be on screen
const screen = async (p, text) => (await p.locator('#timeline').innerText()).includes(text);
async function newPage(b) { const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', e => console.log('  pageerror:', e.message)); p.on('dialog', d => d.accept()); return p; }
const addLog = (p, title) => p.evaluate(t => pushLog({ id: uid(), type: 'feed', icon: '🍼', title: t, detail: '', time: new Date().toISOString() }), title);
const switchTo = (p, name) => p.evaluate(n => switchBaby(babies.findIndex(b => b.baby === n)), name);

(async () => {
  const b = await chromium.launch();
  // ── 1. Legacy data: logs saved by the old version (no babyId) go to the first baby ──
  const L = await newPage(b);
  await L.goto(URL, { waitUntil: 'domcontentloaded' });
  await L.evaluate(() => {
    localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'P', baby: 'Old Baby', dob: '2026-06-01', emoji: '🌙' }));
    localStorage.setItem('bloom_logs', JSON.stringify([
      { id: 'legacy1', type: 'feed', icon: '🍼', title: 'Legacy feed', detail: '', time: new Date().toISOString() },
      { id: 'legacy2', type: 'diaper', icon: '🌿', title: 'Legacy diaper', detail: '', time: new Date().toISOString() }]));
    localStorage.setItem('bloom_growthLogs', JSON.stringify([{ date: '2026-10-01', weight: 11, heightIn: 23, head: 0, notes: '' }]));
  });
  await L.reload({ waitUntil: 'networkidle' });
  await L.evaluate(() => typeof skipAuth === 'function' && document.getElementById('auth-screen').classList.contains('visible') && skipAuth());
  await sleep(1500);
  const leg = await L.evaluate(() => ({ babies: babies.length, ids: allLogs.map(l => !!l.babyId), gid: allGrowth[0] && !!allGrowth[0].id && allGrowth[0].babyId === babies[0].id, view: logs.length }));
  check('old logs + growth get the first baby\'s id and stay visible', leg.babies === 1 && leg.ids.every(Boolean) && leg.gid && leg.view === 2, JSON.stringify(leg));

  // ── 2. Premium account with two babies ──
  const A = await newPage(b);
  await A.goto(URL, { waitUntil: 'networkidle' });
  const email = `lumaby-e2e-babies-${Date.now()}@mailinator.com`, password = 'Babies-' + Date.now().toString(36);
  await A.click('text=Create Account'); await A.fill('#auth-email', email); await A.fill('#auth-password', password); await A.click('#auth-submit-btn');
  await sleep(4000);
  const uid = await A.evaluate(() => currentUser.id);
  sql(`insert into public.subscriptions (user_id, status, plan) values ('${uid}', 'trialing', 'monthly')`);
  await A.reload({ waitUntil: 'networkidle' }); await sleep(4000);
  await A.fill('#ob-parent', 'Sam'); await A.fill('#ob-baby', 'Luna'); await A.click('text=Start tracking'); await sleep(2000);
  await addLog(A, 'Luna feed 1'); await addLog(A, 'Luna feed 2');
  await A.evaluate(() => { babies.push({ id: uid(), baby: 'Milo', dob: '2026-09-01', emoji: '⭐', parent: 'Sam' }); saveBabies(); switchBaby(babies.length - 1); });
  await sleep(500);
  let v = await view(A);
  check('switching to the new baby shows an empty timeline', v.active === 'Milo' && v.logs.length === 0 && v.all === 2, JSON.stringify(v));
  await addLog(A, 'Milo feed 1');
  await A.evaluate(() => { allGrowth.push({ id: uid(), date: '2026-11-10', weight: 8, heightIn: 20, head: 0, notes: '', babyId: currentBabyId() }); refreshBabyView(); saveGrowth(); });
  v = await view(A);
  check('Milo sees only Milo\'s log and growth', v.logs.join() === 'Milo feed 1' && v.growth === 1, JSON.stringify(v));
  check('screen shows Milo\'s log, not Luna\'s', await screen(A, 'Milo feed 1') && !(await screen(A, 'Luna feed 1')));
  await switchTo(A, 'Luna'); await sleep(300);
  v = await view(A);
  check('back to Luna: only Luna\'s two logs, no growth', v.logs.join() === 'Luna feed 1,Luna feed 2' && v.growth === 0, JSON.stringify(v));
  const where = await A.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && e.textContent.includes('Milo feed 1') && e.offsetParent !== null).map(e => (e.id || e.className) + ': ' + e.textContent.slice(0, 60)));
  console.log('  toast text:', JSON.stringify(await A.evaluate(() => document.querySelector('.toast')?.textContent || null)));
  check('screen shows Luna\'s logs, not Milo\'s', await screen(A, 'Luna feed 2') && !(await screen(A, 'Milo feed 1')));
  await A.evaluate(() => deleteLog(logs.find(l => l.title === 'Luna feed 2').id));
  v = await view(A);
  check('deleting one of Luna\'s logs leaves Milo\'s alone', v.logs.join() === 'Luna feed 1' && v.all === 2, JSON.stringify(v));
  // wait for the sync (up to 15s; it is usually done in 2-3s)
  const wantDb = JSON.stringify([{ title: 'Luna feed 1', name: 'Luna' }, { title: 'Milo feed 1', name: 'Milo' }]);
  let db;
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    db = sql(`select l.title, b.name from logs l left join babies b on b.id = l.baby_id where l.user_id='${uid}' and not l.deleted order by 1`);
    if (JSON.stringify(db) === wantDb) break;
  }
  check('database: each log linked to the right baby', JSON.stringify(db) === wantDb, JSON.stringify(db));

  // ── 3. Second device gets both babies with separate timelines ──
  const B2 = await newPage(b);
  await B2.goto(URL, { waitUntil: 'networkidle' });
  await B2.fill('#auth-email', email); await B2.fill('#auth-password', password); await B2.click('#auth-submit-btn');
  await sleep(6000);
  v = await view(B2);
  check('device B: both babies arrive', v.babies.sort().join() === 'Luna,Milo', JSON.stringify(v));
  await switchTo(B2, 'Milo'); v = await view(B2);
  check('device B: Milo\'s timeline', v.logs.join() === 'Milo feed 1' && v.growth === 1, JSON.stringify(v));
  await switchTo(B2, 'Luna'); v = await view(B2);
  check('device B: Luna\'s timeline', v.logs.join() === 'Luna feed 1', JSON.stringify(v));
  // live: A logs for Milo while B looks at Luna -> B's Luna view unchanged, Milo view has it
  await switchTo(A, 'Milo'); await addLog(A, 'Milo live');
  let got = false;
  for (let i = 0; i < 20 && !got; i++) { await sleep(500); got = await B2.evaluate(() => allLogs.some(l => l.title === 'Milo live')); }
  v = await view(B2);
  check('live log for Milo arrives on B without showing under Luna', got && v.logs.join() === 'Luna feed 1', JSON.stringify(v));
  await switchTo(B2, 'Milo'); v = await view(B2);
  check('...and shows under Milo', v.logs.join() === 'Milo feed 1,Milo live', JSON.stringify(v));

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
