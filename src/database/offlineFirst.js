// ══════════════════════════════════════════════════════════════
// Offline-First Layer v2 — Simple & Reliable
// - localStorage is the ONLY read source (always instant)
// - On first load: pull from Supabase → populate localStorage
// - On writes: save to localStorage THEN push to Supabase (background)
// - Offline writes queue for retry
// ══════════════════════════════════════════════════════════════

import { supabase, isConfigured } from './supabase';

const PREFIX = 'dgc_';

function load(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(PREFIX + key)) || fallback; }
  catch { return fallback; }
}
function save(key, data) { localStorage.setItem(PREFIX + key, JSON.stringify(data)); }
function uid() { return crypto.randomUUID(); }
function nowStr() { return new Date().toISOString(); }
function todayStr() {
  // LOCAL date — must match DailyPage's toDateStr(). Using UTC caused evening
  // completions (after UTC midnight) to be stored under tomorrow's date and
  // appear pre-checked the next morning local time.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Local calendar date (YYYY-MM-DD) of an ISO timestamp — same format as todayStr()
function localDateOf(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Recent local dates for sync (today + past 7 days)
function recentDates(n = 7) {
  const dates = [];
  for (let i = 0; i <= n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return dates;
}

// ── Pending ops tracker ──
// Tracks IDs of completions that haven't been confirmed on the server yet.
// backgroundSync will preserve these instead of overwriting them.
function getPending() { return load('pendingOps', {}); }
function savePending(p) { save('pendingOps', p); }
function markPending(id, action) {
  const p = getPending(); p[id] = { action, at: Date.now() }; savePending(p);
}
function clearPending(id) {
  const p = getPending(); delete p[id]; savePending(p);
}

// ── Soft-delete helper ──
// A ledger entry is "live" only if deleted_at is null/undefined.
// All balance, sum, and ungiven readers must filter through this.
function notDeleted(g) { return !g || !g.deleted_at; }

// Numeric amount guard — Supabase numeric columns (or old rows written during the
// text→numeric migration) can surface as strings; string + number concatenates and
// silently corrupts every downstream balance. Always sum through this.
function amt(g) { return Number(g.amount) || 0; }

// ── Failed writes log ──
// Captures queue ops that errored permanently (type/constraint mismatches).
// Old behavior silently dropped them; now they're recoverable + visible to the verifier.
function logFailedWrite(op, error) {
  const fw = load('failedWrites', []);
  fw.push({
    id: crypto.randomUUID(),
    op,
    error: String(error?.message || error || 'unknown'),
    failedAt: nowStr(),
  });
  save('failedWrites', fw.slice(-200)); // cap at last 200 to prevent unbounded growth
}
export function getFailedWrites() { return load('failedWrites', []); }
export function clearFailedWrite(id) {
  save('failedWrites', load('failedWrites', []).filter(f => f.id !== id));
}
export function clearAllFailedWrites() { save('failedWrites', []); }

// Tombstones for ledger entries lost via realtime DELETE events.
// (Older app versions still hard-delete on bonus ✕; this captures evidence.)
export function getLostLedgerEntries() { return load('lostLedgerEntries', []); }
export function clearLostLedgerEntries() { save('lostLedgerEntries', []); }

// IDs of ops still sitting in the write queue (push failed / offline).
// These must be treated as pending FOREVER — the 30s pendingOps TTL only covers
// in-flight pushes. Without this, a queued write's local effect gets reverted by
// the next pull, then re-applied when the queue finally pushes — the classic
// "checkmark/gems flip back and forth over time" bug.
function queuedActions() {
  const map = new Map();
  for (const op of getQueue()) {
    const id = op.data?.id || op.match?.id;
    if (id && !map.has(id)) map.set(id, op.action);
  }
  return map;
}

// Merge server data with pending local writes.
// - Start with server records
// - Add any local records with pending 'insert' that aren't on the server yet
// - Remove any server records with pending 'delete' (local user unchecked before server caught up)
function mergeWithPending(serverData, localData) {
  const pending = getPending();
  const queued = queuedActions();
  const pendingIds = [...new Set([...Object.keys(pending), ...queued.keys()])];
  if (pendingIds.length === 0) return serverData;  // No pending ops — server wins

  const localIds = new Set(localData.map(r => r.id));
  const serverIds = new Set(serverData.map(r => r.id));
  const merged = [...serverData];
  const STALE_MS = 30000; // 30s TTL — if pending op is older than this, it's stale

  for (const id of pendingIds) {
    // Queued ops never go stale here; the queue itself handles retry/expiry.
    // Handle both old format (string) and new format ({action, at})
    const inQueue = queued.has(id);
    const entry = pending[id];
    const action = inQueue ? queued.get(id)
      : (typeof entry === 'string' ? entry : entry.action);
    const age = inQueue ? 0
      : (typeof entry === 'object' && entry.at ? Date.now() - entry.at : Infinity);

    // Only process pending ops that belong to this dataset (id exists in local data)
    if (!localIds.has(id) && !serverIds.has(id)) continue;

    // Clear stale pending ops (older than 30s)
    if (age > STALE_MS) {
      clearPending(id);
      continue;
    }

    if (action === 'insert' && !serverIds.has(id)) {
      // Local insert not yet on server — keep it
      const local = localData.find(r => r.id === id);
      if (local) merged.push(local);
    } else if (action === 'delete' && serverIds.has(id)) {
      // Local delete not yet on server — remove it from merged
      const idx = merged.findIndex(r => r.id === id);
      if (idx >= 0) merged.splice(idx, 1);
    } else if (action === 'update' && serverIds.has(id)) {
      // Local update not yet on server — overlay local fields on top of server row
      const local = localData.find(r => r.id === id);
      const idx = merged.findIndex(r => r.id === id);
      if (local && idx >= 0) merged[idx] = { ...merged[idx], ...local };
    } else {
      // Pending insert already on server, or pending delete already gone — clear
      clearPending(id);
    }
  }
  return merged;
}

// Ledger-specific merge: server is source of truth, but we MUST preserve
// any local entry that has a pending op (insert/update/delete) so a 30s poll
// doesn't wipe a write that hasn't pushed yet. Without this, a bonus that
// failed to sync can vanish on the next backgroundSync.
function mergeLedgerWithPending(serverLedger, localLedger) {
  const merged = mergeWithPending(serverLedger, localLedger);
  // Extra safety: keep any local row whose id isn't on server AND is recent
  // (created within the last 5 minutes), even without an explicit pending flag.
  // This catches inserts where the pending tracker was cleared (e.g. stale TTL)
  // but the Supabase push never actually landed.
  const serverIds = new Set(serverLedger.map(r => r.id));
  const mergedIds = new Set(merged.map(r => r.id));
  const recentCutoff = Date.now() - 5 * 60 * 1000;
  for (const local of localLedger) {
    if (mergedIds.has(local.id)) continue;
    if (serverIds.has(local.id)) continue;
    const created = local.created_at ? new Date(local.created_at).getTime() : 0;
    if (created > recentCutoff) merged.push(local);
  }
  return merged;
}

// ── Sync down: Supabase → localStorage, shared by initialSync + backgroundSync ──
// Every pull is error-guarded: a failed/empty-on-error response must NEVER overwrite
// the local cache (bonuses, redemptions, children and templates used to get wiped to []
// on a single failed fetch, then "come back" on the next successful one).
// Every save merges with pending/queued local writes so a poll can't revert a write
// that hasn't pushed yet.
async function syncDown() {
  const ok = r => !r.error && Array.isArray(r.data);
  const failWarn = (what, r) => console.warn(`${what} pull failed, keeping local cache:`, r.error?.message);

  const [childrenResp, templatesResp, storeResp] = await Promise.all([
    supabase.from('children').select('*').order('sort_order'),
    supabase.from('task_templates').select('*').eq('active', true).order('sort_order'),
    supabase.from('store_items').select('*').eq('active', true).order('sort_order'),
  ]);
  if (ok(childrenResp)) save('children', mergeWithPending(childrenResp.data, load('children', [])));
  else failWarn('children', childrenResp);
  if (ok(storeResp)) save('store_items', mergeWithPending(storeResp.data, load('store_items', [])));
  else failWarn('store_items', storeResp);
  const templates = ok(templatesResp) ? templatesResp.data : null;
  if (!templates) failWarn('task_templates', templatesResp);

  const children = load('children', []);
  for (const child of children) {
    // Task templates — only rewrite caches when the pull succeeded
    // (gem_value column is numeric, so fractional values survive)
    if (templates) {
      for (const type of ['daily', 'weekly']) {
        const key = `tasks_${child.id}_${type}`;
        save(key, mergeWithPending(
          templates.filter(t => t.child_id === child.id && t.task_type === type),
          load(key, [])));
      }
    }

    // Ledger — merge with pending/queued local writes; never zero on error.
    const ledgerResp = await supabase.from('gem_ledger').select('*').eq('child_id', child.id);
    if (ok(ledgerResp)) {
      const ledgerKey = `ledger_${child.id}`;
      save(ledgerKey, mergeLedgerWithPending(ledgerResp.data, load(ledgerKey, [])));
    } else failWarn('gem_ledger', ledgerResp);

    // Recent daily completions (past 7 days) — single query, bucket by date
    const days = recentDates();
    const dailyResp = await supabase.from('daily_completions').select('*')
      .eq('child_id', child.id).gte('completion_date', days[days.length - 1]).lte('completion_date', days[0]);
    if (ok(dailyResp)) {
      for (const day of days) {
        const dailyKey = `daily_comp_${child.id}_${day}`;
        save(dailyKey, mergeWithPending(dailyResp.data.filter(c => c.completion_date === day), load(dailyKey, [])));
      }
    } else failWarn('daily_completions', dailyResp);

    // This week's completions — merge with any pending local writes
    const wk = mondayOfWeek();
    const weeklyResp = await supabase.from('weekly_completions').select('*')
      .eq('child_id', child.id).eq('week_of', wk);
    if (ok(weeklyResp)) {
      const weeklyKey = `weekly_comp_${child.id}_${wk}`;
      save(weeklyKey, mergeWithPending(weeklyResp.data, load(weeklyKey, [])));
    } else failWarn('weekly_completions', weeklyResp);

    // Bonus listening — a just-added bonus with a queued push must survive the pull
    const bonusResp = await supabase.from('bonus_listening').select('*')
      .eq('child_id', child.id).order('created_at', { ascending: false });
    if (ok(bonusResp)) {
      const key = `bonus_${child.id}`;
      const mergedB = mergeWithPending(bonusResp.data, load(key, []));
      mergedB.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      save(key, mergedB);
    } else failWarn('bonus_listening', bonusResp);

    // Redemptions
    const redResp = await supabase.from('store_redemptions').select('*')
      .eq('child_id', child.id).order('redeemed_at', { ascending: false });
    if (ok(redResp)) {
      const key = `redemptions_${child.id}`;
      const mergedR = mergeWithPending(redResp.data, load(key, []));
      mergedR.sort((a, b) => String(b.redeemed_at || '').localeCompare(String(a.redeemed_at || '')));
      save(key, mergedR);
    } else failWarn('store_redemptions', redResp);
  }
}

// ── Initial Sync: Supabase → localStorage (runs once on app load) ──
let _synced = false;
let _syncInFlight = null;

export async function initialSync() {
  if (!isConfigured() || !navigator.onLine || _synced) return;
  if (_syncInFlight) return _syncInFlight; // several components race on mount — share one run

  _syncInFlight = (async () => {
    try {
      // Push any queued local writes to Supabase FIRST, then pull everything
      await processQueue();
      await syncDown();
      _synced = true;
      console.log('Sync complete — all data from Supabase, local gem values preserved');
    } catch (err) {
      console.warn('Sync failed, using local cache:', err);
    } finally {
      _syncInFlight = null;
    }
  })();
  return _syncInFlight;
}

// ── Write Queue ──
// Soft-delete specific gem_ledger entries by id (used by duplicate cleanup).
// Sets deleted_at/deleted_reason/deleted_by locally and pushes UPDATEs to Supabase
// instead of hard-deleting — so disappearances are always traceable and recoverable.
export async function deleteLedgerEntries(childId, ids, reason = 'duplicate cleanup', deletedBy = '') {
  if (!childId || !ids || ids.length === 0) return;
  const key = `ledger_${childId}`;
  const ledger = load(key, []);
  const idSet = new Set(ids);
  const stamp = nowStr();
  ledger.forEach(g => {
    if (idSet.has(g.id)) {
      g.deleted_at = stamp;
      g.deleted_reason = reason;
      g.deleted_by = deletedBy;
    }
  });
  save(key, ledger);
  for (const id of ids) {
    tryPush({
      table: 'gem_ledger',
      action: 'update',
      data: { deleted_at: stamp, deleted_reason: reason, deleted_by: deletedBy },
      match: { id },
    });
  }
}

// Restore previously soft-deleted entries — clears deleted_at locally and pushes UPDATE.
export async function restoreLedgerEntries(childId, ids) {
  if (!childId || !ids || ids.length === 0) return;
  const key = `ledger_${childId}`;
  const ledger = load(key, []);
  const idSet = new Set(ids);
  ledger.forEach(g => {
    if (idSet.has(g.id)) {
      g.deleted_at = null;
      g.deleted_reason = null;
      g.deleted_by = null;
    }
  });
  save(key, ledger);
  for (const id of ids) {
    tryPush({
      table: 'gem_ledger',
      action: 'update',
      data: { deleted_at: null, deleted_reason: null, deleted_by: null },
      match: { id },
    });
  }
}

// Return soft-deleted ledger entries for a child (for the "Show removed" panel).
export async function getDeletedEntries(childId) {
  return load(`ledger_${childId}`, []).filter(g => g.deleted_at);
}

// Update a single gem_ledger entry (gems_given flag etc.)
export async function updateLedgerEntry(childId, id, patch) {
  const key = `ledger_${childId}`;
  const ledger = load(key, []);
  const entry = ledger.find(g => g.id === id);
  if (!entry) return;
  Object.assign(entry, patch);
  save(key, ledger);
  tryPush({ table: 'gem_ledger', action: 'update', data: patch, match: { id } });
}

export function getSyncStatus() {
  const queue = load('writeQueue', []);
  const pending = load('pendingOps', {});
  const lastSync = load('lastBgSync', null);
  return {
    queueSize: queue.length,
    pendingCount: Object.keys(pending).length,
    lastSync,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  };
}

function getQueue() { return load('writeQueue', []); }
function saveQueue(q) { save('writeQueue', q); }
function enqueue(op) { const q = getQueue(); q.push({ ...op, queuedAt: nowStr() }); saveQueue(q); }

async function pushToSupabase(op) {
  const { table, action, data, match } = op;
  if (action === 'insert') {
    const { error } = await supabase.from(table).insert(data);
    if (error) throw error;
  } else if (action === 'update') {
    let query = supabase.from(table).update(data);
    for (const [k, v] of Object.entries(match)) query = query.eq(k, v);
    const { error } = await query;
    if (error) throw error;
  } else if (action === 'delete') {
    let query = supabase.from(table).delete();
    for (const [k, v] of Object.entries(match)) query = query.eq(k, v);
    const { error } = await query;
    if (error) throw error;
  }
}

// Fire-and-forget push to Supabase. Queue if offline/failed.
// NEVER awaited — localStorage is instant, Supabase syncs in background.
// Tracks pending state so backgroundSync won't overwrite unconfirmed writes.
function tryPush(op) {
  if (!isConfigured()) return;
  const pendingId = op.data?.id || op.match?.id;
  if (pendingId) markPending(pendingId, op.action);
  if (navigator.onLine) {
    pushToSupabase(op).then(() => {
      if (pendingId) clearPending(pendingId);
    }).catch(err => {
      console.warn('Push failed, queuing:', err);
      enqueue(op);
    });
  } else {
    enqueue(op);
  }
}

let _processingQueue = false;

export async function processQueue() {
  if (!isConfigured() || !navigator.onLine || _processingQueue) return;
  _processingQueue = true;
  try {
    await processQueueInner();
  } finally {
    _processingQueue = false;
  }
}

async function processQueueInner() {
  const q = getQueue();
  if (q.length === 0) return;
  const remaining = [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24h ago
  for (const op of q) {
    // Stale queued items (>24h) are logged to failedWrites instead of vanishing —
    // they're recoverable from the verifier UI and visible to the user.
    if (op.queuedAt && new Date(op.queuedAt).getTime() < cutoff) {
      console.warn('Logging stale queue item (>24h):', op.table, op.action);
      logFailedWrite(op, 'stale (>24h in queue)');
      const pid = op.data?.id || op.match?.id;
      if (pid) clearPending(pid);
      continue;
    }
    try {
      await pushToSupabase(op);
      const pid = op.data?.id || op.match?.id;
      if (pid) clearPending(pid);
    } catch (err) {
      const msg = err?.message || '';
      // Duplicate key on a queued insert means the row already landed (double push or
      // another device won the race) — that's success, not a failure to log.
      if (msg.includes('duplicate key')) {
        const pid = op.data?.id || op.match?.id;
        if (pid) clearPending(pid);
        continue;
      }
      // Permanent errors (type/constraint mismatch) are logged — never silently dropped.
      // Transient errors stay in the queue for retry.
      if (msg.includes('invalid input') || msg.includes('violates') || msg.includes('type')) {
        console.warn('Logging permanent-error queue item:', msg);
        logFailedWrite(op, err);
        const pid = op.data?.id || op.match?.id;
        if (pid) clearPending(pid);
      } else {
        remaining.push(op);
      }
    }
  }
  // Ops enqueued while we were pushing (tryPush failures during the run) sit past our
  // snapshot — keep them instead of clobbering the queue with just `remaining`.
  const appended = getQueue().slice(q.length);
  saveQueue([...remaining, ...appended]);
}

export function clearFetchCache() {
  _synced = false;
}

// ── Background Sync (poll + visibility/realtime fallback) ──
// Pushes any queued writes first, then pulls fresh data. Re-entrancy-guarded so an
// overlapping poll/visibility/realtime trigger can't interleave with a running sync.
let _bgSyncing = false;

export async function backgroundSync() {
  if (!isConfigured() || !navigator.onLine || _bgSyncing) return;
  _bgSyncing = true;
  try {
    // Retry queued writes on EVERY sync — previously they only retried on app load,
    // online event, or tab-visible, so a failed push could sit for hours while polls
    // kept reverting its local effect.
    await processQueue();
    await syncDown();
    save('lastBgSync', nowStr());
    console.log('backgroundSync complete', todayStr());
  } catch (err) {
    save('lastBgSyncError', err?.message || String(err));
    console.warn('backgroundSync failed:', err);
  } finally {
    _bgSyncing = false;
  }
}

// ══════════════════════════════════════
// Debug Info
// ══════════════════════════════════════

export function getSyncDebugInfo() {
  const queue = load('writeQueue', []);
  const pending = getPending();
  const children = load('children', []);
  const today = todayStr();
  const completions = {};
  for (const child of children) {
    const key = `daily_comp_${child.id}_${today}`;
    completions[child.name] = load(key, []);
  }
  // What server returned on last sync per child
  const serverPulls = {};
  for (const child of children) {
    serverPulls[child.name] = load('lastSyncPull_' + child.name, null);
  }

  return {
    synced: _synced,
    online: navigator.onLine,
    configured: isConfigured(),
    queueLength: queue.length,
    queue: queue.slice(0, 10),
    pendingOps: pending,
    todayCompletions: completions,
    children: children.map(c => ({ id: c.id, name: c.name })),
    lastBgSync: load('lastBgSync', 'never'),
    lastBgSyncError: load('lastBgSyncError', null),
    todayStr: today,
    serverPulls,
  };
}

// ══════════════════════════════════════
// Children
// ══════════════════════════════════════

export async function getChildren() {
  if (!_synced) await initialSync();
  return load('children', []);
}

export async function addChild(name, avatarColor = '#9b59b6', avatarEmoji = '🐉') {
  const child = { id: uid(), name, avatar_color: avatarColor, avatar_emoji: avatarEmoji, sort_order: load('children').length, created_at: nowStr() };
  const c = load('children'); c.push(child); save('children', c);
  tryPush({ table: 'children', action: 'insert', data: child });
  return child;
}

export async function updateChild(id, updates) {
  const c = load('children'); const i = c.findIndex(x => x.id === id);
  if (i >= 0) Object.assign(c[i], updates); save('children', c);
  tryPush({ table: 'children', action: 'update', data: updates, match: { id } });
  return c[i];
}

export async function deleteChild(id) {
  save('children', load('children').filter(c => c.id !== id));
  tryPush({ table: 'children', action: 'delete', match: { id } });
}

// ══════════════════════════════════════
// Task Templates
// ══════════════════════════════════════

export async function getTaskTemplates(childId, taskType) {
  return load(`tasks_${childId}_${taskType}`, []);
}

export async function addTaskTemplate(template) {
  const t = { id: uid(), ...template, active: true, created_at: nowStr() };
  const key = `tasks_${t.child_id}_${t.task_type}`;
  const cached = load(key, []); cached.push(t); save(key, cached);
  tryPush({ table: 'task_templates', action: 'insert', data: t });
  return t;
}

export async function updateTaskTemplate(id, updates) {
  ['daily', 'weekly'].forEach(type => {
    load('children', []).forEach(child => {
      const key = `tasks_${child.id}_${type}`;
      const cached = load(key, []);
      const i = cached.findIndex(t => t.id === id);
      if (i >= 0) { Object.assign(cached[i], updates); save(key, cached); }
    });
  });
  tryPush({ table: 'task_templates', action: 'update', data: updates, match: { id } });
}

export async function deleteTaskTemplate(id) {
  ['daily', 'weekly'].forEach(type => {
    load('children', []).forEach(child => {
      const key = `tasks_${child.id}_${type}`;
      save(key, load(key, []).filter(t => t.id !== id && t.parent_id !== id));
    });
  });
  tryPush({ table: 'task_templates', action: 'delete', match: { id } });
}

export function buildTaskTree(templates) {
  const mainTasks = templates.filter(t => !t.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  return mainTasks.map(main => ({
    ...main,
    subtasks: templates.filter(t => t.parent_id === main.id).sort((a, b) => a.sort_order - b.sort_order),
  }));
}

// ══════════════════════════════════════
// Daily Completions
// ══════════════════════════════════════

export async function getDailyCompletions(childId, date) {
  const d = date || todayStr();
  return load(`daily_comp_${childId}_${d}`, []);
}

export async function toggleDailyCompletion(childId, taskTemplateId, date, completedBy = '') {
  const d = date || todayStr();
  const key = `daily_comp_${childId}_${d}`;
  const cached = load(key, []);
  const idx = cached.findIndex(c => c.task_template_id === taskTemplateId);

  if (idx >= 0) {
    const removed = cached.splice(idx, 1)[0];
    save(key, cached);
    tryPush({ table: 'daily_completions', action: 'delete', match: { id: removed.id } });
    return { completed: false };
  } else {
    // Conflict check: another device may have completed this. Two passes.
    let conflictCheckFailed = false;
    if (isConfigured() && navigator.onLine) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data: existing, error } = await supabase.from('daily_completions').select('id')
            .eq('child_id', childId).eq('task_template_id', taskTemplateId).eq('completion_date', d).limit(1);
          if (error) throw error;
          if (existing && existing.length > 0) {
            cached.push({ id: existing[0].id, child_id: childId, task_template_id: taskTemplateId, completion_date: d, completed_by: completedBy, completed_at: nowStr() });
            save(key, cached);
            return { completed: true, alreadySynced: true };
          }
          conflictCheckFailed = false;
          break;
        } catch (err) {
          conflictCheckFailed = true;
          console.warn(`Conflict check attempt ${attempt + 1} failed:`, err?.message);
          if (attempt === 0) await new Promise(r => setTimeout(r, 500)); // brief retry delay
        }
      }
    }

    // Also check local gem_ledger for an existing same-day entry — last line of defense
    // against duplicates when conflict check fails (offline, network error, etc.)
    if (conflictCheckFailed) {
      const ledgerKey = `ledger_${childId}`;
      const ledger = load(ledgerKey, []);
      const sameDayEntry = ledger.find(g =>
        g.reference_id === taskTemplateId && localDateOf(g.created_at) === d && notDeleted(g));
      if (sameDayEntry) {
        // We already have a gem ledger entry for this task today — don't double-count
        cached.push({ id: uid(), child_id: childId, task_template_id: taskTemplateId, completion_date: d, completed_by: completedBy, completed_at: nowStr() });
        save(key, cached);
        return { completed: true, alreadySynced: true, conflictCheckFailed: true };
      }
    }

    const comp = { id: uid(), child_id: childId, task_template_id: taskTemplateId, completion_date: d, completed_by: completedBy, completed_at: nowStr() };
    cached.push(comp);
    save(key, cached);
    tryPush({ table: 'daily_completions', action: 'insert', data: comp });
    return { completed: true, conflictCheckFailed };
  }
}

// ══════════════════════════════════════
// Weekly Completions
// ══════════════════════════════════════

export async function getWeeklyCompletions(childId, weekOf) {
  return load(`weekly_comp_${childId}_${weekOf}`, []);
}

export async function toggleWeeklyCompletion(childId, taskTemplateId, dayOfWeek, weekOf, completedBy = '') {
  const key = `weekly_comp_${childId}_${weekOf}`;
  const cached = load(key, []);
  const idx = cached.findIndex(c => c.task_template_id === taskTemplateId && c.day_of_week === dayOfWeek);

  if (idx >= 0) {
    const removed = cached.splice(idx, 1)[0];
    save(key, cached);
    tryPush({ table: 'weekly_completions', action: 'delete', match: { id: removed.id } });
    return { completed: false };
  } else {
    // Conflict check: see if another device already completed this
    if (isConfigured() && navigator.onLine) {
      try {
        const { data: existing } = await supabase.from('weekly_completions').select('id')
          .eq('child_id', childId).eq('task_template_id', taskTemplateId)
          .eq('week_of', weekOf).eq('day_of_week', dayOfWeek).limit(1);
        if (existing && existing.length > 0) {
          cached.push({ id: existing[0].id, child_id: childId, task_template_id: taskTemplateId, week_of: weekOf, day_of_week: dayOfWeek, completed_by: completedBy, completed_at: nowStr() });
          save(key, cached);
          return { completed: true, alreadySynced: true };
        }
      } catch { /* proceed with normal insert */ }
    }
    const comp = { id: uid(), child_id: childId, task_template_id: taskTemplateId, week_of: weekOf, day_of_week: dayOfWeek, completed_by: completedBy, completed_at: nowStr() };
    cached.push(comp);
    save(key, cached);
    tryPush({ table: 'weekly_completions', action: 'insert', data: comp });
    return { completed: true };
  }
}

// ══════════════════════════════════════
// Bonus Listening
// ══════════════════════════════════════

export async function getBonusListening(childId) {
  return load(`bonus_${childId}`, []);
}

export async function addBonusListening(childId, description, gemsAwarded, awardedBy = '') {
  const bonus = { id: uid(), child_id: childId, description, gems_awarded: gemsAwarded, awarded_by: awardedBy, event_date: todayStr(), created_at: nowStr() };
  const cached = load(`bonus_${childId}`, []); cached.unshift(bonus); save(`bonus_${childId}`, cached);
  tryPush({ table: 'bonus_listening', action: 'insert', data: bonus });
  return bonus;
}

export async function deleteBonusListening(id) {
  load('children', []).forEach(child => {
    const key = `bonus_${child.id}`;
    save(key, load(key, []).filter(b => b.id !== id));
  });
  tryPush({ table: 'bonus_listening', action: 'delete', match: { id } });
}

// ══════════════════════════════════════
// Gem Ledger — ALL reads from localStorage only
// ══════════════════════════════════════

export async function getGemBalance(childId) {
  return load(`ledger_${childId}`, []).filter(notDeleted).reduce((sum, g) => sum + amt(g), 0);
}

export async function getCollectedBalance(childId) {
  const ledger = load(`ledger_${childId}`, []).filter(notDeleted);
  const givenEarned = ledger.filter(g => amt(g) > 0 && g.gems_given).reduce((sum, g) => sum + amt(g), 0);
  const spent = ledger.filter(g => amt(g) < 0).reduce((sum, g) => sum + amt(g), 0);
  return Math.floor(givenEarned + spent);
}

export async function getAllUngiven(childId) {
  return load(`ledger_${childId}`, []).filter(notDeleted).filter(g => !g.gems_given && amt(g) > 0).reduce((sum, g) => sum + amt(g), 0);
}

export async function getTodayGems(childId) {
  const today = todayStr();
  const data = load(`ledger_${childId}`, []).filter(notDeleted)
    .filter(g => amt(g) > 0 && localDateOf(g.created_at) === today);
  return {
    earned: data.reduce((sum, r) => sum + amt(r), 0),
    given: data.filter(r => r.gems_given).reduce((sum, r) => sum + amt(r), 0),
    ungiven: data.filter(r => !r.gems_given).reduce((sum, r) => sum + amt(r), 0),
  };
}

export async function getUngiven(childId) {
  return load(`ledger_${childId}`, []).filter(notDeleted).filter(g => !g.gems_given && amt(g) > 0);
}

export async function addGemTransaction(childId, amount, source, description, referenceId = null, createdBy = '') {
  const entry = { id: uid(), child_id: childId, amount, source, description, reference_id: referenceId, gems_given: false, given_date: null, created_at: nowStr(), created_by: createdBy };
  const key = `ledger_${childId}`;
  const cached = load(key, []); cached.push(entry); save(key, cached);
  tryPush({ table: 'gem_ledger', action: 'insert', data: entry });
  return entry;
}

// Soft-delete ungiven ledger entries for a reference_id. Already-given entries are
// never removed (kid already received those gems physically).
//
// opts narrows WHICH entries get removed — without it, every ungiven entry sharing the
// reference_id goes (daily/weekly tasks reuse the template id every day, so an unscoped
// call on uncheck was silently erasing prior days' owed gems):
//   - string opts → treated as `reason` (back-compat for bonus deletes, where the id is unique)
//   - { date }        only entries created on that local date
//   - { description } prefer entries with this exact description (weekly day-tagged titles)
//   - { sources }     only these ledger sources (e.g. ['task'] so 'task_bonus' survives)
//   - { limit }       cap at N most-recent entries
//   - { reason, deletedBy }
// If date/description scoping matches nothing but candidates exist (e.g. a task checked
// retroactively, so created_at is today but the page date is yesterday), fall back to the
// single most-recent candidate instead of removing everything.
export async function removeGemTransaction(referenceId, optsOrReason = 'task uncheck or bonus delete', deletedBy = '') {
  const opts = typeof optsOrReason === 'string'
    ? { reason: optsOrReason, deletedBy }
    : { deletedBy, ...optsOrReason };
  const reason = opts.reason || 'task uncheck or bonus delete';
  const byNewest = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));

  const removedIds = [];
  const stamp = nowStr();
  load('children', []).forEach(child => {
    const key = `ledger_${child.id}`;
    const ledger = load(key, []);
    let candidates = ledger.filter(g => g.reference_id === referenceId && !g.gems_given && !g.deleted_at);
    if (opts.sources) candidates = candidates.filter(g => opts.sources.includes(g.source));

    let scoped = candidates;
    if (opts.date) scoped = scoped.filter(g => localDateOf(g.created_at) === opts.date);
    if (opts.description) {
      const withDesc = scoped.filter(g => g.description === opts.description);
      if (withDesc.length > 0) scoped = withDesc;
    }
    let toRemove = scoped;
    if ((opts.date || opts.description) && scoped.length === 0 && candidates.length > 0) {
      toRemove = [candidates.slice().sort(byNewest)[0]];
    }
    if (opts.limit && toRemove.length > opts.limit) {
      toRemove = toRemove.slice().sort(byNewest).slice(0, opts.limit);
    }

    const removeIds = new Set(toRemove.map(g => g.id));
    if (removeIds.size === 0) return;
    ledger.forEach(g => {
      if (removeIds.has(g.id)) {
        g.deleted_at = stamp;
        g.deleted_reason = reason;
        g.deleted_by = opts.deletedBy || '';
        removedIds.push(g.id);
      }
    });
    save(key, ledger);
  });
  // Push UPDATE (not DELETE) for each soft-deleted entry
  for (const id of removedIds) {
    tryPush({
      table: 'gem_ledger',
      action: 'update',
      data: { deleted_at: stamp, deleted_reason: reason, deleted_by: deletedBy },
      match: { id },
    });
  }
}

// One-time cleanup: mark ALL ungiven as given, then add an adjustment entry
// to round the balance to a target whole number
export async function reconcileBalance(childId, targetBalance) {
  const key = `ledger_${childId}`;
  const ledger = load(key, []);
  // Mark everything (non-deleted) as given — both locally and push to Supabase
  ledger.forEach(g => {
    if (!g.gems_given && amt(g) > 0 && !g.deleted_at) {
      g.gems_given = true;
      g.given_date = todayStr();
      tryPush({ table: 'gem_ledger', action: 'update', data: { gems_given: true, given_date: todayStr() }, match: { id: g.id } });
    }
  });
  // Calculate current balance — exclude soft-deleted rows
  const live = ledger.filter(notDeleted);
  const givenEarned = live.filter(g => amt(g) > 0 && g.gems_given).reduce((sum, g) => sum + amt(g), 0);
  const spent = live.filter(g => amt(g) < 0).reduce((sum, g) => sum + amt(g), 0);
  const current = givenEarned + spent;
  const diff = targetBalance - current;
  if (Math.abs(diff) > 0.001) {
    const adj = { id: uid(), child_id: childId, amount: diff, source: 'manual', description: 'Balance reconciliation', reference_id: null, gems_given: true, given_date: todayStr(), created_at: nowStr(), created_by: '' };
    ledger.push(adj);
    tryPush({ table: 'gem_ledger', action: 'insert', data: adj });
  }
  save(key, ledger);
}

export async function markGemsGiven(childId) {
  const key = `ledger_${childId}`;
  const ledger = load(key, []);
  const ungiven = ledger.filter(g => !g.gems_given && amt(g) > 0 && !g.deleted_at)
    .sort((a, b) => amt(b) - amt(a)); // largest first — fit big entries before small budget runs out
  const total = ungiven.reduce((sum, g) => sum + amt(g), 0);
  const wholeToGive = Math.floor(total);
  if (wholeToGive <= 0) return 0;

  // Greedy: take each entry that still fits in the remaining budget.
  // After largest-first pass, do a smallest-first pass over skipped entries
  // to fill any remaining gap (handles awkward fractional combinations).
  let remaining = wholeToGive;
  const givenIds = new Set();
  for (const g of ungiven) {
    if (remaining <= 0.001) break;
    if (amt(g) <= remaining + 0.001) {
      remaining -= amt(g);
      givenIds.add(g.id);
    }
  }
  // Fill gap with skipped (smaller) entries if any remain
  if (remaining > 0.001) {
    const skipped = [...ungiven].reverse(); // smallest first
    for (const g of skipped) {
      if (remaining <= 0.001) break;
      if (givenIds.has(g.id)) continue;
      if (amt(g) <= remaining + 0.001) {
        remaining -= amt(g);
        givenIds.add(g.id);
      }
    }
  }

  // Mark the chosen entries
  const today = todayStr();
  for (const g of ledger) {
    if (givenIds.has(g.id)) {
      g.gems_given = true;
      g.given_date = today;
    }
  }
  save(key, ledger);

  // Push each marked entry to Supabase
  for (const id of givenIds) {
    tryPush({ table: 'gem_ledger', action: 'update',
      data: { gems_given: true, given_date: today },
      match: { id }
    });
  }
  return wholeToGive;
}

export async function getGemHistory(childId, limit = 50) {
  // Soft-deleted entries are excluded from history by default — they live in the
  // "Removed" panel surfaced by the verifier so they're recoverable but don't pollute
  // the running balance display.
  return load(`ledger_${childId}`, [])
    .filter(notDeleted)
    .sort((a, b) => {
      const at = String(a.created_at || '');
      const bt = String(b.created_at || '');
      return bt < at ? -1 : bt > at ? 1 : 0;
    })
    .slice(0, limit);
}

// ══════════════════════════════════════
// Store
// ══════════════════════════════════════

export async function getStoreItems() {
  return load('store_items', []).filter(i => i.active !== false);
}

export async function addStoreItem(item) {
  const i = { id: uid(), ...item, active: true, sort_order: load('store_items', []).length, created_at: nowStr() };
  const cached = load('store_items', []); cached.push(i); save('store_items', cached);
  tryPush({ table: 'store_items', action: 'insert', data: i });
  return i;
}

export async function updateStoreItem(id, updates) {
  const cached = load('store_items', []);
  const idx = cached.findIndex(i => i.id === id);
  if (idx >= 0) Object.assign(cached[idx], updates);
  save('store_items', cached);
  tryPush({ table: 'store_items', action: 'update', data: updates, match: { id } });
}

export async function deleteStoreItem(id) {
  const cached = load('store_items', []);
  const idx = cached.findIndex(i => i.id === id);
  if (idx >= 0) cached[idx].active = false;
  save('store_items', cached);
  tryPush({ table: 'store_items', action: 'update', data: { active: false }, match: { id } });
}

export async function redeemStoreItem(childId, storeItem, redeemedBy = '') {
  // Guard against negative balances — kid can't redeem more than they have in jar.
  // Must exclude soft-deleted rows or removed gems still count as spendable.
  const ledger = load(`ledger_${childId}`, []).filter(notDeleted);
  const givenEarned = ledger.filter(g => amt(g) > 0 && g.gems_given).reduce((s, g) => s + amt(g), 0);
  const spent = ledger.filter(g => amt(g) < 0).reduce((s, g) => s + amt(g), 0);
  const jar = givenEarned + spent;
  if (jar < storeItem.gem_cost - 0.001) {
    const err = new Error(`Not enough gems in jar (has ${Math.floor(jar)}, needs ${storeItem.gem_cost})`);
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }

  const redemption = { id: uid(), child_id: childId, store_item_id: storeItem.id, item_name: storeItem.name, gems_spent: storeItem.gem_cost, redeemed_at: nowStr(), redeemed_by: redeemedBy };
  const cached = load(`redemptions_${childId}`, []); cached.unshift(redemption); save(`redemptions_${childId}`, cached);
  tryPush({ table: 'store_redemptions', action: 'insert', data: redemption });
  await addGemTransaction(childId, -storeItem.gem_cost, 'store', `Redeemed: ${storeItem.name}`, storeItem.id, redeemedBy);
}

export async function getRedemptionHistory(childId) {
  return load(`redemptions_${childId}`, []);
}

// ══════════════════════════════════════
// Supabase Realtime — push-based sync
// ══════════════════════════════════════

let _realtimeChannels = [];

export function subscribeToRealtime(onUpdate) {
  if (!isConfigured() || !supabase) return () => {};

  // Clean up any existing subscriptions
  _realtimeChannels.forEach(ch => supabase.removeChannel(ch));
  _realtimeChannels = [];

  // Subscribe to each table on its own channel (avoids RLS/private channel issues)
  const tables = ['daily_completions', 'weekly_completions', 'gem_ledger', 'task_templates', 'children', 'store_items', 'bonus_listening', 'store_redemptions'];

  for (const table of tables) {
    const ch = supabase.channel(`rt-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        handleRealtimeEvent(table, payload);
        onUpdate();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Realtime: ${table} connected`);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`Realtime ${table}:`, status);
        }
      });
    _realtimeChannels.push(ch);
  }

  return () => {
    _realtimeChannels.forEach(ch => supabase.removeChannel(ch));
    _realtimeChannels = [];
  };
}

function handleRealtimeEvent(table, payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  console.log(`Realtime ${eventType} on ${table}:`, newRow?.id || oldRow?.id);
  const pending = getPending();
  const record = newRow || oldRow;
  if (!record) return;

  // Skip events for records we're currently pushing (prevent echo)
  // But only if the pending op is fresh (< 30s old)
  if (record.id && pending[record.id]) {
    const entry = pending[record.id];
    const age = typeof entry === 'object' && entry.at ? Date.now() - entry.at : Infinity;
    if (age < 30000) return; // fresh pending — skip echo
    clearPending(record.id); // stale — clear it and process the event
  }
  // Skip events for records with a QUEUED local write — local intent wins until the
  // queue pushes (otherwise the event reverts local state that the queue will re-apply).
  if (record.id && queuedActions().has(record.id)) return;

  // For DELETE events, oldRow may only contain {id} without child_id/date
  // (unless replica identity full is set). Use a scan helper for these cases.
  const deleteById = (prefix, id) => {
    let found = false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX + prefix)) {
        const shortKey = k.slice(PREFIX.length);
        const arr = load(shortKey, []);
        const filtered = arr.filter(r => r.id !== id);
        if (filtered.length < arr.length) {
          save(shortKey, filtered);
          found = true;
        }
      }
    }
    return found;
  };

  if (table === 'daily_completions') {
    if (eventType === 'DELETE') {
      deleteById('daily_comp_', oldRow.id);
    } else if (eventType === 'INSERT') {
      const childId = record.child_id;
      const date = record.completion_date;
      if (!childId || !date) { console.warn('Realtime daily INSERT missing fields:', record); return; }
      const key = `daily_comp_${childId}_${date}`;
      const cached = load(key, []);
      if (!cached.find(c => c.id === record.id)) {
        cached.push(record);
        save(key, cached);
      }
    }

  } else if (table === 'weekly_completions') {
    if (eventType === 'DELETE') {
      deleteById('weekly_comp_', oldRow.id);
    } else if (eventType === 'INSERT') {
      const childId = record.child_id;
      const weekOf = record.week_of;
      if (!childId || !weekOf) return;
      const key = `weekly_comp_${childId}_${weekOf}`;
      const cached = load(key, []);
      if (!cached.find(c => c.id === record.id)) {
        cached.push(record);
        save(key, cached);
      }
    }

  } else if (table === 'gem_ledger') {
    if (eventType === 'DELETE') {
      // Capture a tombstone before removing from cache so any incoming realtime
      // hard-delete (e.g. from an older client version still pushing DELETE) is
      // recoverable in the verifier instead of vanishing without a trace.
      const lost = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX + 'ledger_')) {
          const arr = load(k.slice(PREFIX.length), []);
          const hit = arr.find(r => r.id === oldRow.id);
          if (hit) lost.push({ ...hit, lostAt: nowStr(), lostVia: 'realtime DELETE event' });
        }
      }
      if (lost.length > 0) {
        const tombstones = load('lostLedgerEntries', []);
        save('lostLedgerEntries', [...tombstones, ...lost].slice(-200));
      }
      deleteById('ledger_', oldRow.id);
    } else if (eventType === 'INSERT') {
      const childId = record.child_id;
      if (!childId) return;
      const key = `ledger_${childId}`;
      const cached = load(key, []);
      if (!cached.find(g => g.id === record.id)) {
        cached.push(record);
        save(key, cached);
      }
    } else if (eventType === 'UPDATE') {
      const childId = record.child_id;
      if (!childId) return;
      const key = `ledger_${childId}`;
      const cached = load(key, []);
      const idx = cached.findIndex(g => g.id === record.id);
      if (idx >= 0) cached[idx] = record; else cached.push(record);
      save(key, cached);
    }

  } else if (table === 'task_templates') {
    if (eventType === 'DELETE') {
      // Scan all task caches for this ID
      deleteById('tasks_', oldRow.id);
    } else {
      const childId = record.child_id;
      const type = record.task_type;
      if (!childId || !type) return;
      const key = `tasks_${childId}_${type}`;
      const cached = load(key, []);
      if (eventType === 'INSERT') {
        if (!cached.find(t => t.id === record.id)) {
          cached.push(record);
          save(key, cached);
        }
      } else if (eventType === 'UPDATE') {
        const idx = cached.findIndex(t => t.id === record.id);
        if (idx >= 0) cached[idx] = record; else cached.push(record);
        save(key, cached);
      }
    }

  } else if (table === 'children') {
    const cached = load('children', []);
    if (eventType === 'INSERT') {
      if (!cached.find(c => c.id === record.id)) {
        cached.push(record);
        save('children', cached);
      }
    } else if (eventType === 'UPDATE') {
      const idx = cached.findIndex(c => c.id === record.id);
      if (idx >= 0) cached[idx] = record; else cached.push(record);
      save('children', cached);
    } else if (eventType === 'DELETE') {
      save('children', cached.filter(c => c.id !== oldRow.id));
    }

  } else if (table === 'store_items') {
    const cached = load('store_items', []);
    if (eventType === 'INSERT') {
      if (!cached.find(i => i.id === record.id)) {
        cached.push(record);
        save('store_items', cached);
      }
    } else if (eventType === 'UPDATE') {
      const idx = cached.findIndex(i => i.id === record.id);
      if (idx >= 0) cached[idx] = record; else cached.push(record);
      save('store_items', cached);
    } else if (eventType === 'DELETE') {
      save('store_items', cached.filter(i => i.id !== oldRow.id));
    }

  } else if (table === 'bonus_listening') {
    if (eventType === 'DELETE') {
      deleteById('bonus_', oldRow.id);
    } else if (eventType === 'INSERT') {
      const childId = record.child_id;
      if (!childId) return;
      const key = `bonus_${childId}`;
      const cached = load(key, []);
      if (!cached.find(b => b.id === record.id)) {
        cached.unshift(record);
        save(key, cached);
      }
    } else if (eventType === 'UPDATE') {
      const childId = record.child_id;
      if (!childId) return;
      const key = `bonus_${childId}`;
      const cached = load(key, []);
      const idx = cached.findIndex(b => b.id === record.id);
      if (idx >= 0) cached[idx] = record; else cached.unshift(record);
      save(key, cached);
    }

  } else if (table === 'store_redemptions') {
    if (eventType === 'DELETE') {
      deleteById('redemptions_', oldRow.id);
    } else if (eventType === 'INSERT') {
      const childId = record.child_id;
      if (!childId) return;
      const key = `redemptions_${childId}`;
      const cached = load(key, []);
      if (!cached.find(r => r.id === record.id)) {
        cached.unshift(record);
        save(key, cached);
      }
    }
  }
}

// ── Helpers ──
export const today = todayStr;
export function mondayOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
