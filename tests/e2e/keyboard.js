// Keyboard and screen-reader behaviour (what axe can't check).
// Usage: node tests/e2e/keyboard.js [output folder] [url]
const { chromium } = require('playwright');
const S = process.argv[2] || '/tmp', URL = process.argv[3] || 'http://127.0.0.1:8765/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', e => console.log('  pageerror:', e.message));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-06-01', emoji: '🌙' })); localStorage.setItem('bloom_nightMode', '"off"'); });
  await p.reload({ waitUntil: 'networkidle' });
  await p.evaluate(() => document.getElementById('auth-screen').classList.contains('visible') && skipAuth()); await sleep(600);
  const active = () => p.evaluate(() => { const a = document.activeElement; return { tag: a.tagName, role: a.getAttribute('role'), text: (a.getAttribute('aria-label') || a.innerText || '').trim().slice(0, 30), inDialog: !!a.closest('.modal-overlay.open') }; });

  check('pinch-zoom is allowed', !(await p.getAttribute('meta[name=viewport]', 'content')).includes('maximum-scale'));
  // reach "Diaper" in the Log something grid with Tab
  let found = false;
  for (let i = 0; i < 80 && !found; i++) { await p.keyboard.press('Tab'); const a = await active(); found = a.role === 'button' && /\bDiaper$/.test(a.text); }
  check('Tab reaches the "Diaper" button in the log grid', found);
  await p.evaluate(() => document.activeElement.scrollIntoView({ block: 'center' })); await sleep(200);
  check('the focused button shows a visible outline', await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none' && parseFloat(getComputedStyle(document.activeElement).outlineWidth) >= 2));
  await p.screenshot({ path: `${S}/kb-focus.png` });
  await p.keyboard.press('Enter'); await sleep(300);
  check('Enter opens the diaper form', await p.evaluate(() => document.getElementById('modal-log').classList.contains('open') && document.getElementById('log-modal-title').textContent.includes('Diaper')));
  check('the form is announced as a dialog named "Diaper Change"', await p.evaluate(() => { const d = document.querySelector('#modal-log .modal'); return d.getAttribute('role') === 'dialog' && d.getAttribute('aria-modal') === 'true' && document.getElementById(d.getAttribute('aria-labelledby')).textContent.includes('Diaper Change'); }));
  check('focus moved into the dialog', (await active()).inDialog);
  let escaped = false;
  for (let i = 0; i < 25; i++) { await p.keyboard.press('Tab'); if (!(await active()).inDialog) escaped = true; }
  check('Tab stays inside the dialog', !escaped);
  for (let i = 0; i < 5; i++) { await p.keyboard.press('Shift+Tab'); if (!(await active()).inDialog) escaped = true; }
  check('Shift+Tab stays inside too', !escaped);
  check('fields have labels ("Type" -> diaper type)', (await p.getByLabel('Type').count()) >= 1 && await p.evaluate(() => document.getElementById('dp-type').labels.length === 1));
  await p.keyboard.press('Escape'); await sleep(200);
  check('Escape closes the dialog', !(await p.evaluate(() => document.getElementById('modal-log').classList.contains('open'))));
  const back = await active();
  check('focus returns to the Diaper button', /\bDiaper$/.test(back.text), JSON.stringify(back));
  // Space works too, and the + menu
  await p.keyboard.press(' '); await sleep(300);
  check('Space also activates it', await p.evaluate(() => document.getElementById('modal-log').classList.contains('open')));
  await p.keyboard.press('Escape'); await sleep(200);
  // saving announces a toast
  await p.evaluate(() => openLogModal('note')); await sleep(300);
  await p.fill('#nt-text', 'Keyboard test'); await p.locator('#log-modal-body .btn-primary').focus(); await p.keyboard.press('Enter'); await sleep(300);
  check('saving shows a toast screen readers announce', (await p.getAttribute('.toast', 'role')) === 'status');
  check('emoji-only controls have names', await p.evaluate(() => document.getElementById('avatar').getAttribute('aria-label') === 'Profile and settings' && !!document.getElementById('nightToggle').getAttribute('aria-label')));
  check('the main content is a landmark', await p.evaluate(() => document.getElementById('mainApp').getAttribute('role') === 'main'));
  // text can be enlarged without breaking the layout (200% zoom ≈ 195px wide viewport)
  await p.setViewportSize({ width: 195, height: 422 }); await sleep(300);
  const navOk = await p.evaluate(() => [...document.querySelectorAll('.nav-btn')].every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }));
  check('at 200% zoom all five tabs are on screen', navOk);
  check('...and keep their names for screen readers', await p.evaluate(() => [...document.querySelectorAll('.nav-btn')].every(b => b.innerText.trim().length > 2 || b.textContent.trim().length > 2)));
  check('at 200% zoom nothing scrolls sideways', await p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1), String(await p.evaluate(() => document.scrollingElement.scrollWidth)));
  await p.screenshot({ path: `${S}/kb-zoom200.png` });
  console.log(`\n${pass} passed, ${fail} failed`); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
