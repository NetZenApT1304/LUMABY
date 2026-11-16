// Lumaby — Supabase client, sign-in, Premium gating, checkout, export.
// One part of the app script, loaded in order by index.html. All parts share one
// global scope; run `node tools/check-split.js` after moving code between files.
//  CONFIG ? Replace with your own keys
// =======================================
const CONFIG = {
  supabase: {
    url: 'https://pduixzudfizustabthwu.supabase.co',           // e.g. https://abcxyz.supabase.co
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkdWl4enVkZml6dXN0YWJ0aHd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3ODYxMjAsImV4cCI6MjA5NDM2MjEyMH0.vLd_SH9Bn33Kh1dnehtdMaHugoyThYTbNQEjoKIr2YE',  // from Supabase dashboard → Settings → API
  },
  lemonsqueezy: {
    monthlyUrl: 'https://lumaby.lemonsqueezy.com/checkout/buy/58fa4d1f-38f3-4c8a-8a9c-f18105756ed0',
    yearlyUrl:  'https://lumaby.lemonsqueezy.com/checkout/buy/0aabdd0e-e531-4e18-9528-cfa537b779ec',
  },
  // Your Netlify function URLs (set up in Step 3 of README)
  functions: {}
};

// =======================================
//  SUPABASE CLIENT
// =======================================
let supabaseClient = null;
let currentUser = null;
let isPremium = false;
let selectedPlan = 'monthly';

function initSupabase() {
  try {
    if (!CONFIG.supabase.url || CONFIG.supabase.url.includes('YOUR_SUPABASE')) {
      console.warn('[Lumaby] Supabase not configured — running in local mode');
      return false;
    }
    supabaseClient = window.supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);
    return true;
  } catch(e) {
    console.warn('[Lumaby] Supabase init failed:', e);
    return false;
  }
}

// =======================================
//  AUTH FLOW
// =======================================
let authTab = 'signin';

function switchAuthTab(tab) {
  authTab = tab;
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('auth-submit-btn').textContent = tab === 'signin' ? 'Sign In' : 'Create Account';
  const nameField = document.getElementById('auth-name-field');
  if (nameField) nameField.style.display = tab === 'signup' ? 'block' : 'none';
  clearAuthError();
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.add('visible');
}
function clearAuthError() {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = ''; el.classList.remove('visible'); }
}

// Rate limiting store
const RATE_LIMITS = {};
function checkRateLimit(key, maxAttempts = 5, windowMs = 300000) {
  const now = Date.now();
  if (!RATE_LIMITS[key]) RATE_LIMITS[key] = [];
  // Remove old attempts outside window
  RATE_LIMITS[key] = RATE_LIMITS[key].filter(t => now - t < windowMs);
  if (RATE_LIMITS[key].length >= maxAttempts) {
    const waitMs = windowMs - (now - RATE_LIMITS[key][0]);
    const waitMin = Math.ceil(waitMs / 60000);
    return { blocked: true, message: `Too many attempts. Try again in ${waitMin} minute${waitMin > 1 ? 's' : ''}.` };
  }
  RATE_LIMITS[key].push(now);
  return { blocked: false };
}

// Input sanitization
function sanitizeInput(str) {
  if (!str) return '';
  return str.replace(/[<>'"&]/g, c => ({'<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;','&':'&amp;'}[c]));
}

// Anti-tamper: verify isPremium against Supabase on sensitive actions
async function verifyPremium() {
  if (!supabaseClient || !currentUser) return false;
  await loadPremiumStatus();
  return isPremium;
}

async function submitAuth() {
  if (!supabaseClient) { skipAuth(); return; }
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  
  // Rate limit by email
  const rl = checkRateLimit(`auth_${email}`, 5, 300000); // 5 attempts per 5 min
  if (rl.blocked) {
    showAuthError(rl.message);
    return;
  }
  
  // Sanitize inputs
  if (!email || !email.includes('@') || email.length > 254) {
    showAuthError('Please enter a valid email address.');
    return;
  }
  if (!password || password.length < 6) {
    showAuthError('Password must be at least 6 characters.');
    return;
  }
  const btn = document.getElementById('auth-submit-btn');

  if (!email || !password) { showAuthError('Please enter your email and password.'); return; }
  if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }

  btn.innerHTML = '<span class="spinner"></span> Loading...';
  btn.disabled = true;
  clearAuthError();

  try {
    let result;
    if (authTab === 'signup') {
      const name = document.getElementById('auth-name')?.value.trim() || '';
      result = await supabaseClient.auth.signUp({
        email, password,
        options: { data: { full_name: name } }
      });
      if (!result.error && result.data.user && !result.data.session) {
        btn.innerHTML = 'Sign In'; btn.disabled = false;
        showAuthError('✅ Check your email to confirm your account, then sign in.');
        return;
      }
    } else {
      result = await supabaseClient.auth.signInWithPassword({ email, password });
    }

    if (result.error) throw result.error;
    await handleAuthSuccess(result.data.user);
  } catch(e) {
    btn.innerHTML = authTab === 'signin' ? 'Sign In' : 'Create Account';
    btn.disabled = false;
    showAuthError(e.message || 'Something went wrong. Please try again.');
  }
}

async function signInWithGoogle() {
  if (!supabaseClient) { skipAuth(); return; }
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (error) throw error;
  } catch(e) {
    showAuthError(e.message || 'Google sign-in failed.');
  }
}

function skipAuth() {
  const authEl = document.getElementById('auth-screen');
  if (authEl) { authEl.style.cssText = 'display:none!important'; authEl.classList.remove('visible'); }
  currentUser = null;
  isPremium = false;
  if (!profile) {
    document.getElementById('mainApp').style.display = 'none';
    const ob = document.getElementById('onboarding');
    ob.style.cssText = '';
    ob.classList.remove('hidden');
    const dob = new Date();
    dob.setMonth(dob.getMonth() - 4);
    const dobEl = document.getElementById('ob-dob');
    if (dobEl && !dobEl.value) dobEl.value = dob.toISOString().split('T')[0];
  } else {
    launchApp();
  }
}

async function handleAuthSuccess(user) {
  currentUser = user;
  document.getElementById('auth-screen').classList.remove('visible');

  // Load premium status from Supabase
  await loadPremiumStatus();

  // Sync profile from Supabase if exists
  await syncProfile();

  if (!profile) {
    document.getElementById('onboarding').classList.remove('hidden');
  } else {
    launchApp();
  }
}

async function loadPremiumStatus() {
  if (!supabaseClient || !currentUser) { isPremium = false; return; }
  // Never trust localStorage for premium status - always check Supabase
  try {
    const { data, error } = await supabaseClient
      .from('subscriptions')
      .select('status, plan, expires_at')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (error) console.warn('[Lumaby] Premium check failed:', error.message || error);
    if (error || !data) { isPremium = false; return; }

    // 'cancelled' means the subscription won't renew; premium lasts until expires_at.
    const notExpired = !data.expires_at || new Date(data.expires_at) > new Date();
    isPremium = (['active', 'trialing'].includes(data.status) && notExpired) ||
      (data.status === 'cancelled' && !!data.expires_at && notExpired);

    console.log('[Lumaby] Premium status:', isPremium, data.status);
  } catch(e) {
    console.warn('[Lumaby] Could not load premium status:', e);
    isPremium = false;
  }
}

async function syncProfile() {
  if (!supabaseClient || !currentUser) return;
  try {
    const { data } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    if (data) {
      profile = { parent: data.parent_name, baby: data.baby_name, dob: data.baby_dob, emoji: data.baby_emoji || '🌙' };
      saveProfile();
    }
  } catch(e) { /* profile not found, will be created on onboarding */ }
}

async function saveProfileToSupabase() {
  if (!supabaseClient || !currentUser || !profile) return;
  try {
    await supabaseClient.from('profiles').upsert({
      user_id: currentUser.id,
      parent_name: profile.parent,
      baby_name: profile.baby,
      baby_dob: profile.dob,
      baby_emoji: profile.emoji,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  } catch(e) { console.warn('[Lumaby] Profile sync failed:', e); }
}

// =======================================
//  PREMIUM GATING
// =======================================
const PREMIUM_FEATURES = ['insights', 'growth-percentiles', 'export', 'partner-sync', 'unlimited-history'];

function checkPremium(feature) {
  if (isPremium) return true;
  // Free tier limits
  if (feature === 'insights-basic') return true; // basic insights are free
  openModal('modal-upgrade');
  return false;
}

// Gate elements with data-premium attribute
function applyPremiumGates() {
  if (isPremium) {
    // Remove all premium lock overlays. Only re-render if there were locks:
    // renderInsights/renderGrowth/... call this function themselves, so an
    // unconditional re-render here recursed forever for Premium users.
    const hadGates = document.querySelectorAll('.premium-gate').length > 0;
    document.querySelectorAll('.premium-gate').forEach(el => el.remove());
    document.querySelectorAll('.insight-card, .growth-card').forEach(card => {
      card.style.position = '';
      card.style.overflow = '';
    });
    // Re-render active screen with premium content
    const active = hadGates && document.querySelector('.screen.active');
    if (active) {
      const name = active.id.replace('screen-', '');
      if (name === 'insights') renderInsights();
      if (name === 'growth') renderGrowth();
      if (name === 'schedule') renderSchedule();
      if (name === 'book') renderBook();
    }
    // Update UI
    if (typeof renderBabySwitcher === 'function') renderBabySwitcher();
    updatePremiumBadge();
  } else {
    // Add lock overlays for non-premium users
    setTimeout(() => {
      // Temperature stays free: fever tracking is a safety feature.
      document.querySelectorAll('.insight-card:nth-child(n+3):not(#temp-insights)').forEach(card => {
        if (card.querySelector('.premium-gate')) return;
        card.style.position = 'relative';
        card.style.overflow = 'hidden';
        const gate = document.createElement('div');
        gate.className = 'premium-gate';
        gate.innerHTML = `<div class="pg-icon">🔒</div><div class="pg-title">Premium Feature</div><div class="pg-sub">Unlock with Lumaby Premium</div><button class="pg-btn" onclick="openModal('modal-upgrade')">Upgrade</button>`;
        card.appendChild(gate);
      });
      document.querySelectorAll('.growth-card:nth-child(n+2)').forEach(card => {
        if (card.querySelector('.premium-gate')) return;
        card.style.position = 'relative';
        card.style.overflow = 'hidden';
        const gate = document.createElement('div');
        gate.className = 'premium-gate';
        gate.innerHTML = `<div class="pg-icon">📈</div><div class="pg-title">Growth Percentiles</div><div class="pg-sub">Compare with WHO standards</div><button class="pg-btn" onclick="openModal('modal-upgrade')">Unlock</button>`;
        card.appendChild(gate);
      });
    }, 100);
    updatePremiumBadge();
  }
}


function updatePremiumBadge() {
  const existing = document.querySelector('.premium-badge');
  if (existing) existing.remove();
  if (isPremium) {
    const heading = document.querySelector('#greeting');
    if (heading) {
      const badge = document.createElement('span');
      badge.className = 'premium-badge';
      badge.textContent = '✨ Premium';
      heading.after(badge);
    }
  }
}

// Free tier: cap logs at 30 days
function getLogsForDate(date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  const end = new Date(d); end.setHours(23,59,59,999);

  // Free tier: only show last 30 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  if (!isPremium && d < cutoff) return [];

  return logs
    .filter(l => { const t = new Date(l.time); return t >= d && t <= end; })
    .sort((a,b) => new Date(b.time) - new Date(a.time));
}

// =======================================
//  STRIPE CHECKOUT
// =======================================
function selectPlan(plan) {
  selectedPlan = plan;
  document.getElementById('plan-monthly').classList.toggle('selected', plan === 'monthly');
  document.getElementById('plan-yearly').classList.toggle('selected', plan === 'yearly');
  const btn = document.getElementById('upgrade-btn');
  if (plan === 'yearly') {
    btn.textContent = 'Start 7-day free trial · $35.99/yr';
  } else {
    btn.textContent = 'Start 7-day free trial';
  }
}

async function startCheckout() {
  if (!currentUser) {
    closeModal('modal-upgrade');
    document.getElementById('auth-screen').classList.add('visible');
    showToast('✉️ Please sign in first to subscribe');
    return;
  }

  const url = selectedPlan === 'yearly'
    ? CONFIG.lemonsqueezy.yearlyUrl
    : CONFIG.lemonsqueezy.monthlyUrl;

  const checkoutUrl = new URL(url);
  checkoutUrl.searchParams.set('checkout[email]', currentUser.email);
  checkoutUrl.searchParams.set('checkout[custom][user_id]', currentUser.id);
  checkoutUrl.searchParams.set('checkout[redirect_url]', window.location.origin + '?upgraded=true');

  window.location.href = checkoutUrl.toString();
}

function checkPaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('upgraded') === 'true') {
    showToast('🎉 Welcome to Lumaby Premium!');
    // The webhook can land a few seconds after the redirect, and the session
    // may still be restoring, so keep checking for a little while.
    let tries = 0;
    const poll = async () => {
      if (currentUser) {
        await loadPremiumStatus();
        applyPremiumGates();
        if (isPremium) { startSync(); return; }
      }
      if (++tries < 12) setTimeout(poll, 3000);
    };
    setTimeout(poll, 2000);
    window.history.replaceState({}, '', window.location.pathname);
  } else if (params.get('upgraded') === 'false') {
    showToast('Checkout cancelled.');
    window.history.replaceState({}, '', window.location.pathname);
  }
}

async function manageSubscription() {
  window.open('https://app.lemonsqueezy.com/my-orders', '_blank');
}



function showAccountModal() {
  const body = document.getElementById('account-modal-body');
  const email = currentUser?.email || 'Not signed in';
  const planText = isPremium ? '✨ Premium' : 'Free';
  const signedIn = !!currentUser;

  body.innerHTML = `
    <div class="account-card">
      <div class="account-row">
        <div class="ar-label">Email</div>
        <div class="ar-value">${email}</div>
      </div>
      <div class="account-row">
        <div class="ar-label">Plan</div>
        <div class="ar-value">${planText}</div>
      </div>
      <div class="account-row">
        <div class="ar-label">Baby's name</div>
        <div class="ar-value">${profile?.baby || '—'}</div>
      </div>
      <div class="account-row">
        <div class="ar-label">Log entries</div>
        <div class="ar-value">${logs.length} entries</div>
      </div>
    </div>

    ${!isPremium ? `
      <button class="btn-primary btn-full" onclick="closeModal('modal-account');openModal('modal-upgrade')">
        ✨ Upgrade to Premium
      </button>
    ` : `
      <button class="btn-sec btn-full" onclick="manageSubscription()">
        Manage Subscription
      </button>
    `}

    ${signedIn ? `
      ${isPremium ? `
      <button class="btn-sec btn-full" style="margin-top:10px" onclick="exportData()">
        📤 Export my data (CSV)
      </button>` : `
      <button class="btn-sec btn-full" style="margin-top:10px;opacity:0.6" onclick="openModal('modal-upgrade')">
        📤 Export my data (CSV) ✨ Premium
      </button>`}
      <button class="btn-danger" onclick="signOut()">Sign Out</button>
    ` : `
      <button class="btn-primary btn-full" style="margin-top:10px" onclick="closeModal('modal-account');document.getElementById('auth-screen').classList.add('visible')">
        Sign In / Create Account
      </button>
    `}
    <button class="btn-danger" style="margin-top:6px" onclick="if(confirm('Reset all local data?'))resetAll()">Reset all data</button>
  `;

  openModal('modal-account');
}

async function signOut() {
  if (supabase) await supabaseClient.auth.signOut();
  currentUser = null; isPremium = false;
  closeModal('modal-account');
  showToast('👋 Signed out');
  updatePremiumBadge();
}

async function manageSubscription() {
  if (!currentUser) return;
  try {
    const res = await fetch(CONFIG.functions.manageSubscription, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, email: currentUser.email })
    });
    const { url } = await res.json();
    window.location.href = url;
  } catch(e) {
    showToast('⚠️ Could not open subscription portal');
  }
}

// =======================================
//  EXPORT DATA (free feature)
// =======================================
async function exportData() {
  if (!isPremium) { openModal('modal-upgrade'); return; }
  const verified = await verifyPremium();
  if (!verified) {
    showToast('⚠️ Please upgrade to access this feature.');
    openModal('modal-upgrade');
    return;
  }
  const rows = [['Date','Time','Type','Title','Detail']];
  logs.forEach(l => {
    const d = new Date(l.time);
    rows.push([
      d.toLocaleDateString(),
      d.toLocaleTimeString(),
      l.type, l.title, l.detail
    ]);
  });
  const csv = rows.map(r => r.map(c => `"${(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lumaby-export-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📤 Exported!');
}

// =======================================
//  PATCH: Override startApp to add auth
// =======================================
const _originalStartApp = startApp;
// Override startApp to add auth init and premium gates
window._appReady = false;

// Override the DOMContentLoaded handler for auth
window.addEventListener('DOMContentLoaded', () => {
  const supabaseReady = initSupabase();

  if (supabaseReady) {
    // Check if user is already logged in
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        handleAuthSuccess(session.user);
      } else {
        // Show auth screen if Supabase is configured
        if (!profile) {
          document.getElementById('auth-screen').classList.add('visible');
        } else {
          // Has local profile, show auth screen briefly
          document.getElementById('auth-screen').classList.add('visible');
        }
      }
    });

    // Listen for auth state changes (e.g. OAuth redirect)
    supabaseClient.auth.onAuthStateChange((event, session) => {
      // Never await Supabase calls inside this callback: supabase-js holds its
      // auth lock while it runs, so queries made here would wait forever.
      if (event === 'SIGNED_IN' && session?.user && !currentUser) {
        setTimeout(() => handleAuthSuccess(session.user), 0);
      }
    });
  } else {
    // No Supabase ? run local mode, skip auth
    // (original DOMContentLoaded in the main app handles this)
  }

  checkPaymentReturn();
});

// Patch renderInsights to apply gates after render

// =======================================
