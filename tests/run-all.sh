#!/bin/bash
# Run every Lumaby test. Needs Node, Playwright (Chromium) and Python 3.
#   tests/run-all.sh                      # against a local copy of the repo
#   tests/run-all.sh https://lumabyy.netlify.app/   # against the live site
# The e2e tests create temporary accounts on the real Supabase project and
# delete them at the end; set SUPABASE_ACCESS_TOKEN (see tests/q.sh).
cd "$(dirname "$0")/.."
OUT="${OUT:-$(mktemp -d)}"
URL="${1:-http://127.0.0.1:8765/index.html}"
if [[ "$URL" == http://127.0.0.1:8765/* ]]; then
  python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 & SERVER=$!
  trap 'kill $SERVER 2>/dev/null' EXIT; sleep 1
fi
fail=0
# Judge each suite by its summary line only (some suites print expected errors,
# e.g. the sync test's offline step).
run() {
  printf '%-16s ' "$1"; out=$("${@:2}" 2>&1)
  summary=$(echo "$out" | grep -E "[0-9]+ passed, [0-9]+ failed|^OK \(|^offline reload" | tail -1)
  echo "${summary:-NO SUMMARY (crashed?)}"
  if [ -z "$summary" ] || echo "$summary" | grep -qE " [1-9][0-9]* failed|errors: \[" ; then fail=1; echo "$out" | tail -5 | sed 's/^/    /'; fi
}
run split-check   node tools/check-split.js
run reminders     node tests/unit/reminders.test.js
run sync          node tests/e2e/sync.js "$OUT" "$URL"
run partner       node tests/e2e/partner.js "$OUT" "$URL"
run babies        node tests/e2e/babies.js "$OUT" "$URL"
run feed-temp     node tests/e2e/feedtemp.js "$OUT" "$URL"
run temp-report   node tests/e2e/tempreport.js "$OUT" "$URL"
run more-tracking node tests/e2e/moretrack.js "$OUT" "$URL"
run quick-log     node tests/e2e/quick.js "$OUT" "$URL"
run appointments  node tests/e2e/appointments.js "$OUT" "$URL"
run remind-times  node tests/e2e/remtimes.js "$OUT" "$URL"
run offline       node tests/e2e/offline.js "$URL"
run keyboard      node tests/e2e/keyboard.js "$OUT" "$URL"
printf '%-16s ' "axe audit"; axe_out=$(node tests/e2e/a11y.js "$URL" 2>&1); echo "$axe_out" | head -1; echo "$axe_out" | grep -q "^axe: 0 distinct" || { fail=1; echo "$axe_out" | sed -n '2,12p' | sed 's/^/    /'; }
printf '%-16s ' "200% zoom"; zoom_out=$(node tests/e2e/zoom.js "$URL" 2>&1); echo "$zoom_out" | tail -1; echo "$zoom_out" | grep -q "^0 things run off" || { fail=1; echo "$zoom_out" | grep FAIL | sed 's/^/    /'; }
printf '%-16s ' free; free_out=$(node tests/e2e/free.js "$OUT" "$URL" 2>&1); echo "$free_out"
echo "$free_out" | grep -q '"isPremium":false.*"db":{"logs":0,"babies":0},"errors":\[\]' || fail=1
tests/q.sh "delete from auth.users where email like 'lumaby-e2e-%@mailinator.com' returning email" | grep -o "@mailinator" | wc -l | xargs echo "test accounts deleted:"
echo "screenshots and downloads: $OUT"
[ $fail = 0 ] && echo "ALL PASSED" || echo "SOMETHING FAILED (see above)"
exit $fail
