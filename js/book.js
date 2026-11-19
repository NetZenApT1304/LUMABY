// Lumaby — Baby book.
// One part of the app script, loaded in order by index.html. All parts share one
// global scope; run `node tools/check-split.js` after moving code between files.
//  BABY BOOK MODULE
// =====================================================

const CHAPTER_COLORS = [
  '#c4795a','#8ca9b5','#7a9e7e','#b8a5c8',
  '#d4a853','#d4a5a0','#6b8fa3','#9e7a7a',
  '#7a9e8c','#a07ab8','#b88c5a','#7a8c9e'
];

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

// == Render Book Screen ==============================
function renderBook() {
  const el = document.getElementById('bookContent');
  const av = document.getElementById('avatar5');
  if (av) av.textContent = profile?.emoji || '🌙';

  const sub = document.getElementById('book-sub');
  if (sub) sub.textContent = profile?.baby ? profile.baby + "'s story, beautifully told" : 'Your story, beautifully told';

  if (!profile) {
    el.innerHTML = '<div style="text-align:center;padding:48px 24px;color:var(--text-light)"><div style="font-size:48px;margin-bottom:16px">📖</div><div style="font-size:16px">Complete setup to see your baby book</div></div>';
    return;
  }

  const dob = profile.dob ? new Date(profile.dob) : null;
  const ageMonths = dob ? Math.floor((Date.now() - dob) / (30.44 * 86400000)) : 0;
  const totalLogs = logs.length;
  const totalMilestones = logs.filter(l => l.type === 'milestone').length;
  const lastGrowth = growthLogs[growthLogs.length - 1];

  // Build months array
  const months = buildMonthChapters(dob, ageMonths);
  const previewColors = months.slice(0, 6);

  el.innerHTML = `
    <!-- Hero -->
    <div class="book-hero">
      <span class="book-hero-emoji">${profile.emoji || '🌙'}</span>
      <div class="book-hero-name">${profile.baby || 'Baby'}'s Baby Book</div>
      <div class="book-hero-sub">${dob ? 'Born ' + formatDate(dob.toISOString().split('T')[0]) : ''}</div>
      <div class="book-hero-stats">
        <div class="bhs-item"><div class="bhs-val">${ageMonths}</div><div class="bhs-lbl">Months old</div></div>
        <div class="bhs-item"><div class="bhs-val">${totalLogs}</div><div class="bhs-lbl">Moments logged</div></div>
        <div class="bhs-item"><div class="bhs-val">${totalMilestones}</div><div class="bhs-lbl">Milestones</div></div>
        ${lastGrowth ? `<div class="bhs-item"><div class="bhs-val">${lastGrowth.weight}lbs</div><div class="bhs-lbl">Latest weight</div></div>` : ''}
      </div>
    </div>

    <!-- Page preview strip -->
    <div style="font-family:'Playfair Display',serif;font-size:16px;color:var(--deep-brown);margin-bottom:12px">Preview chapters</div>
    <div class="book-preview-strip">
      <div class="preview-page" style="background:linear-gradient(135deg,#c4795a,#d4a5a0)" onclick="scrollToChapter(0)">
        <img src="brand/logo-mark.svg" alt="" width="34" height="34" style="display:block;margin:0 auto"><p>Cover</p>
      </div>
      ${previewColors.map((m,i) => `
        <div class="preview-page" style="background:${CHAPTER_COLORS[i % CHAPTER_COLORS.length]}22;border:2px solid ${CHAPTER_COLORS[i % CHAPTER_COLORS.length]}44" onclick="scrollToChapter(${i})">
          <span style="font-size:18px">Month ${i+1}</span>
          <p style="color:${CHAPTER_COLORS[i % CHAPTER_COLORS.length]}">${m.milestones.length} milestones</p>
        </div>`).join('')}
      <div class="preview-page" style="background:linear-gradient(135deg,rgba(212,168,83,0.15),rgba(196,121,90,0.15));border:2px solid rgba(212,168,83,0.3)" onclick="scrollToChapter(99)">
        <span>📊</span><p>Stats</p>
      </div>
    </div>

    <!-- Generate buttons -->
    <div class="generate-section">
      <div class="gen-title">Download your book</div>
      <div class="gen-cards">
        <div class="gen-card digital" onclick="handleDigitalDownload()">
          <div class="gen-icon">📄</div>
          <div class="gen-info">
            <div class="gen-name">Download PDF</div>
            <div class="gen-desc">Save as PDF and print at home or at any print shop.</div>
          </div>
          <div class="gen-price-tag ${isPremium ? 'free' : 'premium-only'}">${isPremium ? 'Free' : '✨ Premium'}</div>
        </div>
      </div>
    </div>

    <!-- Month chapters -->
    <div style="font-family:'Playfair Display',serif;font-size:18px;color:var(--deep-brown);margin-bottom:14px">Your story by month</div>
    <div id="book-chapters">
      ${months.map((m, i) => renderChapter(m, i, ageMonths)).join('')}
    </div>

    <!-- Stats chapter -->
    <div class="book-chapter" id="chapter-99">
      <div class="chapter-header">
        <div class="chapter-number" style="background:linear-gradient(135deg,var(--soft-gold),#e8b84b)">
          <span style="font-size:18px">📊</span>
        </div>
        <div>
          <div class="chapter-title">The full picture</div>
          <div class="chapter-subtitle">Everything at a glance</div>
        </div>
      </div>
      ${renderStatsChapter()}
    </div>
  `;
}

function buildMonthChapters(dob, ageMonths) {
  const months = [];
  const maxMonths = Math.min(ageMonths + 1, 12);
  for (let m = 0; m < maxMonths; m++) {
    const start = dob ? new Date(dob) : new Date();
    start.setMonth(start.getMonth() + m);
    start.setDate(1); start.setHours(0,0,0,0);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0); end.setHours(23,59,59,999);

    const monthLogs = logs.filter(l => {
      const t = new Date(l.time);
      return t >= start && t <= end;
    });

    const milestones = monthLogs.filter(l => l.type === 'milestone');
    const feeds = monthLogs.filter(l => l.type === 'feed').length;
    const sleeps = monthLogs.filter(l => l.type === 'sleep');
    const diapers = monthLogs.filter(l => l.type === 'diaper').length;
    const totalSleepH = Math.round(sleeps.reduce((s,l) => s + (l.durationMin||0), 0) / 60);

    const growthThisMonth = growthLogs.filter(g => {
      const d = new Date(g.date);
      return d >= start && d <= end;
    });
    const latestGrowth = growthThisMonth[growthThisMonth.length - 1];

    months.push({
      monthNum: m + 1,
      start, end,
      label: MONTH_NAMES[start.getMonth()] + ' ' + start.getFullYear(),
      milestones, feeds, sleeps: sleeps.length, diapers, totalSleepH,
      totalLogs: monthLogs.length, latestGrowth
    });
  }
  return months;
}

function renderChapter(m, i, ageMonths) {
  const color = CHAPTER_COLORS[i % CHAPTER_COLORS.length];
  const isLocked = !isPremium && i >= 1; // Free: only month 1 unlocked

  const statsHtml = `
    <div class="chapter-stats">
      ${m.totalSleepH ? `<div class="cs-pill"><span>😴</span>${m.totalSleepH}h sleep</div>` : ''}
      ${m.feeds ? `<div class="cs-pill"><span>🍼</span>${m.feeds} feeds</div>` : ''}
      ${m.diapers ? `<div class="cs-pill"><span>🌿</span>${m.diapers} diapers</div>` : ''}
      ${m.latestGrowth?.weight ? `<div class="cs-pill"><span>⚖️</span>${m.latestGrowth.weight}lbs</div>` : ''}
      ${m.latestGrowth?.heightIn ? `<div class="cs-pill"><span>📏</span>${m.latestGrowth.heightIn}"</div>` : ''}
    </div>`;

  const milestonesHtml = m.milestones.length > 0 ? `
    <div style="font-size:12px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px">Milestones</div>
    <div class="chapter-milestones">
      ${m.milestones.map(ms => `
        <div class="milestone-card">
          <span class="mc-emoji">${ms.icon}</span>
          <div class="mc-info">
            <div class="mc-title">${ms.title}</div>
            <div class="mc-date">${formatDate(ms.time.split('T')[0])}</div>
            ${ms.detail ? `<div class="mc-note">"${ms.detail}"</div>` : ''}
          </div>
        </div>`).join('')}
    </div>` : `
    <div style="text-align:center;padding:12px;color:var(--text-light);font-size:13px">
      ${m.totalLogs > 0 ? `${m.totalLogs} events logged · No milestones recorded` : 'No events logged this month yet'}
    </div>`;

  const inner = `
    <div class="chapter-header">
      <div class="chapter-number" style="background:${color}">
        <div style="font-size:8px">MONTH</div>
        <div style="font-size:20px;font-weight:800">${m.monthNum}</div>
      </div>
      <div>
        <div class="chapter-title">${profile?.baby || 'Baby'} at ${m.monthNum} month${m.monthNum > 1 ? 's' : ''}</div>
        <div class="chapter-subtitle">${m.label}</div>
      </div>
    </div>
    ${statsHtml}
    ${milestonesHtml}`;

  if (isLocked) {
    return `
      <div class="book-chapter chapter-locked" id="chapter-${i}" style="min-height:200px">
        <div style="filter:blur(3px);pointer-events:none;user-select:none">${inner}</div>
        <div class="chapter-locked-overlay">
          <div class="clo-lock">🔒</div>
          <div class="clo-title">Month ${m.monthNum} is locked</div>
          <div class="clo-sub">Upgrade to Premium to unlock all months and generate your complete baby book.</div>
          <button class="clo-price" onclick="openModal('modal-upgrade')">Unlock for $4.99/mo</button>
          <div class="clo-note">Or get the full PDF for a one-time purchase</div>
        </div>
      </div>`;
  }

  return `<div class="book-chapter" id="chapter-${i}">${inner}</div>`;
}

function renderStatsChapter() {
  const totalFeeds = logs.filter(l => l.type === 'feed').length;
  const totalDiapers = logs.filter(l => l.type === 'diaper').length;
  const totalSleepMin = logs.filter(l => l.type === 'sleep').reduce((s,l) => s+(l.durationMin||0),0);
  const totalSleepH = Math.round(totalSleepMin / 60);
  const totalMilestones = logs.filter(l => l.type === 'milestone').length;
  const totalDays = profile?.dob ? Math.floor((Date.now() - new Date(profile.dob)) / 86400000) : 0;

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${[
        ['🍼', totalFeeds, 'Total feeds'],
        ['🌿', totalDiapers, 'Total diapers'],
        ['😴', totalSleepH + 'h', 'Total sleep'],
        ['⭐', totalMilestones, 'Milestones'],
        ['📅', totalDays, 'Days logged'],
        ['💕', logs.length, 'Total entries'],
      ].map(([icon, val, lbl]) => `
        <div style="background:rgba(255,255,255,0.6);border-radius:16px;padding:16px;text-align:center">
          <div style="font-size:24px;margin-bottom:6px">${icon}</div>
          <div style="font-size:22px;font-weight:700;color:var(--deep-brown)">${val}</div>
          <div style="font-size:11px;color:var(--text-light);margin-top:2px">${lbl}</div>
        </div>`).join('')}
    </div>`;
}

function scrollToChapter(i) {
  const el = document.getElementById('chapter-' + i);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// == Digital PDF Download ============================
function handleDigitalDownload() {
  if (!isPremium) {
    openModal('modal-upgrade');
    return;
  }
  generatePDF(false);
}

// == Print Order =====================================

// == PDF Generation ==================================
async function generatePDF(forPrint = false) {
  // Load jsPDF from CDN
  openModal('modal-pdf-progress');
  const steps = ['pstep-1','pstep-2','pstep-3','pstep-4','pstep-5'];

  async function step(i, label) {
    document.getElementById('pdf-progress-label').textContent = label;
    steps.forEach((s,j) => {
      const el = document.getElementById(s);
      if (!el) return;
      el.className = 'pdf-step ' + (j < i ? 'done' : j === i ? 'active' : '');
    });
    await new Promise(r => setTimeout(r, 600));
  }

  try {
    await step(0, 'Gathering your logs...');

    // Load jsPDF dynamically
    if (!window.jspdf) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    await step(1, 'Collecting milestones...');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, H = 297;
    const dob = profile?.dob ? new Date(profile.dob) : null;
    const ageMonths = dob ? Math.floor((Date.now() - dob) / (30.44 * 86400000)) : 0;

    // == Cover Page ==
    doc.setFillColor(196, 121, 90);
    doc.rect(0, 0, W, H, 'F');
    // Gradient overlay (approximate with multiple rects)
    for (let i = 0; i < 20; i++) {
      doc.setFillColor(212, 165, 160, 0.05 * i);
      doc.rect(0, H * (i/20), W, H/20, 'F');
    }
    // Dots pattern
    doc.setFillColor(255,255,255);
    for (let x = 10; x < W; x += 20) {
      for (let y = 10; y < H; y += 20) {
        doc.setFillColor(255,255,255);
        doc.setGState(new doc.GState({ opacity: 0.06 }));
        doc.circle(x, y, 1, 'F');
      }
    }
    doc.setGState(new doc.GState({ opacity: 1 }));

    // Baby emoji (as text)
    doc.setFontSize(64);
    doc.setTextColor(255,255,255);
    doc.text(profile?.emoji || '🌙', W/2, 80, { align: 'center' });

    doc.setFontSize(32);
    doc.setFont('helvetica','bold');
    doc.text((profile?.baby || 'Baby') + "'s Baby Book", W/2, 120, { align: 'center' });

    doc.setFontSize(14);
    doc.setFont('helvetica','normal');
    doc.text(dob ? 'Born ' + formatDate(dob.toISOString().split('T')[0]) : '', W/2, 136, { align: 'center' });

    // Stats bar
    doc.setFillColor(255,255,255);
    doc.setGState(new doc.GState({ opacity: 0.15 }));
    doc.roundedRect(20, H - 80, W - 40, 50, 8, 8, 'F');
    doc.setGState(new doc.GState({ opacity: 1 }));
    doc.setFontSize(22);
    doc.setFont('helvetica','bold');
    const statsArr = [
      [logs.length.toString(), 'moments'],
      [logs.filter(l=>l.type==='milestone').length.toString(), 'milestones'],
      [(ageMonths).toString(), 'months']
    ];
    const colW = (W - 40) / 3;
    statsArr.forEach((s, i) => {
      const cx = 20 + colW * i + colW / 2;
      doc.text(s[0], cx, H - 58, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica','normal');
      doc.text(s[1], cx, H - 50, { align: 'center' });
      doc.setFontSize(22);
      doc.setFont('helvetica','bold');
    });

    doc.setFontSize(10);
    doc.setFont('helvetica','normal');
    doc.text('Made with Lumaby Baby Tracker', W/2, H - 8, { align: 'center' });

    await step(2, 'Building month chapters...');

    // == Month Pages ==
    const months = buildMonthChapters(dob, ageMonths);
    const chapterColors = [
      [196,121,90],[140,169,181],[122,158,126],[184,165,200],
      [212,168,83],[212,165,160],[107,143,163],[158,122,122]
    ];

    for (let mi = 0; mi < months.length; mi++) {
      const m = months[mi];
      const col = chapterColors[mi % chapterColors.length];

      doc.addPage();

      // Header band
      doc.setFillColor(col[0], col[1], col[2]);
      doc.rect(0, 0, W, 50, 'F');

      // Month number circle
      doc.setFillColor(255,255,255);
      doc.setGState(new doc.GState({ opacity: 0.2 }));
      doc.circle(30, 25, 18, 'F');
      doc.setGState(new doc.GState({ opacity: 1 }));
      doc.setFontSize(20);
      doc.setFont('helvetica','bold');
      doc.setTextColor(255,255,255);
      doc.text(m.monthNum.toString(), 30, 29, { align: 'center' });

      // Month title
      doc.setFontSize(22);
      doc.text((profile?.baby || 'Baby') + ' at ' + m.monthNum + ' month' + (m.monthNum > 1 ? 's' : ''), 55, 22);
      doc.setFontSize(12);
      doc.setFont('helvetica','normal');
      doc.text(m.label, 55, 33);

      // Stats row
      doc.setFillColor(248,245,240);
      doc.rect(0, 50, W, 22, 'F');
      doc.setTextColor(74,55,40);
      doc.setFontSize(11);
      const statsRow = [
        m.totalSleepH ? m.totalSleepH + 'h sleep' : null,
        m.feeds ? m.feeds + ' feeds' : null,
        m.diapers ? m.diapers + ' diapers' : null,
        m.latestGrowth?.weight ? m.latestGrowth.weight + ' lbs' : null,
      ].filter(Boolean);

      let sx = 15;
      statsRow.forEach(stat => {
        doc.setFillColor(col[0], col[1], col[2]);
        doc.setGState(new doc.GState({ opacity: 0.15 }));
        const sw = doc.getTextWidth(stat) + 10;
        doc.roundedRect(sx - 5, 53, sw, 12, 3, 3, 'F');
        doc.setGState(new doc.GState({ opacity: 1 }));
        doc.setTextColor(74,55,40);
        doc.text(stat, sx, 61);
        sx += sw + 6;
      });

      // Milestones
      let y = 86;
      doc.setTextColor(74,55,40);
      if (m.milestones.length > 0) {
        doc.setFontSize(13);
        doc.setFont('helvetica','bold');
        doc.text('Milestones', 15, y);
        y += 10;

        m.milestones.forEach(ms => {
          if (y > H - 30) { doc.addPage(); y = 20; }
          doc.setFillColor(255,255,255);
          doc.setDrawColor(col[0], col[1], col[2]);
          doc.setLineWidth(0.5);
          doc.roundedRect(15, y - 6, W - 30, 22, 4, 4, 'FD');

          doc.setFontSize(16);
          doc.text(ms.icon || '⭐', 22, y + 9);
          doc.setFontSize(12);
          doc.setFont('helvetica','bold');
          doc.setTextColor(61,43,31);
          doc.text(ms.title, 35, y + 5);
          doc.setFont('helvetica','normal');
          doc.setFontSize(10);
          doc.setTextColor(138,112,96);
          doc.text(formatDate(ms.time.split('T')[0]), 35, y + 12);
          if (ms.detail) {
            const detail = ms.detail.length > 60 ? ms.detail.slice(0,60) + '...' : ms.detail;
            doc.text('"' + detail + '"', 55, y + 12);
          }
          y += 28;
        });
      } else {
        doc.setFontSize(12);
        doc.setFont('helvetica','italic');
        doc.setTextColor(138,112,96);
        doc.text(m.totalLogs > 0
          ? m.totalLogs + ' moments logged this month'
          : 'Nothing logged this month yet', 15, y);
      }

      // Page footer
      doc.setFontSize(9);
      doc.setTextColor(196,121,90);
      doc.text('Page ' + (mi + 2) + ' · Lumaby Baby Tracker', W - 15, H - 8, { align: 'right' });
    }

    await step(3, 'Designing final pages...');

    // == Stats Summary Page ==
    doc.addPage();
    doc.setFillColor(61,43,31);
    doc.rect(0, 0, W, 40, 'F');
    doc.setFontSize(24);
    doc.setFont('helvetica','bold');
    doc.setTextColor(255,255,255);
    doc.text('The Full Picture', W/2, 26, { align: 'center' });

    const allStats = [
      ['🍼', logs.filter(l=>l.type==='feed').length, 'Total feeds'],
      ['🌿', logs.filter(l=>l.type==='diaper').length, 'Total diapers'],
      ['😴', Math.round(logs.filter(l=>l.type==='sleep').reduce((s,l)=>s+(l.durationMin||0),0)/60) + 'h', 'Total sleep'],
      ['⭐', logs.filter(l=>l.type==='milestone').length, 'Milestones'],
      ['📅', dob ? Math.floor((Date.now()-dob)/86400000) : 0, 'Days of life'],
      ['💕', logs.length, 'Total entries'],
    ];

    doc.setTextColor(61,43,31);
    let sy = 60;
    for (let si = 0; si < allStats.length; si += 2) {
      const [icon1, val1, lbl1] = allStats[si];
      const [icon2, val2, lbl2] = allStats[si + 1] || ['','',''];
      [[icon1,val1,lbl1,15],[icon2,val2,lbl2,W/2+5]].forEach(([ic,vl,lb,x]) => {
        if (!lb) return;
        doc.setFillColor(248,245,240);
        doc.roundedRect(x, sy - 8, 85, 28, 6, 6, 'F');
        doc.setFontSize(18); doc.text(ic, x + 10, sy + 8);
        doc.setFontSize(18); doc.setFont('helvetica','bold'); doc.setTextColor(61,43,31);
        doc.text(vl.toString(), x + 26, sy + 8);
        doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(138,112,96);
        doc.text(lb, x + 26, sy + 16);
      });
      sy += 36;
    }

    // Growth table
    if (growthLogs.length > 0) {
      sy += 10;
      doc.setFontSize(14); doc.setFont('helvetica','bold'); doc.setTextColor(61,43,31);
      doc.text('Growth History', 15, sy);
      sy += 10;
      doc.setFontSize(10); doc.setFont('helvetica','normal');
      const gh = ['Date','Weight (lbs)','Height (in)','Head (cm)'];
      const colWidths = [50,40,40,40];
      let gx = 15;
      doc.setFillColor(61,43,31);
      gh.forEach((h,i) => {
        doc.setFillColor(61,43,31);
        doc.rect(gx, sy-5, colWidths[i], 8, 'F');
        doc.setTextColor(255,255,255);
        doc.text(h, gx+2, sy+1);
        gx += colWidths[i];
      });
      sy += 10;
      growthLogs.slice(-6).forEach((g,ri) => {
        gx = 15;
        if (ri % 2 === 0) { doc.setFillColor(248,245,240); doc.rect(15, sy-5, W-30, 8, 'F'); }
        doc.setTextColor(61,43,31);
        [formatDate(g.date), g.weight||'-', g.heightIn||'-', g.head||'-'].forEach((v,i) => {
          doc.text(v.toString(), gx+2, sy+1);
          gx += colWidths[i];
        });
        sy += 10;
      });
    }

    // Back cover
    doc.addPage();
    doc.setFillColor(253,246,238);
    doc.rect(0,0,W,H,'F');
    await addBrandMark(doc, 'brand/logo-mark.png', W/2 - 18, H/2 - 52, 36);
    doc.setFontSize(20); doc.setFont('helvetica','bold'); doc.setTextColor(196,121,90);
    doc.text('Made with love', W/2, H/2 + 10, { align:'center' });
    doc.setFontSize(12); doc.setFont('helvetica','normal'); doc.setTextColor(138,112,96);
    doc.text('Tracked with Lumaby Baby Tracker', W/2, H/2 + 24, { align:'center' });
    doc.text('lumabyy.netlify.app', W/2, H/2 + 36, { align:'center' });

    await step(4, 'Generating your PDF...');

    const filename = (profile?.baby || 'baby').toLowerCase().replace(/\s+/g,'-') + '-baby-book.pdf';
    doc.save(filename);

    closeModal('modal-pdf-progress');
    showToast('📖 Baby book downloaded!');

  } catch(e) {
    console.error('[Lumaby] PDF error:', e);
    closeModal('modal-pdf-progress');
    showToast('Could not generate PDF — please try again');
  }
}

// == Patch switchScreen to render book ==============
const _origSwitchScreen = switchScreen;
switchScreen = function(name, btn) {
  // Baby book tab is premium only
  if (name === 'book' && !isPremium) {
    openModal('modal-upgrade');
    return;
  }
  _origSwitchScreen(name, btn);
  if (name === 'book') renderBook();
};

// Check for print return
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('print') === 'success') {
    showToast('📬 Print order placed! Ships in 5-7 days');
    window.history.replaceState({}, '', window.location.pathname);
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('[Lumaby] Service worker registered:', reg.scope);
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('\uD83D\uDD04 Update available — refresh to get the latest');
            }
          });
        });
      })
      .catch(err => console.warn('[Lumaby] SW registration failed:', err));
  });
}

// =======================================
