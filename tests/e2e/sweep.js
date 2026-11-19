// Full sweep of the live site: every screen, popup and log form, free and
// Premium, day and night. Records errors, CSP violations, failed requests,
// layout overflow, and whether each save/export works.
const { chromium } = require('playwright'); const { execFileSync } = require('child_process'); const fs = require('fs');
const S = process.argv[2] || '/tmp', URL = process.argv[3] || 'https://lumabyy.netlify.app/';
const OUT = S + '/sweep'; fs.mkdirSync(OUT, { recursive: true });
const sql = q => JSON.parse(execFileSync(require('path').join(__dirname, '..', 'q.sh'), [q]).toString().trim().split('\n').slice(0, -1).join('\n'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const findings = [];
const note = (state, where, kind, detail) => { findings.push({ state, where, kind, detail }); };

function watch(p, state, whereRef) {
  p.on('pageerror', e => note(state, whereRef.v, 'JS error', e.message));
  p.on('console', m => {
    const t = m.text();
    if (/Content Security Policy/i.test(t)) note(state, whereRef.v, 'CSP violation', t.slice(0, 160));
    else if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of 40[16]/.test(t)) note(state, whereRef.v, 'console error', t.slice(0, 160));
  });
  p.on('response', r => { if (r.status() >= 400 && !/supabase\.co\/(rest|auth)/.test(r.url())) note(state, whereRef.v, `HTTP ${r.status()}`, r.url().slice(0, 120)); });
  p.on('requestfailed', r => { const u = r.url(); if (!/fonts\.g|cdnjs|lemonsqueezy/.test(u)) note(state, whereRef.v, 'request failed', u.slice(0, 120) + ' ' + r.failure()?.errorText); });
  p.on('dialog', d => d.accept('ABC234'));
}
async function overflow(p, scopeSel) {
  return p.evaluate(sel => {
    const W = window.innerWidth, out = [];
    if (document.scrollingElement.scrollWidth > W + 1) out.push(`page scrolls sideways (${document.scrollingElement.scrollWidth}px > ${W}px)`);
    const scope = sel ? document.querySelector(sel) : document.body;
    if (!scope) return out;
    scope.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('.quick-log, .day-strip, .baby-switcher, [style*="overflow-x"]')) return;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      if (r.right > W + 2 && cs.position !== 'fixed') out.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} sticks out ${Math.round(r.right - W)}px: "${(el.innerText || '').trim().slice(0, 40)}"`);
    });
    return [...new Set(out)].slice(0, 6);
  }, scopeSel);
}
const seedLogs = () => {
  const H = 3600e3, now = Date.now(), id = () => Math.random().toString(36).slice(2, 10);
  const b = currentBabyId();
  const add = (o) => allLogs.unshift({ id: id(), babyId: b, ...o });
  for (let d = 0; d < 6; d++) {
    add({ type: 'feed', icon: '🍼', title: 'Bottle', detail: 'Bottle · Formula · 4 oz', feedType: 'formula', oz: 4, time: new Date(now - (d * 24 + 3) * H).toISOString() });
    add({ type: 'feed', icon: '🤱', title: 'Nursing', detail: 'Nursing · L 8m · R 6m', feedType: 'breast-both', leftMin: 8, rightMin: 6, durationMin: 14, lastSide: 'right', time: new Date(now - (d * 24 + 6) * H).toISOString() });
    add({ type: 'sleep', icon: '😴', title: 'Sleep', detail: '1h 30m', durationMin: 90, wakeUps: 1, time: new Date(now - (d * 24 + 5) * H).toISOString() });
    add({ type: 'diaper', icon: '🌿', title: 'Diaper change', detail: 'wet', diaperType: 'wet', time: new Date(now - (d * 24 + 2) * H).toISOString() });
  }
  add({ type: 'temp', icon: '🌡️', title: 'Temperature', detail: '100.9 °F · Fever', tempF: 100.9, tempC: 38.3, unit: 'F', fever: true, time: new Date(now - 8 * H).toISOString() });
  add({ type: 'milestone', icon: '😊', title: 'First smile', detail: '', time: new Date(now - 30 * H).toISOString() });
  allLogs.sort((a, b) => new Date(b.time) - new Date(a.time));
  allGrowth.push({ id: id(), babyId: b, date: '2026-10-01', weight: 12.1, heightIn: 23.5, head: 40 }, { id: id(), babyId: b, date: '2026-11-01', weight: 13.4, heightIn: 24.4, head: 41 });
  refreshBabyView(); saveLogs(); saveGrowth(); renderHome();
};

async function sweepState(b, state, prepare) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', acceptDownloads: true });
  const p = await ctx.newPage(); const where = { v: 'load' }; watch(p, state, where);
  await prepare(p, where);
  for (const mode of ['off', 'on']) {
    await p.evaluate(m => { nightMode = m; applyNightMode(); document.querySelector('.toast')?.remove(); }, mode);
    for (const scr of ['home', 'insights', 'schedule', 'growth', 'book']) {
      where.v = `screen ${scr} (${mode === 'on' ? 'night' : 'day'})`;
      await p.evaluate(n => { closeModal('modal-log'); switchScreen(n, document.querySelector(`.nav-btn[data-screen="${n}"]`)); window.scrollTo(0, 0); }, scr);
      await sleep(700);
      (await overflow(p, `#screen-${scr}`)).forEach(o => note(state, where.v, 'layout', o));
      await p.screenshot({ path: `${OUT}/${state}-${mode}-${scr}.png`, fullPage: true });
    }
  }
  await p.evaluate(() => { nightMode = 'off'; applyNightMode(); switchScreen('home', document.querySelector('.nav-btn[data-screen="home"]')); });
  // popups
  const popups = { choose: () => openModal('modal-choose'), profile: () => showProfileModal(), reminders: () => showRemindersModal(), partner: () => showPartnerModal(),
    pedi: () => showPediReport(), coach: () => showSleepCoach(), upgrade: () => openModal('modal-upgrade'), 'baby-edit': () => (typeof openBabyEdit === 'function' ? openBabyEdit(0) : openModal('modal-baby-edit')) };
  for (const [name, fn] of Object.entries(popups)) {
    where.v = `popup ${name}`;
    await p.evaluate(src => { document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); try { eval('(' + src + ')')(); } catch (e) { console.error('open failed: ' + e.message); } }, fn.toString());
    await sleep(900);
    const open = await p.evaluate(() => [...document.querySelectorAll('.modal-overlay.open')].map(m => m.id));
    if (!open.length) note(state, where.v, 'no popup opened', '');
    (await overflow(p, '.modal-overlay.open')).forEach(o => note(state, where.v, 'layout', o));
    await p.screenshot({ path: `${OUT}/${state}-popup-${name}.png` });
  }
  // every log form: open, screenshot, save with defaults
  const types = await p.evaluate(() => Object.keys(LOG_CONFIGS));
  for (const t of types) {
    where.v = `log form ${t}`;
    await p.evaluate(() => document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')));
    await p.evaluate(t => openLogModal(t), t); await sleep(500);
    (await overflow(p, '#modal-log')).forEach(o => note(state, where.v, 'layout', o));
    await p.screenshot({ path: `${OUT}/${state}-log-${t}.png` });
    const before = await p.evaluate(() => allLogs.length);
    // fill required-ish fields
    await p.evaluate(() => {
      const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input')); } };
      set('gr-weight', '13.6'); set('gr-height', '24.6'); set('ms-title', 'Rolled over'); set('nt-text', 'Test note'); set('md-name', 'Vitamin D');
      set('note-text', 'Test note'); set('ms-name', 'Rolled over'); set('med-name', 'Vitamin D');
    });
    const btn = p.locator('#log-modal-body .btn-primary').last();
    if (await btn.count()) { await btn.click({ timeout: 5000 }).catch(e => note(state, where.v, 'save button not clickable', e.message.split('\n')[0])); }
    await sleep(500);
    const after = await p.evaluate(() => allLogs.length), toast = await p.evaluate(() => document.querySelector('.toast')?.innerText || '');
    if (after <= before && !/Set the amount|Enter/.test(toast) && t !== 'feed') note(state, where.v, 'save did not add a log', `toast: "${toast}"`);
    findings.push({ state, where: where.v, kind: 'ok?', detail: `logs ${before}->${after} toast "${toast}"`, info: true });
  }
  await p.evaluate(() => document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')));
  // exports
  if (state === 'premium') {
    for (const [name, fn] of [['CSV export', 'exportData()'], ['pediatrician PDF', 'generatePediPDF()'], ['baby book PDF', 'generatePDF()']]) {
      where.v = name;
      const got = await Promise.all([p.waitForEvent('download', { timeout: 40000 }).then(d => d.suggestedFilename()).catch(() => null), p.evaluate(f => eval(f), fn).catch(e => 'ERR ' + e.message)]);
      if (!got[0]) note(state, where.v, 'no download', String(got[1] || ''));
      else findings.push({ state, where: name, kind: 'ok', detail: got[0], info: true });
      await sleep(800);
    }
  }
  await ctx.close();
}

(async () => {
  const b = await chromium.launch();
  await sweepState(b, 'free', async (p, where) => {
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-07-01', emoji: '🌙' })); });
    await p.reload({ waitUntil: 'networkidle' });
    where.v = 'auth screen'; await p.screenshot({ path: `${OUT}/free-auth.png` });
    await p.evaluate(() => document.getElementById('auth-screen').classList.contains('visible') && skipAuth()); await sleep(800);
    await p.evaluate(seedLogs); await sleep(500);
  });
  let uid;
  await sweepState(b, 'premium', async (p, where) => {
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.click('text=Create Account'); await p.fill('#auth-email', `lumaby-e2e-sweep-${Date.now()}@mailinator.com`); await p.fill('#auth-password', 'Sweep-test-123'); await p.click('#auth-submit-btn');
    await sleep(4000);
    uid = await p.evaluate(() => currentUser.id);
    sql(`insert into public.subscriptions (user_id, status, plan) values ('${uid}', 'trialing', 'monthly')`);
    await p.reload({ waitUntil: 'networkidle' }); await sleep(4000);
    where.v = 'onboarding'; await p.screenshot({ path: `${OUT}/premium-onboarding.png` });
    await p.fill('#ob-parent', 'Sam'); await p.fill('#ob-baby', 'Luna'); await p.click("text=Let's begin"); await sleep(2000);
    await p.evaluate(seedLogs); await sleep(3000);
  });
  await b.close();
  fs.writeFileSync(OUT + '/findings.json', JSON.stringify(findings, null, 1));
  const real = findings.filter(f => !f.info);
  const grouped = {};
  real.forEach(f => { const k = `${f.kind}: ${f.detail}`; (grouped[k] = grouped[k] || []).push(`${f.state}/${f.where}`); });
  console.log(`\n${real.length} findings (${Object.keys(grouped).length} distinct):`);
  Object.entries(grouped).forEach(([k, w]) => console.log(`- ${k}\n    at: ${[...new Set(w)].slice(0, 6).join('; ')}${w.length > 6 ? ' …' : ''}`));
  console.log('\nsaves/exports:'); findings.filter(f => f.info).forEach(f => console.log(`  ${f.state} ${f.where}: ${f.detail}`));
})().catch(e => { console.error(e); process.exit(1); });
