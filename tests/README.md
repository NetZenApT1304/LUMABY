# Lumaby tests

Browser tests drive the real app in headless Chromium (Playwright) at phone
size, against the real Supabase project. They create temporary accounts
(`lumaby-e2e-…@mailinator.com`), give some of them a temporary Premium
subscription, and delete them at the end.

## Run everything

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...     # Supabase → Account → Access Tokens
tests/run-all.sh                         # local copy of this repo
tests/run-all.sh https://lumabyy.netlify.app/   # the live site
```

`tools/check-split.js` (load-order safety of `js/*.js`) and the reminder
logic tests run first and need no token.

## Suites

| File | What it checks |
|---|---|
| `unit/reminders.test.js` | when feed / nap / medicine / bath / growth reminders are due (time zones, settings) |
| `e2e/sync.js` | two devices on one account: data, live updates, deletes, edits, offline, sign-out |
| `e2e/partner.js` | invites, sharing one baby, live both ways, access rules, removal |
| `e2e/babies.js` | each baby's own timeline, on screen and across devices |
| `e2e/feedtemp.js` | Nursing / Bottle and the thermometer |
| `e2e/tempreport.js` | temperature in Insights, the pediatrician report and its PDF |
| `e2e/moretrack.js` | doctor & vaccines, solids, teething, and the report/PDF |
| `e2e/quick.js` | one-tap logging, undo, home-screen shortcuts |
| `e2e/appointments.js` | upcoming doctor appointments: form, pink days on the day strip, home card, Reminders switch |
| `e2e/remtimes.js` | the reminder settings screen and its server copy |
| `e2e/reminders.js` | turning reminders on (device registration) |
| `e2e/free.js` | a free account: logging works, nothing is synced |
| `e2e/offline.js` | the app starts offline from the service worker |
| `e2e/a11y.js` | axe-core accessibility audit of every screen, popup and form, day and night |
| `e2e/keyboard.js` | keyboard use, dialogs (focus, Tab, Escape), labels, landmarks, 200% zoom |
| `e2e/zoom.js` | at 200% zoom nothing runs off the edge |
| `e2e/sweep.js` | every screen, popup, form and export (free/Premium, day/night): errors, layout, saves, downloads |
| `e2e/perf.js`, `e2e/waterfall.js` | load timing on a simulated mid-range phone and slow 4G |

Each e2e script takes `<output folder> [url]`, e.g.
`node tests/e2e/sync.js /tmp/out http://127.0.0.1:8765/index.html`
(serve the repo with `python3 -m http.server 8765` first).
