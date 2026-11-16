// Lumaby — Pediatrician report, sleep coach, pump totals.
// One part of the app script, loaded in order by index.html. All parts share one
// global scope; run `node tools/check-split.js` after moving code between files.
//  PEDIATRICIAN REPORT
// =====================================================
// Strip emojis for PDF compatibility
function stripEmoji(str) {
  if (!str) return '';
  return str.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function showPediReport() {
  if (!isPremium) { openModal('modal-upgrade'); return; }
  const body = document.getElementById('pedi-modal-body');
  const dob = profile?.dob ? new Date(profile.dob) : null;
  const ageMonths = dob ? Math.floor((Date.now() - dob) / (30.44 * 86400000)) : 0;
  const last = growthLogs[growthLogs.length - 1];
  const prev = growthLogs[growthLogs.length - 2];
  const pct = last?.weight ? getPercentile(last.weight, ageMonths) : null;

  const last7feeds = logs.filter(l => l.type === 'feed' && (Date.now() - new Date(l.time)) < 7 * 86400000);
  const last7sleep = logs.filter(l => l.type === 'sleep' && (Date.now() - new Date(l.time)) < 7 * 86400000);
  const avgFeedsPerDay = (last7feeds.length / 7).toFixed(1);
  const avgSleepH = last7sleep.length > 0
    ? (last7sleep.reduce((s,l) => s+(l.durationMin||0), 0) / last7sleep.length / 60).toFixed(1)
    : '—';

  body.innerHTML = `
    <p style="font-size:13px;color:var(--text-light);margin-bottom:20px;line-height:1.6">
      A formatted summary of ${profile?.baby || 'baby'}'s health data ready to share with your pediatrician.
    </p>
    <div style="background:white;border-radius:20px;padding:20px;border:1px solid var(--warm-tan);margin-bottom:20px">
      <div style="font-family:'Playfair Display',serif;font-size:18px;color:var(--deep-brown);margin-bottom:4px">
        ${profile?.baby || 'Baby'}'s Health Summary
      </div>
      <div style="font-size:12px;color:var(--text-light);margin-bottom:16px">
        Generated ${new Date().toLocaleDateString()} · Age: ${ageMonths} months
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        ${[
          ['⚖️', last?.weight ? last.weight + ' lbs' : '—', 'Weight'],
          ['📏', last?.heightIn ? last.heightIn + '"' : '—', 'Height'],
          ['📊', pct ? pct.pct : '—', 'Percentile'],
          ['📅', ageMonths + ' mo', 'Age'],
          ['🍼', avgFeedsPerDay + '/day', 'Avg feeds'],
          ['😴', avgSleepH + 'h', 'Avg sleep'],
        ].map(([icon, val, lbl]) => `
          <div style="background:rgba(61,43,31,0.04);border-radius:12px;padding:12px;text-align:center">
            <div style="font-size:18px;margin-bottom:4px">${icon}</div>
            <div style="font-size:16px;font-weight:700;color:var(--deep-brown)">${val}</div>
            <div style="font-size:10px;color:var(--text-light)">${lbl}</div>
          </div>`).join('')}
      </div>

      ${(() => {
        const t = tempSummary(14); if (!t.readings.length) return '';
        const u = '°' + tempUnit;
        return `<div style="font-size:12px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px">Temperature · last 14 days</div>
          <div style="font-size:13px;color:var(--text);margin-bottom:6px">
            ${t.readings.length} reading${t.readings.length === 1 ? '' : 's'} · highest this week ${t.highest ? tempOf(t.highest).toFixed(1) + ' ' + u : '—'} ·
            <span style="${t.fevers.length ? 'color:#c94a3b;font-weight:600' : ''}">${t.fevers.length} fever reading${t.fevers.length === 1 ? '' : 's'}</span></div>
          ${t.readings.slice(-6).reverse().map(l => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(61,43,31,0.05);font-size:13px">
            <span style="color:var(--text-light)">${fmtWhen(l.time)}</span>
            <span style="color:var(--deep-brown);font-weight:600">${tempOf(l).toFixed(1)} ${u}${isFeverReading(l) ? ' <span style="color:#c94a3b">● Fever</span>' : ''}</span></div>`).join('')}
          <div style="height:14px"></div>`;
      })()}
      ${(() => {
        const h = healthReportData();
        const head = t => `<div style="font-size:12px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.6px;margin:0 0 8px">${t}</div>`;
        const row = (a, b) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid rgba(61,43,31,0.05);font-size:13px"><span style="color:var(--text-light);white-space:nowrap">${a}</span><span style="color:var(--deep-brown);text-align:right">${b}</span></div>`;
        let out = '';
        if (h.vaccines.length || h.visits.length) {
          out += head('Doctor & vaccines');
          [...h.vaccines, ...h.visits].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 8).forEach(l =>
            out += row(formatDate(l.time.split('T')[0]), (l.healthKind === 'vaccine' ? '💉 ' + escHtml(l.vaccines.join(', ')) + (l.reactions?.length ? ' · reaction: ' + escHtml(l.reactions.join(', ')) : '') : '🩺 ' + escHtml(l.title + (l.provider ? ' · ' + l.provider : '')))));
          out += '<div style="height:14px"></div>';
        }
        if (h.foods.length) {
          out += head(`Solids · ${h.foods.length} food${h.foods.length === 1 ? '' : 's'} tried`);
          if (h.reactions.length) out += `<div style="font-size:13px;color:#c94a3b;font-weight:600;margin-bottom:6px">⚠️ Reactions to: ${h.reactions.map(f => escHtml(f.name)).join(', ')}</div>`;
          out += `<div style="font-size:13px;color:var(--text);line-height:1.6">${h.foods.map(f => escHtml(f.name)).join(', ')}</div><div style="height:14px"></div>`;
        }
        if (h.teeth) out += head('Teeth') + `<div style="font-size:13px;color:var(--text);margin-bottom:14px">${h.teeth} of 20 baby teeth in</div>`;
        return out;
      })()}
      <div style="font-size:12px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px">Recent milestones</div>
      ${logs.filter(l => l.type === 'milestone').slice(0, 5).map(ms => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(61,43,31,0.05)">
          <span style="font-size:16px">${ms.icon}</span>
          <span style="font-size:13px;color:var(--text)">${ms.title}</span>
          <span style="font-size:11px;color:var(--text-light);margin-left:auto">${formatDate(ms.time.split('T')[0])}</span>
        </div>`).join('') || '<div style="font-size:13px;color:var(--text-light);padding:8px 0">No milestones logged yet</div>'}

      ${growthLogs.length > 0 ? `
        <div style="font-size:12px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.6px;margin:14px 0 8px">Growth history</div>
        ${growthLogs.slice(-4).map(g => `
          <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(61,43,31,0.05);font-size:13px">
            <span style="color:var(--text-light)">${formatDate(g.date)}</span>
            <span style="color:var(--deep-brown)">${g.weight ? g.weight+'lbs' : ''} ${g.heightIn ? g.heightIn+'"' : ''}</span>
          </div>`).join('')}` : ''}
    </div>
    <button class="btn-primary btn-full" onclick="generatePediPDF()">⬇️ Download PDF Report</button>
    <p style="text-align:center;font-size:11px;color:var(--text-light);margin-top:10px">
      Share with your pediatrician at your next visit
    </p>`;
  openModal('modal-pedi');
}

async function generatePediPDF() {
  if (!window.jspdf) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const { 
jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, dob = profile?.dob ? new Date(profile.dob) : null;
  const ageMonths = dob ? Math.floor((Date.now() - dob) / (30.44 * 86400000)) : 0;

  // Header
  doc.setFillColor(61, 43, 31);
  doc.rect(0, 0, W, 35, 'F');
  doc.setFontSize(20); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
  doc.text((profile?.baby || 'Baby') + ' — Pediatrician Report', 15, 20);
  doc.setFontSize(10); doc.setFont('helvetica','normal');
  doc.text('Generated ' + new Date().toLocaleDateString() + ' · Age: ' + ageMonths + ' months · Lumaby Baby Tracker', 15, 28);

  let y = 50;
  doc.setTextColor(61,43,31);

  // Stats grid
  const last = growthLogs[growthLogs.length - 1];
  const pct = last?.weight ? getPercentile(last.weight, ageMonths) : null;
  const last7feeds = logs.filter(l => l.type === 'feed' && (Date.now() - new Date(l.time)) < 7 * 86400000);
  const last7sleep = logs.filter(l => l.type === 'sleep' && (Date.now() - new Date(l.time)) < 7 * 86400000);

  const stats = [
    ['Weight', last?.weight ? last.weight + ' lbs' : 'N/A'],
    ['Height', last?.heightIn ? last.heightIn + '"' : 'N/A'],
    ['WHO Percentile', pct ? pct.pct : 'N/A'],
    ['Avg feeds/day', (last7feeds.length / 7).toFixed(1)],
    ['Avg sleep/session', last7sleep.length ? (last7sleep.reduce((s,l)=>s+(l.durationMin||0),0)/last7sleep.length/60).toFixed(1)+'h' : 'N/A'],
    ['Total milestones', logs.filter(l=>l.type==='milestone').length.toString()],
  ];

  doc.setFontSize(13); doc.setFont('helvetica','bold');
  doc.text('Health Summary', 15, y); y += 8;
  for (let i = 0; i < stats.length; i += 2) {
    const [l1, v1] = stats[i]; const [l2, v2] = stats[i+1] || ['',''];
    doc.setFillColor(248, 245, 240);
    doc.roundedRect(15, y - 5, 85, 18, 3, 3, 'F');
    doc.roundedRect(110, y - 5, 85, 18, 3, 3, 'F');
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(138,112,96);
    doc.text(l1, 20, y + 2); doc.text(l2, 115, y + 2);
    doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(61,43,31);
    doc.text(v1, 20, y + 10); doc.text(v2, 115, y + 10);
    y += 24;
  }

  // Milestones
  y += 6;
  doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.text('Milestones', 15, y); y += 8;
  const milestones = logs.filter(l => l.type === 'milestone').slice(0, 10);
  if (milestones.length > 0) {
    milestones.forEach(ms => {
      doc.setFillColor(248,245,240); doc.roundedRect(15, y-4, W-30, 14, 2, 2, 'F');
      doc.setFontSize(11); doc.setFont('helvetica','normal'); doc.setTextColor(61,43,31);
      doc.text(ms.title, 20, y+5);
      doc.setFontSize(9); doc.setTextColor(138,112,96);
      doc.text(formatDate(ms.time.split('T')[0]), W-20, y+5, { align:'right' });
      y += 18;
    });
  } else {
    doc.setFontSize(11); doc.setFont('helvetica','italic'); doc.setTextColor(138,112,96);
    doc.text('No milestones logged', 20, y); y += 14;
  }

  // Growth history
  if (growthLogs.length > 0) {
    y += 6;
    doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(61,43,31);
    doc.text('Growth History', 15, y); y += 8;
    const headers = ['Date', 'Weight (lbs)', 'Height (in)', 'Head (cm)'];
    const cws = [55, 40, 40, 40];
    let gx = 15;
    doc.setFillColor(61,43,31);
    headers.forEach((h, i) => {
      doc.rect(gx, y-4, cws[i], 10, 'F');
      doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
      doc.text(h, gx+2, y+3);
      gx += cws[i];
    });
    y += 12;
    growthLogs.slice(-8).forEach((g, ri) => {
      gx = 15;
      if (ri % 2 === 0) { doc.setFillColor(248,245,240); doc.rect(15, y-4, W-30, 10, 'F'); }
      doc.setTextColor(61,43,31); doc.setFont('helvetica','normal');
      [formatDate(g.date), g.weight||'-', g.heightIn||'-', g.head||'-'].forEach((v,i) => {
        doc.text(v.toString(), gx+2, y+3);
        gx += cws[i];
      });
      y += 12;
    });
  }

  // Temperature
  const temps = tempSummary(14);
  if (temps.readings.length) {
    const u = '\u00B0' + tempUnit;
    if (y > 225) { doc.addPage(); y = 20; }
    y += 6;
    doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(61,43,31);
    doc.text('Temperature (last 14 days)', 15, y); y += 7;
    doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(90,70,55);
    doc.text(`${temps.readings.length} readings · highest this week ${temps.highest ? tempOf(temps.highest).toFixed(1) + ' ' + u : 'N/A'} · ${temps.fevers.length} fever reading${temps.fevers.length === 1 ? '' : 's'} (fever: ${TEMP_RANGE[tempUnit].fever} ${u} or higher)`, 15, y);
    y += 8;
    const tcw = [60, 35, 25, W - 30 - 120];
    let tx = 15;
    doc.setFillColor(61,43,31);
    ['Date & time', 'Temperature', 'Fever', 'Notes'].forEach((h, i) => {
      doc.rect(tx, y-4, tcw[i], 10, 'F');
      doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
      doc.text(h, tx+2, y+3); tx += tcw[i];
    });
    y += 12;
    temps.readings.slice(-12).reverse().forEach((l, ri) => {
      if (y > 275) { doc.addPage(); y = 20; }
      tx = 15;
      if (ri % 2 === 0) { doc.setFillColor(248,245,240); doc.rect(15, y-4, W-30, 10, 'F'); }
      const fever = isFeverReading(l);
      const notes = stripEmoji((l.detail || '').split(' · ').slice(1).filter(x => x !== 'Fever').join(' · ')).slice(0, 40);
      [fmtWhen(l.time), tempOf(l).toFixed(1) + ' ' + u, fever ? 'Yes' : '', notes].forEach((v, i) => {
        doc.setFont('helvetica', i === 2 && fever ? 'bold' : 'normal');
        if (i === 2 && fever) doc.setTextColor(201,74,59); else doc.setTextColor(61,43,31);
        doc.text(String(v), tx+2, y+3); tx += tcw[i];
      });
      y += 12;
    });
  }

  // Doctor & vaccines, solids, teeth
  const hr = healthReportData();
  const section = title => { if (y > 240) { doc.addPage(); y = 20; } y += 6; doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(61,43,31); doc.text(title, 15, y); y += 8; };
  const line = (left, right, color) => {
    if (y > 278) { doc.addPage(); y = 20; }
    doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(138,112,96); doc.text(left, 15, y);
    doc.setTextColor(...(color || [61,43,31]));
    const wrapped = doc.splitTextToSize(stripEmoji(right), W - 70);
    doc.text(wrapped, 55, y); y += 6 * wrapped.length + 1;
  };
  const healthItems = [...hr.vaccines, ...hr.visits].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 12);
  if (healthItems.length) {
    section('Doctor visits & vaccines');
    healthItems.forEach(l => line(formatDate(l.time.split('T')[0]),
      l.healthKind === 'vaccine' ? 'Vaccines: ' + l.vaccines.join(', ') + (l.reactions?.length ? ' (reaction: ' + l.reactions.join(', ') + ')' : '') + (l.notes ? ' - ' + l.notes : '')
                                 : l.title + (l.provider ? ' - ' + l.provider : '') + (l.notes ? ': ' + l.notes : '')));
  }
  if (hr.foods.length) {
    section(`Solids (${hr.foods.length} food${hr.foods.length === 1 ? '' : 's'} tried)`);
    if (hr.reactions.length) line('Reactions', hr.reactions.map(f => f.name).join(', '), [201,74,59]);
    line('Foods', hr.foods.map(f => f.name).join(', '));
  }
  if (hr.teeth) { section('Teeth'); line('Teeth in', `${hr.teeth} of 20`); }

  // Footer
  doc.setFontSize(9); doc.setTextColor(196,121,90);
  doc.text('Generated by Lumaby Baby Tracker · lumabyy.netlify.app', W/2, 287, { align:'center' });

  const fname = (profile?.baby||'baby').toLowerCase().replace(/\s+/g,'-') + '-pedi-report.pdf';
  doc.save(fname);
  showToast('🩺 Report downloaded!');
}

// =====================================================
//  AI SLEEP COACH
// =====================================================
function showSleepCoach() {
  if (!isPremium) { openModal('modal-upgrade'); return; }
  const body = document.getElementById('sleep-coach-body');
  const dob = profile?.dob ? new Date(profile.dob) : null;
  const ageMonths = dob ? Math.floor((Date.now() - dob) / (30.44 * 86400000)) : 0;
  const sleepLogs = logs.filter(l => l.type === 'sleep').slice(0, 20);

  // Analyze patterns
  const avgDuration = sleepLogs.length
    ? (sleepLogs.reduce((s,l) => s+(l.durationMin||0), 0) / sleepLogs.length)
    : 0;
  const avgWakeUps = sleepLogs.length
    ? (sleepLogs.reduce((s,l) => s+(l.wakeUps||0), 0) / sleepLogs.length)
    : 0;
  const nightSleeps = sleepLogs.filter(l => {
    const h = new Date(l.time).getHours();
    return h >= 19 || h < 6;
  });
  const dayNaps = sleepLogs.filter(l => {
    const h = new Date(l.time).getHours();
    return h >= 6 && h < 19;
  });

  // Age-based recommendations
  const getAgeRec = () => {
    if (ageMonths < 2) return { total: '14-17h', naps: '4-5', night: '8-9h', awake: '45-60min' };
    if (ageMonths < 4) return { total: '14-16h', naps: '3-4', night: '9-10h', awake: '1-2h' };
    if (ageMonths < 6) return { total: '12-15h', naps: '3', night: '10-11h', awake: '1.5-2h' };
    if (ageMonths < 9) return { total: '12-15h', naps: '2-3', night: '11h', awake: '2-3h' };
    if (ageMonths < 12) return { total: '12-14h', naps: '2', night: '11h', awake: '2.5-3.5h' };
    return { total: '11-14h', naps: '1-2', night: '11h', awake: '3-4h' };
  };
  const rec = getAgeRec();

  // Generate insights
  const insights = [];
  if (avgWakeUps > 2) insights.push({ icon: '🌙', title: 'Frequent night wakings', tip: 'Try a consistent bedtime routine — bath, feed, song — starting 30 min before sleep. Consistency signals to baby that night is different from naps.' });
  if (avgDuration < 45 && dayNaps.length > 0) insights.push({ icon: '⏰', title: 'Short nap cycles', tip: 'Naps under 45 min are often one sleep cycle. Try extending by gently soothing at the 35-40 min mark before baby fully wakes.' });
  // Compare naps per day (not the total across all logged days) with the
  // most naps recommended for this age.
  const napDays = new Set(dayNaps.map(l => new Date(l.time).toDateString())).size;
  const napsPerDay = napDays ? dayNaps.length / napDays : 0;
  const maxRecNaps = Math.max(...String(rec.naps).split('-').map(Number));
  if (napDays >= 3 && napsPerDay > maxRecNaps + 0.5) insights.push({ icon: '☀️', title: 'Too many naps for age', tip: `${profile?.baby || 'Baby'} is averaging ${napsPerDay.toFixed(1)} naps a day. At ${ageMonths} months, most babies do best with ${rec.naps}. Capping naps may lead to longer overnight sleep.` });
  if (avgDuration > 30 && avgWakeUps < 1) insights.push({ icon: '🏆', title: 'Great sleep patterns!', tip: `${profile?.baby || 'Baby'} is sleeping well. Keep the consistent routine going — it's working!` });
  if (insights.length === 0) insights.push({ icon: '📊', title: 'Log more sleep to get insights', tip: 'Track at least 5-7 sleep sessions to unlock personalized coaching tips.' });

  body.innerHTML = `
    <div class="sleep-coach-card">
      <div class="coach-message">
        <div class="coach-msg-title">📊 Sleep snapshot for ${profile?.baby || 'Baby'} · ${ageMonths} months</div>
        <div class="coach-msg-body">
          Avg session: <strong>${Math.round(avgDuration)} min</strong> ·
          Night wake-ups: <strong>${avgWakeUps.toFixed(1)}/night</strong> ·
          Naps logged: <strong>${dayNaps.length}</strong> ·
          Night sleeps: <strong>${nightSleeps.length}</strong>
        </div>
      </div>
    </div>

    <div style="font-family:'Playfair Display',serif;font-size:16px;color:var(--deep-brown);margin-bottom:12px">
      Recommended for ${ageMonths} months
    </div>
    <div style="background:var(--card);border-radius:16px;padding:16px;margin-bottom:20px;box-shadow:var(--shadow)">
      ${[
        ['⏰', 'Total sleep', rec.total],
        ['☀️', 'Naps per day', rec.naps],
        ['🌙', 'Night sleep', rec.night],
        ['👀', 'Awake window', rec.awake],
      ].map(([icon, lbl, val]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(61,43,31,0.06)">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text)">${icon} ${lbl}</div>
          <div style="font-size:14px;font-weight:700;color:var(--terracotta)">${val}</div>
        </div>`).join('')}
    </div>

    <div style="font-family:'Playfair Display',serif;font-size:16px;color:var(--deep-brown);margin-bottom:12px">
      Personalised tips
    </div>
    <div class="sleep-coach-card">
      ${insights.map(ins => `
        <div class="coach-tip">
          <div class="coach-tip-icon">${ins.icon}</div>
          <div class="coach-tip-text"><strong>${ins.title}</strong><br>${ins.tip}</div>
        </div>`).join('')}
    </div>

    <div style="margin-top:16px;padding:14px;background:rgba(140,169,181,0.1);border-radius:14px;font-size:12px;color:var(--text-light);line-height:1.6">
      💡 Tips are based on your logged data and WHO/AAP guidelines. Always consult your pediatrician for medical advice.
    </div>`;
  openModal('modal-sleep-coach');
}

// =====================================================
//  PUMP SESSION TOTALS
// =====================================================
function getPumpSummary() {
  const pumpLogs = logs.filter(l => l.type === 'pump');
  const todayPumps = pumpLogs.filter(l => {
    const d = new Date(l.time); d.setHours(0,0,0,0);
    const today = new Date(); today.setHours(0,0,0,0);
    return d.getTime() === today.getTime();
  });
  const totalOzToday = todayPumps.reduce((s,l) => {
    const m = l.detail?.match(/(\d+\.?\d*)\s*oz/i);
    return s + (m ? parseFloat(m[1]) : 0);
  }, 0);
  const weekPumps = pumpLogs.filter(l => Date.now() - new Date(l.time) < 7 * 86400000);
  const totalOzWeek = weekPumps.reduce((s,l) => {
    const m = l.detail?.match(/(\d+\.?\d*)\s*oz/i);
    return s + (m ? parseFloat(m[1]) : 0);
  }, 0);
  return { sessions: todayPumps.length, ozToday: totalOzToday.toFixed(1), ozWeek: totalOzWeek.toFixed(1) };
}

// =====================================================
