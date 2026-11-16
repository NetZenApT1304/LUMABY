// Lumaby — Temperature in Insights and reports.
// One part of the app script, loaded in order by index.html. All parts share one
// global scope; run `node tools/check-split.js` after moving code between files.
//  TEMPERATURE IN INSIGHTS & REPORTS
// =======================================
function tempOf(l, unit = tempUnit) {
  if (unit === 'F') return l.tempF != null ? l.tempF : round1(toF(l.tempC));
  return l.tempC != null ? l.tempC : round1(toC(l.tempF));
}
function isFeverReading(l) { return l.tempC != null ? l.tempC >= 38.0 : l.tempF >= 100.4; }
// Readings in the last `days`, oldest first.
function tempReadings(days = 14) {
  const since = Date.now() - days * 86400000;
  return logs.filter(l => l.type === 'temp' && (l.tempF != null || l.tempC != null) && Date.parse(l.time) >= since)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}
function fmtWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function agoShort(iso) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${Math.max(m, 0)}m ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}
function tempSummary(days = 14) {
  const r = tempReadings(days);
  const week = r.filter(l => Date.parse(l.time) >= Date.now() - 7 * 86400000);
  const highest = week.length ? week.reduce((a, b) => (tempOf(b) > tempOf(a) ? b : a)) : null;
  const fevers = r.filter(isFeverReading);
  return { readings: r, latest: r[r.length - 1] || null, highest, fevers, lastFever: fevers[fevers.length - 1] || null };
}

// Single-series line over the last 14 days with the fever threshold.
function tempChartSvg(readings) {
  const W = 320, H = 150, L = 34, R = 10, T = 12, B = 22;
  const unit = tempUnit, range = TEMP_RANGE[unit];
  const t1 = Date.now(), t0 = t1 - 14 * 86400000;
  const vals = readings.map(l => tempOf(l));
  const step = unit === 'F' ? 1 : 0.5;
  const lo = Math.floor(Math.min(...vals, unit === 'F' ? 97 : 36) / step) * step;
  const hi = Math.ceil(Math.max(...vals, range.fever + step) / step) * step;
  const x = t => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  // Round tick values: 1° (°F) or 0.5° (°C) multiples, at most ~4 lines.
  const gridStep = step * Math.max(1, Math.ceil((hi - lo) / step / 4));
  let grid = '';
  for (let v = lo; v <= hi + 1e-9; v = round1(v + gridStep)) {
    grid += `<line class="tc-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>` +
            `<text class="tc-axis" x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${(+v.toFixed(1))}</text>`;
  }
  const fy = y(range.fever);
  const pts = readings.map(l => ({ l, cx: x(Date.parse(l.time)), cy: y(tempOf(l)) }));
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ');
  const tip = l => `${tempOf(l).toFixed(1)} °${unit}${isFeverReading(l) ? ' · Fever' : ''} — ${fmtWhen(l.time)}`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Temperature readings over the last 14 days">
    ${grid}
    <line class="tc-fever-line" x1="${L}" x2="${W - R}" y1="${fy}" y2="${fy}"/>
    <text class="tc-fever-lbl" x="${L + 4}" y="${fy - 4}">Fever ${range.fever}°</text>
    ${pts.length > 1 ? `<path class="tc-line" d="${path}"/>` : ''}
    ${pts.map(p => `<circle class="tc-pt ${isFeverReading(p.l) ? 'fever' : ''}" cx="${p.cx}" cy="${p.cy}" r="4"/>`).join('')}
    ${pts.map(p => `<circle class="tc-hit" cx="${p.cx}" cy="${p.cy}" r="13" data-tip="${tip(p.l)}"/>`).join('')}
    <text class="tc-axis" x="${L}" y="${H - 6}">${new Date(t0).toLocaleDateString([], { month: 'short', day: 'numeric' })}</text>
    <text class="tc-axis" x="${W - R}" y="${H - 6}" text-anchor="end">Today</text>
  </svg><div class="tc-tip" role="status"></div>`;
}

function tempInsightsCard() {
  const s = tempSummary(14);
  const u = `°${tempUnit}`;
  if (!s.readings.length) {
    return `<div class="insight-card" id="temp-insights">
      <div class="ic-title">🌡️ Temperature</div>
      <p style="font-size:13px;color:var(--text-light);margin-bottom:12px">No readings in the last 14 days.</p>
      <button class="btn-sec" onclick="openLogModal('temp')">Log a temperature</button></div>`;
  }
  const fever = l => isFeverReading(l) ? ' <span class="fever-tag">● Fever</span>' : '';
  return `<div class="insight-card" id="temp-insights">
    <div class="ic-title">🌡️ Temperature · last 14 days</div>
    <div class="temp-tiles">
      <div class="temp-tile"><div class="tt-v">${tempOf(s.latest).toFixed(1)}${u}</div><div class="tt-l">Latest · ${agoShort(s.latest.time)}</div></div>
      <div class="temp-tile"><div class="tt-v">${s.highest ? tempOf(s.highest).toFixed(1) + u : '—'}</div><div class="tt-l">Highest this week</div></div>
      <div class="temp-tile"><div class="tt-v" style="${s.fevers.length ? 'color:#c94a3b' : ''}">${s.fevers.length}</div><div class="tt-l">Fever readings${s.lastFever ? ' · last ' + agoShort(s.lastFever.time) : ''}</div></div>
    </div>
    <div class="temp-chart-wrap" id="temp-chart">${tempChartSvg(s.readings)}</div>
    <div class="temp-list" aria-label="Recent temperature readings">
      ${s.readings.slice(-5).reverse().map(l => `<div class="temp-row"><span class="tr-when">${fmtWhen(l.time)}</span>
        <span><span class="tr-val">${tempOf(l).toFixed(1)} ${u}</span>${fever(l)}</span></div>`).join('')}
    </div></div>`;
}

// Tooltip for chart points (hover with a mouse, tap on a phone).
document.addEventListener('pointerover', e => {
  const hit = e.target.closest?.('.tc-hit'); if (!hit) return;
  const wrap = hit.closest('.temp-chart-wrap'), tip = wrap.querySelector('.tc-tip');
  const svg = wrap.querySelector('svg'), box = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
  tip.textContent = hit.dataset.tip;
  tip.style.display = 'block';
  // keep the tooltip inside the card
  const half = tip.offsetWidth / 2, px = (hit.cx.baseVal.value / vb.width) * box.width;
  tip.style.left = Math.min(Math.max(px, half + 4), box.width - half - 4) + 'px';
  tip.style.top = (hit.cy.baseVal.value / vb.height) * box.height + 'px';
});
document.addEventListener('pointerout', e => {
  const hit = e.target.closest?.('.tc-hit'); if (!hit) return;
  hit.closest('.temp-chart-wrap').querySelector('.tc-tip').style.display = 'none';
});

const _origRenderInsights = renderInsights;
renderInsights = function() {
  _origRenderInsights();
  const el = document.getElementById('insightsContent');
  if (el) el.insertAdjacentHTML('beforeend', tempInsightsCard());
  applyPremiumGates();
};

const _origRenderGrowth = renderGrowth;
renderGrowth = function() {
  _origRenderGrowth();
  applyPremiumGates();
};

// Patch showProfileModal to show account modal instead if signed in
const _origShowProfile = showProfileModal;
showProfileModal = function() {
  if (currentUser) {
    showAccountModal();
  } else {
    _origShowProfile();
  }
};

// =======================================
