// Delete my account (App Store / Google Play requirement), against the real
// Supabase project:
//  • a partner deletes their account: their entries on the shared baby stay,
//    handed to the owner; their login and membership are gone
//  • an owner with a renewing subscription is told to cancel first
//  • after cancelling, the owner deletes: babies, logs (including the
//    partner's), invites, settings and login all gone; the device is wiped
//   node tests/e2e/deleteaccount.js <screenshot dir> [url]
const { chromium } = require('playwright'); const { execFileSync } = require('child_process');
const S = process.argv[2] || '/tmp', BASE = process.argv[3] || 'http://127.0.0.1:8765/';
const URL = BASE.endsWith('/') ? BASE + (BASE.includes('127.0.0.1') ? 'index.html' : '') : BASE;
const sql = q => { const out = execFileSync(require('path').join(__dirname, '..', 'q.sh'), [q]).toString().trim().split('\n'); const code = out.pop(); const body = JSON.parse(out.join('\n'));
  if (!/HTTP 20/.test(code)) throw new Error('SQL failed: ' + code + ' ' + JSON.stringify(body).slice(0, 200)); return body; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (label, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + label + (extra ? '  ' + extra : '')); };
const stamp = Date.now();
async function newPage(b, name) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', e => console.log(`  [${name} pageerror]`, e.message));
  p.on('dialog', d => d.accept());
  return p;
}
async function signUp(p, email, url = URL) {
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.click('text=Create Account'); await p.fill('#auth-email', email); await p.fill('#auth-password', 'Delete-test-123'); await p.click('#auth-submit-btn');
  await sleep(5000);
}
const addLog = (p, t) => p.evaluate(t => pushLog({ id: uid(), type: 'feed', icon: '🍼', title: t, detail: '', time: new Date().toISOString() }), t);
const waitFor = async (fn, ms = 15000) => { for (let i = 0; i < ms / 500; i++) { if (await fn()) return true; await sleep(500); } return false; };
async function deleteViaUi(p) {
  await p.evaluate(() => showAccountModal()); await sleep(300);
  await p.click('text=Delete account'); await sleep(300);
  const disabledBefore = await p.locator('#del-go').isDisabled();
  await p.fill('#del-confirm', 'delete');
  const enabledAfter = await p.locator('#del-go').isEnabled();
  await p.click('#del-go');
  return { disabledBefore, enabledAfter };
}

(async () => {
  const b = await chromium.launch();
  // ── owner with Premium (needed to share), one baby, one log ──
  const O = await newPage(b, 'owner');
  const ownerEmail = `lumaby-e2e-delowner-${stamp}@mailinator.com`;
  await signUp(O, ownerEmail);
  const ownerId = await O.evaluate(() => currentUser.id);
  sql(`insert into public.subscriptions (user_id, status, plan, expires_at) values ('${ownerId}', 'active', 'monthly', now() + interval '20 days')`);
  await O.reload({ waitUntil: 'networkidle' }); await sleep(4000);
  await O.fill('#ob-parent', 'Sam'); await O.fill('#ob-baby', 'Luna'); await O.click("text=Let's begin"); await sleep(2000);
  await addLog(O, 'by owner');
  await sleep(3000);
  await O.evaluate(() => showPartnerModal()); await sleep(2500);
  await O.click('text=Create invite code');
  await O.waitForSelector('.invite-code-box', { timeout: 15000 });
  const code = (await O.locator('.invite-code-box').innerText()).trim();
  await O.evaluate(() => closeModal('modal-partner'));

  // ── partner joins and adds an entry ──
  const P = await newPage(b, 'partner');
  await signUp(P, `lumaby-e2e-delpartner-${stamp}@mailinator.com`, URL + '?join=' + code);
  const partnerId = await P.evaluate(() => currentUser?.id);
  await addLog(P, 'by partner');
  check('partner entry reaches the server', await waitFor(() => sql(`select count(*)::int n from logs where title='by partner' and user_id='${partnerId}'`)[0].n === 1));

  // ── partner deletes their account ──
  await P.evaluate(() => showAccountModal()); await sleep(300);
  check('My Account has "Delete account"', await P.locator('#account-modal-body >> text=Delete account').count() === 1);
  const ui = await deleteViaUi(P);
  check('button stays off until DELETE is typed (any case)', ui.disabledBefore && ui.enabledAfter);
  check('"Your account and data were deleted" shown', await waitFor(async () => (await P.evaluate(() => document.querySelector('.toast')?.textContent || '').catch(() => '')).includes('account and data were deleted'), 12000));
  check('partner login is gone', sql(`select count(*)::int n from auth.users where id='${partnerId}'`)[0].n === 0);
  check('partner membership is gone', sql(`select count(*)::int n from baby_members where user_id='${partnerId}'`)[0].n === 0);
  const kept = sql(`select user_id from logs where title='by partner'`);
  check('their entry on Luna stays, now owned by the owner', kept.length === 1 && kept[0].user_id === ownerId, JSON.stringify(kept));
  const pState = await P.evaluate(() => ({ keys: Object.keys(localStorage).filter(k => !/^sb-.*-code-verifier$/.test(k)), auth: document.getElementById('auth-screen').classList.contains('visible') || !!document.getElementById('onboarding') && !document.getElementById('onboarding').classList.contains('hidden'), toast: document.querySelector('.toast')?.textContent || '' }));
  check('partner device wiped and back at the start', pState.auth && !pState.keys.some(k => /bloom_logs|bloom_profile|sb-.*auth-token/.test(k)), JSON.stringify(pState.keys));

  // ── owner with a renewing subscription is blocked ──
  await deleteViaUi(O); await sleep(3000);
  const err = await O.locator('#del-error').innerText();
  check('renewing subscription: asked to cancel first', /still active/.test(err) && /Manage subscription/.test(err), JSON.stringify(err));
  check('nothing deleted', sql(`select count(*)::int n from auth.users where id='${ownerId}'`)[0].n === 1 && sql(`select count(*)::int n from logs where baby_id in (select id from babies where user_id='${ownerId}')`)[0].n === 2);
  await O.screenshot({ path: `${S}/delete-blocked.png` });
  await O.evaluate(() => closeModal('modal-delete-account'));

  // ── cancelled (runs to period end): deletion allowed ──
  sql(`update subscriptions set cancel_at_period_end = true, status = 'cancelled' where user_id='${ownerId}'`);
  await deleteViaUi(O); await sleep(5000);
  const left = sql(`select (select count(*) from auth.users where id='${ownerId}')::int users, (select count(*) from babies where user_id='${ownerId}')::int babies,
    (select count(*) from logs where title in ('by owner','by partner'))::int logs, (select count(*) from partner_invites where created_by='${ownerId}')::int invites,
    (select count(*) from subscriptions where user_id='${ownerId}')::int subs, (select count(*) from profiles where user_id='${ownerId}')::int profiles`)[0];
  check('owner deleted: login, babies, all logs (incl. partner\'s), invites, subscription row, profile', Object.values(left).every(n => n === 0), JSON.stringify(left));
  check('owner device back at the sign-in screen', await O.evaluate(() => document.getElementById('auth-screen').classList.contains('visible')));
  const relogin = await O.evaluate(async e => (await supabaseClient.auth.signInWithPassword({ email: e, password: 'Delete-test-123' })).error?.message || 'signed in', ownerEmail);
  check('old password no longer signs in', /invalid/i.test(relogin), relogin);

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
