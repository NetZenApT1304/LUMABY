// Lumaby — Google Play billing inside the Android app.
// One part of the app script, loaded in order by index.html. All parts share one
// global scope; run `node tools/check-split.js` after moving code between files.
//
// In the Google Play app (a Trusted Web Activity), Premium must be bought
// through Google Play. Chrome gives the page Google's Digital Goods API and a
// Google Play payment method; the purchase is then checked by our server
// (netlify/functions/play-verify.js) before Premium turns on. On the website
// nothing changes: Lemon Squeezy as before.

const PLAY_BILLING = 'https://play.google.com/billing';
const PLAY_PACKAGE = 'com.lumaby.app';
const PLAY_SKUS = { monthly: 'premium_monthly', yearly: 'premium_yearly' };

// Opened from the Play app? Its first page load has an android-app://
// referrer; remember that for the rest of the visit.
const inPlayApp = (() => {
  const fromApp = document.referrer.startsWith('android-app://' + PLAY_PACKAGE);
  try {
    if (fromApp) sessionStorage.setItem('lumaby_play_app', '1');
    return sessionStorage.getItem('lumaby_play_app') === '1';
  } catch (e) { return fromApp; }
})();

let playService, playDetails = {};
async function getPlayService() {
  if (playService !== undefined) return playService;
  playService = null;
  if ('getDigitalGoodsService' in window) {
    try { playService = await window.getDigitalGoodsService(PLAY_BILLING); } catch (e) { console.warn('[Lumaby] Google Play billing unavailable:', e.message || e); }
  }
  return playService;
}

// ── Prices on the Premium screen come from Google Play ──
function fmtPlayPrice(price, divideBy = 1) {
  const v = Number(price.value) / divideBy;
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: price.currency }).format(v); }
  catch (e) { return v.toFixed(2) + ' ' + price.currency; }
}
function playTrialDays(d) {
  const m = /P(?:(\d+)W)?(?:(\d+)D)?/.exec(d?.freeTrialPeriod || '');
  return m ? (+m[1] || 0) * 7 + (+m[2] || 0) : 0;
}
async function loadPlayPrices() {
  const s = await getPlayService(); if (!s) return;
  try {
    (await s.getDetails(Object.values(PLAY_SKUS))).forEach(d => { playDetails[d.itemId] = d; });
  } catch (e) { console.warn('[Lumaby] Google Play prices:', e.message || e); }
  applyPlayPrices();
}
function applyPlayPrices() {
  const m = playDetails[PLAY_SKUS.monthly], y = playDetails[PLAY_SKUS.yearly];
  const q = sel => document.querySelector(sel);
  if (m && q('#plan-monthly .amount')) q('#plan-monthly .amount').textContent = fmtPlayPrice(m.price);
  if (y && q('#plan-yearly .amount')) {
    q('#plan-yearly .amount').textContent = fmtPlayPrice(y.price, 12);
    const save = q('#plan-yearly .save');
    if (save) {
      const pct = m ? Math.round((1 - Number(y.price.value) / (Number(m.price.value) * 12)) * 100) : 0;
      save.textContent = (pct > 0 ? `Save ${pct}% · ` : '') + fmtPlayPrice(y.price) + '/year';
    }
  }
  const note = q('#upgrade-note');
  if (note) note.textContent = 'Billed through Google Play. Cancel anytime in Google Play.';
  q('#plan-lifetime')?.remove(); // not sold in the Play app
  selectPlan(selectedPlan === 'lifetime' ? 'monthly' : selectedPlan);
}

// Button text: trial (if Google Play has one for that plan) and price.
const _billOrigSelectPlan = selectPlan;
selectPlan = function (plan) {
  _billOrigSelectPlan(plan);
  if (!inPlayApp) return;
  const d = playDetails[PLAY_SKUS[plan]], btn = document.getElementById('upgrade-btn');
  if (!d || !btn) return;
  const trial = playTrialDays(d);
  const price = fmtPlayPrice(d.price) + (plan === 'yearly' ? '/yr' : '/mo');
  btn.textContent = trial ? `Start ${trial}-day free trial · then ${price}` : `Subscribe · ${price}`;
};

// ── Buying ──
async function sendPlayPurchase(purchaseToken) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return { ok: false, error: 'signed_out' };
  try {
    const r = await fetch('/.netlify/functions/play-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ purchaseToken }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && j.premium === true, error: j.error, status: r.status };
  } catch (e) { return { ok: false, error: 'network' }; }
}
async function refreshPremiumUi() {
  await loadPremiumStatus();
  updatePremiumBadge();
  if (typeof applyPremiumGates === 'function') applyPremiumGates();
  if (typeof renderHome === 'function') renderHome();
}

const _billOrigStartCheckout = startCheckout;
startCheckout = async function () {
  if (!inPlayApp) return _billOrigStartCheckout();
  if (!currentUser) {
    closeModal('modal-upgrade');
    document.getElementById('auth-screen').classList.add('visible');
    showToast('✉️ Please sign in first to subscribe');
    return;
  }
  const s = await getPlayService();
  const sku = PLAY_SKUS[selectedPlan] || PLAY_SKUS.monthly;
  if (!s || !window.PaymentRequest) {
    showToast('Google Play purchases need the latest Chrome. Update Chrome from the Play Store and try again.');
    return;
  }
  const btn = document.getElementById('upgrade-btn'), label = btn.textContent;
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Opening Google Play…';
  try {
    const request = new PaymentRequest([{ supportedMethods: PLAY_BILLING, data: { sku } }],
      { total: { label: 'Total', amount: { currency: 'USD', value: '0' } } });
    const response = await request.show();
    btn.innerHTML = '<span class="spinner"></span> Confirming…';
    const result = await sendPlayPurchase(response.details.purchaseToken);
    await response.complete(result.ok ? 'success' : 'fail');
    if (result.ok) {
      closeModal('modal-upgrade');
      showToast('🎉 Welcome to Lumaby Premium!');
      await refreshPremiumUi();
    } else if (result.error === 'token_in_use') {
      showToast('This Google Play subscription is already linked to another Lumaby account.');
    } else {
      showToast('Payment received. We\'re still confirming it; Premium will turn on shortly.');
    }
  } catch (e) {
    if (e.name !== 'AbortError') { console.warn('[Lumaby] Google Play purchase:', e); showToast('⚠️ The purchase didn\'t go through. Please try again.'); }
  } finally {
    btn.disabled = false; btn.textContent = label; selectPlan(selectedPlan);
  }
};

// ── Existing purchases: renewals, and restoring on a new phone ──
let playPurchasesSynced = false;
async function syncPlayPurchases() {
  if (!inPlayApp || !currentUser || playPurchasesSynced) return;
  playPurchasesSynced = true;
  const s = await getPlayService(); if (!s) return;
  let list = [];
  try { list = await s.listPurchases(); } catch (e) { return; }
  let changed = false;
  for (const p of list) if (Object.values(PLAY_SKUS).includes(p.itemId)) changed = (await sendPlayPurchase(p.purchaseToken)).ok || changed;
  if (changed && !isPremium) await refreshPremiumUi();
}
const _billOrigLoadPremium = loadPremiumStatus;
loadPremiumStatus = async function () {
  await _billOrigLoadPremium();
  if (inPlayApp && currentUser && !playPurchasesSynced) setTimeout(syncPlayPurchases, 0);
};

// ── Managing the subscription: wherever it was bought ──
async function subscriptionProvider() {
  if (!supabaseClient || !currentUser) return null;
  const { data } = await supabaseClient.from('subscriptions').select('provider, play_product_id').eq('user_id', currentUser.id).maybeSingle();
  return data;
}
manageSubscription = async function () {
  const sub = await subscriptionProvider();
  if (sub?.provider === 'play') {
    window.open(`https://play.google.com/store/account/subscriptions?package=${PLAY_PACKAGE}${sub.play_product_id ? '&sku=' + sub.play_product_id : ''}`, '_blank');
  } else {
    window.open('https://app.lemonsqueezy.com/my-orders', '_blank');
  }
};

if (inPlayApp) {
  document.addEventListener('DOMContentLoaded', loadPlayPrices);
  if (document.readyState !== 'loading') loadPlayPrices();
}
