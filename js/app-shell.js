// Lumaby — Profile, navigation, popups, toasts, quick log, helpers.
// One part of the app script, loaded in order by index.html. All parts share one
// global scope; run `node tools/check-split.js` after moving code between files.
//  PROFILE MODAL
// =======================================
function showProfileModal() {
  document.getElementById('profile-form-body').innerHTML = `
    <div class="form-group"><label>Parent name</label><input class="form-input" id="pf-parent" value="${profile.parent||''}"/></div>
    <div class="form-group"><label>Baby's name</label><input class="form-input" id="pf-baby" value="${profile.baby||''}"/></div>
    <div class="form-group"><label>Birthday</label><input class="form-input" id="pf-dob" type="date" value="${profile.dob||''}"/></div>
    <div class="form-group"><label>Baby emoji</label>
      <select class="form-input" id="pf-emoji">
        ${['🌙','⭐','🌸','🌿','🦋','🐣','🌻','🐻'].map(e=>`<option ${profile.emoji===e?'selected':''}>${e}</option>`).join('')}
      </select>
    </div>
    <button class="btn-primary btn-full" onclick="saveProfile2()">Save profile</button>
    <button class="btn-sec btn-full" style="margin-top:8px" onclick="if(confirm('Reset all data? This cannot be undone.'))resetAll()">Reset all data</button>`;
  openModal('modal-profile');
}

function saveProfile2() {
  const newDob = document.getElementById('pf-dob')?.value;
  if (newDob && new Date(newDob) > new Date()) {
    showToast("⚠️ Baby's birthday can't be in the future!");
    return;
  }
  profile.parent = document.getElementById('pf-parent').value.trim() || profile.parent;
  profile.baby = document.getElementById('pf-baby').value.trim() || profile.baby;
  profile.dob = document.getElementById('pf-dob').value || profile.dob;
  profile.emoji = document.getElementById('pf-emoji').value;
  saveProfile();
  closeModal('modal-profile');
  updateHeader();
  showToast('✅ Profile saved');
}

function resetAll() {
  localStorage.clear();
  location.reload();
}

// =======================================
//  NAV & SCREENS
// =======================================
function switchScreen(name, btn) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'insights') renderInsights();
  if (name === 'schedule') renderSchedule();
  if (name === 'growth') renderGrowth();
}

// =======================================
//  MODAL HELPERS
// =======================================
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function closeModalOnBg(e, id) { if (e.target === document.getElementById(id)) closeModal(id); }

// =======================================
//  TOAST
// =======================================
let toastTimer;
// Toast with an Undo button (5 seconds).
function showUndoToast(msg, onUndo) {
  clearTimeout(toastTimer);
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast toast-undo';
  t.setAttribute('role', 'status');
  const label = document.createElement('span'); label.textContent = msg;
  const btn = document.createElement('button'); btn.textContent = 'Undo';
  btn.onclick = () => { clearTimeout(toastTimer); t.remove(); onUndo(); };
  t.append(label, btn);
  document.body.appendChild(t);
  toastTimer = setTimeout(() => {
    t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(-8px)';
    setTimeout(() => t.remove(), 300);
  }, 5000);
}

// ── One-tap logging ──
const FEED_LABELS = { formula: 'Formula', breastmilk: 'Breast milk', 'breast-left': 'Breast · Left', 'breast-right': 'Breast · Right', 'breast-both': 'Breast · Both', solids: 'Solids' };
const DIAPER_QUICK = { wet: ['💧', 'Wet'], dirty: ['🟤', 'Dirty'], both: ['💧🟤', 'Both'] };

// Nursing feeds are breast-left/right/both; 'breastmilk' is a bottle.
function isNursingFeed(f) { return !!f && /^breast-/.test(f.feedType || ''); }
function lastFeed() { return logs.find(l => l.type === 'feed' && l.feedType); }

// Log an entry right now, without a form, with Undo.
function quickLog(entry, msg) {
  entry = { id: uid(), time: new Date().toISOString(), ...entry };
  if (!entry.babyId) entry.babyId = currentBabyId();
  allLogs.unshift(entry);
  refreshBabyView();
  saveLogs();
  renderTimeline(); renderStats(); renderMilestoneBanner();
  showUndoToast(msg, () => { deleteLog(entry.id); showToast('Removed'); });
  return entry;
}

function quickDiaper(kind) {
  const [icon, label] = DIAPER_QUICK[kind] || DIAPER_QUICK.wet;
  quickLog({ type: 'diaper', icon: '🌿', title: 'Diaper change', detail: kind, diaperType: kind }, `🌿 ${label} diaper logged`);
}

// Breast feeds: start a timer on the other side from last time.
// Bottle/formula/solids: log the same as last time.
function quickFeed() {
  const last = lastFeed();
  if (activeTimers.feed) { stopTimer('feed'); renderQuickLog(); return; }
  if (!last || isNursingFeed(last)) {
    nurseTap(suggestedSide());
    showToast(`🤱 ${suggestedSideLabel()} side started`);
    renderQuickLog();
    return;
  }
  const detail = bottleDetail(last.feedType, last.oz || 0, last.unit || 'oz');
  quickLog({ type: 'feed', icon: '🍼', title: 'Bottle', detail, feedType: last.feedType, oz: last.oz || 0, unit: last.unit || 'oz', durationMin: 0 },
    `🍼 ${detail}`);
}

function suggestedSideLabel() {
  const n = nursingSession()?.extra.nursing;
  const s = n?.running || suggestedSide();
  return s === 'left' ? 'Left' : 'Right';
}

function quickSleep() {
  if (activeTimers.sleep) stopTimer('sleep'); else startTimer('sleep', '😴', 'Sleep');
  renderQuickLog();
}

function renderQuickLog() {
  const el = document.getElementById('quickLog');
  if (!el) return;
  const last = lastFeed();
  const sleeping = !!activeTimers.sleep, feeding = !!activeTimers.feed;
  let feedBtn;
  if (feeding) {
    feedBtn = `<button class="ql-btn running" onclick="quickFeed()"><span class="ql-icon">🤱</span><span>Save nursing<span class="ql-sub">${activeTimers.feed.label || 'Timer running'}</span></span></button>`;
  } else if (!last || isNursingFeed(last)) {
    const side = suggestedSide() === 'left' ? 'Left' : 'Right';
    const prev = lastFeedSide(last);
    feedBtn = `<button class="ql-btn" onclick="quickFeed()"><span class="ql-icon">🤱</span><span>Start ${side} side<span class="ql-sub">${prev ? 'Last ended on ' + (prev === 'left' ? 'Left' : 'Right') : 'Nursing timer'}</span></span></button>`;
  } else {
    const d = bottleDetail(last.feedType, last.oz || 0, last.unit || 'oz').replace('Bottle · ', '');
    feedBtn = `<button class="ql-btn" onclick="quickFeed()"><span class="ql-icon">🍼</span><span>Repeat feed<span class="ql-sub">${d}</span></span></button>`;
  }
  el.innerHTML = `
    <button class="ql-btn ${sleeping ? 'running' : ''}" onclick="quickSleep()"><span class="ql-icon">😴</span>
      <span>${sleeping ? 'Stop sleep' : 'Start sleep'}<span class="ql-sub">${sleeping ? 'Timer running' : 'One tap'}</span></span></button>
    ${feedBtn}
    ${Object.entries(DIAPER_QUICK).map(([k, [icon, label]]) =>
      `<button class="ql-btn" onclick="quickDiaper('${k}')"><span class="ql-icon">${icon}</span><span>${label}<span class="ql-sub">Diaper</span></span></button>`).join('')}`;
}

// Home-screen shortcuts: /?quick=feed | diaper-wet | diaper-dirty | sleep
let pendingQuickAction = (() => {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('quick');
  if (!q) return null;
  params.delete('quick');
  const rest = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (rest ? '?' + rest : ''));
  return q;
})();
function runPendingQuickAction() {
  const q = pendingQuickAction; pendingQuickAction = null;
  if (!q || !profile) return;
  if (q === 'feed') quickFeed();
  else if (q === 'sleep') { if (!activeTimers.sleep) quickSleep(); }
  else if (q.startsWith('diaper-')) quickDiaper(q.slice(7));
}

function showToast(msg) {
  clearTimeout(toastTimer);
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  toastTimer = setTimeout(() => {
    t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(-8px)';
    setTimeout(() => t.remove(), 300);
  }, 1800);
}

// =======================================
//  UTILS
// =======================================
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function fmtDuration(secs) {
  const h = Math.floor(secs/3600).toString().padStart(2,'0');
  const m = Math.floor((secs%3600)/60).toString().padStart(2,'0');
  const s = (secs%60).toString().padStart(2,'0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function fmtDur(mins) {
  if (mins < 60) return mins + 'min';
  const h = Math.floor(mins/60);
  const m = mins%60;
  return h + 'h' + (m > 0 ? ' ' + m + 'min' : '');
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return Math.floor(diff/86400) + 'd ago';
}

function timeUntil(date) {
  const diff = (new Date(date) - Date.now()) / 1000;
  if (diff < 0) return 'now';
  if (diff < 3600) return Math.floor(diff/60) + 'min';
  return (diff/3600).toFixed(1) + 'h';
}

function timeInputNow(offsetMins) {
  const d = new Date(Date.now() + offsetMins * 60000);
  return d.toTimeString().slice(0,5);
}

function timeInputToDate(str) {
  const [h,m] = str.split(':').map(Number);
  const d = new Date();
  d.setHours(h,m,0,0);
  return d;
}

function formatDate(str) {
  return new Date(str).toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' });
}


// =======================================
