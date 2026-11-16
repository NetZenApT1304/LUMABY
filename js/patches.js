// Lumaby — Screen add-ons (schedule cards, growth extras, start-up, plans).
// One part of the app script, loaded in order by index.html. All parts share one
// global scope; run `node tools/check-split.js` after moving code between files.
//  PATCH: update schedule screen to include partner/reminders/coach
// =====================================================
const _origRenderSchedule = renderSchedule;
renderSchedule = function() {
  _origRenderSchedule();
  const el = document.getElementById('scheduleContent');
  if (!el) return;

  // Append partner + reminders + sleep coach cards
  const extra = document.createElement('div');
  extra.innerHTML = `
    <div class="partner-section">
      <div class="pedi-report-card" onclick="showPartnerModal()">
        <div class="pedi-header">
          <div class="pedi-icon">👥</div>
          <div>
            <div class="pedi-title">Partner Sharing</div>
            <div class="pedi-sub">${babies[activeBabyIndex] && !isMine(babies[activeBabyIndex]) ? 'Shared with you · Live' : 'Share with your partner, live'}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="pedi-report-card" onclick="showRemindersModal()">
      <div class="pedi-header">
        <div class="pedi-icon">🔔</div>
        <div>
          <div class="pedi-title">Smart Reminders</div>
          <div class="pedi-sub">Feed, nap & medicine alerts · ${isPremium ? 'Tap to configure' : 'Premium feature'}</div>
        </div>
      </div>
      <div class="pedi-includes">
        <span class="pedi-tag">Feed timer</span>
        <span class="pedi-tag">Nap window</span>
        <span class="pedi-tag">Medicine</span>
        <span class="pedi-tag">Growth check</span>
      </div>
    </div>`;
  el.appendChild(extra);
};

// =====================================================
//  PATCH: update growth screen to include percentiles + pedi report
// =====================================================
const _origRenderGrowth2 = renderGrowth;
renderGrowth = function() {
  _origRenderGrowth2();
  const el = document.getElementById('growthContent');
  if (!el) return;

  const dob = profile?.dob ? new Date(profile.dob) : null;
  const ageMonths = dob ? Math.floor((Date.now() - dob) / (30.44 * 86400000)) : 0;
  const lastGrowth = growthLogs[growthLogs.length-1];
  const pct = lastGrowth?.weight ? getPercentile(lastGrowth.weight, ageMonths) : null;

  // Insert percentile card before first child
  const pctCard = document.createElement('div');
  pctCard.className = 'growth-card';
  pctCard.innerHTML = `
    <div class="ic-title">📊 WHO Weight Percentile</div>
    ${!isPremium ? `
      <div style="position:relative;overflow:hidden;border-radius:12px">
        <div style="filter:blur(4px);pointer-events:none">
          <canvas id="pct-canvas" style="width:100%;height:160px"></canvas>
        </div>
        <div class="chapter-locked-overlay" style="border-radius:12px">
          <div class="clo-lock">📈</div>
          <div class="clo-title">WHO Percentile Charts</div>
          <div class="clo-sub">See how your baby compares to WHO growth standards</div>
          <button class="clo-price" onclick="openModal('modal-upgrade')">Unlock Premium</button>
        </div>
      </div>` : `
      <canvas id="pct-canvas" style="width:100%;height:160px"></canvas>
      <div class="pct-legend">
        <div class="pct-legend-item"><div class="pct-dot" style="background:rgba(122,158,126,0.5)"></div>85th–97th</div>
        <div class="pct-legend-item"><div class="pct-dot" style="background:rgba(140,169,181,0.5)"></div>15th–85th</div>
        <div class="pct-legend-item"><div class="pct-dot" style="background:rgba(212,168,83,0.5)"></div>3rd–15th</div>
        <div class="pct-legend-item"><div class="pct-dot" style="background:#c4795a"></div>${profile?.baby||'Baby'}</div>
      </div>
      ${pct ? `<div class="percentile-badge ${pct.class}">
        ${lastGrowth.weight} lbs · ${pct.pct} percentile · ${pct.label}
      </div>` : ''}`}
  `;
  el.insertBefore(pctCard, el.firstChild);

  if (isPremium) {
    setTimeout(() => renderPercentileChart('pct-canvas', ageMonths), 80);
  }

  // Add pedi report + sleep coach cards at bottom
  const actions = document.createElement('div');
  actions.innerHTML = `
    <div class="pedi-report-card" onclick="showPediReport()">
      <div class="pedi-header">
        <div class="pedi-icon">🩺</div>
        <div>
          <div class="pedi-title">Pediatrician Report</div>
          <div class="pedi-sub">Full PDF summary for your next visit</div>
        </div>
      </div>
      <div class="pedi-includes">
        <span class="pedi-tag">Growth chart</span>
        <span class="pedi-tag">Milestones</span>
        <span class="pedi-tag">Feed history</span>
        <span class="pedi-tag">Sleep data</span>
      </div>
    </div>
    <div class="pedi-report-card" onclick="showSleepCoach()">
      <div class="pedi-header">
        <div class="pedi-icon">🌙</div>
        <div>
          <div class="pedi-title">Sleep Coach</div>
          <div class="pedi-sub">Personalized tips from your data · ${isPremium ? 'Tap to view' : 'Premium'}</div>
        </div>
      </div>
    </div>`;
  el.appendChild(actions);
};

// =====================================================
//  PATCH: startApp to init babies + switcher
// =====================================================
const _origStartApp2 = startApp;
startApp = function() {
  initBabies();
  if (babies.length === 0 && profile) {
    babies = [{ ...profile, id: uid() }];
    saveBabies();
  }
  _origStartApp2();
  renderBabySwitcher();
  scheduleAllReminders();
};

// =====================================================
//  PATCH: selectPlan to handle lifetime
// =====================================================
const _origSelectPlan = selectPlan;
selectPlan = function(plan) {
  selectedPlan = plan;
  ['monthly','yearly','lifetime'].forEach(p => {
    const el = document.getElementById('plan-' + p);
    if (el) el.classList.toggle('selected', p === plan);
  });
  const btn = document.getElementById('upgrade-btn');
  if (!btn) return;
  if (plan === 'yearly') btn.textContent = 'Start 7-day free trial · $35.99/yr';
  else if (plan === 'lifetime') btn.textContent = 'Get Lifetime Access · $79 once';
  else btn.textContent = 'Start 7-day free trial';
};

// Handle lifetime checkout differently (one-time payment, not subscription)
const _origStartCheckout = startCheckout;
startCheckout = async function() {
  if (selectedPlan === 'lifetime') {
    if (!currentUser) {
      closeModal('modal-upgrade');
      document.getElementById('auth-screen').classList.add('visible');
      showToast('Please sign in first');
      return;
    }
    const btn = document.getElementById('upgrade-btn');
    btn.innerHTML = '<span class="spinner"></span> Opening checkout...';
    btn.disabled = true;
    try {
      const res = await fetch('/.netlify/functions/create-lifetime-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id, email: currentUser.email,
          successUrl: window.location.origin + '?upgraded=true',
          cancelUrl: window.location.origin + '?upgraded=false'
        })
      });
      if (!res.ok) throw new Error('Could not create checkout');
      const { url } = await res.json();
      window.location.href = url;
    } catch(e) {
      btn.innerHTML = 'Get Lifetime Access · $79 once';
      btn.disabled = false;
      showToast('Checkout not configured yet');
    }
    return;
  }
  await _origStartCheckout();
};

// =====================================================
