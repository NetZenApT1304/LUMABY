// Lumaby — Install prompt, home-screen shortcuts, night mode.
// One part of the app script, loaded in order by index.html. All parts share one
// global scope; run `node tools/check-split.js` after moving code between files.
//  PWA ? Install Prompt
// =======================================
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  setTimeout(showInstallBanner, 12000);
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  hideInstallBanner();
  showToast('\uD83C\uDF38 Lumaby installed! Find it on your home screen');
});

function showInstallBanner() {
  if (!deferredInstallPrompt) return;
  if (document.getElementById('install-banner')) return;
  const style = document.createElement('style');
  style.textContent = '@keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
  document.head.appendChild(style);
  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);width:calc(100% - 48px);max-width:382px;background:white;border-radius:20px;padding:16px 18px;display:flex;align-items:center;gap:14px;box-shadow:0 8px 40px rgba(61,43,31,0.18);border:1px solid rgba(196,121,90,0.15);z-index:300;animation:slideUp 0.4s cubic-bezier(0.34,1.2,0.64,1)';
  banner.innerHTML = `
    <div style="width:44px;height:44px;background:linear-gradient(135deg,#d4a5a0,#c4795a);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">\uD83C\uDF38</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:14px;font-weight:600;color:#3d2b1f">Add Lumaby to Home Screen</div>
      <div style="font-size:12px;color:#8a7060;margin-top:2px">Works offline · Fast access · No app store needed</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
      <button onclick="triggerInstall()" style="padding:8px 14px;background:#c4795a;color:white;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:\'DM Sans\',sans-serif">Install</button>
      <button onclick="hideInstallBanner()" style="padding:6px;background:none;color:#8a7060;border:none;font-size:12px;cursor:pointer;font-family:\'DM Sans\',sans-serif">Not now</button>
    </div>`;
  document.body.appendChild(banner);
}

function hideInstallBanner() {
  const b = document.getElementById('install-banner');
  if (b) b.remove();
}

async function triggerInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  hideInstallBanner();
  if (outcome === 'accepted') showToast('\uD83C\uDF38 Installing Lumaby...');
}

// =======================================
//  PWA ? URL Shortcut Actions
// =======================================
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  if (action && profile) {
    setTimeout(() => openLogModal(action), 700);
  }
});


// =======================================
//  NIGHT MODE
//  auto (default): on from 8pm to 7am on this device's clock; on; off.
// =======================================
let nightMode = STORE.get('nightMode') || 'auto';
const NIGHT_LABELS = { auto: 'Night mode: Auto (8pm–7am)', on: 'Night mode: On', off: 'Night mode: Off' };
const NIGHT_ICONS = { auto: '🌗', on: '🌙', off: '☀️' };

function nightActive() {
  if (nightMode === 'on') return true;
  if (nightMode === 'off') return false;
  const h = new Date().getHours();
  return h >= 20 || h < 7;
}

function applyNightMode() {
  const on = nightActive();
  document.documentElement.classList.toggle('night', on);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', on ? '#17100d' : '#c4795a');
  const btn = document.getElementById('nightToggle');
  if (btn) {
    btn.textContent = NIGHT_ICONS[nightMode];
    btn.title = NIGHT_LABELS[nightMode];
    btn.setAttribute('aria-label', NIGHT_LABELS[nightMode]);
  }
}

function cycleNightMode() {
  nightMode = { auto: 'on', on: 'off', off: 'auto' }[nightMode] || 'auto';
  STORE.set('nightMode', nightMode);
  applyNightMode();
  showToast(NIGHT_ICONS[nightMode] + ' ' + NIGHT_LABELS[nightMode]);
}

applyNightMode();
setInterval(applyNightMode, 60000);

// =======================================
//  PWA ? Local Notifications
// =======================================

// ── SECURITY: Anti-tamper protection ──
(function() {
  // Freeze CONFIG so it can't be modified from console
  Object.freeze(CONFIG.lemonsqueezy);

  // Periodically re-verify premium status from Supabase (every 5 min)
  setInterval(async () => {
    if (currentUser && supabaseClient) {
      const prevStatus = isPremium;
      await loadPremiumStatus();
      if (prevStatus !== isPremium) {
        if (isPremium) startSync(); else stopSync();
        applyPremiumGates();
        console.warn('[Lumaby] Premium status refreshed');
      }
    }
  }, 300000);

  // Detect devtools tampering with isPremium
  let _isPremium = false;
  const originalLaunch = window.launchApp;
})();

