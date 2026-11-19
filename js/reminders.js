// Lumaby — Push reminders (settings and device registration).
// One part of the app script, loaded in order by index.html. All parts share one
// global scope; run `node tools/check-split.js` after moving code between files.
//  SMART REMINDERS
// =====================================================
const REMINDER_DEFAULTS = {
  feedEnabled: true, feedMode: 'auto', feedInterval: 3, feedNight: true,
  napEnabled: true, napWindow: 2,
  medsEnabled: false, medsTimes: ['08:00'],
  bathEnabled: false, bathDays: 2,
  growthEnabled: true, growthWeeks: 4,
  apptEnabled: true,
};
const storedReminders = STORE.get('reminders') || {};
let reminders = { ...REMINDER_DEFAULTS, ...storedReminders };
// older settings had a single medsTime
if (!Array.isArray(storedReminders.medsTimes) || !storedReminders.medsTimes.length) {
  reminders.medsTimes = [storedReminders.medsTime || '08:00'];
}
delete reminders.medsTime;
function saveReminders() { STORE.set('reminders', reminders); }

function fmtHours(h) {
  h = Number(h);
  if (h < 1) return `${Math.round(h * 60)} min`;
  const whole = Math.floor(h), half = h - whole >= 0.5;
  return `${whole}${half ? '½' : ''} h`;
}
function fmtTime12(t) {
  const [hh, mm] = (t || '08:00').split(':').map(Number);
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}
function selectHtml(onchange, value, options) {
  return `<select class="form-input reminder-select" onchange="${onchange}">` +
    options.map(([v, label]) => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${label}</option>`).join('') +
    '</select>';
}

// Change one setting, save it (locally and to the server) and redraw.
function setReminder(key, value) {
  reminders[key] = value;
  saveReminders();
  renderRemindersBody();
}
function setMedsTime(i, value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return;
  reminders.medsTimes[i] = value;
  reminders.medsTimes.sort();
  saveReminders();
  renderRemindersBody();
}
function addMedsTime() {
  if (reminders.medsTimes.length >= 4) return;
  // Suggest a time that isn't taken: 12h after the last one, else 6h, 4h...
  const last = reminders.medsTimes[reminders.medsTimes.length - 1] || '08:00';
  const shift = h => String((Number(last.slice(0, 2)) + h) % 24).padStart(2, '0') + last.slice(2);
  const next = [12, 6, 4, 8, 3, 9, 2, 10, 1, 11].map(shift).find(t => !reminders.medsTimes.includes(t));
  if (!next) return;
  setReminder('medsTimes', [...reminders.medsTimes, next].sort());
}
function removeMedsTime(i) {
  if (reminders.medsTimes.length <= 1) return;
  setReminder('medsTimes', reminders.medsTimes.filter((_, j) => j !== i));
}

function showRemindersModal() {
  if (!isPremium) { openModal('modal-upgrade'); return; }
  renderRemindersBody();
  openModal('modal-reminders');
}

function renderRemindersBody() {
  const body = document.getElementById('reminders-modal-body');
  if (!body) return;
  const r = reminders;
  const hours = (list) => list.map(h => [h, fmtHours(h)]);

  const feedSub = r.feedMode === 'fixed'
    ? `Every ${fmtHours(r.feedInterval)} after the last feed`
    : 'When the next feed is due, based on your recent feeds';
  const feedOptions = `
    ${selectHtml("setReminder('feedMode', this.value === 'auto' ? 'auto' : 'fixed'); if (this.value !== 'auto') setReminder('feedInterval', Number(this.value))",
      r.feedMode === 'fixed' ? r.feedInterval : 'auto',
      [['auto', 'Learn from my logs'], ...hours([1.5, 2, 2.5, 3, 3.5, 4, 5, 6]).map(([v, l]) => [v, 'Every ' + l])])}
    <label class="reminder-check"><input type="checkbox" ${r.feedNight !== false ? 'checked' : ''}
      onchange="setReminder('feedNight', this.checked)"/> Remind me overnight (10pm–6am)</label>`;

  const napOptions = selectHtml("setReminder('napWindow', Number(this.value))", r.napWindow,
    hours([0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4]).map(([v, l]) => [v, l + ' awake']));

  const medsOptions = `
    ${r.medsTimes.map((t, i) => `
      <div class="reminder-time-row">
        <input type="time" class="form-input reminder-select" value="${t}" onchange="setMedsTime(${i}, this.value)"/>
        ${r.medsTimes.length > 1 ? `<button class="reminder-link" onclick="removeMedsTime(${i})" aria-label="Remove ${fmtTime12(t)}">Remove</button>` : ''}
      </div>`).join('')}
    ${r.medsTimes.length < 4 ? '<button class="reminder-link" onclick="addMedsTime()">+ Add another time</button>' : ''}`;

  const bathOptions = selectHtml("setReminder('bathDays', Number(this.value))", r.bathDays,
    [1, 2, 3, 4, 5, 6, 7].map(d => [d, d === 1 ? 'Every day' : `Every ${d} days`]));
  const growthOptions = selectHtml("setReminder('growthWeeks', Number(this.value))", r.growthWeeks,
    [1, 2, 3, 4, 6, 8].map(w => [w, w === 1 ? 'Every week' : `Every ${w} weeks`]));

  body.innerHTML = `
    <p style="font-size:13px;color:var(--text-light);margin-bottom:20px;line-height:1.6">
      Lumaby reminds you at the right times, even when the app is closed.
      ${(typeof Notification !== 'undefined' && Notification.permission === 'granted') ? '<br><strong>🔔 Notifications are on for this device.</strong>' : ''}
    </p>
    <div class="reminders-card">
      ${renderReminderRow('feedEnabled', '🍼', 'Feed reminder', feedSub, feedOptions)}
      ${renderReminderRow('napEnabled', '😴', 'Nap reminder', `After ${fmtHours(r.napWindow)} awake (7am–8pm)`, napOptions)}
      ${renderReminderRow('medsEnabled', '💊', 'Medicine reminder', 'Daily at ' + r.medsTimes.map(fmtTime12).join(', '), medsOptions)}
      ${renderReminderRow('bathEnabled', '🛁', 'Bath reminder', r.bathDays === 1 ? 'Every day' : `Every ${r.bathDays} days`, bathOptions)}
      ${renderReminderRow('growthEnabled', '📏', 'Growth check', r.growthWeeks === 1 ? 'Every week' : `Every ${r.growthWeeks} weeks`, growthOptions)}
      ${renderReminderRow('apptEnabled', '📅', 'Doctor appointments', 'At the times you pick when adding one (Doctor → Upcoming)', '')}
    </div>
    <button class="btn-primary btn-full" onclick="saveAndScheduleReminders()">
      Save & Enable Reminders
    </button>`;
}

function renderReminderRow(key, icon, label, sub, options) {
  const on = !!reminders[key];
  return `
    <div class="reminder-row">
      <div class="reminder-icon">${icon}</div>
      <div class="reminder-info">
        <div class="reminder-label">${label}</div>
        <div class="reminder-sub">${sub}</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" ${on ? 'checked' : ''} aria-label="${label}"
          onchange="setReminder('${key}', this.checked)"/>
        <span class="toggle-slider"></span>
      </label>
    </div>
    ${on && options ? `<div class="reminder-options">${options}</div>` : ''}`;
}

// Reminders are sent by the server as push notifications (Netlify
// function send-reminders, every 5 minutes), so they arrive even when the
// app is closed. The app only registers this device and saves settings.
const VAPID_PUBLIC_KEY = 'BN4d2CGS7lNSzUDqwonX085a9IGWpDmvNeMkoHuO6HJMzFWxSzfhz9XedFOaxpu76HmXEoJB18QKM65cDDsWLT8';

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function isIosBrowserTab() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone;
}
function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function saveReminderSettingsRemote() {
  if (!supabaseClient || !currentUser) return;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const { error } = await supabaseClient.from('reminder_settings').upsert(
    { user_id: currentUser.id, settings: reminders, tz, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) console.warn('[Lumaby] Saving reminder settings failed:', error.message);
}

async function savePushSubscription(sub) {
  const j = sub.toJSON();
  const { error } = await supabaseClient.from('push_subscriptions').upsert({
    endpoint: j.endpoint, user_id: currentUser.id, p256dh: j.keys.p256dh, auth: j.keys.auth,
    user_agent: navigator.userAgent.slice(0, 200),
  }, { onConflict: 'endpoint' });
  if (error) throw error;
}

// Ask for permission, subscribe this device, save it and the settings.
async function enablePushReminders() {
  if (!supabaseClient || !currentUser) { showToast('Sign in to turn on reminders'); return false; }
  if (isIosBrowserTab()) {
    alert('On iPhone and iPad, reminders work once Lumaby is on your Home Screen.\n\nTap the Share button, then "Add to Home Screen", open Lumaby from there, and turn reminders on again.');
    return false;
  }
  if (!pushSupported()) { showToast('This browser can\'t show reminders. Try Chrome, Edge, Firefox or Safari.'); return false; }
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') { showToast('🔕 Notifications are blocked. Allow them for this site in your browser settings.'); return false; }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    await savePushSubscription(sub);
    await saveReminderSettingsRemote();
    return true;
  } catch (e) {
    console.warn('[Lumaby] Push subscription failed:', e);
    showToast('⚠️ Couldn\'t turn on reminders on this device. Please try again.');
    return false;
  }
}

async function saveAndScheduleReminders() {
  saveReminders();
  const ok = await enablePushReminders();
  closeModal('modal-reminders');
  if (ok) showToast('🔔 Reminders on — they\'ll arrive even when Lumaby is closed');
}

// Called on app start: keep this device's subscription and the settings
// current (subscriptions can change). Never prompts.
async function scheduleAllReminders() {
  if (!supabaseClient || !currentUser || !isPremium || !pushSupported()) return;
  if (Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await savePushSubscription(sub);
    await saveReminderSettingsRemote();
  } catch (e) { console.warn('[Lumaby] Refreshing push subscription failed:', e.message || e); }
}

// Remove this device's subscription (on sign out), so reminders for this
// account stop here and another account can use the device.
async function removePushSubscriptionForDevice() {
  if (!supabaseClient || !currentUser || !pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await supabaseClient.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch (e) { /* best effort */ }
}

// Toggling a reminder updates the server copy too.
let reminderSaveTimer = null;
const _remOrigSaveReminders = saveReminders;
saveReminders = function () {
  _remOrigSaveReminders();
  clearTimeout(reminderSaveTimer);
  reminderSaveTimer = setTimeout(saveReminderSettingsRemote, 800);
};

// =====================================================
//  PARTNER SHARING
// =====================================================
// =====================================================
