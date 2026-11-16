// Accessibility audit with axe-core: every screen, popup and log form, day
// and night. Usage: node tests/e2e/a11y.js [url] [path to axe.min.js]
const { chromium } = require('playwright'); const fs = require('fs');
const URL = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const AXE = fs.readFileSync(process.argv[3] || require.resolve('axe-core/axe.min.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' })).newPage();
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-06-01', emoji: '🌙' })); localStorage.setItem('bloom_nightMode', '"off"'); });
  await p.reload({ waitUntil: 'networkidle' });
  const results = {};
  const audit = async (where, scope) => {
    await p.addScriptTag({ content: AXE }).catch(() => {});
    const r = await p.evaluate(async sc => {
      const res = await axe.run(sc ? document.querySelector(sc) : document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] });
      return res.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, ex: v.nodes.slice(0, 2).map(x => x.target.join(' ') + (x.any[0]?.message ? ' — ' + x.any[0].message.slice(0, 90) : '')) }));
    }, scope);
    r.forEach(v => { const k = v.id; (results[k] = results[k] || { ...v, where: [], total: 0 }); results[k].where.push(where); results[k].total += v.n; });
  };
  await audit('auth screen');
  await p.evaluate(() => skipAuth()); await sleep(600);
  await p.evaluate(() => { const H = 36e5, n = Date.now(); [['feed','🍼','Bottle','Bottle · Formula · 4 oz'],['sleep','😴','Sleep','1h 20m'],['diaper','🌿','Diaper change','wet'],['temp','🌡️','Temperature','99.1 °F']].forEach(([t,i,ti,d],k) => allLogs.unshift({ id: 'a'+k, type: t, icon: i, title: ti, detail: d, time: new Date(n - (k+1)*H).toISOString(), babyId: currentBabyId(), tempF: 99.1, tempC: 37.3 })); refreshBabyView(); saveLogs(); renderHome(); });
  for (const mode of ['off', 'on']) {
    await p.evaluate(m => { nightMode = m; applyNightMode(); }, mode);
    for (const scr of ['home', 'insights', 'schedule', 'growth', 'book']) {
      await p.evaluate(n => { document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); switchScreen(n, document.querySelector(`.nav-btn[data-screen="${n}"]`)); }, scr); await sleep(500);
      await audit(`${scr} (${mode === 'on' ? 'night' : 'day'})`);
    }
  }
  await p.evaluate(() => { nightMode = 'off'; applyNightMode(); switchScreen('home', document.querySelector('.nav-btn[data-screen="home"]')); });
  const popups = { choose: "openModal('modal-choose')", profile: 'showProfileModal()', upgrade: "openModal('modal-upgrade')", 'add-baby': 'isPremium=true;openAddBabyModal()', reminders: 'isPremium=true;showRemindersModal()', partner: 'showPartnerModal()', pedi: 'isPremium=true;showPediReport()', coach: 'isPremium=true;showSleepCoach()' };
  for (const [n, f] of Object.entries(popups)) {
    await p.evaluate(f => { document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); eval(f); }, f); await sleep(700);
    await audit(`popup ${n}`, '.modal-overlay.open');
  }
  for (const t of await p.evaluate(() => Object.keys(LOG_CONFIGS))) {
    await p.evaluate(t => { document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); openLogModal(t); }, t); await sleep(400);
    await audit(`form ${t}`, '#modal-log');
  }
  // things axe can't fully judge
  const extra = await p.evaluate(() => ({
    zoomBlocked: /maximum-scale=1(\.0)?|user-scalable=no/.test(document.querySelector('meta[name=viewport]')?.content || ''),
    clickableNonButtons: [...document.querySelectorAll('[onclick]')].filter(e => !['BUTTON', 'A', 'INPUT', 'SELECT', 'LABEL'].includes(e.tagName) && !e.classList.contains('modal-overlay') && !e.getAttribute('role')).length,
    dialogsWithRole: [...document.querySelectorAll('.modal-overlay')].filter(m => m.querySelector('[role=dialog],[role=alertdialog]') || m.getAttribute('role') === 'dialog').length,
    dialogs: document.querySelectorAll('.modal-overlay').length,
    lang: document.documentElement.lang,
  }));
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const list = Object.values(results).sort((a, b) => order[a.impact] - order[b.impact] || b.total - a.total);
  console.log(`axe: ${list.length} distinct issues, ${list.reduce((s, v) => s + v.total, 0)} elements`);
  list.forEach(v => console.log(`[${v.impact}] ${v.id} (${v.total}) — ${v.help}\n    at: ${[...new Set(v.where)].slice(0, 5).join('; ')}${v.where.length > 5 ? ' …' : ''}\n    e.g. ${v.ex[0] || ''}`));
  console.log('\nother checks:', JSON.stringify(extra));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
