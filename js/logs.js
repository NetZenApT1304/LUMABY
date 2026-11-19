// Lumaby — Log forms: sleep, feeding, temperature, solids, doctor, teething….
// One part of the app script, loaded in order by index.html. All parts share one
// global scope; run `node tools/check-split.js` after moving code between files.
//  LOG MODALS
// =======================================
const LOG_CONFIGS = {
  sleep: {
    title: '😴 Log Sleep',
    build: () => `
      <div class="log-form">
        <div class="timer-section">
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">Timer</div>
            <div class="timer-display" id="sleep-timer-display">${activeTimers.sleep ? fmtDuration(Math.floor((Date.now()-activeTimers.sleep.startMs)/1000)) : '00:00:00'}</div>
          </div>
          <div class="timer-controls">
            ${activeTimers.sleep
              ? `<button class="btn-sec" onclick="stopTimer('sleep');closeModal('modal-log')">Stop & Save</button>`
              : `<button class="btn-sec" onclick="startTimer('sleep','😴','Sleep');closeModal('modal-log')">Start timer</button>`}
          </div>
        </div>
        <div style="text-align:center;color:var(--text-light);font-size:13px;margin:-6px 0">— or log manually —</div>
        <div class="form-row">
          <div class="form-group"><label>Start time</label><input class="form-input" id="sl-start" type="time" value="${timeInputNow(-60)}"/></div>
          <div class="form-group"><label>End time</label><input class="form-input" id="sl-end" type="time" value="${timeInputNow(0)}"/></div>
        </div>
        <div class="form-group"><label>Wake-ups during</label>
          <select class="form-input" id="sl-wake">
            <option value="0">0</option><option value="1">1</option><option value="2">2</option>
            <option value="3">3</option><option value="4">4+</option>
          </select>
        </div>
        <div class="form-group"><label>Notes</label><textarea class="form-input" id="sl-notes" placeholder="How did they sleep?"></textarea></div>
        <button class="btn-primary btn-full" onclick="saveSleep()">Save sleep</button>
      </div>`
  },
  feed: {
    title: '🍼 Feeding',
    build: () => feedFormHtml(),
  },
  temp: {
    title: '🌡️ Temperature',
    build: () => tempFormHtml(),
  },
  health: {
    title: '🩺 Doctor & vaccines',
    build: () => healthFormHtml(),
  },
  solids: {
    title: '🥕 Solids',
    build: () => solidsFormHtml(),
  },
  tooth: {
    title: '🦷 Teething',
    build: () => teethFormHtml(),
  },
  diaper: {
    title: '🌿 Diaper Change',
    build: () => `
      <div class="log-form">
        <div class="form-group"><label>Type</label>
          <select class="form-input" id="dp-type">
            <option value="wet">Wet 💧</option>
            <option value="dirty">Dirty 🟤</option>
            <option value="both">Both</option>
            <option value="dry">Dry</option>
          </select>
        </div>
        <div class="form-group"><label>Consistency</label>
          <select class="form-input" id="dp-consistency">
            <option value="">— optional —</option>
            <option>Normal</option><option>Runny</option>
            <option>Hard</option><option>Seedy</option><option>Mucousy</option>
          </select>
        </div>
        <div class="form-group"><label>Time</label><input class="form-input" id="dp-time" type="time" value="${timeInputNow(0)}"/></div>
        <div class="form-group"><label>Notes</label><textarea class="form-input" id="dp-notes" placeholder="Any concerns?"></textarea></div>
        <button class="btn-primary btn-full" onclick="saveDiaper()">Save diaper</button>
      </div>`
  },
  pump: {
    title: '🤱 Log Pumping',
    build: () => `
      <div class="log-form">
        <div class="timer-section">
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">Timer</div>
            <div class="timer-display">${activeTimers.pump ? fmtDuration(Math.floor((Date.now()-activeTimers.pump.startMs)/1000)) : '00:00:00'}</div>
          </div>
          <div class="timer-controls">
            ${activeTimers.pump
              ? `<button class="btn-sec" onclick="stopTimer('pump');closeModal('modal-log')">Stop & Save</button>`
              : `<button class="btn-sec" onclick="startTimer('pump','🤱','Pump');closeModal('modal-log')">Start timer</button>`}
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Left (oz)</label><input class="form-input" id="pu-left" type="number" step="0.5" min="0" placeholder="0"/></div>
          <div class="form-group"><label>Right (oz)</label><input class="form-input" id="pu-right" type="number" step="0.5" min="0" placeholder="0"/></div>
        </div>
        <div class="form-group"><label>Time</label><input class="form-input" id="pu-time" type="time" value="${timeInputNow(0)}"/></div>
        <button class="btn-primary btn-full" onclick="savePump()">Save pumping</button>
      </div>`
  },
  tummy: {
    title: '🏋️ Tummy Time',
    build: () => `
      <div class="log-form">
        <div class="timer-section">
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">Timer</div>
            <div class="timer-display">${activeTimers.tummy ? fmtDuration(Math.floor((Date.now()-activeTimers.tummy.startMs)/1000)) : '00:00:00'}</div>
          </div>
          <div class="timer-controls">
            ${activeTimers.tummy
              ? `<button class="btn-sec" onclick="stopTimer('tummy');closeModal('modal-log')">Stop & Save</button>`
              : `<button class="btn-sec" onclick="startTimer('tummy','🏋️','Tummy time');closeModal('modal-log')">Start timer</button>`}
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Duration (min)</label><input class="form-input" id="tt-min" type="number" min="0" max="120" placeholder="e.g. 10"/></div>
          <div class="form-group"><label>Time</label><input class="form-input" id="tt-time" type="time" value="${timeInputNow(0)}"/></div>
        </div>
        <div class="form-group"><label>Notes</label><textarea class="form-input" id="tt-notes" placeholder="How did they do?"></textarea></div>
        <button class="btn-primary btn-full" onclick="saveTummy()">Save tummy time</button>
      </div>`
  },
  bath: {
    title: '🛁 Log Bath',
    build: () => `
      <div class="log-form">
        <div class="form-group"><label>Time</label><input class="form-input" id="ba-time" type="time" value="${timeInputNow(0)}"/></div>
        <div class="form-group"><label>Notes</label><textarea class="form-input" id="ba-notes" placeholder="How did bath time go?"></textarea></div>
        <button class="btn-primary btn-full" onclick="saveBath()">Save bath</button>
      </div>`
  },
  meds: {
    title: '💊 Log Medicine',
    build: () => `
      <div class="log-form">
        <div class="form-group"><label>Medicine name</label><input class="form-input" id="md-name" placeholder="e.g. Tylenol"/></div>
        <div class="form-row">
          <div class="form-group"><label>Dose</label><input class="form-input" id="md-dose" placeholder="e.g. 2.5 mL"/></div>
          <div class="form-group"><label>Time</label><input class="form-input" id="md-time" type="time" value="${timeInputNow(0)}"/></div>
        </div>
        <div class="form-group"><label>Notes</label><textarea class="form-input" id="md-notes" placeholder="Reason, reaction…"></textarea></div>
        <button class="btn-primary btn-full" onclick="saveMeds()">Save medicine</button>
      </div>`
  },
  milestone: {
    title: '⭐ Log Milestone',
    build: () => `
      <div class="log-form">
        <div class="form-group"><label>What happened?</label><input class="form-input" id="ms-title" placeholder="e.g. First laugh, Rolled over…"/></div>
        <div class="form-group"><label>Pick an emoji</label>
          <div class="emoji-row">
            ${['⭐','🎉','💕','😂','🏆','🌟','💫','🎈','🦋','🌸'].map(e => `<div class="emoji-pick" onclick="pickEmoji(this,'${e}')">${e}</div>`).join('')}
          </div>
          <input type="hidden" id="ms-emoji" value="⭐"/>
        </div>
        <div class="form-group"><label>Notes</label><textarea class="form-input" id="ms-notes" placeholder="Describe the moment…"></textarea></div>
        <div class="form-group"><label>Time</label><input class="form-input" id="ms-time" type="time" value="${timeInputNow(0)}"/></div>
        <button class="btn-primary btn-full" onclick="saveMilestone()">Save milestone</button>
      </div>`
  },
  growth: {
    title: '📏 Log Growth',
    build: () => `
      <div class="log-form">
        <div class="form-row">
          <div class="form-group"><label>Weight (lbs)</label><input class="form-input" id="gr-weight" type="number" step="0.1" min="0" placeholder="e.g. 15.2"/></div>
          <div class="form-group"><label>Height (in)</label><input class="form-input" id="gr-height" type="number" step="0.25" min="0" placeholder="e.g. 24.5"/></div>
        </div>
        <div class="form-group"><label>Head circ. (cm)</label><input class="form-input" id="gr-head" type="number" step="0.1" min="0" placeholder="e.g. 41"/></div>
        <div class="form-group"><label>Date</label><input class="form-input" id="gr-date" type="date" value="${new Date().toISOString().split('T')[0]}"/></div>
        <div class="form-group"><label>Notes</label><textarea class="form-input" id="gr-notes" placeholder="Doctor's office, at home…"></textarea></div>
        <button class="btn-primary btn-full" onclick="saveGrowthEntry()">Save measurement</button>
      </div>`
  },
  note: {
    title: '📝 Add Note',
    build: () => `
      <div class="log-form">
        <div class="form-group"><label>Note</label><textarea class="form-input" id="nt-text" style="height:120px" placeholder="Write anything…"></textarea></div>
        <div class="form-group"><label>Time</label><input class="form-input" id="nt-time" type="time" value="${timeInputNow(0)}"/></div>
        <button class="btn-primary btn-full" onclick="saveNote()">Save note</button>
      </div>`
  }
};

function openLogModal(type) {
  closeModal('modal-choose');
  if (!type) { openModal('modal-choose'); return; }
  const cfg = LOG_CONFIGS[type];
  if (!cfg) return;
  document.getElementById('log-modal-title').textContent = cfg.title;
  if (type === 'feed') { bottleAmount = null; nurseManual = false; }
  if (type === 'temp') tempValue = null;
  document.getElementById('log-modal-body').innerHTML = cfg.build();
  openModal('modal-log');
  if (type === 'temp') initThermo();
  if (type === 'solids') initSolidsForm();
  // Update timer display inside modal
  if (activeTimers[type]) {
    updateModalTimer(type);
  }
}

function updateModalTimer(type) {
  const displayId = type + '-timer-display';
  const el = document.getElementById(displayId);
  if (!el || !activeTimers[type]) return;
  el.textContent = fmtDuration(Math.floor((Date.now()-activeTimers[type].startMs)/1000));
  setTimeout(() => updateModalTimer(type), 1000);
}

function pickEmoji(el, emoji) {
  document.querySelectorAll('.emoji-pick').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('ms-emoji').value = emoji;
}

// == Save functions ==
function pushLog(entry) {
  if (!entry.babyId) entry.babyId = currentBabyId();
  allLogs.unshift(entry);
  refreshBabyView();
  saveLogs();
  closeModal('modal-log');
  renderTimeline();
  renderStats();
  renderMilestoneBanner();
  showToast(`${entry.icon} ${entry.title} saved`);
}

function saveSleep() {
  const start = document.getElementById('sl-start').value;
  const end = document.getElementById('sl-end').value;
  const wakeUps = parseInt(document.getElementById('sl-wake').value) || 0;
  const notes = document.getElementById('sl-notes').value;
  const startDt = timeInputToDate(start);
  let endDt = timeInputToDate(end);
  if (endDt <= startDt) endDt.setDate(endDt.getDate()+1);
  const durationMin = Math.round((endDt - startDt) / 60000);
  const detail = `${fmtDur(durationMin)}${wakeUps > 0 ? ' · ' + wakeUps + ' wake-up' + (wakeUps>1?'s':'') : ''}${notes ? ' · '+notes : ''}`;
  pushLog({ id:uid(), type:'sleep', icon:'😴', title:'Sleep', detail, time:startDt.toISOString(), durationMin, wakeUps });
}

// =======================================
//  FEEDING: Nursing | Bottle
// =======================================
let feedTab = STORE.get('feedTab') || 'nursing';
let feedUnit = STORE.get('feedUnit') || 'oz';
let bottleType = STORE.get('bottleType') || 'formula';
let bottleAmount = null; // in feedUnit; set when the form opens
let nurseManual = false;
const OZ_ML = 29.5735;

function fmtClock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

// Which breast to start with: the other one from last time.
function lastFeedSide(feed) {
  if (!feed) return null;
  if (feed.lastSide) return feed.lastSide;
  if (feed.feedType === 'breast-left') return 'left';
  if (feed.feedType === 'breast-right') return 'right';
  return null;
}
function suggestedSide() {
  const last = logs.find(l => l.type === 'feed' && isNursingFeed(l));
  const side = lastFeedSide(last);
  return side === 'left' ? 'right' : side === 'right' ? 'left' : 'left';
}

function nursingSession() { return activeTimers.feed?.extra?.nursing ? activeTimers.feed : null; }
function nurseTotals(t = nursingSession()) {
  if (!t) return { left: 0, right: 0 };
  const n = t.extra.nursing, now = Date.now();
  return {
    left: n.left + (n.running === 'left' ? now - n.runStart : 0),
    right: n.right + (n.running === 'right' ? now - n.runStart : 0),
  };
}

// Tap a side: start it; tap the other side to switch; tap the running side to pause.
function nurseTap(side) {
  let t = nursingSession();
  const now = Date.now();
  if (!t) {
    activeTimers.feed = { id: uid(), type: 'feed', icon: '🍼', label: 'Nursing', startMs: now,
      extra: { nursing: { left: 0, right: 0, running: null, runStart: null, lastSide: null } } };
    t = activeTimers.feed;
  }
  const n = t.extra.nursing;
  if (n.running) { n[n.running] += now - n.runStart; }
  if (n.running === side) { n.running = null; n.runStart = null; }
  else { n.running = side; n.runStart = now; n.lastSide = side; }
  t.label = n.running ? `Nursing · ${n.running === 'left' ? 'Left' : 'Right'}` : 'Nursing · paused';
  saveTimers(); renderTimers();
  refreshFeedForm();
}

function nursingEntry(leftMs, rightMs, lastSide, startIso) {
  const leftMin = Math.round(leftMs / 60000), rightMin = Math.round(rightMs / 60000);
  const feedType = leftMs && rightMs ? 'breast-both' : leftMs ? 'breast-left' : 'breast-right';
  const parts = [leftMs ? `L ${leftMin}m` : '', rightMs ? `R ${rightMin}m` : ''].filter(Boolean);
  return { id: uid(), type: 'feed', icon: '🤱', title: 'Nursing', detail: ['Nursing', ...parts].join(' · '),
           time: startIso, feedType, leftMin, rightMin, durationMin: leftMin + rightMin,
           lastSide: lastSide || (rightMs ? 'right' : 'left') };
}

// Save the running/paused session (from the form, the timer pill or quick log).
function finishNursing() {
  const t = nursingSession();
  if (!t) return;
  const { left, right } = nurseTotals(t);
  const startInput = document.getElementById('nr-start');
  let startIso = new Date(t.startMs).toISOString();
  if (startInput && startInput.value && startInput.dataset.edited === '1') startIso = timeInputToDate(startInput.value).toISOString();
  delete activeTimers.feed; saveTimers(); renderTimers();
  if (left + right < 1000) { closeModal('modal-log'); showToast('Nothing to save'); return; }
  const entry = nursingEntry(left, right, t.extra.nursing.lastSide, startIso);
  pushLog(entry);
  showUndoToast(`🤱 Saved · ${entry.detail.replace('Nursing · ', '')}`, () => { deleteLog(entry.id); showToast('Removed'); });
}

function discardNursing() {
  if (!nursingSession() || !confirm('Discard this nursing session?')) return;
  delete activeTimers.feed; saveTimers(); renderTimers(); refreshFeedForm();
}

function saveNursingManual() {
  const l = Math.max(0, parseInt(document.getElementById('nr-left-min').value) || 0);
  const r = Math.max(0, parseInt(document.getElementById('nr-right-min').value) || 0);
  if (!l && !r) { showToast('⚠️ Enter minutes for at least one side'); return; }
  const start = document.getElementById('nr-start').value;
  const startIso = (start ? timeInputToDate(start) : new Date()).toISOString();
  pushLog(nursingEntry(l * 60000, r * 60000, document.getElementById('nr-last').value, startIso));
}

function bottleDetail(type, oz, unit) {
  const label = type === 'breastmilk' ? 'Breast milk' : type === 'solids' ? 'Solids' : 'Formula';
  const amount = !oz ? '' : unit === 'ml' ? `${Math.round(oz * OZ_ML)} ml` : `${+oz.toFixed(1)} oz`;
  return ['Bottle', label, amount].filter(Boolean).join(' · ');
}

function setBottleType(t) { bottleType = t; STORE.set('bottleType', t); refreshFeedForm(); }
function setFeedUnit(u) {
  if (u === feedUnit) return;
  bottleAmount = u === 'ml' ? Math.round(bottleAmount * OZ_ML / 10) * 10 : Math.round(bottleAmount / OZ_ML * 2) / 2;
  feedUnit = u; STORE.set('feedUnit', u); refreshFeedForm();
}
function bumpBottle(dir) {
  const step = feedUnit === 'ml' ? 10 : 0.5, max = feedUnit === 'ml' ? 400 : 14;
  bottleAmount = Math.min(max, Math.max(0, +(bottleAmount + dir * step).toFixed(1)));
  refreshFeedForm();
}
function saveBottle() {
  if (!bottleAmount) { showToast('⚠️ Set the amount'); return; }
  const oz = feedUnit === 'ml' ? bottleAmount / OZ_ML : bottleAmount;
  const time = timeInputToDate(document.getElementById('bt-time').value);
  const notes = document.getElementById('bt-notes').value.trim();
  const detail = bottleDetail(bottleType, oz, feedUnit) + (notes ? ' · ' + notes : '');
  pushLog({ id: uid(), type: 'feed', icon: '🍼', title: 'Bottle', detail, time: time.toISOString(),
            feedType: bottleType, oz: +oz.toFixed(2), unit: feedUnit, durationMin: 0 });
}

function setFeedTab(tab) { feedTab = tab; STORE.set('feedTab', tab); refreshFeedForm(); }
function toggleNurseManual() { nurseManual = !nurseManual; refreshFeedForm(); }

function refreshFeedForm() {
  const body = document.getElementById('feed-form');
  if (body) body.outerHTML = feedFormHtml();
}

function feedFormHtml() {
  if (bottleAmount === null) {
    const lastBottle = logs.find(l => l.type === 'feed' && l.oz && !isNursingFeed(l));
    bottleAmount = lastBottle ? (feedUnit === 'ml' ? Math.round(lastBottle.oz * OZ_ML / 10) * 10 : +(+lastBottle.oz).toFixed(1)) : (feedUnit === 'ml' ? 120 : 4);
  }
  const t = nursingSession();
  if (t) feedTab = 'nursing';
  const tabs = `<div class="seg" role="tablist">
      <button role="tab" aria-selected="${feedTab === 'nursing'}" class="${feedTab === 'nursing' ? 'active' : ''}" onclick="setFeedTab('nursing')">Nursing</button>
      <button role="tab" aria-selected="${feedTab === 'bottle'}" class="${feedTab === 'bottle' ? 'active' : ''}" onclick="setFeedTab('bottle')">Bottle</button>
    </div>`;

  if (feedTab === 'bottle') {
    return `<div class="log-form" id="feed-form">${tabs}
      <div class="feed-row"><label>Time</label><input class="form-input" id="bt-time" type="time" value="${timeInputNow(0)}"/></div>
      <div class="seg">
        <button class="${bottleType === 'formula' ? 'active' : ''}" onclick="setBottleType('formula')">Formula</button>
        <button class="${bottleType === 'breastmilk' ? 'active' : ''}" onclick="setBottleType('breastmilk')">Breast milk</button>
      </div>
      <div class="amount-picker">
        <button onclick="bumpBottle(-1)" aria-label="Less">−</button>
        <div class="amount-value" id="bt-amount">${feedUnit === 'ml' ? bottleAmount : +(+bottleAmount).toFixed(1)}<small>${feedUnit}</small></div>
        <button onclick="bumpBottle(1)" aria-label="More">+</button>
      </div>
      <div style="text-align:center;margin-bottom:18px">
        <div class="seg small"><button class="${feedUnit === 'oz' ? 'active' : ''}" onclick="setFeedUnit('oz')">oz</button><button class="${feedUnit === 'ml' ? 'active' : ''}" onclick="setFeedUnit('ml')">ml</button></div>
      </div>
      <div class="form-group"><label>Notes</label><textarea class="form-input" id="bt-notes" placeholder="Any observations…"></textarea></div>
      <button class="btn-primary btn-full" onclick="saveBottle()">Save bottle</button>
    </div>`;
  }

  const tot = nurseTotals(t), n = t?.extra.nursing;
  const next = suggestedSide();
  const side = s => {
    const running = n?.running === s, ms = tot[s];
    const icon = running ? '❚❚' : '▶';
    const label = s === 'left' ? 'LEFT' : 'RIGHT';
    return `<button class="nurse-side ${running ? 'running' : ''} ${!t && next === s ? 'suggested' : ''}" onclick="nurseTap('${s}')"
      aria-label="${running ? 'Pause' : 'Start'} ${s} side" aria-pressed="${running}">
      <span class="ns-icon">${icon}</span><span class="ns-label">${label}</span>
      <span class="ns-time" id="nr-${s}-time">${ms ? fmtClock(ms) : ''}</span></button>`;
  };
  const startVal = t ? new Date(t.startMs).toTimeString().slice(0, 5) : timeInputNow(0);
  let summary;
  if (t) summary = `Total ${fmtClock(tot.left + tot.right)}${n.running ? '' : ' · paused'}`;
  else {
    const last = lastFeedSide(logs.find(l => l.type === 'feed' && isNursingFeed(l)));
    summary = last ? `Last time ended on ${last === 'left' ? 'Left' : 'Right'} · start with ${next === 'left' ? 'Left' : 'Right'}` : 'Tap a side to start the timer';
  }
  const manual = nurseManual && !t ? `
      <div class="form-row">
        <div class="form-group"><label>Left (min)</label><input class="form-input" id="nr-left-min" type="number" min="0" max="90" inputmode="numeric" placeholder="0"/></div>
        <div class="form-group"><label>Right (min)</label><input class="form-input" id="nr-right-min" type="number" min="0" max="90" inputmode="numeric" placeholder="0"/></div>
      </div>
      <div class="form-group"><label>Finished on</label>
        <select class="form-input" id="nr-last"><option value="left">Left</option><option value="right" ${next === 'left' ? 'selected' : ''}>Right</option></select></div>
      <button class="btn-primary btn-full" onclick="saveNursingManual()">Save nursing</button>` : '';
  return `<div class="log-form" id="feed-form">${tabs}
    <div class="feed-row"><label>Start time</label><input class="form-input" id="nr-start" type="time" value="${startVal}" oninput="this.dataset.edited='1'"/></div>
    ${nurseManual && !t ? manual : `
      <div class="nurse-sides">${side('left')}${side('right')}</div>
      <div class="nurse-summary" id="nr-summary">${summary}</div>
      ${t ? `<button class="btn-primary btn-full" onclick="finishNursing()">Save</button>
             <button class="link-btn" onclick="discardNursing()">Discard</button>` : ''}`}
    ${t ? '' : `<button class="link-btn" onclick="toggleNurseManual()">${nurseManual ? 'Use the timer instead' : 'Manual entry'}</button>`}
  </div>`;
}

// Keep the side clocks ticking while the form is open.
setInterval(() => {
  const t = nursingSession();
  if (!t || !document.getElementById('feed-form')) return;
  const tot = nurseTotals(t);
  ['left', 'right'].forEach(s => { const el = document.getElementById(`nr-${s}-time`); if (el && tot[s]) el.textContent = fmtClock(tot[s]); });
  const sum = document.getElementById('nr-summary');
  if (sum) sum.textContent = `Total ${fmtClock(tot.left + tot.right)}${t.extra.nursing.running ? '' : ' · paused'}`;
}, 1000);

// =======================================
//  TEMPERATURE: thermometer slider
// =======================================
const TEMP_RANGE = { F: { min: 93, max: 105, fever: 100.4, low: 95, major: 1, minor: 0.2 },
                     C: { min: 34, max: 40.5, fever: 38.0, low: 35, major: 0.5, minor: 0.1 } };
let tempUnit = STORE.get('tempUnit') || (/^en-(US|LR)|^my/.test(navigator.language || '') ? 'F' : 'C');
let tempValue = null;
const toF = c => c * 9 / 5 + 32, toC = f => (f - 32) * 5 / 9;
const round1 = v => Math.round(v * 10) / 10;

function tempFormHtml() {
  if (tempValue === null) {
    const last = logs.find(l => l.type === 'temp');
    tempValue = last ? round1(tempUnit === 'F' ? last.tempF : last.tempC) : (tempUnit === 'F' ? 98.6 : 37.0);
  }
  const r = TEMP_RANGE[tempUnit];
  const span = r.max - r.min, pct = v => ((v - r.min) / span) * 100;
  let labels = '', ticks = '';
  for (let v = r.min; v <= r.max + 1e-9; v = round1(v + r.minor)) {
    const major = Math.abs(v / r.major - Math.round(v / r.major)) < 1e-6;
    ticks += `<div class="thermo-tick" style="bottom:${pct(v)}%;width:${major ? 22 : 12}px"></div>`;
    if (major && (tempUnit === 'C' ? Math.abs(v - Math.round(v)) < 1e-6 : true)) labels += `<div class="thermo-label" style="bottom:${pct(v)}%">${+v.toFixed(1)}</div>`;
  }
  return `<div class="log-form" id="temp-form">
    <div class="feed-row"><label>Time</label><input class="form-input" id="tp-time" type="time" value="${timeInputNow(0)}"/></div>
    <div class="feed-row"><label>Temperature</label>
      <div class="seg small"><button class="${tempUnit === 'C' ? 'active' : ''}" onclick="setTempUnit('C')">°C</button><button class="${tempUnit === 'F' ? 'active' : ''}" onclick="setTempUnit('F')">°F</button></div></div>
    <div class="thermo-wrap"><div class="thermo" id="thermo">
      ${labels}${ticks}
      <div class="thermo-track" id="thermo-track" role="slider" tabindex="0" aria-label="Temperature"
        aria-valuemin="${r.min}" aria-valuemax="${r.max}"><div class="thermo-fill" id="thermo-fill"></div><div class="thermo-thumb" id="thermo-thumb"></div></div>
      <div class="thermo-bubble" id="thermo-bubble"></div>
    </div></div>
    <div class="temp-note" id="temp-note"></div>
    <div class="fine-adjust"><button onclick="nudgeTemp(-0.1)" aria-label="Down 0.1">−0.1</button><button onclick="nudgeTemp(0.1)" aria-label="Up 0.1">+0.1</button></div>
    <div class="form-group"><label>Notes</label><textarea class="form-input" id="tp-notes" placeholder="Medicine given, symptoms…"></textarea></div>
    <button class="btn-primary btn-full" onclick="saveTemp()">Save</button>
  </div>`;
}

function drawTemp() {
  const r = TEMP_RANGE[tempUnit];
  tempValue = Math.min(r.max, Math.max(r.min, round1(tempValue)));
  const pct = ((tempValue - r.min) / (r.max - r.min)) * 100;
  const fever = tempValue >= r.fever, low = tempValue < r.low;
  const fill = document.getElementById('thermo-fill'); if (!fill) return;
  fill.style.height = `calc(${pct}% - 6px * ${pct / 100})`;
  document.getElementById('thermo-thumb').style.bottom = pct + '%';
  const bubble = document.getElementById('thermo-bubble');
  bubble.style.bottom = pct + '%';
  bubble.textContent = `${tempValue.toFixed(1)} °${tempUnit}`;
  document.getElementById('thermo').classList.toggle('fever', fever);
  const track = document.getElementById('thermo-track');
  track.setAttribute('aria-valuenow', tempValue.toFixed(1));
  track.setAttribute('aria-valuetext', `${tempValue.toFixed(1)} degrees ${tempUnit === 'F' ? 'Fahrenheit' : 'Celsius'}${fever ? ', fever' : ''}`);
  const note = document.getElementById('temp-note');
  note.className = 'temp-note' + (fever ? ' fever' : '');
  note.textContent = fever ? `Fever (${r.fever} °${tempUnit} or higher)` : low ? 'Lower than usual. Re-check if unsure.' : 'Normal range';
}

function nudgeTemp(d) { tempValue = round1(tempValue + d); drawTemp(); }
function setTempUnit(u) {
  if (u === tempUnit) return;
  tempValue = round1(u === 'F' ? toF(tempValue) : toC(tempValue));
  tempUnit = u; STORE.set('tempUnit', u);
  const form = document.getElementById('temp-form');
  if (form) { form.outerHTML = tempFormHtml(); initThermo(); }
}

function initThermo() {
  const track = document.getElementById('thermo-track'), thermo = document.getElementById('thermo');
  if (!track) return;
  const fromY = y => {
    const rect = track.getBoundingClientRect(), r = TEMP_RANGE[tempUnit];
    const pct = 1 - Math.min(1, Math.max(0, (y - rect.top) / rect.height));
    tempValue = round1(r.min + pct * (r.max - r.min)); drawTemp();
  };
  let dragging = false;
  thermo.addEventListener('pointerdown', e => { dragging = true; thermo.setPointerCapture(e.pointerId); fromY(e.clientY); e.preventDefault(); });
  thermo.addEventListener('pointermove', e => { if (dragging) fromY(e.clientY); });
  thermo.addEventListener('pointerup', () => { dragging = false; });
  thermo.addEventListener('pointercancel', () => { dragging = false; });
  track.addEventListener('keydown', e => {
    const step = { ArrowUp: 0.1, ArrowRight: 0.1, ArrowDown: -0.1, ArrowLeft: -0.1, PageUp: 1, PageDown: -1 }[e.key];
    if (step) { nudgeTemp(step); e.preventDefault(); }
  });
  drawTemp();
}

function saveTemp() {
  const r = TEMP_RANGE[tempUnit];
  const v = round1(tempValue), fever = v >= r.fever;
  const tempF = round1(tempUnit === 'F' ? v : toF(v)), tempC = round1(tempUnit === 'C' ? v : toC(v));
  const notes = document.getElementById('tp-notes').value.trim();
  const time = timeInputToDate(document.getElementById('tp-time').value);
  const detail = [`${v.toFixed(1)} °${tempUnit}`, fever ? 'Fever' : '', notes].filter(Boolean).join(' · ');
  pushLog({ id: uid(), type: 'temp', icon: '🌡️', title: 'Temperature', detail, time: time.toISOString(), tempF, tempC, unit: tempUnit, fever });
}

function saveDiaper() {
  const type = document.getElementById('dp-type').value;
  const cons = document.getElementById('dp-consistency').value;
  const time = timeInputToDate(document.getElementById('dp-time').value);
  const notes = document.getElementById('dp-notes').value;
  const detail = [type, cons, notes].filter(Boolean).join(' · ');
  pushLog({ id:uid(), type:'diaper', icon:'🌿', title:'Diaper change', detail, time:time.toISOString(), diaperType:type });
}

function savePump() {
  const left = parseFloat(document.getElementById('pu-left').value) || 0;
  const right = parseFloat(document.getElementById('pu-right').value) || 0;
  const time = timeInputToDate(document.getElementById('pu-time').value);
  const total = left + right;
  pushLog({ id:uid(), type:'pump', icon:'🤱', title:'Pumping', detail:`${total.toFixed(1)} oz total (L:${left} R:${right})`, time:time.toISOString() });
}

function saveTummy() {
  const mins = parseInt(document.getElementById('tt-min').value) || 0;
  const time = timeInputToDate(document.getElementById('tt-time').value);
  const notes = document.getElementById('tt-notes').value;
  pushLog({ id:uid(), type:'tummy', icon:'🏋️', title:'Tummy time', detail:[mins?mins+'min':'',notes].filter(Boolean).join(' · '), time:time.toISOString(), durationMin:mins });
}

function saveBath() {
  const time = timeInputToDate(document.getElementById('ba-time').value);
  const notes = document.getElementById('ba-notes').value;
  pushLog({ id:uid(), type:'bath', icon:'🛁', title:'Bath', detail:notes||'Bath time', time:time.toISOString() });
}

function saveMeds() {
  const name = document.getElementById('md-name').value || 'Medicine';
  const dose = document.getElementById('md-dose').value;
  const time = timeInputToDate(document.getElementById('md-time').value);
  const notes = document.getElementById('md-notes').value;
  pushLog({ id:uid(), type:'meds', icon:'💊', title:name, detail:[dose,notes].filter(Boolean).join(' · '), time:time.toISOString() });
}

function saveMilestone() {
  const title = document.getElementById('ms-title').value || 'Milestone';
  const emoji = document.getElementById('ms-emoji').value;
  const notes = document.getElementById('ms-notes').value;
  const time = timeInputToDate(document.getElementById('ms-time').value);
  pushLog({ id:uid(), type:'milestone', icon:emoji, title, detail:notes||'', time:time.toISOString(), milestoneEmoji:emoji });
}

function saveGrowthEntry() {
  const weight = parseFloat(document.getElementById('gr-weight').value) || 0;
  const heightIn = parseFloat(document.getElementById('gr-height').value) || 0;
  const head = parseFloat(document.getElementById('gr-head').value) || 0;
  const date = document.getElementById('gr-date').value;
  const notes = document.getElementById('gr-notes').value;
  if (!weight && !heightIn) { showToast('⚠️ Enter at least weight or height'); return; }
  allGrowth.push({ id: uid(), date, weight, heightIn, head, notes, babyId: currentBabyId() });
  allGrowth.sort((a,b) => a.date.localeCompare(b.date));
  refreshBabyView();
  saveGrowth();
  const detail = [weight?weight+'lbs':'', heightIn?heightIn+'"':'', head?head+'cm head':''].filter(Boolean).join(' · ');
  pushLog({ id:uid(), type:'growth', icon:'📏', title:'Growth measurement', detail, time:new Date(date).toISOString() });
  renderGrowth();
}

function saveNote() {
  const text = document.getElementById('nt-text').value.trim();
  const time = timeInputToDate(document.getElementById('nt-time').value);
  if (!text) return;
  pushLog({ id:uid(), type:'note', icon:'📝', title:'Note', detail:text, time:time.toISOString() });
}
// =======================================
//  MORE TRACKING: doctor & vaccines, solids, teething
// =======================================
function todayInput() { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function dateTimeToIso(dateStr, timeStr) {
  const [y, m, d] = (dateStr || todayInput()).split('-').map(Number);
  const [hh, mm] = (timeStr || '12:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
}
function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// Multi-select chips: data-on toggles; read with chipValues(containerId).
function chipsHtml(id, options, selected = [], single = false) {
  return `<div class="chip-row" id="${id}" data-single="${single}">` + options.map(([v, label]) =>
    `<button type="button" class="chip ${selected.includes(v) ? 'on' : ''}" data-v="${escHtml(v)}" aria-pressed="${selected.includes(v)}" onclick="toggleChip(this)">${label}</button>`).join('') + '</div>';
}
function toggleChip(el) {
  const row = el.parentElement;
  const off = c => { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); };
  if (row.dataset.single === 'true') row.querySelectorAll('.chip').forEach(c => { if (c !== el) off(c); });
  el.classList.toggle('on'); el.setAttribute('aria-pressed', el.classList.contains('on'));
  // "None" can't be combined with anything else
  if (el.classList.contains('on')) {
    if (el.dataset.v === 'none') row.querySelectorAll('.chip').forEach(c => { if (c !== el) off(c); });
    else row.querySelectorAll('.chip[data-v="none"]').forEach(off);
  }
  row.dispatchEvent(new Event('change'));
}
function chipValues(id) { return [...document.querySelectorAll(`#${id} .chip.on`)].map(c => c.dataset.v); }

// ── 🩺 Doctor & vaccines ──
const VACCINES = [['HepB', 'Hep B'], ['RSV', 'RSV'], ['RV', 'Rotavirus'], ['DTaP', 'DTaP'], ['Hib', 'Hib'], ['PCV', 'Pneumococcal'],
  ['IPV', 'Polio (IPV)'], ['Flu', 'Flu'], ['COVID', 'COVID-19'], ['MMR', 'MMR'], ['VAR', 'Chickenpox'], ['HepA', 'Hep A']];
const VACCINE_NAME = Object.fromEntries(VACCINES);
let healthTab = 'vaccine';
function setHealthTab(t) { healthTab = t; const f = document.getElementById('health-form'); if (f) f.outerHTML = healthFormHtml(); }
function healthFormHtml() {
  const when = `<div class="form-row">
      <div class="form-group"><label>Date</label><input class="form-input" id="hl-date" type="date" value="${todayInput()}" max="${todayInput()}"/></div>
      <div class="form-group"><label>Time</label><input class="form-input" id="hl-time" type="time" value="${timeInputNow(0)}"/></div></div>`;
  const tabs = `<div class="seg"><button class="${healthTab === 'vaccine' ? 'active' : ''}" onclick="setHealthTab('vaccine')">Vaccines</button>
    <button class="${healthTab === 'visit' ? 'active' : ''}" onclick="setHealthTab('visit')">Doctor visit</button>
    <button class="${healthTab === 'appt' ? 'active' : ''}" onclick="setHealthTab('appt')">Upcoming</button></div>`;
  if (healthTab === 'appt') return apptFormHtml(tabs);
  if (healthTab === 'vaccine') {
    return `<div class="log-form" id="health-form">${tabs}${when}
      <div class="form-group"><label>Vaccines given</label>${chipsHtml('hl-vax', VACCINES)}</div>
      <div class="form-group"><label>Other vaccine (optional)</label><input class="form-input" id="hl-vax-other" placeholder="Name"/></div>
      <div class="form-group"><label>Reaction</label>${chipsHtml('hl-react', [['none', 'None'], ['fussy', 'Fussy'], ['sore', 'Sore leg/arm'], ['fever', 'Fever'], ['sleepy', 'Sleepy']], ['none'])}</div>
      <div class="form-group"><label>Notes</label><textarea class="form-input" id="hl-notes" placeholder="Batch, clinic, next appointment…"></textarea></div>
      <button class="btn-primary btn-full" onclick="saveHealth()">Save vaccines</button></div>`;
  }
  return `<div class="log-form" id="health-form">${tabs}${when}
    <div class="form-group"><label>Visit type</label>${chipsHtml('hl-reason', [['checkup', 'Checkup'], ['sick', 'Sick visit'], ['specialist', 'Specialist'], ['other', 'Other']], ['checkup'], true)}</div>
    <div class="form-group"><label>Doctor or clinic</label><input class="form-input" id="hl-provider" placeholder="e.g. Dr. Lee"/></div>
    <div class="form-group"><label>Notes</label><textarea class="form-input" id="hl-notes" placeholder="What the doctor said, follow-ups…"></textarea></div>
    <button class="btn-primary btn-full" onclick="saveHealth()">Save visit</button></div>`;
}
function saveHealth() {
  if (healthTab === 'appt') return saveAppointment();
  const time = dateTimeToIso(document.getElementById('hl-date').value, document.getElementById('hl-time').value);
  const notes = document.getElementById('hl-notes').value.trim();
  if (healthTab === 'vaccine') {
    const vax = chipValues('hl-vax').map(v => VACCINE_NAME[v] || v);
    const other = document.getElementById('hl-vax-other').value.trim();
    if (other) vax.push(other);
    if (!vax.length) { showToast('⚠️ Pick at least one vaccine'); return; }
    const reactions = chipValues('hl-react').filter(r => r !== 'none');
    const detail = [vax.join(', '), reactions.length ? 'Reaction: ' + reactions.join(', ') : '', notes].filter(Boolean).join(' · ');
    pushLog({ id: uid(), type: 'health', icon: '💉', title: vax.length === 1 ? 'Vaccine' : 'Vaccines', detail, time, healthKind: 'vaccine', vaccines: vax, reactions, notes });
  } else {
    const reason = chipValues('hl-reason')[0] || 'other';
    const label = { checkup: 'Checkup', sick: 'Sick visit', specialist: 'Specialist', other: 'Doctor visit' }[reason];
    const provider = document.getElementById('hl-provider').value.trim();
    pushLog({ id: uid(), type: 'health', icon: '🩺', title: label, detail: [provider, notes].filter(Boolean).join(' · ') || label, time,
              healthKind: 'visit', visitReason: reason, provider, notes });
  }
}

// ── 📅 Upcoming doctor appointments ──
// Saved as type 'appointment' at the appointment's time, so they sync and
// show on that day. The day is pink on the home day strip, and the server
// sends a push at each "remind me" time (send-reminders.js).
const APPT_KINDS = [['checkup', 'Checkup'], ['vaccines', 'Vaccines'], ['sick', 'Sick visit'], ['specialist', 'Specialist'], ['other', 'Other']];
const APPT_REMIND = [['1d', 'Day before'], ['2h', '2 hours before'], ['1h', '1 hour before'], ['30m', '30 min before']];
function apptFormHtml(tabs) {
  const tomorrow = new Date(Date.now() + 864e5);
  const tomorrowInput = new Date(tomorrow - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const pushNote = !isPremium
    ? '<p class="form-hint">Notifications are part of Premium. The day still shows pink on your calendar.</p>'
    : (typeof Notification !== 'undefined' && Notification.permission !== 'granted'
      ? '<p class="form-hint">We\'ll ask to turn on notifications when you save.</p>' : '');
  return `<div class="log-form" id="health-form">${tabs}
    <div class="form-row">
      <div class="form-group"><label>Date</label><input class="form-input" id="hl-date" type="date" value="${tomorrowInput}" min="${todayInput()}"/></div>
      <div class="form-group"><label>Time</label><input class="form-input" id="hl-time" type="time" value="09:00"/></div></div>
    <div class="form-group"><label>Appointment for</label>${chipsHtml('hl-appt-kind', APPT_KINDS, ['checkup'], true)}</div>
    <div class="form-group"><label>Doctor or clinic</label><input class="form-input" id="hl-provider" placeholder="e.g. Dr. Lee"/></div>
    <div class="form-group"><label>Notes</label><textarea class="form-input" id="hl-notes" placeholder="Questions to ask, what to bring…"></textarea></div>
    <div class="form-group"><label>Remind me</label>${chipsHtml('hl-remind', APPT_REMIND, ['1d', '1h'])}${pushNote}</div>
    <button class="btn-primary btn-full" onclick="saveHealth()">Save appointment</button></div>`;
}
function apptTitle(kind) { return { checkup: 'Checkup', vaccines: 'Vaccine appointment', sick: 'Sick visit', specialist: 'Specialist', other: 'Doctor appointment' }[kind] || 'Doctor appointment'; }
async function saveAppointment() {
  const time = dateTimeToIso(document.getElementById('hl-date').value, document.getElementById('hl-time').value);
  if (Date.parse(time) <= Date.now()) { showToast('⚠️ Pick a date and time in the future'); return; }
  const kind = chipValues('hl-appt-kind')[0] || 'other';
  const provider = document.getElementById('hl-provider').value.trim();
  const notes = document.getElementById('hl-notes').value.trim();
  const remind = chipValues('hl-remind');
  const title = apptTitle(kind);
  pushLog({ id: uid(), type: 'appointment', icon: '📅', title, time, apptKind: kind, provider, notes, remind,
            detail: [provider, notes].filter(Boolean).join(' · ') || 'Upcoming appointment' });
  // Notifications come from the server; make sure this device can get them.
  if (remind.length && isPremium && typeof Notification !== 'undefined' && Notification.permission !== 'granted'
      && typeof enablePushReminders === 'function') {
    if (await enablePushReminders()) showToast('🔔 We\'ll remind you before the appointment');
  }
}
function upcomingAppointments() {
  const now = Date.now();
  return logs.filter(l => l.type === 'appointment' && Date.parse(l.time) > now)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}
function fmtApptWhen(iso) {
  const d = new Date(iso), today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 864e5);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow'
    : d.toLocaleDateString([], diff < 7 ? { weekday: 'long' } : { weekday: 'short', month: 'short', day: 'numeric' });
  return `${date} at ${time}`;
}
// "Next appointment" card on the home screen; tapping it opens that day.
function renderApptBanner() {
  const el = document.getElementById('apptBanner'); if (!el) return;
  const next = upcomingAppointments()[0];
  if (!next) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="appt-banner" onclick="selectDay('${next.time}')">
    <span class="appt-banner-icon">📅</span>
    <div><div class="appt-banner-title">${escHtml(next.title)}${next.provider ? ' · ' + escHtml(next.provider) : ''}</div>
    <div class="appt-banner-when">${fmtApptWhen(next.time)}</div></div></div>`;
}

// ── 🥕 Solids ──
function foodsTried() {
  const map = new Map();
  [...logs].reverse().forEach(l => { if (l.type === 'solids' && l.food) {
    const k = l.food.toLowerCase(); const prev = map.get(k) || { name: l.food, times: 0, reaction: false };
    map.set(k, { name: l.food, times: prev.times + 1, reaction: prev.reaction || l.reaction === 'reaction', last: l.time });
  } });
  return [...map.values()].sort((a, b) => Date.parse(b.last) - Date.parse(a.last));
}
function solidsFormHtml() {
  const tried = foodsTried().slice(0, 12);
  return `<div class="log-form" id="solids-form">
    <div class="form-group"><label>Food</label><input class="form-input" id="sd-food" placeholder="e.g. Avocado, oatmeal" oninput="updateFirstTry()" autocomplete="off"/></div>
    ${tried.length ? `<div class="chip-row" style="margin:-6px 0 14px">${tried.map(f =>
      `<button type="button" class="chip ${f.reaction ? 'warn' : ''}" onclick="document.getElementById('sd-food').value=this.dataset.food;updateFirstTry()" data-food="${escHtml(f.name)}">${f.reaction ? '⚠️ ' : ''}${escHtml(f.name)}</button>`).join('')}</div>` : ''}
    <div class="form-group" id="sd-first-wrap" style="display:none"><span class="first-try">✨ First time trying</span></div>
    <div class="form-group"><label>How much</label>${chipsHtml('sd-amount', [['taste', 'A taste'], ['some', 'Some'], ['lots', 'Lots']], ['some'], true)}</div>
    <div class="form-group"><label>How it went</label>${chipsHtml('sd-reaction', [['liked', '😋 Liked it'], ['ok', '😐 OK'], ['disliked', '😖 Not keen'], ['reaction', '⚠️ Reaction']], ['liked'], true)}</div>
    <div class="form-group" id="sd-react-wrap" style="display:none"><label>What happened?</label>
      ${chipsHtml('sd-symptoms', [['rash', 'Rash / hives'], ['vomit', 'Vomiting'], ['swelling', 'Swelling'], ['diarrhea', 'Diarrhea'], ['breathing', 'Breathing trouble']])}
      <p class="safety-note">If your baby has trouble breathing or swelling of the face or lips, call emergency services right away.</p></div>
    <div class="form-row"><div class="form-group"><label>Time</label><input class="form-input" id="sd-time" type="time" value="${timeInputNow(0)}"/></div></div>
    <div class="form-group"><label>Notes</label><textarea class="form-input" id="sd-notes" placeholder="Texture, how it was prepared…"></textarea></div>
    <button class="btn-primary btn-full" onclick="saveSolids()">Save</button></div>`;
}
function updateFirstTry() {
  const v = document.getElementById('sd-food').value.trim().toLowerCase();
  const first = v && !foodsTried().some(f => f.name.toLowerCase() === v);
  document.getElementById('sd-first-wrap').style.display = first ? '' : 'none';
}
function initSolidsForm() {
  const r = document.getElementById('sd-reaction');
  if (r) r.addEventListener('change', () => { document.getElementById('sd-react-wrap').style.display = chipValues('sd-reaction')[0] === 'reaction' ? '' : 'none'; });
}
function saveSolids() {
  const food = document.getElementById('sd-food').value.trim();
  if (!food) { showToast('⚠️ What food was it?'); return; }
  const firstTry = !foodsTried().some(f => f.name.toLowerCase() === food.toLowerCase());
  const amount = chipValues('sd-amount')[0] || 'some', reaction = chipValues('sd-reaction')[0] || 'ok';
  const symptoms = reaction === 'reaction' ? chipValues('sd-symptoms') : [];
  const notes = document.getElementById('sd-notes').value.trim();
  const amountLabel = { taste: 'a taste', some: 'some', lots: 'lots' }[amount];
  const reactLabel = { liked: 'liked it', ok: 'OK', disliked: 'not keen', reaction: '⚠️ reaction' + (symptoms.length ? ' (' + symptoms.join(', ') + ')' : '') }[reaction];
  const detail = [food, amountLabel, reactLabel, firstTry ? 'first time' : '', notes].filter(Boolean).join(' · ');
  pushLog({ id: uid(), type: 'solids', icon: '🥕', title: firstTry ? 'Solids · new food' : 'Solids', detail,
            time: timeInputToDate(document.getElementById('sd-time').value).toISOString(), food, amount, reaction, symptoms, firstTry, notes });
}

// ── 🦷 Teething ──
// Universal letters A-T: upper A (right second molar) ... J (left second molar),
// lower K (left second molar) ... T (right second molar).
const TEETH_UPPER = [['A', 'Upper right second molar'], ['B', 'Upper right first molar'], ['C', 'Upper right canine'], ['D', 'Upper right lateral incisor'], ['E', 'Upper right central incisor'],
  ['F', 'Upper left central incisor'], ['G', 'Upper left lateral incisor'], ['H', 'Upper left canine'], ['I', 'Upper left first molar'], ['J', 'Upper left second molar']];
const TEETH_LOWER = [['T', 'Lower right second molar'], ['S', 'Lower right first molar'], ['R', 'Lower right canine'], ['Q', 'Lower right lateral incisor'], ['P', 'Lower right central incisor'],
  ['O', 'Lower left central incisor'], ['N', 'Lower left lateral incisor'], ['M', 'Lower left canine'], ['L', 'Lower left first molar'], ['K', 'Lower left second molar']];
const TOOTH_NAME = Object.fromEntries([...TEETH_UPPER, ...TEETH_LOWER]);
function teethIn() {
  const map = {};
  logs.forEach(l => { if (l.type === 'tooth' && l.tooth && (!map[l.tooth] || Date.parse(l.time) < Date.parse(map[l.tooth]))) map[l.tooth] = l.time; });
  return map;
}
let selectedTooth = null;
function pickTooth(t) {
  if (teethIn()[t]) { showToast(`🦷 ${TOOTH_NAME[t]} — already in`); return; }
  selectedTooth = selectedTooth === t ? null : t;
  document.querySelectorAll('.tooth').forEach(b => { b.classList.toggle('picked', b.dataset.t === selectedTooth); b.setAttribute('aria-pressed', b.dataset.t === selectedTooth); });
  document.getElementById('th-picked').textContent = selectedTooth ? `New tooth: ${TOOTH_NAME[selectedTooth]}` : 'Tap a tooth if a new one came through';
}
function teethFormHtml() {
  selectedTooth = null;
  const have = teethIn(), n = Object.keys(have).length;
  const row = list => `<div class="teeth-row">${list.map(([t, name]) =>
    `<button type="button" class="tooth ${have[t] ? 'in' : ''}" data-t="${t}" onclick="pickTooth('${t}')" aria-pressed="false"
      aria-label="${name}${have[t] ? ', in since ' + new Date(have[t]).toLocaleDateString() : ''}" title="${name}"></button>`).join('')}</div>`;
  return `<div class="log-form" id="teeth-form">
    <div class="teeth-chart" aria-label="Tooth chart">
      <div class="teeth-label">Upper</div>${row(TEETH_UPPER)}${row(TEETH_LOWER)}<div class="teeth-label">Lower</div>
    </div>
    <div class="teeth-count">${n} of 20 teeth in</div>
    <div class="teeth-picked" id="th-picked">Tap a tooth if a new one came through</div>
    <div class="form-group"><label>Symptoms</label>${chipsHtml('th-symptoms', [['drooling', 'Drooling'], ['fussy', 'Fussy'], ['chewing', 'Chewing'], ['sleep', 'Poor sleep'], ['gums', 'Swollen gums'], ['temp', 'Mild temperature']])}</div>
    <div class="form-row"><div class="form-group"><label>Date</label><input class="form-input" id="th-date" type="date" value="${todayInput()}" max="${todayInput()}"/></div>
      <div class="form-group"><label>Time</label><input class="form-input" id="th-time" type="time" value="${timeInputNow(0)}"/></div></div>
    <div class="form-group"><label>Notes</label><textarea class="form-input" id="th-notes" placeholder="Remedies that helped…"></textarea></div>
    <button class="btn-primary btn-full" onclick="saveTeething()">Save</button></div>`;
}
function saveTeething() {
  const symptoms = chipValues('th-symptoms'), notes = document.getElementById('th-notes').value.trim();
  if (!selectedTooth && !symptoms.length && !notes) { showToast('⚠️ Tap a tooth or pick a symptom'); return; }
  const labels = { drooling: 'drooling', fussy: 'fussy', chewing: 'chewing', sleep: 'poor sleep', gums: 'swollen gums', temp: 'mild temperature' };
  const detail = [selectedTooth ? 'New tooth: ' + TOOTH_NAME[selectedTooth] : '', symptoms.map(s => labels[s]).join(', '), notes].filter(Boolean).join(' · ');
  const n = Object.keys(teethIn()).length + (selectedTooth ? 1 : 0);
  pushLog({ id: uid(), type: 'tooth', icon: '🦷', title: selectedTooth ? `New tooth! (${n} of 20)` : 'Teething', detail,
            time: dateTimeToIso(document.getElementById('th-date').value, document.getElementById('th-time').value),
            tooth: selectedTooth || null, symptoms, notes });
}

// ── For the pediatrician report ──
function healthReportData() {
  const vaccines = logs.filter(l => l.type === 'health' && l.healthKind === 'vaccine').slice(0, 10);
  const visits = logs.filter(l => l.type === 'health' && l.healthKind === 'visit').slice(0, 6);
  const foods = foodsTried();
  return { vaccines, visits, foods, reactions: foods.filter(f => f.reaction), teeth: Object.keys(teethIn()).length };
}


// =======================================
