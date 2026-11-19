// Logo and icons (brand/BRAND.md): every icon the manifest, page and service
// worker point at exists at its stated size, and the lockup shows on the
// sign-in and welcome screens in day and night mode.
//   node tests/e2e/brand.js [url]
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const ROOT = new URL('./', BASE).href;
let pass = 0, fail = 0; const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });

  // image size of a URL, measured in the page
  const size = src => p.evaluate(u => new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth + 'x' + i.naturalHeight); i.onerror = () => res('missing'); i.src = u; }), new URL(src, ROOT).href);

  const manifest = await (await p.request.get(ROOT + 'manifest.json')).json();
  const bad = [];
  for (const ic of [...manifest.icons, ...manifest.shortcuts.flatMap(s => s.icons || [])]) {
    const got = await size(ic.src); if (got !== ic.sizes) bad.push(`${ic.src}: ${got} (says ${ic.sizes})`);
  }
  check('every manifest icon exists at its stated size', !bad.length, bad.join('; '));
  check('manifest has maskable icons (192 and 512)', manifest.icons.filter(i => i.purpose === 'maskable').map(i => i.sizes).join() === '192x192,512x512');
  check('regular icons are "any", not "any maskable"', manifest.icons.filter(i => i.purpose !== 'maskable').every(i => i.purpose === 'any'));
  check('apple-touch-icon is 180x180', await size(await p.getAttribute('link[rel=apple-touch-icon]', 'href')) === '180x180');
  check('favicon.ico and SVG icon linked', await p.locator('link[rel=icon][href="icons/favicon.ico"]').count() === 1 && await size('brand/app-icon.svg') !== 'missing');
  check('notification badge exists', await size('icons/badge-96.png') === '96x96');
  const sw = await (await p.request.get(ROOT + 'sw.js')).text();
  const missing = [];
  for (const u of [...sw.matchAll(/'(\/(?:icons|brand)\/[^']+)'/g)].map(m => m[1])) if (!(await p.request.get(new URL(u.slice(1), ROOT).href)).ok()) missing.push(u);
  check('service worker only points at files that exist', !missing.length, missing.join(', '));

  for (const mode of ['off', 'on']) {
    await p.evaluate(m => { localStorage.clear(); localStorage.setItem('bloom_nightMode', JSON.stringify(m)); }, mode);
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(900);
    const want = mode === 'on' ? 'logo-mark-onbrown.svg' : 'logo-mark.svg';
    const shown = async sel => p.evaluate(s => [...document.querySelectorAll(s + ' .brand-mark')].filter(i => i.offsetParent && i.complete && i.naturalWidth).map(i => i.getAttribute('src').split('/').pop()), sel);
    check(`sign-in (${mode === 'on' ? 'night' : 'day'}): ${want}, "Lumaby" + BABY CARE COMPANION`,
      JSON.stringify(await shown('#auth-screen')) === JSON.stringify([want]) &&
      await p.locator('#auth-screen .brand-wordmark').innerText() === 'Lumaby' &&
      await p.locator('#auth-screen .brand-tagline').innerText() === 'BABY CARE COMPANION');
    if (mode === 'off') {
      const f = await p.locator('.brand-wordmark').first().evaluate(e => { const s = getComputedStyle(e); return [s.fontFamily.split(',')[0].replace(/"/g, ''), s.fontWeight, s.letterSpacing].join('|'); });
      check('wordmark is Playfair Display 600, -0.5px', f === 'Playfair Display|600|-0.5px', f);
    }
    await p.evaluate(() => skipAuth()); await p.waitForTimeout(700);
    check(`welcome (${mode === 'on' ? 'night' : 'day'}): ${want}`, JSON.stringify(await shown('#onboarding')) === JSON.stringify([want]));
  }
  // Sign in with Apple appears only when Apple is turned on in Supabase
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('bloom_nightMode', '"off"'); });
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  check('Apple button hidden while Apple sign-in is off in Supabase', !(await p.locator('#btn-apple').isVisible()));
  await p.route('**/auth/v1/settings', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ external: { google: true, apple: true, email: true } }) }));
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  check('Apple button shows once it is turned on', await p.locator('#btn-apple').isVisible() && (await p.locator('#btn-apple').innerText()).includes('Continue with Apple'));
  await p.screenshot({ path: (process.env.OUT || require('os').tmpdir()) + '/auth-apple.png' });
  await p.unroute('**/auth/v1/settings');
  check('no 🌸 left where the logo used to be', !(await p.content()).includes('auth-logo') && !(await p.content()).includes('onboard-emoji'));
  check('no page errors', !errors.length, errors.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
