// Lumaby — App state, storage, start-up, header, home screen.
// One part of the app script, loaded in order by index.html. All parts share one
// global scope; run `node tools/check-split.js` after moving code between files.
// =======================================
//  STATE & PERSISTENCE
// =======================================
const STORE = {
  get(k) { try { return JSON.parse(localStorage.getItem('bloom_'+k)); } catch(e) { return null; } },
  set(k,v) { localStorage.setItem('bloom_'+k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem('bloom_'+k); }
};

let profile = STORE.get('profile') || null;
// allLogs / allGrowth hold every baby's entries (what is stored and synced).
// logs / growthLogs are the active baby's entries, which the screens read.
// Change entries through allLogs/allGrowth, then call refreshBabyView().
let allLogs = STORE.get('logs') || [];
let allGrowth = STORE.get('growthLogs') || [];
let logs = allLogs;
let growthLogs = allGrowth;
let activeTimers = STORE.get('activeTimers') || {};

function saveLogs() { STORE.set('logs', allLogs); }
function saveGrowth() { STORE.set('growthLogs', allGrowth); }
function saveTimers() { STORE.set('activeTimers', activeTimers); }
function saveProfile() { STORE.set('profile', profile); }

// =======================================
//  INIT
// =======================================
window.addEventListener('DOMContentLoaded', () => {
  if (profile) {
    document.getElementById('onboarding').classList.add('hidden');
    startApp();
  } else {
    // Set default DOB to ~4 months ago
    const dob = new Date();
    dob.setMonth(dob.getMonth() - 4);
    document.getElementById('ob-dob').value = dob.toISOString().split('T')[0];
  }
});

function completeOnboarding() {
  const parent = document.getElementById('ob-parent').value.trim() || 'Parent';
  const baby   = document.getElementById('ob-baby').value.trim()   || 'Baby';
  const dob    = document.getElementById('ob-dob').value           || new Date(Date.now() - 120*24*3600000).toISOString().split('T')[0];
  const emoji  = document.getElementById('ob-emoji').value         || '🌙';

  // Validate birthday not in future
  if (dob && new Date(dob) > new Date()) {
    showToast("⚠️ Baby's birthday can't be in the future!");
    return;
  }

  profile = { parent, baby, dob, emoji };
  saveProfile();
  seedData();
  launchApp();
}

function launchApp() {
  ensureBabyView();
  // Hide every possible overlay
  ['auth-screen','onboarding'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.cssText = 'display:none!important';
    el.classList.add('hidden');
    el.classList.remove('visible');
  });
  // Show main app
  const app = document.getElementById('mainApp');
  app.style.cssText = 'display:flex!important';
  const fab = document.getElementById('fab');
  if (fab) fab.style.cssText = 'display:flex!important';
  buildDayStrip();
  updateHeader();
  renderHome();
  startTimerTick();
  setInterval(updateHeader, 60000);
  initBabies();
  renderBabySwitcher();
  scheduleAllReminders();
  if (pendingQuickAction) setTimeout(runPendingQuickAction, 300);
}

function seedData() {
  // App starts clean - no sample data
}

function startApp() {
  launchApp();
}

// =======================================
//  HEADER & AGE
// =======================================
function getAge() {
  if (!profile?.dob) return '';
  const dob = new Date(profile.dob);
  const now = new Date();
  const days = Math.floor((now - dob) / 86400000);
  if (days < 7) return `${days} days old`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} weeks old`;
  const months = Math.floor(days / 30.44);
  const remWeeks = Math.floor((days - months * 30.44) / 7);
  return `${months} months${remWeeks > 0 ? `, ${remWeeks} weeks` : ''} old`;
}

function updateHeader() {
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = profile?.parent || 'Mama';
  const emoji = hour < 12 ? '🌿' : hour < 17 ? '☀️' : '🌙';
  document.getElementById('greeting').innerHTML = `${greet}, <em>${name}</em> ${emoji}`;
  document.getElementById('age-line').textContent = `${profile?.baby || 'Baby'} is ${getAge()}`;
  const av = profile?.emoji || '🌙';
  ['avatar','avatar2','avatar3','avatar4'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = av;
  });
  const gl = document.getElementById('growth-age-line');
  if (gl) gl.textContent = `${profile?.baby || 'Baby'} · ${getAge()}`;
}

// =======================================
//  DAY STRIP
// =======================================
let selectedDate = new Date();
selectedDate.setHours(0,0,0,0);

function buildDayStrip() {
  const strip = document.getElementById('dayStrip');
  strip.innerHTML = '';
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  for (let i = -4; i <= 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(0,0,0,0);
    const chip = document.createElement('div');
    chip.className = 'day-chip' + (i === 0 ? ' active' : '');
    chip.dataset.date = d.toISOString();
    chip.innerHTML = `<span class="dn">${days[d.getDay()]}</span><span class="dd">${d.getDate()}</span>`;
    chip.addEventListener('click', () => {
      document.querySelectorAll('.day-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedDate = new Date(chip.dataset.date);
      renderTimeline();
      renderStats();
    });
    strip.appendChild(chip);
  }
}

// =======================================
//  HOME
// =======================================
function renderHome() {
  renderTimers();
  renderMilestoneBanner();
  renderStats();
  renderTimeline();
}

// == Timers ==
let timerInterval = null;
function startTimerTick() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (Object.keys(activeTimers).length > 0) renderTimers();
  }, 1000);
}

function renderTimers() {
  const bar = document.getElementById('timersBar');
  if (!bar) return;
  bar.innerHTML = '';
  const now = Date.now();
  for (const [id, timer] of Object.entries(activeTimers)) {
    const elapsed = Math.floor((now - timer.startMs) / 1000);
    const pill = document.createElement('div');
    pill.className = 'timer-pill';
    pill.innerHTML = `
      <span class="tp-icon">${timer.icon}</span>
      <div class="tp-info">
        <div class="tp-label">${timer.label} in progress</div>
        <div class="tp-elapsed">${fmtDuration(elapsed)}</div>
      </div>
      <button class="tp-stop" onclick="stopTimer('${id}')">Stop</button>`;
    bar.appendChild(pill);
  }
}

function startTimer(type, icon, label, extra) {
  const id = uid();
  activeTimers[type] = { id, type, icon, label, startMs: Date.now(), extra: extra || null };
  saveTimers();
  renderTimers();
  showToast(`${icon} ${label} started`);
}

function stopTimer(type) {
  const timer = activeTimers[type];
  if (!timer) return;
  if (timer.extra?.nursing) { finishNursing(); return; }
  const elapsed = Math.floor((Date.now() - timer.startMs) / 1000);
  const mins = Math.round(elapsed / 60);
  delete activeTimers[type];
  saveTimers();
  renderTimers();
  // auto-log it
  const entry = {
    id: uid(), type, icon: timer.icon,
    title: timer.label,
    detail: [timer.extra?.detailPrefix, fmtDuration(elapsed)].filter(Boolean).join(' · '),
    time: new Date(timer.startMs).toISOString(),
    durationMin: mins,
    babyId: currentBabyId(),
    ...(timer.extra?.fields || {})
  };
  allLogs.unshift(entry);
  refreshBabyView();
  saveLogs();
  renderTimeline();
  renderStats();
  showToast(`${timer.icon} ${timer.label} saved · ${fmtDuration(elapsed)}`);
}

// == Milestone banner ==
function renderMilestoneBanner() {
  const el = document.getElementById('milestoneBanner');
  const recent = logs.find(l => l.type === 'milestone');
  if (!recent) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="milestone-badge" onclick="openLogModal('milestone')"><span>⭐</span><span>${recent.title}</span></div>`;
}

// == Stats ==
function renderStats() {
  const dayLogs = getLogsForDate(selectedDate);
  const sleepLogs = dayLogs.filter(l => l.type === 'sleep');
  const feedLogs = dayLogs.filter(l => l.type === 'feed');
  const diaperLogs = dayLogs.filter(l => l.type === 'diaper');

  const totalSleepMin = sleepLogs.reduce((s,l) => s + (l.durationMin||0), 0);
  const lastGrowth = growthLogs[growthLogs.length - 1];

  const sleepH = (totalSleepMin/60).toFixed(1);
  const sleepPct = Math.min(totalSleepMin / (16*60), 1); // 16h max
  const offset = 220 - (220 * sleepPct);

  const wakeUps = sleepLogs.reduce((s,l) => s + (l.wakeUps||0), 0);
  const feedCount = feedLogs.length;
  const lastFeed = feedLogs[0];
  const lastFeedAgo = lastFeed ? timeAgo(lastFeed.time) : '—';
  const wet = diaperLogs.filter(l => l.diaperType === 'wet').length;
  const dirty = diaperLogs.filter(l => l.diaperType === 'dirty').length;

  const statsRow = document.getElementById('statsRow');
  statsRow.innerHTML = `
    <div class="stat-card ring-card" onclick="openLogModal('sleep')">
      <div class="week-ring">
        <svg class="ring-svg" width="88" height="88" viewBox="0 0 88 88">
          <circle class="ring-bg" cx="44" cy="44" r="35"/>
          <circle class="ring-prog" cx="44" cy="44" r="35" style="stroke-dashoffset:${offset}"/>
        </svg>
        <div class="ring-label">
          <span class="rv">${sleepH}h</span>
          <span class="rl">sleep</span>
        </div>
      </div>
      <div class="stat-label">Last 24h</div>
      <div class="stat-sub">${wakeUps > 0 ? wakeUps+' wake-up'+(wakeUps>1?'s':'') : 'No wake-ups'}</div>
    </div>
    <div class="stat-card" onclick="openLogModal('feed')">
      <div class="stat-icon si-feed">🍼</div>
      <div class="stat-value">${feedCount}</div>
      <div class="stat-label">Feeds today</div>
      <div class="stat-sub">Last: ${lastFeedAgo}</div>
    </div>
    <div class="stat-card" onclick="openLogModal('diaper')">
      <div class="stat-icon si-diaper">🌿</div>
      <div class="stat-value">${diaperLogs.length}</div>
      <div class="stat-label">Diapers today</div>
      <div class="stat-sub">${wet} wet · ${dirty} dirty</div>
    </div>
    <div class="stat-card" onclick="switchScreen('growth',document.querySelector('[data-screen=growth]'))">
      <div class="stat-icon si-growth">📏</div>
      <div class="stat-value">${lastGrowth ? lastGrowth.weight : '—'}</div>
      <div class="stat-label">Weight (lbs)</div>
      <div class="stat-sub">${growthLogs.length >= 2 ? '+' + (growthLogs[growthLogs.length-1].weight - growthLogs[growthLogs.length-2].weight).toFixed(1) + ' since last' : 'Add measurement'}</div>
    </div>`;
}

// == Timeline ==
function renderTimeline() {
  const tl = document.getElementById('timeline');
  const dayLogs = getLogsForDate(selectedDate);

  if (dayLogs.length === 0) {
    tl.innerHTML = `<div class="tl-empty"><span>🌱</span>Nothing logged yet.<br>Tap a button above to start!</div>`;
    return;
  }
  tl.innerHTML = '';
  dayLogs.forEach((ev, i) => {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.style.animationDelay = (i * 0.05) + 's';
    const dotClass = 'tl-' + (ev.type === 'milestone' ? 'milestone' : ev.type === 'feed' || ev.type === 'pump' ? 'feed' : ev.type === 'diaper' ? 'diaper' : ev.type === 'growth' ? 'growth' : ev.type === 'sleep' ? 'sleep' : 'other');
    item.innerHTML = `
      <div class="tl-dot ${dotClass}">${ev.icon}</div>
      <div class="tl-info">
        <div class="tl-title">${ev.title}</div>
        <div class="tl-detail">${ev.detail}</div>
      </div>
      <div class="tl-time">${fmtTime(ev.time)}</div>
      <button class="tl-delete" onclick="deleteLog('${ev.id}')" title="Delete">✕</button>`;
    tl.appendChild(item);
  });
}


function deleteLog(id) {
  allLogs = allLogs.filter(l => l.id !== id);
  refreshBabyView();
  saveLogs();
  renderTimeline();
  renderStats();
  renderMilestoneBanner();
}

// =======================================
