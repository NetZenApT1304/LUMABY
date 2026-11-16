// Lumaby — Accessibility: labels, keyboard access, dialogs.
// Loaded last. Works on whatever the app renders (including forms built
// later), so new screens get the same treatment without extra code.

// ── Form labels ──
// Forms use <label> next to their field without for="…". Connect them, and
// name any remaining field from its placeholder so screen readers don't just
// say "edit text".
let a11yIdSeq = 0;
function a11yId(el) { if (!el.id) el.id = 'a11y-' + (++a11yIdSeq); return el.id; }
function linkLabels(root) {
  root.querySelectorAll('label:not([for])').forEach(label => {
    if (label.querySelector('input,select,textarea')) return; // already wraps its field
    const group = label.closest('.form-group, .feed-row');
    const field = group && [...group.querySelectorAll('input,select,textarea')].find(f => f.type !== 'checkbox' || !f.closest('.toggle-switch'));
    if (field && !document.querySelector(`label[for="${field.id}"]`)) label.htmlFor = a11yId(field);
    else if (group) {
      // a label for a group of chips
      const chips = group.querySelector('.chip-row, .seg');
      if (chips && !chips.getAttribute('aria-labelledby')) { chips.setAttribute('role', 'group'); chips.setAttribute('aria-labelledby', a11yId(label)); }
    }
  });
  root.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(f => {
    if (f.labels?.length || f.getAttribute('aria-label') || f.getAttribute('aria-labelledby')) return;
    const reminderRow = f.closest('.reminder-options')?.previousElementSibling;
    const name = f.placeholder
      || (reminderRow?.classList.contains('reminder-row') && reminderRow.querySelector('.reminder-label')?.textContent + (f.type === 'time' ? ' time' : ' setting'))
      || f.closest('.toggle-switch')?.closest('.reminder-row')?.querySelector('.reminder-label')?.textContent;
    if (name) f.setAttribute('aria-label', name.trim());
  });
}

// ── Keyboard access for tappable boxes ──
// Many controls are <div onclick>. Give them a button role and make them
// focusable; Enter and Space activate them (see the keydown handler below).
const NATIVE = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'SUMMARY']);
function makeClickablesAccessible(root) {
  root.querySelectorAll('[onclick]').forEach(el => {
    if (NATIVE.has(el.tagName) || el.classList.contains('modal-overlay') || el.hasAttribute('data-a11y')) return;
    el.setAttribute('data-a11y', '');
    if (!el.getAttribute('role')) el.setAttribute('role', 'button');
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    // emoji-only controls need a name
    const text = (el.innerText || '').replace(/\p{Extended_Pictographic}|️/gu, '').trim();
    if (!text && !el.getAttribute('aria-label')) {
      const name = el.id === 'avatar' || el.classList.contains('baby-avatar') ? 'Profile and settings' : el.title || '';
      if (name) el.setAttribute('aria-label', name);
    }
  });
  // sideways-scrolling rows must be reachable by keyboard
  root.querySelectorAll('#dayStrip, .book-preview-strip, #babySwitcher').forEach(el => {
    if (!el.hasAttribute('tabindex') && el.scrollWidth > el.clientWidth) el.tabIndex = 0;
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', { dayStrip: 'Days', babySwitcher: 'Babies' }[el.id] || 'Chapters');
  });
  const fab = document.getElementById('fab');
  if (fab && !fab.getAttribute('aria-label')) fab.setAttribute('aria-label', 'Log something');
}
document.addEventListener('keydown', e => {
  const el = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && el.getAttribute?.('role') === 'button' && !NATIVE.has(el.tagName)) {
    e.preventDefault(); el.click();
  }
});

// ── Dialogs ──
// Popups are announced as dialogs, take focus when they open, keep Tab
// inside, close with Escape and give focus back to whatever opened them.
const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const dialogOpeners = {};
function setUpDialogs() {
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    const box = ov.querySelector('.modal'); if (!box || box.getAttribute('role')) return;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.tabIndex = -1;
    // a popup that scrolls but has nothing focusable must itself be focusable,
    // so keyboard users can scroll it
    new MutationObserver(() => { box.tabIndex = box.querySelector(FOCUSABLE.replace(',[tabindex]:not([tabindex="-1"])', '')) ? -1 : 0; })
      .observe(box, { childList: true, subtree: true });
    const title = box.querySelector('.modal-title');
    if (title) box.setAttribute('aria-labelledby', a11yId(title));
  });
}
function topOpenDialog() { const open = [...document.querySelectorAll('.modal-overlay.open')]; return open[open.length - 1] || null; }

const _a11yOrigOpenModal = openModal;
openModal = function (id) {
  const already = document.getElementById(id)?.classList.contains('open');
  if (!already) dialogOpeners[id] = document.activeElement;
  _a11yOrigOpenModal(id);
  setTimeout(() => {
    const ov = document.getElementById(id); if (!ov || !ov.classList.contains('open')) return;
    if (ov.contains(document.activeElement)) return;
    const box = ov.querySelector('.modal') || ov;
    const first = [...box.querySelectorAll(FOCUSABLE)].find(el => el.offsetParent !== null && !el.closest('.modal-title'));
    (first && first.tagName !== 'SELECT' && !first.matches('input,textarea') ? first : box).focus({ preventScroll: true });
  }, 60);
};
const _a11yOrigCloseModal = closeModal;
closeModal = function (id) {
  const wasOpen = document.getElementById(id)?.classList.contains('open');
  _a11yOrigCloseModal(id);
  const back = dialogOpeners[id]; delete dialogOpeners[id];
  if (wasOpen && back && document.contains(back) && !topOpenDialog()) back.focus?.({ preventScroll: true });
};
document.addEventListener('keydown', e => {
  const ov = topOpenDialog(); if (!ov) return;
  if (e.key === 'Escape') { e.preventDefault(); closeModal(ov.id); return; }
  if (e.key !== 'Tab') return;
  const items = [...ov.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || !ov.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !ov.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
});

// Toasts are read out by screen readers
const _a11yOrigShowToast = showToast;
showToast = function (msg) {
  _a11yOrigShowToast(msg);
  const t = document.querySelector('.toast'); if (t) { t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); }
};

// ── Apply now and whenever the app renders something new ──
function applyA11y() { linkLabels(document); makeClickablesAccessible(document); setUpDialogs(); }
let a11yTimer = null;
new MutationObserver(() => { clearTimeout(a11yTimer); a11yTimer = setTimeout(applyA11y, 30); })
  .observe(document.body, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', applyA11y);
applyA11y();
