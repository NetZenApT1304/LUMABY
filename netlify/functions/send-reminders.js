// netlify/functions/send-reminders.js
// Scheduled every 5 minutes (see netlify.toml). Works out which reminders
// are due from each baby's synced logs and sends Web Push notifications,
// so reminders arrive even when the app is closed. Each due reminder is
// recorded in reminder_sent and sent once.

const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const HOUR = 3600000, MIN = 60000, DAY = 24 * HOUR;

// ── Time zone helpers ──
function localParts(ms, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, date: `${p.year}-${p.month}-${p.day}` };
}
// UTC instant of local date (y-m-d) at hh:mm in tz.
function zonedTime(y, m, d, hh, mm, tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = localParts(guess, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  return guess - (asUtc - guess);
}
function validTz(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch (e) { return 'UTC'; }
}
function ago(ms) {
  const h = Math.floor(ms / HOUR), m = Math.round((ms % HOUR) / MIN);
  return h ? `${h}h ${m}m ago` : `${m}m ago`;
}
const daytime = (now, tz) => { const h = localParts(now, tz).h; return h >= 9 && h < 20; };

// ── What's due ──
// input: { name, feeds: [ms desc], sleeps: [{start, durationMin}] desc,
//          baths: [ms desc], growth: [ms desc] }
// settings: the app's reminder settings. Returns [{ kind, dueKey, title, body }].
function computeDue(input, settings, tz, now) {
  tz = validTz(tz || 'UTC');
  const s = settings || {};
  const name = input.name || 'Baby';
  const out = [];

  if (s.feedEnabled && input.feeds.length) {
    const last = input.feeds[0];
    const gaps = [];
    for (let i = 0; i < Math.min(input.feeds.length - 1, 5); i++) {
      const g = input.feeds[i] - input.feeds[i + 1];
      if (g >= 30 * MIN && g <= 8 * HOUR) gaps.push(g);
    }
    let interval = gaps.length >= 2 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : (Number(s.feedInterval) || 3) * HOUR;
    interval = Math.min(Math.max(interval, HOUR), 6 * HOUR);
    const due = last + interval;
    if (now >= due && now - due < 2 * HOUR) {
      out.push({ kind: 'feed', dueKey: String(last), title: `🍼 Feed time for ${name}`, body: `Last fed ${ago(now - last)}` });
    }
  }

  if (s.napEnabled && input.sleeps.length && daytimeNap(now, tz)) {
    const sl = input.sleeps[0];
    const end = sl.start + (Number(sl.durationMin) || 0) * MIN;
    const due = end + (Number(s.napWindow) || 2) * HOUR;
    if (now >= due && now - due < HOUR) {
      out.push({ kind: 'nap', dueKey: String(sl.start), title: `😴 Nap window for ${name}`, body: `Awake for ${ago(now - end).replace(' ago', '')}` });
    }
  }

  if (s.medsEnabled && /^\d{1,2}:\d{2}$/.test(s.medsTime || '')) {
    const [hh, mm] = s.medsTime.split(':').map(Number);
    const p = localParts(now, tz);
    const due = zonedTime(p.y, p.m, p.d, hh, mm, tz);
    if (now >= due && now - due < 30 * MIN) {
      out.push({ kind: 'meds', dueKey: p.date, title: '💊 Medicine time', body: `Time for ${name}'s medicine` });
    }
  }

  if (s.bathEnabled && input.baths.length && daytime(now, tz)) {
    const due = input.baths[0] + (Number(s.bathDays) || 2) * DAY;
    if (now >= due && now - due < 3 * DAY) {
      out.push({ kind: 'bath', dueKey: String(input.baths[0]), title: `🛁 Bath day for ${name}`, body: `Last bath ${Math.round((now - input.baths[0]) / DAY)} days ago` });
    }
  }

  if (s.growthEnabled && input.growth.length && daytime(now, tz)) {
    const due = input.growth[0] + (Number(s.growthWeeks) || 4) * 7 * DAY;
    if (now >= due && now - due < 7 * DAY) {
      out.push({ kind: 'growth', dueKey: String(input.growth[0]), title: `📏 Growth check for ${name}`, body: 'Time to log weight and height' });
    }
  }
  return out;
}
// Naps are a daytime thing; no nap pings overnight.
function daytimeNap(now, tz) { const h = localParts(now, tz).h; return h >= 7 && h < 20; }

// ── Scheduled handler ──
async function run(now = Date.now()) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://lumabyy.netlify.app',
    process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const t = await supabase.rpc('reminder_targets');
  if (t.error) throw new Error('reminder_targets: ' + t.error.message);
  const targets = t.data || [];
  if (!targets.length) return { targets: 0, sent: 0 };

  const babyIds = [...new Set(targets.map(x => x.baby_id))];
  const userIds = [...new Set(targets.map(x => x.user_id))];
  const since = new Date(now - 30 * DAY).toISOString();

  const [logsRes, growthRes, subsRes] = await Promise.all([
    supabase.from('logs').select('baby_id, type, logged_at, data')
      .in('baby_id', babyIds).eq('deleted', false).in('type', ['feed', 'sleep', 'bath'])
      .gte('logged_at', since).order('logged_at', { ascending: false }).limit(10000),
    supabase.from('growth_logs').select('baby_id, log_date, data')
      .in('baby_id', babyIds).eq('deleted', false).order('log_date', { ascending: false }).limit(5000),
    supabase.from('push_subscriptions').select('endpoint, user_id, p256dh, auth').in('user_id', userIds),
  ]);
  for (const r of [logsRes, growthRes, subsRes]) if (r.error) throw new Error(r.error.message);

  const inputs = {};
  const inputFor = id => (inputs[id] = inputs[id] || { feeds: [], sleeps: [], baths: [], growth: [] });
  logsRes.data.forEach(l => {
    const ms = Date.parse(l.logged_at);
    if (!ms) return;
    const i = inputFor(l.baby_id);
    if (l.type === 'feed') i.feeds.push(ms);
    else if (l.type === 'bath') i.baths.push(ms);
    else if (l.type === 'sleep') i.sleeps.push({ start: ms, durationMin: l.data?.durationMin });
  });
  growthRes.data.forEach(g => {
    const ms = Date.parse(g.log_date || g.data?.date);
    if (ms) inputFor(g.baby_id).growth.push(ms);
  });

  const subsByUser = {};
  subsRes.data.forEach(s => (subsByUser[s.user_id] = subsByUser[s.user_id] || []).push(s));

  let sent = 0;
  for (const target of targets) {
    const input = { name: target.baby_name, ...inputFor(target.baby_id) };
    const due = computeDue(input, target.settings, target.tz, now);
    for (const r of due) {
      // Claim it first so a reminder is never sent twice.
      const claim = await supabase.from('reminder_sent')
        .upsert({ user_id: target.user_id, baby_id: target.baby_id, kind: r.kind, due_key: r.dueKey },
                { onConflict: 'user_id,baby_id,kind,due_key', ignoreDuplicates: true })
        .select('kind');
      if (claim.error) { console.error('[Lumaby] reminder_sent:', claim.error.message); continue; }
      if (!claim.data.length) continue; // already sent

      const payload = JSON.stringify({ title: r.title, body: r.body, url: '/', tag: `${r.kind}-${target.baby_id}`, kind: r.kind });
      for (const sub of subsByUser[target.user_id] || []) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600 });
          sent++;
          await supabase.from('push_subscriptions').update({ last_used_at: new Date(now).toISOString() }).eq('endpoint', sub.endpoint);
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); // expired
          } else {
            console.error('[Lumaby] push failed:', e.statusCode || '', e.body || e.message);
          }
        }
      }
    }
  }

  // Keep the sent log small.
  await supabase.from('reminder_sent').delete().lt('sent_at', new Date(now - 60 * DAY).toISOString());
  return { targets: targets.length, sent };
}

exports.handler = async () => {
  try {
    const result = await run();
    console.log('[Lumaby] Reminders:', JSON.stringify(result));
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (e) {
    console.error('[Lumaby] Reminders failed:', e);
    return { statusCode: 500, body: JSON.stringify({ error: 'Reminders failed' }) };
  }
};

exports.computeDue = computeDue;
exports.run = run;
