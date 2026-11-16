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

## Ship checklist (on or after 2026-12-15)
1. Check credits: Netlify → team → Usage & billing.
2. `tests/run-all.sh` against a local copy: everything passes.
3. Open one pull request from the branch to `main`; wait for its preview.
4. Merge; confirm the production deploy is `ready` (not "Skipped").
5. `tests/run-all.sh https://lumabyy.netlify.app/` and the full sweep.
