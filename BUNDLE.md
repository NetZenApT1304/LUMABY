# Next release (bundle)

Netlify's free plan ran out of deploy credits on 2026-11-16; they reset on
**2026-12-15**. Until then, work collects on the branch
`claude/code-review-jl0e2n` and **nothing is deployed**: no pull requests
(they create Netlify previews) and no merges to `main` (they deploy).

## Already on `main`, waiting to deploy
- Load the app's scripts in parallel with `defer` (#20) — the live site
  has #19, which works but is slower to become ready on HTTP/1.1.

## In this bundle (on the branch)
- Test suites committed to the repo (`tests/`, `tests/run-all.sh`).
- Accessibility: pinch-zoom re-enabled; labels on every field; all tappable
  controls work as buttons (keyboard, switch control, screen readers);
  popups are real dialogs (focus moves in, Tab stays inside, Escape closes,
  focus returns); contrast meets WCAG AA in day and night mode; visible
  focus outline; reduced-motion support; landmarks; nothing cut off at 200%
  zoom. axe-core: 477 problem elements -> 0. New checks: `tests/e2e/a11y.js`,
  `keyboard.js`, `zoom.js`.
- Removed the Quick log row from the home screen (it scrolled sideways, cut
  buttons off and repeated the "Log something" grid). One-tap logging stays
  in the home-screen icon shortcuts and the timer bar.
- Upcoming doctor appointments (Doctor → Upcoming): date, time, type,
  doctor, notes and "remind me" times (day before / 2h / 1h / 30 min).
  The day is pink on the home day strip (deep pink when selected; the strip
  stretches up to 60 days ahead to reach it), a "next appointment" card sits
  on the home screen, and the server pushes a notification at each picked
  time (send-reminders.js; Premium, like the other reminders; switch in
  Reminders). No database change needed: appointments are ordinary synced
  logs (type `appointment`). Tests: `tests/e2e/appointments.js` and 12 new
  unit checks.
- New logo (the notched blossom, from the brand kit; same name). Files in
  `brand/` (SVG masters + BRAND.md) and `icons/` (app icons, new maskable
  Android icons, 180px apple-touch-icon, favicon). Sign-in and welcome
  screens show the logo lockup (mark + "Lumaby" + BABY TRACKER), with the
  on-brown mark in night mode. The PDF report header and baby book back
  cover use the mark (PDFs couldn't draw the old 🌸 emoji). Notifications
  get a one-colour badge (`icons/badge-96.png`). Icons were recompressed
  losslessly (pixel-identical, about 4x smaller). `store-icon-1024.png` is
  for the App Store / Google Play listings, not used by the web app. Test:
  `tests/e2e/brand.js`. After release, installed apps pick up the new home
  screen icon when the phone next checks the manifest (can take a day or
  so; reinstalling is instant).
- "Baby tracker" wording replaced with "Baby care companion": logo tagline
  (BABY CARE COMPANION), app name on phones / search, PDF footers, privacy
  page; "track" softened elsewhere ("Start tracking" -> "Let's begin"),
  except the Pump option, which keeps "Track volume".
- App store prep (see STORES.md): Delete my account (My Account → Delete
  account; DB function in 005_account_deletion.sql, already applied; blocks
  while a subscription will renew), deletion section on the privacy page,
  Sign in with Apple button (shows once Apple is enabled in Supabase), store
  screenshot generator (tools/store-screenshots.js). Fixed: "Manage
  Subscription" was defined twice and the second copy called a missing
  server function, so the button failed. Test: tests/e2e/deleteaccount.js.

## Ship checklist (on or after 2026-12-15)
1. Check credits: Netlify → team → Usage & billing.
2. `tests/run-all.sh` against a local copy: everything passes.
3. Open one pull request from the branch to `main`; wait for its preview.
4. Merge; confirm the production deploy is `ready` (not "Skipped").
5. `tests/run-all.sh https://lumabyy.netlify.app/` and the full sweep.
