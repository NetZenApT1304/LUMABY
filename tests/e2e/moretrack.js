const { chromium } = require('playwright'); const { execFileSync } = require('child_process');
const S = process.argv[2] || '/tmp', BASE = process.argv[3] || 'http://127.0.0.1:8765/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (l, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', acceptDownloads: true })).newPage();
  p.on('pageerror', e => console.log('  pageerror:', e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('bloom_profile', JSON.stringify({ parent: 'Sam', baby: 'Luna', dob: '2026-05-01', emoji: '🌙' })); localStorage.setItem('bloom_nightMode', '"off"'); });
  await p.reload({ waitUntil: 'networkidle' });
  await p.evaluate(() => document.getElementById('auth-screen').classList.contains('visible') && skipAuth()); await sleep(700);
  const body = () => p.locator('#log-modal-body');
  const last = () => p.evaluate(() => { const l = logs[0]; return { type: l.type, title: l.title, detail: l.detail }; });
  const chip = (row, text) => body().locator(`#${row} .chip`, { hasText: text });

  check('home has Solids, Doctor and Teeth buttons', (await p.locator('.quick-actions').innerText()).match(/Solids[\s\S]*Doctor[\s\S]*Teeth/) !== null);

  // ── vaccines ──
  await p.evaluate(() => openLogModal('health')); await sleep(300);
  for (const v of ['DTaP', 'Hib', 'Pneumococcal']) await chip('hl-vax', v).click();
  await chip('hl-react', 'Fussy').click();
  check('picking a reaction clears "None"', (await body().locator('#hl-react .chip.on').allInnerTexts()).join() === 'Fussy');
  await p.screenshot({ path: `${S}/more-vaccines.png` });
  await body().locator('text=Save vaccines').click(); await sleep(300);
  let l = await last();
  check('vaccines saved: DTaP, Hib, Pneumococcal · Reaction: fussy', l.type === 'health' && l.title === 'Vaccines' && l.detail === 'DTaP, Hib, Pneumococcal · Reaction: fussy', JSON.stringify(l));
  await p.evaluate(() => openLogModal('health')); await sleep(300);
  await body().locator('text=Save vaccines').click(); await sleep(200);
  check('saving with no vaccine picked asks for one', (await p.locator('.toast').innerText()).includes('Pick at least one vaccine'));
  // ── visit ──
  await body().locator('.seg button', { hasText: 'Doctor visit' }).click(); await sleep(200);
  await p.fill('#hl-provider', 'Dr. Lee'); await p.fill('#hl-notes', 'All good, next visit at 6 months');
  await p.fill('#hl-date', await p.evaluate(() => { const d = new Date(Date.now() - 2 * 864e5); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }));
  await p.screenshot({ path: `${S}/more-visit.png` });
  await body().locator('text=Save visit').click(); await sleep(300);
  l = await p.evaluate(() => { const v = logs.find(x => x.healthKind === 'visit'); return { title: v.title, detail: v.detail, daysAgo: Math.round((Date.now() - Date.parse(v.time)) / 864e5) }; });
  check('visit saved as Checkup · Dr. Lee, dated 2 days ago', l.title === 'Checkup' && l.detail === 'Dr. Lee · All good, next visit at 6 months' && l.daysAgo === 2, JSON.stringify(l));

  // ── solids ──
  await p.evaluate(() => openLogModal('solids')); await sleep(300);
  await p.fill('#sd-food', 'Avocado'); await sleep(100);
  check('new food shows "First time trying"', await p.locator('#sd-first-wrap').isVisible());
  await chip('sd-amount', 'Lots').click();
  await body().locator('text=Save').last().click(); await sleep(300);
  l = await last();
  check('saved: Solids · new food · Avocado · lots · liked it · first time', l.title === 'Solids · new food' && l.detail === 'Avocado · lots · liked it · first time', JSON.stringify(l));
  await p.evaluate(() => openLogModal('solids')); await sleep(300);
  check('foods tried appear as one-tap buttons', (await body().locator('.chip-row .chip', { hasText: 'Avocado' }).count()) >= 1);
  await body().locator('.chip-row .chip[data-food="Avocado"]').click(); await sleep(100);
  check('picking a tried food hides "First time"', !(await p.locator('#sd-first-wrap').isVisible()));
  await p.fill('#sd-food', 'Peanut butter'); await p.dispatchEvent('#sd-food', 'input');
  await chip('sd-reaction', 'Reaction').click(); await sleep(150);
  check('choosing Reaction shows symptoms and a safety note', await p.locator('#sd-react-wrap').isVisible() && (await p.locator('.safety-note').innerText()).includes('emergency'));
  await chip('sd-symptoms', 'Rash').click();
  await p.screenshot({ path: `${S}/more-solids.png` });
  await body().locator('text=Save').last().click(); await sleep(300);
  l = await last();
  check('reaction saved: Peanut butter · some · ⚠️ reaction (rash) · first time', l.detail === 'Peanut butter · some · ⚠️ reaction (rash) · first time', JSON.stringify(l));
  await p.evaluate(() => openLogModal('solids')); await sleep(300);
  check('Peanut butter is flagged ⚠️ next time', (await body().locator('.chip.warn').innerText()).includes('Peanut butter'));

  // ── teething ──
  await p.evaluate(() => openLogModal('tooth')); await sleep(300);
  check('tooth chart: 20 teeth, 0 in', (await body().locator('.tooth').count()) === 20 && (await body().locator('.teeth-count').innerText()) === '0 of 20 teeth in');
  await body().locator('.tooth[data-t="P"]').click();
  check('tapping a tooth names it', (await p.locator('#th-picked').innerText()) === 'New tooth: Lower right central incisor');
  await chip('th-symptoms', 'Drooling').click();
  await p.screenshot({ path: `${S}/more-teeth.png` });
  await body().locator('text=Save').last().click(); await sleep(300);
  l = await last();
  check('saved "New tooth! (1 of 20)"', l.type === 'tooth' && l.title === 'New tooth! (1 of 20)' && l.detail === 'New tooth: Lower right central incisor · drooling', JSON.stringify(l));
  await p.evaluate(() => openLogModal('tooth')); await sleep(300);
  check('chart remembers it: 1 of 20, tooth filled', (await body().locator('.teeth-count').innerText()) === '1 of 20 teeth in' && (await body().locator('.tooth.in[data-t="P"]').count()) === 1);
  await body().locator('.tooth[data-t="P"]').click(); await sleep(100);
  check('tapping a tooth that is already in says so', (await p.locator('.toast').innerText()).includes('already in'));
  await chip('th-symptoms', 'Fussy').click(); await body().locator('text=Save').last().click(); await sleep(300);
  check('symptoms only -> "Teething"', (await last()).title === 'Teething');
  check('timeline shows the new entries', /New tooth|Teething/.test(await p.locator('#timeline').innerText()));

  // ── report + PDF ──
  await p.evaluate(() => { isPremium = true; showPediReport(); }); await sleep(400);
  const rep = (await p.locator('#pedi-modal-body').innerText()).replace(/\s+/g, ' ');
  check('report: doctor & vaccines', /DOCTOR & VACCINES/i.test(rep) && rep.includes('DTaP, Hib, Pneumococcal · reaction: fussy') && rep.includes('Checkup · Dr. Lee'));
  check('report: solids with reaction warning', /SOLIDS · 2 FOODS TRIED/i.test(rep) && rep.includes('⚠️ Reactions to: Peanut butter'));
  check('report: teeth', rep.includes('1 of 20 baby teeth in'));
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.evaluate(() => generatePediPDF())]);
  await dl.saveAs(`${S}/more-report.pdf`);
  const pdf = execFileSync('pdftotext', ['-layout', `${S}/more-report.pdf`, '-']).toString().replace(/[ \t]+/g, ' ');
  check('PDF: doctor visits & vaccines', pdf.includes('Doctor visits & vaccines') && pdf.includes('Vaccines: DTaP, Hib, Pneumococcal (reaction: fussy)') && pdf.includes('Checkup - Dr. Lee: All good'));
  check('PDF: solids with reactions', pdf.includes('Solids (2 foods tried)') && /Reactions Peanut butter/.test(pdf));
  check('PDF: teeth', /Teeth in 1 of 20/.test(pdf));
  await p.evaluate(() => { closeModal('modal-pedi'); nightMode = 'on'; applyNightMode(); openLogModal('tooth'); }); await sleep(300);
  await p.screenshot({ path: `${S}/more-teeth-night.png` });
  console.log(`\n${pass} passed, ${fail} failed`); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
