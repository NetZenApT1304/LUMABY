// Lumaby — Two-way sync, partner sharing, multiple babies.
// One part of the app script, loaded in order by index.html. All parts share one
// global scope; run `node tools/check-split.js` after moving code between files.
//  TWO-WAY SYNC + PARTNER SHARING
//  Local-first: the app keeps working from localStorage, and every change
//  is queued and pushed to Supabase. Changes from other devices (and from
//  partners on shared babies) are pulled on start, on focus, every minute,
//  and live through Supabase Realtime. Row-level security decides what
//  each user can see: their own babies plus babies shared with them.
//  The newest edit (updatedAt) wins; deletions sync as tombstones.
// =======================================
const SYNC_TABLES = {
  babies: {
    table: 'babies',
    get: () => babies, set: v => { babies = v; },
    persist: () => STORE.set('babies', babies),
    columns: b => ({ name: b.baby || null, dob: b.dob || null, emoji: b.emoji || null }),
    babyOf: b => b.id,
  },
  logs: {
    table: 'logs',
    get: () => allLogs, set: v => { allLogs = v; },
    persist: () => STORE.set('logs', allLogs),
    columns: l => ({ type: l.type || null, icon: l.icon || null, title: l.title || null, detail: l.detail || null,
                     logged_at: l.time || null, baby_id: l.babyId || null }),
    sort: arr => arr.sort((a, b) => new Date(b.time) - new Date(a.time)),
    babyOf: l => l.babyId,
  },
  growth: {
    table: 'growth_logs',
    get: () => allGrowth, set: v => { allGrowth = v; },
    persist: () => STORE.set('growthLogs', allGrowth),
    columns: g => ({ log_date: g.date || null, weight_lbs: g.weight || null, height_in: g.heightIn || null,
                     head_cm: g.head || null, notes: g.notes || null, baby_id: g.babyId || null }),
    sort: arr => arr.sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    babyOf: g => g.babyId,
  },
};
const SYNC_KEYS = Object.keys(SYNC_TABLES);
const SYNC_PAGE = 1000;
const SYNC_OVERLAP_MS = 30000; // re-read a little before the cursor to catch late commits

// ownPremium: this user's own subscription. hasSharedAccess: a partner on a
// baby whose owner has Premium. isPremium (used for feature gates) is either.
let ownPremium = false, hasSharedAccess = false;

function freshSyncState(owner) {
  const s = { owner: owner || null, cursor: {}, known: {}, outbox: {}, tombs: {} };
  SYNC_KEYS.forEach(k => { s.known[k] = {}; s.outbox[k] = []; s.tombs[k] = {}; });
  return s;
}
let syncState = STORE.get('syncState') || freshSyncState();
syncState.cursor = syncState.cursor || {};
SYNC_KEYS.forEach(k => {
  syncState.known[k] = syncState.known[k] || {}; syncState.outbox[k] = syncState.outbox[k] || [];
  syncState.tombs[k] = syncState.tombs[k] || {};
  // older format stored only the time
  Object.keys(syncState.tombs[k]).forEach(id => {
    if (typeof syncState.tombs[k][id] === 'string') syncState.tombs[k][id] = { at: syncState.tombs[k][id], baby: null };
  });
});
function saveSyncState() { STORE.set('syncState', syncState); }

let syncChannel = null, syncRunning = false, syncAgain = false, syncPushTimer = null, syncRenderTimer = null;

function syncEnabled() { return !!(supabaseClient && currentUser && isPremium); }

// What gets stored remotely: the item minus local-only fields.
function syncPayload(item) {
  const { updatedAt, synced, ownerId, ...rest } = item;
  return rest;
}
function syncHash(item) {
  const s = JSON.stringify(syncPayload(item)) + '|' + (item.ownerId || '');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}
// known[key][id] = { h: hash, b: baby id } for what was last synced/queued
function knownHash(key, id) { const k = syncState.known[key][id]; return k && typeof k === 'object' ? k.h : k; }
function knownBaby(key, id) { const k = syncState.known[key][id]; return k && typeof k === 'object' ? k.b : null; }
function setKnown(key, item) { syncState.known[key][item.id] = { h: syncHash(item), b: SYNC_TABLES[key].babyOf(item) || null }; }

function queueOutbox(key, id) {
  const box = syncState.outbox[key];
  if (!box.includes(id)) box.push(id);
}
function dropOutbox(key, id) {
  syncState.outbox[key] = syncState.outbox[key].filter(x => x !== id);
  delete syncState.tombs[key][id];
}

function isMine(baby) { return !baby || !baby.ownerId || baby.ownerId === currentUser?.id; }
function sharedBabyIds() { return new Set(babies.filter(b => !isMine(b)).map(b => b.id)); }

// Can this item (or tombstone) be pushed? With their own Premium, everything.
// A partner without it can only write to babies shared with them, and can't
// create or delete babies.
function canPush(key, id, item) {
  if (ownPremium) return true;
  const shared = sharedBabyIds();
  if (key === 'babies') return !!item && shared.has(id);
  const babyId = item ? SYNC_TABLES[key].babyOf(item) : syncState.tombs[key][id]?.baby;
  return !!babyId && shared.has(babyId);
}

// Compare the local collection with what was last synced/queued and queue
// every added, changed or removed item. Runs after each local save.
function detectLocalChanges(key) {
  const cfg = SYNC_TABLES[key], known = syncState.known[key];
  const items = cfg.get() || [];
  const now = new Date().toISOString();
  const seen = new Set();
  let touched = false;
  items.forEach(item => {
    if (!item.id) { item.id = uid(); touched = true; }
    if (key === 'babies' && !item.ownerId && currentUser) { item.ownerId = currentUser.id; touched = true; }
    seen.add(item.id);
    if (knownHash(key, item.id) !== syncHash(item)) {
      item.updatedAt = now; setKnown(key, item); queueOutbox(key, item.id); touched = true;
    }
  });
  Object.keys(known).forEach(id => {
    if (!seen.has(id)) {
      syncState.tombs[key][id] = { at: now, baby: knownBaby(key, id) };
      delete known[id]; queueOutbox(key, id); touched = true;
    }
  });
  if (touched) { cfg.persist(); saveSyncState(); }
  return touched;
}

// Apply one row from Supabase to the local collection. Returns true if the
// local data changed.
function applyRemoteRow(key, row) {
  const cfg = SYNC_TABLES[key];
  const items = cfg.get() || [];
  const idx = items.findIndex(i => i.id === row.id);
  const local = idx >= 0 ? items[idx] : null;
  if (syncState.outbox[key].includes(row.id)) {
    const localTime = local ? local.updatedAt : syncState.tombs[key][row.id]?.at;
    if (localTime && Date.parse(localTime) > Date.parse(row.updated_at)) return false; // local edit is newer; it will be pushed
  }
  if (row.deleted) {
    dropOutbox(key, row.id);
    delete syncState.known[key][row.id];
    if (idx < 0) return false;
    items.splice(idx, 1);
    return true;
  }
  const item = { ...(row.data || {}), id: row.id, updatedAt: row.updated_at };
  if (key === 'babies' && row.user_id) item.ownerId = row.user_id;
  delete item.synced;
  dropOutbox(key, row.id);
  setKnown(key, item);
  if (local && syncHash(local) === syncHash(item)) { local.updatedAt = row.updated_at; return false; }
  if (idx >= 0) items[idx] = item; else items.push(item);
  return true;
}

async function pullTable(key) {
  const cfg = SYNC_TABLES[key];
  let since = syncState.cursor[key] ? new Date(Date.parse(syncState.cursor[key]) - SYNC_OVERLAP_MS).toISOString() : null;
  let changed = false;
  for (;;) {
    // No user filter: row-level security returns this user's rows plus
    // rows of babies shared with them.
    let q = supabaseClient.from(cfg.table)
      .select('id, user_id, data, updated_at, deleted, synced_at')
      .order('synced_at', { ascending: true })
      .limit(SYNC_PAGE);
    if (since) q = q.gt('synced_at', since);
    const { data, error } = await q;
    if (error) throw error;
    data.forEach(row => {
      if (applyRemoteRow(key, row)) changed = true;
      if (!syncState.cursor[key] || Date.parse(row.synced_at) > Date.parse(syncState.cursor[key])) syncState.cursor[key] = row.synced_at;
    });
    if (data.length < SYNC_PAGE) break;
    since = data[data.length - 1].synced_at;
  }
  if (changed) { if (cfg.sort) cfg.sort(cfg.get()); cfg.persist(); }
  return changed;
}

async function pushTable(key) {
  const cfg = SYNC_TABLES[key];
  const items = cfg.get() || [];
  const ids = syncState.outbox[key].filter(id => canPush(key, id, items.find(i => i.id === id)));
  if (!ids.length) return;
  const emptyCols = cfg.columns({});
  const rows = ids.map(id => {
    const item = items.find(i => i.id === id);
    if (item) {
      return { id, user_id: key === 'babies' ? (item.ownerId || currentUser.id) : currentUser.id,
               data: syncPayload(item), deleted: false,
               updated_at: item.updatedAt || new Date().toISOString(), ...cfg.columns(item) };
    }
    // Deletion. Logs/growth keep their baby_id so the access check passes.
    const tomb = syncState.tombs[key][id] || {};
    const row = { id, user_id: currentUser.id, data: null, deleted: true,
                  updated_at: tomb.at || new Date().toISOString(), ...emptyCols };
    if (key !== 'babies') row.baby_id = tomb.baby || null;
    return row;
  });
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabaseClient.from(cfg.table).upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
    chunk.forEach(r => dropOutbox(key, r.id));
    saveSyncState();
  }
}

// Shared babies this user lost access to (partner removed, or owner deleted
// the baby): drop them and their entries from this device, without
// sending deletions.
async function dropInaccessibleBabies() {
  const shared = babies.filter(b => !isMine(b));
  if (!shared.length) return false;
  const { data, error } = await supabaseClient.from('babies').select('id').eq('deleted', false)
    .in('id', shared.map(b => b.id));
  if (error) throw error;
  const ok = new Set(data.map(r => r.id));
  const gone = shared.filter(b => !ok.has(b.id)).map(b => b.id);
  if (!gone.length) return false;
  forgetBabiesLocally(gone);
  if (!babies.length) {
    // Their only baby was the shared one: back to the welcome screen.
    profile = null; STORE.del('profile');
    showToast('Your partner stopped sharing with you');
    setTimeout(() => location.reload(), 1500);
  }
  return true;
}

function forgetBabiesLocally(ids) {
  const drop = new Set(ids);
  const forget = (key, keep) => {
    const cfg = SYNC_TABLES[key];
    const kept = [];
    (cfg.get() || []).forEach(item => {
      if (keep(item)) kept.push(item);
      else { delete syncState.known[key][item.id]; dropOutbox(key, item.id); }
    });
    cfg.set(kept);
    // forget queued deletions for those babies too
    Object.keys(syncState.tombs[key]).forEach(id => { if (drop.has(syncState.tombs[key][id]?.baby)) dropOutbox(key, id); });
    cfg.persist();
  };
  forget('babies', b => !drop.has(b.id));
  forget('logs', l => !drop.has(l.babyId));
  forget('growth', g => !drop.has(g.babyId));
  saveSyncState();
}

function syncPending() {
  return SYNC_KEYS.reduce((n, k) => {
    const items = SYNC_TABLES[k].get() || [];
    return n + syncState.outbox[k].filter(id => canPush(k, id, items.find(i => i.id === id))).length;
  }, 0);
}

// Pull everything new, then push local changes. Safe to call any time.
async function syncNow() {
  if (!syncEnabled()) return false;
  if (syncRunning) { syncAgain = true; return false; }
  syncRunning = true;
  let changed = false;
  try {
    for (const key of SYNC_KEYS) detectLocalChanges(key);
    for (const key of SYNC_KEYS) if (await pullTable(key)) changed = true;
    if (await dropInaccessibleBabies()) changed = true;
    // Push each table separately so one failure doesn't block the others.
    for (const key of SYNC_KEYS) {
      try { await pushTable(key); } catch (e) { console.warn(`[Lumaby] Sync push (${key}) failed, will retry:`, e.message || e); }
    }
    saveSyncState();
  } catch (e) {
    console.warn('[Lumaby] Sync failed, will retry:', e.message || e);
  } finally {
    syncRunning = false;
  }
  if (changed) afterRemoteChange();
  if (syncAgain) { syncAgain = false; return syncNow(); }
  return changed;
}

function schedulePush() {
  clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(syncNow, 1500);
}

// Keep profile/active baby consistent and redraw after remote changes.
function afterRemoteChange() {
  if (babies.length) assignLegacyBabyIds();
  if (babies.length) {
    const i = profile?.id ? babies.findIndex(b => b.id === profile.id) : -1;
    activeBabyIndex = i >= 0 ? i : Math.min(activeBabyIndex, babies.length - 1);
    profile = babies[activeBabyIndex];
    STORE.set('activeBabyIndex', activeBabyIndex); saveProfile();
  }
  refreshBabyView();
  clearTimeout(syncRenderTimer);
  syncRenderTimer = setTimeout(() => {
    if (document.getElementById('mainApp')?.style.display === 'none') return;
    const safe = fn => { try { if (typeof fn === 'function') fn(); } catch (e) { console.warn('[Lumaby] Render after sync:', e); } };
    safe(updateHeader); safe(renderBabySwitcher); safe(renderTimeline); safe(renderStats); safe(renderMilestoneBanner);
    const active = document.querySelector('.screen.active')?.id;
    if (active === 'screen-insights') safe(renderInsights);
    if (active === 'screen-schedule') safe(renderSchedule);
    if (active === 'screen-growth') safe(renderGrowth);
  }, 150);
}

function subscribeRealtime() {
  if (syncChannel || !syncEnabled()) return;
  syncChannel = supabaseClient.channel('lumaby-sync-' + currentUser.id);
  SYNC_KEYS.forEach(key => {
    // No filter: Realtime applies row-level security per subscriber, so
    // changes to shared babies arrive too.
    syncChannel.on('postgres_changes',
      { event: '*', schema: 'public', table: SYNC_TABLES[key].table },
      payload => {
        if (!payload.new || !payload.new.id) return;
        if (applyRemoteRow(key, payload.new)) {
          const cfg = SYNC_TABLES[key];
          if (cfg.sort) cfg.sort(cfg.get());
          cfg.persist(); saveSyncState(); afterRemoteChange();
        } else {
          saveSyncState();
        }
      });
  });
  syncChannel.subscribe();
}

function unsubscribeRealtime() {
  if (syncChannel) { try { supabaseClient.removeChannel(syncChannel); } catch (e) {} syncChannel = null; }
}

function clearLocalAccountData() {
  ['logs', 'growthLogs', 'babies', 'activeBabyIndex', 'profile', 'syncState', 'partnerData'].forEach(k => STORE.del(k));
  allLogs = []; allGrowth = []; logs = allLogs; growthLogs = allGrowth;
  babies = []; activeBabyIndex = 0; profile = null;
  syncState = freshSyncState();
}

// Start syncing for the signed-in user. Returns after the first pull, so
// callers can wait for the user's data before showing the app.
async function startSync() {
  if (!syncEnabled()) return;
  if (syncState.owner && syncState.owner !== currentUser.id) {
    // Data on this device belongs to another account that synced it; it is
    // safe in that account, so don't mix it into this one.
    clearLocalAccountData();
  }
  if (!syncState.owner) { syncState.owner = currentUser.id; saveSyncState(); }
  await syncNow();
  subscribeRealtime();
}

function stopSync() {
  unsubscribeRealtime();
  clearTimeout(syncPushTimer);
}

// Hook the existing save functions so every local change is queued.
const _syncOrigSaveLogs = saveLogs;
saveLogs = function () { _syncOrigSaveLogs(); if (syncEnabled()) { detectLocalChanges('logs'); schedulePush(); } };
const _syncOrigSaveGrowth = saveGrowth;
saveGrowth = function () { _syncOrigSaveGrowth(); if (syncEnabled()) { detectLocalChanges('growth'); schedulePush(); } };
const _syncOrigSaveBabies = saveBabies;
saveBabies = function () { _syncOrigSaveBabies(); if (syncEnabled()) { detectLocalChanges('babies'); schedulePush(); } };

// Premium = own subscription, or partner access to a Premium owner's baby.
const _syncOrigLoadPremium = loadPremiumStatus;
loadPremiumStatus = async function () {
  await _syncOrigLoadPremium();
  ownPremium = isPremium;
  if (supabaseClient && currentUser) {
    try {
      const { data, error } = await supabaseClient.rpc('has_shared_access');
      if (!error) hasSharedAccess = !!data;
    } catch (e) { /* keep last known value */ }
  } else {
    hasSharedAccess = false;
  }
  isPremium = ownPremium || hasSharedAccess;
};

// =======================================
//  PARTNER SHARING
// =======================================
// Invite links look like https://…/?join=CODE. Remember the code until the
// person has signed in.
(function capturePartnerInviteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('join');
  if (!code) return;
  STORE.set('pendingJoin', code.trim().toUpperCase().slice(0, 12));
  params.delete('join');
  const rest = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (rest ? '?' + rest : ''));
})();

function partnerError(e) {
  const msg = (e && (e.message || e.error_description)) || String(e || '');
  return msg.replace(/^.*?ERROR:\s*/, '') || 'Something went wrong. Please try again.';
}

// Redeem a code. Returns the shared baby's id, or null.
async function acceptPartnerInvite(code) {
  code = (code || '').trim().toUpperCase();
  if (!supabaseClient || !currentUser) { showToast('Sign in first to join your partner'); return null; }
  if (code.length < 6) { showToast('Please enter the 6-character code'); return null; }
  const { data, error } = await supabaseClient.rpc('accept_partner_invite', { p_code: code });
  if (error) { showToast('⚠️ ' + partnerError(error)); return null; }
  if (!data) { showToast('⚠️ That code is invalid or has expired'); return null; }
  hasSharedAccess = true;
  isPremium = ownPremium || hasSharedAccess;
  // Re-read everything: the shared baby's history predates our sync cursor.
  syncState.cursor = {};
  saveSyncState();
  return data;
}

function selectBabyById(babyId) {
  const i = babies.findIndex(b => b.id === babyId);
  if (i < 0) return false;
  activeBabyIndex = i; profile = babies[i];
  STORE.set('activeBabyIndex', activeBabyIndex); saveProfile();
  refreshBabyView();
  return true;
}

async function joinWithCode(codeFromCaller) {
  const input = document.getElementById('join-code-input');
  const babyId = await acceptPartnerInvite(codeFromCaller || input?.value);
  if (!babyId) return;
  await startSync();
  await syncNow();
  closeModal('modal-partner');
  if (selectBabyById(babyId)) {
    if (document.getElementById('mainApp')?.style.display === 'none') launchApp();
    else { renderBabySwitcher(); updateHeader(); renderHome(); applyPremiumGates?.(); }
    showToast(`👥 You're now sharing ${profile?.baby || 'your partner\'s baby'}`);
  } else {
    showToast('👥 Joined — your partner\'s baby will appear in a moment');
  }
}

// Onboarding: someone whose partner already set up the baby.
async function joinFromOnboarding() {
  if (!currentUser) {
    showToast('Sign in or create an account first, then enter the code');
    document.getElementById('onboarding').classList.add('hidden');
    document.getElementById('auth-screen').classList.add('visible');
    return;
  }
  const code = prompt('Enter the invite code from your partner:');
  if (code) await joinWithCode(code);
}

async function createPartnerInvite() {
  const baby = babies[activeBabyIndex];
  const box = document.getElementById('partner-invite-box');
  if (!baby || !box) return;
  box.innerHTML = '<div class="pc-sub">Creating code…</div>';
  await syncNow(); // the baby must be on the server first
  const { data, error } = await supabaseClient.rpc('create_partner_invite', { p_baby_id: baby.id });
  if (error || !data?.length) { box.innerHTML = `<div class="pc-sub">⚠️ ${sanitizeInput(partnerError(error))}</div>`; return; }
  const code = data[0].code;
  const link = `${window.location.origin}/?join=${code}`;
  box.innerHTML = `
    <div class="partner-invite-link">
      <div class="invite-code-box">${code}</div>
      <button class="copy-btn" onclick="sharePartnerInvite('${code}')">Share</button>
    </div>
    <p style="font-size:12px;color:var(--text-light);margin-top:10px;line-height:1.5">
      Send this to your partner. They open <strong>${sanitizeInput(link)}</strong>, sign in, and they're in.
      Or they can enter the code under Partner Sharing. It works once and expires in 7 days.
    </p>`;
}

async function sharePartnerInvite(code) {
  const link = `${window.location.origin}/?join=${code}`;
  const text = `Join me on Lumaby to track ${profile?.baby || 'our baby'} together. Open ${link} or enter code ${code}.`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Lumaby invite', text, url: link }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); showToast('🔗 Invite copied'); }
  catch (e) { prompt('Copy this invite:', text); }
}

async function removePartner(babyId, userId, isSelf) {
  const msg = isSelf ? 'Stop sharing this baby? It will be removed from this device.'
                     : 'Remove this partner? They will lose access to this baby.';
  if (!confirm(msg)) return;
  const { error } = await supabaseClient.rpc('remove_baby_member', { p_baby_id: babyId, p_user_id: userId });
  if (error) { showToast('⚠️ ' + partnerError(error)); return; }
  if (isSelf) {
    forgetBabiesLocally([babyId]);
    await loadPremiumStatus();
    if (!syncEnabled()) stopSync();
    afterRemoteChange();
    if (!babies.length) { profile = null; saveProfile(); location.reload(); return; }
    closeModal('modal-partner');
    showToast('Stopped sharing');
  } else {
    showToast('Partner removed');
    showPartnerModal();
  }
}

async function showPartnerModal() {
  const body = document.getElementById('partner-modal-body');
  const joinBlock = `
    <div style="margin-top:20px">
      <div style="font-size:13px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">Have a code from your partner?</div>
      <div style="display:flex;gap:8px">
        <input class="form-input" id="join-code-input" placeholder="Enter code" maxlength="6" autocapitalize="characters" style="flex:1;text-transform:uppercase;letter-spacing:2px"/>
        <button class="copy-btn" onclick="joinWithCode()">Join</button>
      </div>
    </div>`;
  if (!supabaseClient || !currentUser) {
    body.innerHTML = `<p class="pc-sub" style="margin-bottom:16px">Sign in to share a baby with your partner. You'll both see and add to the same timeline in real time.</p>
      <button class="btn-primary btn-full" onclick="closeModal('modal-partner');document.getElementById('auth-screen').classList.add('visible')">Sign in</button>`;
    openModal('modal-partner');
    return;
  }
  const baby = babies[activeBabyIndex];
  const mine = isMine(baby);
  body.innerHTML = '<div class="pc-sub">Loading…</div>';
  openModal('modal-partner');

  let members = [];
  if (baby) {
    const { data, error } = await supabaseClient.rpc('list_baby_members', { p_baby_id: baby.id });
    if (!error && data) members = data;
  }
  const partners = members.filter(m => m.role !== 'owner');
  const owner = members.find(m => m.role === 'owner');
  const babyName = sanitizeInput(baby?.baby || 'your baby');
  const rows = members.map(m => {
    const name = sanitizeInput(m.email || 'Unknown') + (m.is_me ? ' (you)' : '');
    let action = '';
    if (m.role !== 'owner' && (mine || m.is_me)) {
      action = `<button class="copy-btn" style="background:transparent;color:var(--terracotta);border:1px solid currentColor" onclick="removePartner('${baby.id}','${m.user_id}',${m.is_me})">${m.is_me ? 'Leave' : 'Remove'}</button>`;
    }
    return `<div class="partner-status-row" style="justify-content:space-between;gap:8px">
      <span style="display:flex;align-items:center;gap:8px;min-width:0"><span class="status-dot green"></span>
      <span style="overflow:hidden;text-overflow:ellipsis">${name} · ${m.role === 'owner' ? 'Owner' : 'Partner'}</span></span>${action}</div>`;
  }).join('');

  let inviteBlock = '';
  if (baby && mine) {
    inviteBlock = ownPremium
      ? `<div style="margin-top:20px"><div style="font-size:13px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">Invite your partner</div>
           <div id="partner-invite-box"><button class="btn-primary btn-full" onclick="createPartnerInvite()">Create invite code</button></div></div>`
      : `<p class="pc-sub" style="margin-top:16px">Partner sharing is part of Lumaby Premium. Your partner joins free with your subscription.</p>
         <button class="btn-primary btn-full" style="margin-top:10px" onclick="closeModal('modal-partner');openModal('modal-upgrade')">Upgrade</button>`;
  }

  body.innerHTML = `
    <div class="partner-card" style="margin-bottom:12px">
      <div class="pc-info">
        <div class="pc-title">${mine ? (partners.length ? `Sharing ${babyName}` : `Share ${babyName}`) : `${babyName} is shared with you`}</div>
        <div class="pc-sub">${mine
          ? (partners.length ? 'Everyone here sees and adds to the same timeline, live.' : 'Invite your partner to see and add to the same timeline, live.')
          : `Shared by ${sanitizeInput(owner?.email || 'your partner')}. Their Premium covers you.`}</div>
      </div>
      ${rows ? `<div style="margin-top:12px">${rows}</div>` : ''}
    </div>
    ${inviteBlock}
    ${joinBlock}`;
}

// Removing a baby that someone shared with you means leaving it.
const _partnerOrigRemoveBaby = removeBaby;
removeBaby = function (index) {
  const baby = babies[index];
  if (currentUser && baby && !isMine(baby)) { removePartner(baby.id, currentUser.id, true); return; }
  _partnerOrigRemoveBaby(index);
};

// Signing in: load Premium/sharing status, redeem a pending invite link,
// then pull the account's data before the app decides between onboarding
// and the main screen (so a new device gets the existing babies).
let authHandledFor = null;
handleAuthSuccess = async function (user) {
  // getSession() and the SIGNED_IN event can both report the same sign-in.
  if (authHandledFor === user.id) return;
  authHandledFor = user.id;
  currentUser = user;
  document.getElementById('auth-screen').classList.remove('visible');
  await loadPremiumStatus();
  let joinedBabyId = null;
  const pendingJoin = STORE.get('pendingJoin');
  if (pendingJoin) { STORE.del('pendingJoin'); joinedBabyId = await acceptPartnerInvite(pendingJoin); }
  if (syncEnabled()) {
    await startSync();
    if (joinedBabyId) selectBabyById(joinedBabyId);
    if (!profile && babies.length) { profile = babies[Math.min(activeBabyIndex, babies.length - 1)]; saveProfile(); }
  }
  await syncProfile();
  if (!profile) {
    document.getElementById('onboarding').classList.remove('hidden');
  } else {
    launchApp();
    if (joinedBabyId) setTimeout(() => showToast(`👥 You're now sharing ${profile?.baby || 'your partner\'s baby'}`), 600);
  }
};

// Signing out: push what's left, then remove synced data from this device.
const _syncOrigSignOut = signOut;
signOut = async function () {
  const wasSyncing = syncEnabled() && syncState.owner === currentUser?.id;
  if (wasSyncing) {
    await syncNow();
    if (syncPending() > 0 &&
        !confirm('Some changes haven\'t synced yet (you may be offline). Sign out anyway and lose them on this device?')) return;
  }
  await removePushSubscriptionForDevice();
  stopSync();
  authHandledFor = null;
  ownPremium = false; hasSharedAccess = false;
  await _syncOrigSignOut();
  if (wasSyncing) { clearLocalAccountData(); location.reload(); }
};

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
window.addEventListener('online', () => syncNow());
setInterval(() => { if (syncEnabled()) syncNow(); }, 60000);


// =======================================
//  PWA ? Service Worker Registration
// =======================================


// =====================================================
//  MULTI-BABY PROFILES
// =====================================================
let babies = STORE.get('babies') || [];
let activeBabyIndex = STORE.get('activeBabyIndex') || 0;

function saveBabies() { STORE.set('babies', babies); STORE.set('activeBabyIndex', activeBabyIndex); }

// == Per-baby logs ==
function currentBabyId() {
  return (babies[activeBabyIndex] || babies[0] || {}).id || null;
}

// Point logs/growthLogs at the active baby's entries.
function refreshBabyView() {
  const id = currentBabyId();
  if (!id) { logs = allLogs; growthLogs = allGrowth; return; }
  logs = allLogs.filter(l => l.babyId === id);
  growthLogs = allGrowth.filter(g => g.babyId === id);
}

// Entries from before logs belonged to a baby were all recorded for the
// first baby, so give them that baby's id.
function assignLegacyBabyIds() {
  const first = babies[0]?.id;
  if (!first) return;
  let changedLogs = false, changedGrowth = false;
  allLogs.forEach(l => { if (!l.babyId) { l.babyId = first; changedLogs = true; } });
  allGrowth.forEach(g => {
    if (!g.id) { g.id = uid(); changedGrowth = true; }
    if (!g.babyId) { g.babyId = first; changedGrowth = true; }
  });
  if (changedLogs) saveLogs();
  if (changedGrowth) saveGrowth();
}

function ensureBabyView() {
  initBabies();
  assignLegacyBabyIds();
  refreshBabyView();
}

function initBabies() {
  // Safely migrate single profile to multi-baby system
  // Check if already migrated to prevent duplicates
  if (profile && babies.length === 0) {
    // Only migrate if no babies exist yet
    const existingBaby = babies.find(b => b.baby === profile.baby && b.dob === profile.dob);
    if (!existingBaby) {
      babies = [{ ...profile, id: profile.id || uid() }];
      saveBabies();
    }
  }
  // Ensure activeBabyIndex is valid
  if (activeBabyIndex >= babies.length) activeBabyIndex = 0;
}

function renderBabySwitcher() {
  const sw = document.getElementById('babySwitcher');
  if (!sw) return;

  // Free users: show a teaser chip to upgrade
  if (!isPremium) {
    sw.style.display = 'flex';
    sw.innerHTML = `
      <div class="baby-chip active">
        <span class="bc-emoji">${profile?.emoji || '🌙'}</span>
        <span class="bc-name">${profile?.baby || 'Baby'}</span>
      </div>
      <div class="baby-chip add-baby" onclick="openModal('modal-upgrade')" style="border-color:rgba(212,168,83,0.4);background:rgba(212,168,83,0.06)">
        <span class="bc-emoji" style="font-size:14px">✨+</span>
        <span class="bc-name" style="color:var(--soft-gold)">Premium</span>
      </div>`;
    return;
  }

  // Premium: show all babies + add button
  if (babies.length <= 1) { sw.style.display = 'none'; return; }
  sw.style.display = 'flex';
  sw.innerHTML = babies.map((b, i) => `
    <div class="baby-chip ${i === activeBabyIndex ? 'active' : ''}" onclick="switchBaby(${i})">
      <span class="bc-emoji">${b.emoji || '🌙'}</span>
      <span class="bc-name">${b.baby || 'Baby'}</span>
    </div>`).join('') + `
    <div class="baby-chip add-baby" onclick="openAddBabyModal()">
      <span class="bc-emoji">+</span>
      <span class="bc-name">Add</span>
    </div>`;
}

function switchBaby(index) {
  activeBabyIndex = index;
  profile = babies[index];
  refreshBabyView();
  saveBabies(); saveProfile();
  renderBabySwitcher();
  updateHeader();
  renderHome();
}

function openAddBabyModal(editIndex = -1) {
  const isEdit = editIndex >= 0;
  // Adding a new baby is a premium feature; editing existing is always allowed
  if (!isEdit && !isPremium) { openModal('modal-upgrade'); return; }
  const b = isEdit ? babies[editIndex] : {};
  document.getElementById('baby-edit-title').textContent = isEdit ? 'Edit Baby' : 'Add Baby';
  const dob = new Date(); dob.setMonth(dob.getMonth() - 2);
  document.getElementById('baby-edit-body').innerHTML = `
    <div class="form-group"><label>Baby's name</label>
      <input class="form-input" id="be-name" value="${b.baby || ''}" placeholder="e.g. Oliver"/></div>
    <div class="form-row">
      <div class="form-group"><label>Birthday</label>
        <input class="form-input" id="be-dob" type="date" value="${b.dob || dob.toISOString().split('T')[0]}"/></div>
      <div class="form-group"><label>Emoji</label>
        <select class="form-input" id="be-emoji">
          ${['🌙','⭐','🌸','🌿','🦋','🐣','🌻','🐻','🦊','🐧'].map(e =>
            `<option ${(b.emoji||'🌙')===e?'selected':''}>${e}</option>`).join('')}
        </select>
      </div>
    </div>
    ${isEdit ? `<button class="btn-primary btn-full" onclick="saveBabyEdit(${editIndex})">Save Changes</button>
    <button class="btn-danger" style="margin-top:8px" onclick="removeBaby(${editIndex})">Remove Baby</button>` :
    `<button class="btn-primary btn-full" onclick="addNewBaby()">Add Baby</button>`}`;
  openModal('modal-baby-edit');
}

function addNewBaby() {
  if (!isPremium && babies.length >= 1) { closeModal('modal-baby-edit'); openModal('modal-upgrade'); return; }
  const name = document.getElementById('be-name').value.trim() || 'Baby';
  const dob = document.getElementById('be-dob').value;
  const emoji = document.getElementById('be-emoji').value;
  babies.push({ id: uid(), baby: name, dob, emoji, parent: profile?.parent || '' });
  saveBabies();
  switchBaby(babies.length - 1);
  closeModal('modal-baby-edit');
  showToast(`${emoji} ${name} added!`);
}

function saveBabyEdit(index) {
  babies[index].baby = document.getElementById('be-name').value.trim() || babies[index].baby;
  babies[index].dob = document.getElementById('be-dob').value;
  babies[index].emoji = document.getElementById('be-emoji').value;
  if (index === activeBabyIndex) { profile = babies[index]; saveProfile(); }
  saveBabies(); closeModal('modal-baby-edit');
  renderBabySwitcher(); updateHeader();
  showToast('Baby profile updated');
}

function removeBaby(index) {
  if (!confirm('Remove this baby profile? Their logs will still be saved.')) return;
  babies.splice(index, 1);
  if (activeBabyIndex >= babies.length) activeBabyIndex = 0;
  profile = babies[activeBabyIndex] || null;
  refreshBabyView();
  saveBabies(); saveProfile();
  closeModal('modal-baby-edit');
  renderBabySwitcher(); updateHeader(); renderHome();
}

// =====================================================
