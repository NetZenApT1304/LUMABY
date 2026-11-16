const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const S = process.argv[2] || '/tmp', URL = process.argv[3] || 'http://127.0.0.1:8765/index.html';
const sql = q => JSON.parse(execFileSync(require('path').join(__dirname, '..', 'q.sh'), [q]).toString().trim().split('\n').slice(0, -1).join('\n'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const email = `lumaby-e2e-sync-${Date.now()}@mailinator.com`, password = 'E2e-sync-' + Date.now().toString(36);
let pass = 0, fail = 0;
const check = (label, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + label + (extra ? '  ' + extra : '')); };

async function device(b, name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`  [${name} pageerror]`, e.message));
  page.on('console', m => { if (/Sync failed|Render after sync/.test(m.text())) console.log(`  [${name}]`, m.text()); });
  page.on('dialog', d => d.accept());
  return page;
}
const state = p => p.evaluate(() => ({
  logs: logs.map(l => l.title), growth: growthLogs.length, babies: babies.map(b => b.baby), profile: profile?.baby || null,
  pending: syncPending(), premium: isPremium, user: currentUser?.email || null,
  onboarding: !document.getElementById('onboarding').classList.contains('hidden') && getComputedStyle(document.getElementById('onboarding')).display !== 'none',
}));

(async () => {
  const b = await chromium.launch();
  // ── Device A: sign up, become premium, onboard ──
  const A = await device(b, 'A');
  await A.goto(URL, { waitUntil: 'networkidle' });
  await A.click('text=Create Account');
  await A.fill('#auth-email', email); await A.fill('#auth-password', password); await A.click('#auth-submit-btn');
  await sleep(4000);
  const uid = await A.evaluate(() => currentUser.id);
  sql(`insert into public.subscriptions (user_id, status, plan, ls_subscription_id) values ('${uid}', 'trialing', 'monthly', 'e2e-${uid}')`);
  await A.reload({ waitUntil: 'networkidle' }); await sleep(5000);
  let s = await state(A);
  check('A signed in and premium', s.premium && s.user === email, JSON.stringify({ premium: s.premium, onboarding: s.onboarding }));
  if (s.onboarding) {
    await A.fill('#ob-parent', 'Parent A').catch(() => {});
    await A.fill('#ob-baby', 'Luna').catch(() => {});
    await A.click('text=Start tracking'); await sleep(2500);
  }
  await A.evaluate(() => {
    pushLog({ id: uid(), type: 'feed', icon: '🍼', title: 'Feed A1', detail: '4oz', time: new Date().toISOString(), oz: 4 });
    pushLog({ id: uid(), type: 'diaper', icon: '🌿', title: 'Diaper A2', detail: 'wet', time: new Date().toISOString() });
    allGrowth.push({ id: uid(), date: '2026-11-01', weight: 12.5, heightIn: 24, head: 40, notes: '', babyId: currentBabyId() }); refreshBabyView(); saveGrowth();
  });
  await sleep(4000);
  s = await state(A);
  check('A has baby + 2 logs + growth, nothing pending', s.babies.length === 1 && s.logs.length === 2 && s.growth === 1 && s.pending === 0, JSON.stringify(s));
  const db = sql(`select (select count(*) from logs where user_id='${uid}' and not deleted) logs, (select count(*) from growth_logs where user_id='${uid}') growth, (select string_agg(name, ',') from babies where user_id='${uid}') babies`)[0];
  check('Supabase has the data', db.logs == 2 && db.growth == 1 && db.babies === 'Luna', JSON.stringify(db));

  // ── Device B: fresh browser, same account ──
  const B = await device(b, 'B');
  await B.goto(URL, { waitUntil: 'networkidle' });
  await B.fill('#auth-email', email); await B.fill('#auth-password', password); await B.click('#auth-submit-btn');
  await sleep(6000);
  s = await state(B);
  check('B skips onboarding and gets the same baby', !s.onboarding && s.babies.join() === 'Luna' && s.profile === 'Luna', JSON.stringify({ babies: s.babies, onboarding: s.onboarding }));
  check('B has both logs and the growth entry', s.logs.length === 2 && s.growth === 1, JSON.stringify(s.logs));
  const timelineB = await B.locator('body').innerText();
  check('B shows the logs on screen', timelineB.includes('Feed A1'));

  // ── Live updates ──
  await A.evaluate(() => pushLog({ id: uid(), type: 'sleep', icon: '😴', title: 'Nap from A', detail: '1h', time: new Date().toISOString(), durationMin: 60 }));
  let live = false;
  for (let i = 0; i < 20 && !live; i++) { await sleep(500); live = (await state(B)).logs.includes('Nap from A'); }
  check('A adds a log -> appears on B live (no reload)', live);
  let drawn = false;
  for (let i = 0; i < 12 && !drawn; i++) { await sleep(250); drawn = (await B.locator('#timeline').innerText()).includes('Nap from A'); }
  check('B redraws the timeline', drawn);

  await B.evaluate(() => { const l = logs.find(x => x.title === 'Diaper A2'); deleteLog(l.id); });
  let gone = false;
  for (let i = 0; i < 20 && !gone; i++) { await sleep(500); gone = !(await state(A)).logs.includes('Diaper A2'); }
  check('B deletes a log -> removed on A live', gone);

  await B.evaluate(() => { const l = logs.find(x => x.title === 'Feed A1'); l.detail = '6oz (edited on B)'; saveLogs(); });
  let edited = false;
  for (let i = 0; i < 20 && !edited; i++) { await sleep(500); edited = await A.evaluate(() => logs.find(x => x.title === 'Feed A1')?.detail === '6oz (edited on B)'); }
  check('B edits a log -> edit appears on A', edited);

  // ── Offline change on A syncs when it reconnects ──
  await A.context().setOffline(true);
  await A.evaluate(() => pushLog({ id: uid(), type: 'note', icon: '📝', title: 'Offline note', detail: 'x', time: new Date().toISOString() }));
  await sleep(3000);
  check('A offline: change kept and queued', (await state(A)).pending >= 1);
  await A.context().setOffline(false);
  await A.evaluate(() => window.dispatchEvent(new Event('online')));
  let arrived = false;
  for (let i = 0; i < 30 && !arrived; i++) { await sleep(500); arrived = (await state(B)).logs.includes('Offline note'); }
  check('A back online -> offline change reaches B', arrived);

  // ── Sign out clears synced data from the device ──
  await B.evaluate(() => signOut()); await sleep(4000);
  const afterOut = await B.evaluate(() => ({ logs: JSON.parse(localStorage.getItem('bloom_logs') || '[]').length, babies: JSON.parse(localStorage.getItem('bloom_babies') || '[]').length }));
  check('Sign out on B removes the account data from B', afterOut.logs === 0 && afterOut.babies === 0, JSON.stringify(afterOut));

  const final = sql(`select (select count(*) from logs where user_id='${uid}' and not deleted) live, (select count(*) from logs where user_id='${uid}' and deleted) tomb`)[0];
  check('Database: 3 live logs + 1 deleted', final.live == 3 && final.tomb == 1, JSON.stringify(final));
  console.log(`\n${pass} passed, ${fail} failed`); console.log('TEST_USER_ID=' + uid);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
