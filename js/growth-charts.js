// Lumaby — WHO growth percentiles.
// One part of the app script, loaded in order by index.html. All parts share one
// global scope; run `node tools/check-split.js` after moving code between files.
//  WHO GROWTH PERCENTILES
// =====================================================
// WHO weight-for-age reference data (boys, simplified key percentiles)
// Source: WHO Child Growth Standards
const WHO_WEIGHT = {
  // [age_months]: { p3, p15, p50, p85, p97 }
  0:  [2.5, 2.9, 3.3, 3.9, 4.3],
  1:  [3.4, 3.9, 4.5, 5.1, 5.7],
  2:  [4.4, 4.9, 5.6, 6.3, 7.0],
  3:  [5.1, 5.7, 6.4, 7.2, 7.9],
  4:  [5.6, 6.2, 7.0, 7.9, 8.7],
  5:  [6.1, 6.7, 7.5, 8.4, 9.3],
  6:  [6.4, 7.1, 7.9, 8.9, 9.7],
  7:  [6.7, 7.4, 8.3, 9.3, 10.2],
  8:  [6.9, 7.7, 8.6, 9.6, 10.5],
  9:  [7.1, 7.9, 8.9, 9.9, 10.8],
  10: [7.4, 8.2, 9.2, 10.2, 11.2],
  11: [7.6, 8.4, 9.4, 10.5, 11.5],
  12: [7.7, 8.6, 9.6, 10.8, 11.8],
};

function kgToLbs(kg) { return kg * 2.20462; }
function lbsToKg(lbs) { return lbs / 2.20462; }

function getPercentile(weightLbs, ageMonths) {
  const m = Math.min(Math.floor(ageMonths), 12);
  const ref = WHO_WEIGHT[m];
  if (!ref) return null;
  const kg = lbsToKg(weightLbs);
  const [p3, p15, p50, p85, p97] = ref;
  if (kg < p3) return { pct: '<3rd', label: 'Below average', class: 'pct-low', tier: 3 };
  if (kg < p15) return { pct: '3rd–15th', label: 'Low average', class: 'pct-low', tier: 15 };
  if (kg < p50) return { pct: '15th–50th', label: 'Average', class: 'pct-mid', tier: 50 };
  if (kg < p85) return { pct: '50th–85th', label: 'Above average', class: 'pct-mid', tier: 85 };
  if (kg < p97) return { pct: '85th–97th', label: 'High average', class: 'pct-high', tier: 97 };
  return { pct: '>97th', label: 'Above range', class: 'pct-high', tier: 99 };
}

function renderPercentileChart(canvasId, ageMonths) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 300;
  const H = 160;
  canvas.width = W * (window.devicePixelRatio || 1);
  canvas.height = H * (window.devicePixelRatio || 1);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

  const maxAge = Math.min(Math.ceil(ageMonths) + 1, 12);
  const ages = Object.keys(WHO_WEIGHT).map(Number).filter(a => a <= maxAge);
  const pad = { l: 30, r: 10, t: 10, b: 20 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;

  // Y range: 2kg to 14kg
  const minY = 2, maxY = 14;
  const toX = a => pad.l + (a / maxAge) * cw;
  const toY = kg => pad.t + ch - ((kg - minY) / (maxY - minY)) * ch;

  // Draw percentile bands
  const bandColors = [
    [230, 244, 234, 0.7],  // p3-p15 green
    [219, 234, 254, 0.7],  // p15-p85 blue
    [254, 243, 199, 0.7],  // p85-p97 yellow
  ];
  const bands = [[0,1],[1,3],[3,4]]; // indices into [p3,p15,p50,p85,p97]

  bands.forEach(([lo, hi], bi) => {
    const [r,g,b,a] = bandColors[bi];
    ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
    ctx.beginPath();
    ages.forEach((age, i) => {
      const x = toX(age);
      const y = toY(WHO_WEIGHT[age][lo]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    [...ages].reverse().forEach(age => ctx.lineTo(toX(age), toY(WHO_WEIGHT[age][hi])));
    ctx.closePath(); ctx.fill();
  });

  // Draw median line
  ctx.beginPath();
  ages.forEach((age, i) => {
    const x = toX(age), y = toY(WHO_WEIGHT[age][2]);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(140,169,181,0.6)'; ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);

  // Plot baby's weight
  if (growthLogs.length > 0 && profile?.dob) {
    const dob = new Date(profile.dob);
    ctx.beginPath();
    let first = true;
    growthLogs.filter(g => g.weight).forEach(g => {
      const ageM = (new Date(g.date) - dob) / (30.44 * 86400000);
      if (ageM < 0 || ageM > maxAge) return;
      const x = toX(ageM), y = toY(lbsToKg(g.weight));
      first ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      first = false;
    });
    ctx.strokeStyle = '#c4795a'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();

    growthLogs.filter(g => g.weight).forEach(g => {
      const ageM = (new Date(g.date) - dob) / (30.44 * 86400000);
      if (ageM < 0 || ageM > maxAge) return;
      const x = toX(ageM), y = toY(lbsToKg(g.weight));
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#c4795a'; ctx.fill();
      ctx.fillStyle = '#3d2b1f'; ctx.font = '9px DM Sans';
      ctx.textAlign = 'center'; ctx.fillText(g.weight, x, y - 7);
    });
  }

  // X axis labels
  ctx.setLineDash([]); ctx.fillStyle = '#8a7060'; ctx.font = '9px DM Sans';
  ctx.textAlign = 'center';
  for (let a = 0; a <= maxAge; a += 2) {
    ctx.fillText(a + 'm', toX(a), H - 4);
  }
}

// =====================================================
