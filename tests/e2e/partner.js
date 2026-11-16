const { chromium } = require('playwright'); const { execFileSync } = require('child_process');
const S = process.argv[2] || '/tmp', BASE = process.argv[3] || 'http://127.0.0.1:8765/';
const URL = BASE.endsWith('/') ? BASE + (BASE.includes('127.0.0.1') ? 'index.html' : '') : BASE;
const sql = q => { const out = execFileSync(require('path').join(__dirname, '..', 'q.sh'), [q]).toString().trim().split('\n'); const code = out.pop(); const body = JSON.parse(out.join('\n'));
  if (!/HTTP 20/.test(code)) throw new Error('SQL failed: ' + code + ' ' + JSON.stringify(body).slice(0, 200)); return body; };
const sqlRaw = q => execFileSync(require('path').join(__dirname, '..', 'q.sh'), [q]).toString();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (label, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + label + (extra ? '  ' + extra : '')); };
const stamp = Date.now();
async function newPage(b, name, dialogAnswer) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', e => console.log(`  [${name} pageerror]`, e.message));
  p.on('console', m => { if (/Sync (push|failed)/.test(m.text())) console.log(`  [${name}]`, m.text()); });
  p.on('dialog', d => d.accept(dialogAnswer ? dialogAnswer() : undefined));
  return p;
}
async function signUp(p, email, url = URL) {
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.click('text=Create Account'); await p.fill('#auth-email', email); await p.fill('#auth-password', 'Partner-test-123'); await p.click('#auth-submit-btn');
  await sleep(5000);
}
const st = p => p.evaluate(() => ({ babies: babies.map(b => b.baby).sort(), active: profile?.baby || null, logs: logs.map(l => l.title).sort(),
  all: allLogs.map(l => l.title).sort(), isPremium, ownPremium, hasSharedAccess,
  inApp: document.getElementById('mainApp')?.style.display !== 'none', toast: document.querySelector('.toast')?.textContent || '' }));
const addLog = (p, t) => p.evaluate(t => pushLog({ id: uid(), type: 'feed', icon: '🍼', title: t, detail: '', time: new Date().toISOString() }), t);
const waitFor = async (fn, ms = 10000) => { for (let i = 0; i < ms / 500; i++) { if (await fn()) return true; await sleep(500); } return false; };

(async () => {
  const b = await chromium.launch();
  // ── Owner ──
  const O = await newPage(b, 'owner');
  await signUp(O, `lumaby-e2e-owner-${stamp}@mailinator.com`);
  const ownerId = await O.evaluate(() => currentUser.id);
  sql(`insert into public.subscriptions (user_id, status, plan) values ('${ownerId}', 'trialing', 'monthly')`);
  await O.reload({ waitUntil: 'networkidle' }); await sleep(4000);
  await O.fill('#ob-parent', 'Sam'); await O.fill('#ob-baby', 'Luna'); await O.click('text=Start tracking'); await sleep(2000);
  await addLog(O, 'Luna by owner');
  await O.evaluate(() => { babies.push({ id: uid(), baby: 'Milo', dob: '2026-09-01', emoji: '⭐', parent: 'Sam' }); saveBabies(); switchBaby(babies.length - 1); });
  await addLog(O, 'Milo secret');
  await O.evaluate(() => switchBaby(babies.findIndex(b => b.baby === 'Luna')));
  await sleep(3000);

  // owner creates an invite through the real UI
  await O.evaluate(() => showPartnerModal()); await sleep(2500);
  check('owner sees "Share Luna" with an invite button', (await O.locator('#partner-modal-body').innerText()).includes('Share Luna'));
  await O.click('text=Create invite code');
  await O.waitForSelector('.invite-code-box', { timeout: 15000 });
  const code = (await O.locator('.invite-code-box').innerText()).trim();
  check('invite code created', /^[A-Z2-9]{6}$/.test(code), code);
  const ownCode = await O.evaluate(async c => (await supabaseClient.rpc('accept_partner_invite', { p_code: c })).error?.message || 'no error', code);
  check('owner can\'t redeem their own code', /your own invite/i.test(ownCode), ownCode);

  // ── Partner joins by opening the link, then signing up ──
  const P = await newPage(b, 'partner');
  await signUp(P, `lumaby-e2e-partner-${stamp}@mailinator.com`, URL + (URL.includes('?') ? '&' : '?') + 'join=' + code);
  let s = await st(P);
  check('partner lands in the app on Luna, skipping onboarding', s.inApp && s.active === 'Luna', JSON.stringify({ inApp: s.inApp, active: s.active }));
  check('partner gets only the shared baby, not Milo', s.babies.join() === 'Luna', JSON.stringify(s.babies));
  check('partner sees the owner\'s Luna log, never Milo\'s', s.logs.join() === 'Luna by owner' && !s.all.includes('Milo secret'), JSON.stringify(s.all));
  check('partner is covered by owner\'s Premium (no own subscription)', s.isPremium && !s.ownPremium && s.hasSharedAccess);

  // ── Live both ways ──
  await addLog(P, 'Feed by partner');
  check('partner\'s log appears on owner live', await waitFor(() => O.evaluate(() => logs.some(l => l.title === 'Feed by partner'))));
  await addLog(O, 'Nap by owner');
  check('owner\'s log appears on partner live', await waitFor(() => P.evaluate(() => logs.some(l => l.title === 'Nap by owner'))));
  await P.evaluate(() => deleteLog(logs.find(l => l.title === 'Luna by owner').id));
  check('partner deletes a log -> gone on owner', await waitFor(() => O.evaluate(() => !allLogs.some(l => l.title === 'Luna by owner'))));

  // owner's sharing screen lists the partner
  await O.evaluate(() => showPartnerModal()); await sleep(2500);
  const modal = await O.locator('#partner-modal-body').innerText();
  check('owner\'s sharing screen lists the partner', modal.includes(`lumaby-e2e-partner-${stamp}`) && modal.includes('Remove'));

  // ── Codes: single use, wrong codes, guess limit ──
  const Q = await newPage(b, 'stranger');
  await signUp(Q, `lumaby-e2e-stranger-${stamp}@mailinator.com`);
  const reuse = await Q.evaluate(async c => (await supabaseClient.rpc('accept_partner_invite', { p_code: c })).data, code);
  check('a used code doesn\'t work again', reuse === null);
  let limited = '';
  for (let i = 0; i < 11; i++) limited = await Q.evaluate(async () => { const r = await supabaseClient.rpc('accept_partner_invite', { p_code: 'ZZZZZZ' }); return r.error?.message || String(r.data); });
  check('too many wrong codes are blocked', /Too many attempts/.test(limited), limited);
  const strangerSees = await Q.evaluate(async () => (await supabaseClient.from('logs').select('id')).data.length);
  check('stranger can read none of the logs', strangerSees === 0, String(strangerSees));

  // ── Partner can't delete the baby or write to Milo ──
  const babyDel = await P.evaluate(async () => { const b = babies[0]; return (await supabaseClient.from('babies').update({ deleted: true }).eq('id', b.id)).error?.message || 'allowed'; });
  check('partner can\'t delete the owner\'s baby', /owner can delete/i.test(babyDel), babyDel);
  const miloId = await O.evaluate(() => babies.find(b => b.baby === 'Milo').id);
  const partnerId = await P.evaluate(() => currentUser.id);
  const miloWrite = await P.evaluate(async ([mid, me]) => (await supabaseClient.from('logs').insert({ id: 'x' + Date.now(), user_id: me, baby_id: mid, data: {} })).error?.message || 'allowed', [miloId, partnerId]);
  check('partner can\'t write to the unshared baby', /row-level security/.test(miloWrite), miloWrite);

  // ── Owner's Premium lapses -> partner can read but not write ──
  sql(`update public.subscriptions set status='expired' where user_id='${ownerId}'`);
  const lunaId = await O.evaluate(() => babies.find(b => b.baby === 'Luna').id);
  const lapsed = await P.evaluate(async ([bid, me]) => (await supabaseClient.from('logs').insert({ id: 'y' + Date.now(), user_id: me, baby_id: bid, data: {} })).error?.message || 'allowed', [lunaId, partnerId]);
  check('when owner\'s Premium lapses, partner writes are refused', /row-level security/.test(lapsed), lapsed);
  sql(`update public.subscriptions set status='trialing' where user_id='${ownerId}'`);

  // ── Owner removes the partner ──
  await O.evaluate(([bid, pid]) => removePartner(bid, pid, false), [lunaId, partnerId]); await sleep(2000);
  await P.evaluate(() => syncNow());
  // the app reloads to the welcome screen when the only shared baby is gone: wait for that
  s = null;
  for (let i = 0; i < 30 && !s; i++) {
    await sleep(500);
    s = await P.evaluate(() => (typeof babies !== 'undefined' && document.readyState === 'complete' && !babies.length) ? { babies: babies.map(b => b.baby), all: allLogs.map(l => l.title) } : null).catch(() => null);
  }
  s = s || { babies: ['(still there)'], all: [] };
  check('removed partner loses the baby and its logs on their device', !s.babies.includes('Luna') && !s.all.some(t => /partner|owner/.test(t)), JSON.stringify({ babies: s.babies, all: s.all }));
  const after = await P.evaluate(async () => (await supabaseClient.from('logs').select('id')).data.length);
  check('removed partner can no longer read any of the logs (even their own)', after === 0, String(after));

  // ── Onboarding route: "My partner already set up our baby" ──
  await O.evaluate(() => showPartnerModal()); await sleep(2500);
  await O.click('text=Create invite code'); await O.waitForSelector('.invite-code-box', { timeout: 15000 });
  const code2 = (await O.locator('.invite-code-box').innerText()).trim();
  const R = await newPage(b, 'partner2', () => code2);
  await signUp(R, `lumaby-e2e-partner2-${stamp}@mailinator.com`);
  await R.click('text=My partner already set up our baby'); await sleep(7000);
  s = await st(R);
  check('onboarding "partner already set up" joins and opens Luna', s.inApp && s.active === 'Luna' && s.babies.join() === 'Luna', JSON.stringify({ inApp: s.inApp, active: s.active, babies: s.babies }));

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
