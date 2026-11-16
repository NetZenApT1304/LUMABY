// Unit tests for the reminder scheduler's "what's due" logic (no network).
//   node tests/unit/reminders.test.js
const { computeDue } = require('../../netlify/functions/send-reminders.js');
const H = 3600000, M = 60000, D = 24 * H;
let pass = 0, fail = 0;
const t = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok ? '' : '  got ' + JSON.stringify(got))); };
const kinds = r => r.map(x => x.kind + (x.kind === 'meds' ? '@' + x.dueKey.slice(11) : ''));
const S = { feedEnabled: true, feedInterval: 3, napEnabled: true, napWindow: 2, medsEnabled: true, medsTimes: ['08:00'], bathEnabled: true, bathDays: 2, growthEnabled: true, growthWeeks: 4 };
const empty = { name: 'Luna', feeds: [], sleeps: [], baths: [], growth: [] };
const tz = 'America/New_York';
const now = Date.UTC(2026, 10, 16, 19, 0);            // 14:00 New York
const night = Date.UTC(2026, 10, 17, 3, 0);           // 22:00 New York
const twoAm = Date.UTC(2026, 10, 17, 7, 0);           // 02:00 New York
const ny = (hh, mm) => Date.UTC(2026, 10, 16, hh + 5, mm);

t('nothing logged -> nothing due', kinds(computeDue(empty, S, tz, now)), []);
t('feed: 3h05m since last, no history -> due (default 3h)', kinds(computeDue({ ...empty, feeds: [now - 185 * M] }, S, tz, now)), ['feed']);
t('feed: 2h since last -> not yet', kinds(computeDue({ ...empty, feeds: [now - 2 * H] }, S, tz, now)), []);
t('feed: learned 2h rhythm -> due at 2h10m', kinds(computeDue({ ...empty, feeds: [now - 130 * M, now - 250 * M, now - 370 * M] }, S, tz, now)), ['feed']);
t('feed: overdue by 3h -> stale, skipped', kinds(computeDue({ ...empty, feeds: [now - 6 * H] }, S, tz, now)), []);
t('feed: body says how long ago', computeDue({ ...empty, feeds: [now - 185 * M] }, S, tz, now)[0].body, 'Last fed 3h 5m ago');
t('feed: off in settings', kinds(computeDue({ ...empty, feeds: [now - 185 * M] }, { ...S, feedEnabled: false }, tz, now)), []);
t('feed fixed 4h ignores a learned 2h rhythm', kinds(computeDue({ ...empty, feeds: [now - 130 * M, now - 250 * M, now - 370 * M] }, { feedEnabled: true, feedMode: 'fixed', feedInterval: 4 }, tz, now)), []);
t('feed fixed 1.5h -> due at 1h35', kinds(computeDue({ ...empty, feeds: [now - 95 * M] }, { feedEnabled: true, feedMode: 'fixed', feedInterval: 1.5 }, tz, now)), ['feed']);
t('feed at 2am with overnight on (default)', kinds(computeDue({ ...empty, feeds: [twoAm - 185 * M] }, { feedEnabled: true }, tz, twoAm)), ['feed']);
t('feed at 2am with overnight off -> skipped', kinds(computeDue({ ...empty, feeds: [twoAm - 185 * M] }, { feedEnabled: true, feedNight: false }, tz, twoAm)), []);
t('nap: woke 2h10m ago -> due', kinds(computeDue({ ...empty, sleeps: [{ start: now - 190 * M, durationMin: 60 }] }, S, tz, now)), ['nap']);
t('nap: never at 10pm local', kinds(computeDue({ ...empty, sleeps: [{ start: night - 190 * M, durationMin: 60 }] }, S, tz, night)), []);
t('nap window 45 min', kinds(computeDue({ ...empty, sleeps: [{ start: now - 110 * M, durationMin: 60 }] }, { napEnabled: true, napWindow: 0.75 }, tz, now)), ['nap']);
t('meds: 08:10 local -> due', kinds(computeDue(empty, S, tz, ny(8, 10))), ['meds@08:00']);
t('meds: 08:45 local -> window passed', kinds(computeDue(empty, S, tz, ny(8, 45))), []);
t('meds: same instant in Tokyo is not 08:00', kinds(computeDue(empty, S, 'Asia/Tokyo', ny(8, 10))), []);
const twice = { medsEnabled: true, medsTimes: ['08:00', '20:00'] };
t('meds twice a day: morning dose', kinds(computeDue(empty, twice, tz, ny(8, 5))), ['meds@08:00']);
t('meds twice a day: evening dose', kinds(computeDue(empty, twice, tz, ny(20, 5))), ['meds@20:00']);
t('meds twice a day: nothing at 14:00', kinds(computeDue(empty, twice, tz, now)), []);
t('meds: old single medsTime still works', kinds(computeDue(empty, { medsEnabled: true, medsTime: '08:00' }, tz, ny(8, 5))), ['meds@08:00']);
t('meds: junk times ignored', kinds(computeDue(empty, { medsEnabled: true, medsTimes: ['nope', '', null] }, tz, ny(8, 5))), []);
t('bath: 2 days + 1h, daytime -> due', kinds(computeDue({ ...empty, baths: [now - 2 * D - H] }, S, tz, now)), ['bath']);
t('bath: not at night', kinds(computeDue({ ...empty, baths: [night - 2 * D - H] }, S, tz, night)), []);
t('bath every 5 days: day 4 -> not yet', kinds(computeDue({ ...empty, baths: [now - 4 * D] }, { bathEnabled: true, bathDays: 5 }, tz, now)), []);
t('growth: 4 weeks + 1 day -> due', kinds(computeDue({ ...empty, growth: [now - 29 * D] }, S, tz, now)), ['growth']);
t('growth every 2 weeks: day 15 -> due', kinds(computeDue({ ...empty, growth: [now - 15 * D] }, { growthEnabled: true, growthWeeks: 2 }, tz, now)), ['growth']);
t('bad time zone falls back to UTC', Array.isArray(computeDue(empty, S, 'Not/AZone', now)), true);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
