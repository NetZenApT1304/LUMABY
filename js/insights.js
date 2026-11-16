// Lumaby — Insights, Schedule and Growth screens.
// One part of the app script, loaded in order by index.html. All parts share one
// global scope; run `node tools/check-split.js` after moving code between files.
//  INSIGHTS
// =======================================
function renderInsights() {
  const el = document.getElementById('insightsContent');
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const last7 = [];
  for (let i=6; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0);
    last7.push(d);
  }

  const sleepData = last7.map(d => {
    const dl = getLogsForDate(d).filter(l=>l.type==='sleep');
    return dl.reduce((s,l)=>s+(l.durationMin||0),0)/60;
  });
  const feedData = last7.map(d => getLogsForDate(d).filter(l=>l.type==='feed').length);
  const diaperData = last7.map(d => getLogsForDate(d).filter(l=>l.type==='diaper').length);

  const maxSleep = Math.max(...sleepData, 1);
  const maxFeed = Math.max(...feedData, 1);

  const avgSleep = (sleepData.reduce((a,b)=>a+b,0)/7).toFixed(1);
  const avgFeed = Math.round(feedData.reduce((a,b)=>a+b,0)/7);
  const totalDiapers = diaperData.reduce((a,b)=>a+b,0);
  const todayFeeds = feedData[6];
  const todaySleep = sleepData[6].toFixed(1);

  const labels = last7.map(d => days[d.getDay()]);

  el.innerHTML = `
    <div class="insight-card">
      <div class="ic-title">Weekly Overview</div>
      <div class="totals-row">
        <div class="total-item"><div class="tv">${avgSleep}h</div><div class="tl2">Avg sleep/day</div></div>
        <div class="total-item"><div class="tv">${avgFeed}</div><div class="tl2">Avg feeds/day</div></div>
        <div class="total-item"><div class="tv">${totalDiapers}</div><div class="tl2">Total diapers</div></div>
      </div>
    </div>

    <div class="insight-card">
      <div class="ic-title">😴 Sleep this week (hours)</div>
      <div class="bar-chart">
        ${sleepData.map((h,i)=>`
          <div class="bar-wrap">
            <div class="bar-val">${h.toFixed(1)}</div>
            <div class="bar-col" style="height:${(h/maxSleep*100).toFixed(0)}%;background:var(--muted-blue);opacity:${0.5+0.5*(h/maxSleep)}"></div>
            <div class="bar-lbl">${labels[i]}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="insight-card">
      <div class="ic-title">🍼 Feeds per day</div>
      <div class="bar-chart">
        ${feedData.map((n,i)=>`
          <div class="bar-wrap">
            <div class="bar-val">${n}</div>
            <div class="bar-col" style="height:${(n/maxFeed*100).toFixed(0)}%;background:var(--soft-gold);opacity:${0.5+0.5*(n/maxFeed)}"></div>
            <div class="bar-lbl">${labels[i]}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="insight-card">
      <div class="ic-title">🌿 Diapers per day</div>
      <div class="bar-chart">
        ${diaperData.map((n,i)=>`
          <div class="bar-wrap">
            <div class="bar-val">${n}</div>
            <div class="bar-col" style="height:${(n/Math.max(...diaperData,1)*100).toFixed(0)}%;background:var(--sage);opacity:${0.5+0.5*(n/Math.max(...diaperData,1))}"></div>
            <div class="bar-lbl">${labels[i]}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="insight-card">
      <div class="ic-title">Today at a glance</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        <div><div style="font-size:28px;font-weight:700;color:var(--deep-brown)">${todaySleep}h</div><div style="font-size:12px;color:var(--text-light)">Sleep</div></div>
        <div><div style="font-size:28px;font-weight:700;color:var(--deep-brown)">${todayFeeds}</div><div style="font-size:12px;color:var(--text-light)">Feeds</div></div>
        <div><div style="font-size:28px;font-weight:700;color:var(--deep-brown)">${diaperData[6]}</div><div style="font-size:12px;color:var(--text-light)">Diapers</div></div>
        <div><div style="font-size:28px;font-weight:700;color:var(--deep-brown)">${logs.filter(l=>l.type==='milestone').length}</div><div style="font-size:12px;color:var(--text-light)">Milestones</div></div>
      </div>
    </div>`;
}

// =======================================
//  SCHEDULE
// =======================================
function renderSchedule() {
  const el = document.getElementById('scheduleContent');
  const now = new Date();

  // Predict next events from recent patterns
  const recentFeeds = logs.filter(l=>l.type==='feed').slice(0,8);
  const recentSleeps = logs.filter(l=>l.type==='sleep').slice(0,5);

  // Same rule as the reminder scheduler: only gaps of 30 min to 8 h count
  // (long overnight or missed-log gaps would make it predict a feed every
  // 12 hours), clamped to 1-6 h, 3 h until there are two usable gaps.
  let avgFeedInterval = 3 * 3600000; // default 3h
  if (recentFeeds.length >= 2) {
    const diffs = [];
    for (let i=0; i<recentFeeds.length-1; i++) {
      const d = new Date(recentFeeds[i].time) - new Date(recentFeeds[i+1].time);
      if (d >= 30 * 60000 && d <= 8 * 3600000) diffs.push(d);
    }
    if (diffs.length >= 2) avgFeedInterval = Math.min(6 * 3600000, Math.max(3600000, diffs.slice(0, 5).reduce((a,b)=>a+b,0)/Math.min(diffs.length, 5)));
  }

  const lastFeed = recentFeeds[0] ? new Date(recentFeeds[0].time) : now;
  const nextFeed = new Date(lastFeed.getTime() + avgFeedInterval);
  const feedDue = nextFeed > now ? 'in ' + timeUntil(nextFeed) : 'overdue!';
  const feedBadge = nextFeed > now ? (nextFeed - now < 3600000 ? 'badge-gold' : 'badge-green') : 'badge-gold';

  const lastSleep = recentSleeps[0] ? new Date(recentSleeps[0].time) : now;
  const lastSleepAgo = Math.floor((now - lastSleep) / 3600000);
  const napDue = lastSleepAgo >= 2;
  const napBadge = napDue ? 'badge-gold' : 'badge-blue';
  const napText = napDue ? 'Due soon' : 'In ~' + Math.max(0, 2-lastSleepAgo) + 'h';

  // Generate next 8 reminders
  const upcoming = [];
  for (let i=1; i<=4; i++) {
    upcoming.push({ label:`Feed #${i}`, time: new Date(lastFeed.getTime() + avgFeedInterval*i), icon:'🍼' });
  }
  // Bath (every other day)
  const nextBath = new Date(now); nextBath.setHours(19,0,0,0);
  if (nextBath < now) nextBath.setDate(nextBath.getDate()+1);
  upcoming.push({ label:'Bath time', time: nextBath, icon:'🛁' });
  upcoming.sort((a,b)=>a.time-b.time);

  el.innerHTML = `
    <div class="schedule-card">
      <div class="sc-header">
        <div class="sc-icon" style="background:rgba(212,168,83,0.2)">🍼</div>
        <div><div class="sc-title">Next feed</div><div class="sc-sub">${fmtTime(nextFeed.toISOString())}</div></div>
      </div>
      <div class="schedule-row">
        <div class="sr-left"><div class="sr-label">Based on ${(avgFeedInterval/3600000).toFixed(1)}h average</div><div class="sr-sub">From ${recentFeeds.length} recent feeds</div></div>
        <span class="sr-badge ${feedBadge}">${feedDue}</span>
      </div>
    </div>

    <div class="schedule-card">
      <div class="sc-header">
        <div class="sc-icon" style="background:rgba(140,169,181,0.2)">😴</div>
        <div><div class="sc-title">Next nap</div><div class="sc-sub">${napDue ? 'Due now' : 'In about 2 hours'}</div></div>
      </div>
      <div class="schedule-row">
        <div class="sr-left"><div class="sr-label">Last sleep: ${timeAgo(lastSleep.toISOString())}</div><div class="sr-sub">Awake window ~2h for this age</div></div>
        <span class="sr-badge ${napBadge}">${napText}</span>
      </div>
    </div>

    <div class="schedule-card">
      <div class="sc-header">
        <div class="sc-icon" style="background:rgba(184,165,200,0.15)">🗓️</div>
        <div><div class="sc-title">Upcoming</div><div class="sc-sub">Next 24h predictions</div></div>
      </div>
      ${upcoming.map(ev=>`
        <div class="schedule-row">
          <div class="sr-left">
            <div class="sr-label">${ev.icon} ${ev.label}</div>
            <div class="sr-sub">${fmtTime(ev.time.toISOString())}</div>
          </div>
          <span class="sr-badge badge-blue">${timeUntil(ev.time)}</span>
        </div>`).join('')}
    </div>

`;
}

// =======================================
//  GROWTH
// =======================================
function renderGrowth() {
  const el = document.getElementById('growthContent');
  const last = growthLogs[growthLogs.length-1];
  const prev = growthLogs[growthLogs.length-2];

  const wDelta = last && prev && last.weight && prev.weight ? '+' + (last.weight - prev.weight).toFixed(1) : '';
  const hDelta = last && prev && last.heightIn && prev.heightIn ? '+' + (last.heightIn - prev.heightIn).toFixed(2) : '';

  el.innerHTML = `
    <div class="growth-stats">
      <div class="gs-item">
        <div class="gs-val">${last?.weight || '—'}</div>
        <div class="gs-lbl">Weight (lbs)</div>
        <div class="gs-delta">${wDelta}</div>
      </div>
      <div class="gs-item">
        <div class="gs-val">${last?.heightIn || '—'}"</div>
        <div class="gs-lbl">Height (in)</div>
        <div class="gs-delta">${hDelta}</div>
      </div>
      <div class="gs-item">
        <div class="gs-val">${last?.head || '—'}</div>
        <div class="gs-lbl">Head (cm)</div>
        <div class="gs-delta"></div>
      </div>
    </div>

    <div class="growth-card">
      <div class="ic-title">Weight chart (lbs)</div>
      ${growthLogs.length >= 2 ? `
        <div class="line-chart-wrap">
          <canvas id="weightCanvas"></canvas>
        </div>
        <div class="chart-labels">
          ${growthLogs.map(g=>`<span>${g.date.slice(5)}</span>`).join('')}
        </div>` : `<div style="text-align:center;padding:24px;color:var(--text-light);font-size:13px">Add 2+ measurements to see chart</div>`}
    </div>

    <div class="growth-card">
      <div class="ic-title">Measurement history</div>
      ${growthLogs.length === 0 ? `<div style="text-align:center;padding:20px;color:var(--text-light);font-size:13px">No measurements yet</div>` :
        [...growthLogs].reverse().map(g=>`
          <div class="growth-log-item">
            <div class="gli-date">${formatDate(g.date)}</div>
            <div class="gli-vals">
              ${g.weight ? `<div class="gli-val"><div class="gv-num">${g.weight}</div><div class="gv-unit">lbs</div></div>` : ''}
              ${g.heightIn ? `<div class="gli-val"><div class="gv-num">${g.heightIn}"</div><div class="gv-unit">height</div></div>` : ''}
              ${g.head ? `<div class="gli-val"><div class="gv-num">${g.head}</div><div class="gv-unit">cm</div></div>` : ''}
            </div>
          </div>`).join('')}
    </div>

    <button class="btn-primary btn-full" onclick="openLogModal('growth')" style="margin-bottom:20px">+ Add measurement</button>`;

  // Draw weight chart
  if (growthLogs.length >= 2) {
    setTimeout(() => drawWeightChart(), 50);
  }
}

function drawWeightChart() {
  const canvas = document.getElementById('weightCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth; const H = 120;
  canvas.width = W * window.devicePixelRatio;
  canvas.height = H * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const weights = growthLogs.map(g => g.weight).filter(Boolean);
  const min = Math.min(...weights) - 1;
  const max = Math.max(...weights) + 1;
  const n = weights.length;
  const pad = 20;

  const toX = i => pad + i * (W - 2*pad) / (n-1);
  const toY = v => H - pad - (v - min) / (max - min) * (H - 2*pad);

  // Gradient fill
  const grad = ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0, 'rgba(140,169,181,0.3)');
  grad.addColorStop(1, 'rgba(140,169,181,0)');

  ctx.beginPath();
  ctx.moveTo(toX(0), toY(weights[0]));
  for (let i=1;i<n;i++) ctx.lineTo(toX(i), toY(weights[i]));
  ctx.lineTo(toX(n-1), H); ctx.lineTo(toX(0), H); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath();
  ctx.moveTo(toX(0), toY(weights[0]));
  for (let i=1;i<n;i++) ctx.lineTo(toX(i), toY(weights[i]));
  ctx.strokeStyle = '#8ca9b5'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  ctx.stroke();

  weights.forEach((w,i) => {
    ctx.beginPath();
    ctx.arc(toX(i), toY(w), 4, 0, Math.PI*2);
    ctx.fillStyle = '#8ca9b5'; ctx.fill();
    ctx.fillStyle = '#3d2b1f';
    ctx.font = `bold ${10*window.devicePixelRatio/window.devicePixelRatio}px DM Sans`;
    ctx.textAlign = 'center';
    ctx.fillText(w, toX(i), toY(w)-8);
  });
}

// =======================================
