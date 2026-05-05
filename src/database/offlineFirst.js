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

// Merge server data with pending local writes.
// - Start with server records
// - Add any local records with pending 'insert' that aren't on the server yet
// - Remove any server records with pending 'delete' (local user unchecked before server caught up)
function mergeWithPending(serverData, localData) {
  const pending = getPending();
  const pendingIds = Object.keys(pending);
  if (pendingIds.length === 0) return serverData;  // No pending ops — server wins

  const localIds = new Set(localData.map(r => r.id));
  const serverIds = new Set(serverData.map(r => r.id));
  const merged = [...serverData];
  const STALE_MS = 30000; // 30s TTL — if pending op is older than this, it's stale

  for (const id of pendingIds) {
    // Handle both old format (string) and new format ({action, at})
    const entry = pending[id];
    const action = typeof entry === 'string' ? entry : entry.action;
    const age = typeof entry === 'object' && entry.at ? Date.now() - entry.at : Infinity;

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
    } else {
      // Pending insert already on server, or pending delete already gone — clear
      clearPending(id);
    }
  }
  return merged;
}

// ── Initial Sync: Supabase → localStorage (runs once on app load) ──
let _synced = false;

export async function initialSync() {
  if (!isConfigured() || !navigator.onLine || _synced) return;

  try {
    // Step 1: Push any queued local writes to Supabase FIRST
    await processQueue();

    // Step 2: Pull everything from Supabase
    const [children, templates, storeItems] = await Promise.all([
      supabase.from('children').select('*').order('sort_order').then(r => r.data || []),
      supabase.from('task_templates').select('*').eq('active', true).order('sort_order').then(r => r.data || []),
      supabase.from('store_items').select('*').eq('active', true).order('sort_order').then(r => r.data || []),
    ]);

    save('children', children);
    save('store_items', storeItems);

    // Step 3: Save templates — Supabase is source of truth
    // (gem_value column is now numeric, so fractional values survive)
    for (const child of children) {
      for (const type of ['daily', 'weekly']) {
        const key = `tasks_${child.id}_${type}`;
        save(key, templates.filter(t => t.child_id === child.id && t.task_type === type));
      }

      // Ledger
      const { data: ledger } = await supabase.from('gem_ledger').select('*').eq('child_id', child.id);
      save(`ledger_${child.id}`, ledger || []);

      // Recent daily completions (past 7 days) — single query, bucket by date
      const days = recentDates();
      const { data: allDailyComps } = await supabase.from('daily_completions').select('*')
        .eq('child_id', child.id).gte('completion_date', days[days.length - 1]).lte('completion_date', days[0]);
      for (const day of days) {
        const dailyKey = `daily_comp_${child.id}_${day}`;
        const dayComps = (allDailyComps || []).filter(c => c.completion_date === day);
        save(dailyKey, mergeWithPending(dayComps, load(dailyKey, [])));
      }

      // This week's completions — merge with any pending local writes
      const wk = mondayOfWeek();
      const { data: weeklyComps } = await supabase.from('weekly_completions').select('*')
        .eq('child_id', child.id).eq('week_of', wk);
      const weeklyKey = `weekly_comp_${child.id}_${wk}`;
      save(weeklyKey, mergeWithPending(weeklyComps || [], load(weeklyKey, [])));

      // Bonus listening
      const { data: bonuses } = await supabase.from('bonus_listening').select('*')
        .eq('child_id', child.id).order('created_at', { ascending: false });
      save(`bonus_${child.id}`, bonuses || []);

      // Redemptions
      const { data: redemptions } = await supabase.from('store_redemptions').select('*')
        .eq('child_id', child.id).order('redeemed_at', { ascending: false });
      save(`redemptions_${child.id}`, redemptions || []);
    }

    _synced = true;
    console.log('Sync complete — all data from Supabase, local gem values preserved');
  } catch (err) {
    console.warn('Sync failed, using local cache:', err);
  }
}

// ── Write Queue ──
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

export async function processQueue() {
  if (!isConfigured() || !navigator.onLine) return;
  const q = getQueue();
  if (q.length === 0) return;
  const remaining = [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24h ago
  for (const op of q) {
    // Drop stale queued items older than 24h — they likely have type errors
    // that will never succeed (e.g. int column rejecting decimal values)
    if (op.queuedAt && new Date(op.queuedAt).getTime() < cutoff) {
      console.warn('Dropping stale queue item (>24h):', op.table, op.action);
      continue;
    }
    try {
      await pushToSupabase(op);
      const pid = op.data?.id || op.match?.id;
      if (pid) clearPending(pid);
    } catch (err) {
      // If it's a type/constraint error, drop it instead of re-queuing forever
      const msg = err?.message || '';
      if (msg.includes('invalid input') || msg.includes('violates') || msg.includes('type')) {
        console.warn('Dropping queue item (permanent error):', msg);
      } else {
        remaining.push(op);
      }
    }
  }
  saveQueue(remaining);
}

export function clearFetchCache() {
  _synced = false;
}

// ── Background Sync (30s poll) ──
// Pulls fresh completions + ledger from Supabase without full reload
export async function backgroundSync() {
  if (!isConfigured() || !navigator.onLine) return;
  try {
    // Pull shared data (children, templates, store items)
    const [children, templates, storeItems] = await Promise.all([
      supabase.from('children').select('*').order('sort_order').then(r => r.data || []),
      supabase.from('task_templates').select('*').eq('active', true).order('sort_order').then(r => r.data || []),
      supabase.from('store_items').select('*').eq('active', true).order('sort_order').then(r => r.data || []),
    ]);
    save('children', children);
    save('store_items', storeItems);

    for (const child of children) {
      // Task templates
      for (const type of ['daily', 'weekly']) {
        save(`tasks_${child.id}_${type}`, templates.filter(t => t.child_id === child.id && t.task_type === type));
      }

      // Recent daily completions (past 7 days) — single query, bucket by date
      const days = recentDates();
      const { data: allDailyComps } = await supabase.from('daily_completions').select('*')
        .eq('child_id', child.id).gte('completion_date', days[days.length - 1]).lte('completion_date', days[0]);
      for (const day of days) {
        const dailyKey = `daily_comp_${child.id}_${day}`;
        const dayComps = (allDailyComps || []).filter(c => c.completion_date === day);
        save(dailyKey, mergeWithPending(dayComps, load(dailyKey, [])));
      }

      // This week's weekly completions — merge with pending local writes
      const wk = mondayOfWeek();
      const { data: weeklyComps } = await supabase.from('weekly_completions').select('*')
        .eq('child_id', child.id).eq('week_of', wk);
      const weeklyKey = `weekly_comp_${child.id}_${wk}`;
      save(weeklyKey, mergeWithPending(weeklyComps || [], load(weeklyKey, [])));

      // Ledger (for balance accuracy)
      const { data: ledger } = await supabase.from('gem_ledger').select('*').eq('child_id', child.id);
      save(`ledger_${child.id}`, ledger || []);

      // Bonus listening
      const { data: bonuses } = await supabase.from('bonus_listening').select('*')
        .eq('child_id', child.id).order('created_at', { ascending: false });
      save(`bonus_${child.id}`, bonuses || []);

      // Store redemptions
      const { data: redemptions } = await supabase.from('store_redemptions').select('*')
        .eq('child_id', child.id).order('redeemed_at', { ascending: false });
      save(`redemptions_${child.id}`, redemptions || []);
    }
    save('lastBgSync', nowStr());
    console.log('backgroundSync complete', todayStr());
  } catch (err) {
    save('lastBgSyncError', err?.message || String(err));
    console.warn('backgroundSync failed:', err);
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
    // Conflict check: see if another device already completed this
    if (isConfigured() && navigator.onLine) {
      try {
        const { data: existing } = await supabase.from('daily_completions').select('id')
          .eq('child_id', childId).eq('task_template_id', taskTemplateId).eq('completion_date', d).limit(1);
        if (existing && existing.length > 0) {
          // Already completed on another device — just update local state
          cached.push({ id: existing[0].id, child_id: childId, task_template_id: taskTemplateId, completion_date: d, completed_by: completedBy, completed_at: nowStr() });
          save(key, cached);
          return { completed: true, alreadySynced: true };
        }
      } catch { /* offline or error — proceed with normal insert */ }
    }
    const comp = { id: uid(), child_id: childId, task_template_id: taskTemplateId, completion_date: d, completed_by: completedBy, completed_at: nowStr() };
    cached.push(comp);
    save(key, cached);
    tryPush({ table: 'daily_completions', action: 'insert', data: comp });
    return { completed: true };
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
  return load(`ledger_${childId}`, []).reduce((sum, g) => sum + g.amount, 0);
}

export async function getCollectedBalance(childId) {
  const ledger = load(`ledger_${childId}`, []);
  const givenEarned = ledger.filter(g => g.amount > 0 && g.gems_given).reduce((sum, g) => sum + g.amount, 0);
  const spent = ledger.filter(g => g.amount < 0).reduce((sum, g) => sum + g.amount, 0);
  return Math.floor(givenEarned + spent);
}

export async function getAllUngiven(childId) {
  return load(`ledger_${childId}`, []).filter(g => !g.gems_given && g.amount > 0).reduce((sum, g) => sum + g.amount, 0);
}

export async function getTodayGems(childId) {
  const today = todayStr();
  const data = load(`ledger_${childId}`, []).filter(g => {
    if (g.amount <= 0) return false;
    const ct = new Date(g.created_at);
    const localDate = `${ct.getFullYear()}-${String(ct.getMonth() + 1).padStart(2, '0')}-${String(ct.getDate()).padStart(2, '0')}`;
    return localDate === today;
  });
  return {
    earned: data.reduce((sum, r) => sum + r.amount, 0),
    given: data.filter(r => r.gems_given).reduce((sum, r) => sum + r.amount, 0),
    ungiven: data.filter(r => !r.gems_given).reduce((sum, r) => sum + r.amount, 0),
  };
}

export async function getUngiven(childId) {
  return load(`ledger_${childId}`, []).filter(g => !g.gems_given && g.amount > 0);
}

export async function addGemTransaction(childId, amount, source, description, referenceId = null, createdBy = '') {
  const entry = { id: uid(), child_id: childId, amount, source, description, reference_id: referenceId, gems_given: false, given_date: null, created_at: nowStr(), created_by: createdBy };
  const key = `ledger_${childId}`;
  const cached = load(key, []); cached.push(entry); save(key, cached);
  tryPush({ table: 'gem_ledger', action: 'insert', data: entry });
  return entry;
}

export async function removeGemTransaction(referenceId) {
  const removedIds = [];
  load('children', []).forEach(child => {
    const key = `ledger_${child.id}`;
    const ledger = load(key, []);
    // Remove ungiven gem entries matching this task. No date filter — the entry
    // may have been created today even though the completion is for a past day.
    // gems_given guard ensures already-collected gems are never removed.
    ledger.forEach(g => {
      if (g.reference_id === referenceId && !g.gems_given) {
        removedIds.push(g.id);
      }
    });
    save(key, ledger.filter(g => !removedIds.includes(g.id)));
  });
  // Mark each removed entry as pending so Realtime doesn't re-add them
  removedIds.forEach(id => markPending(id, 'delete'));
  // Delete from Supabase by specific IDs
  for (const id of removedIds) {
    tryPush({ table: 'gem_ledger', action: 'delete', match: { id } });
  }
}

// One-time cleanup: mark ALL ungiven as given, then add an adjustment entry
// to round the balance to a target whole number
export async function reconcileBalance(childId, targetBalance) {
  const key = `ledger_${childId}`;
  const ledger = load(key, []);
  // Mark everything as given — both locally and push to Supabase
  ledger.forEach(g => {
    if (!g.gems_given && g.amount > 0) {
      g.gems_given = true;
      g.given_date = todayStr();
      tryPush({ table: 'gem_ledger', action: 'update', data: { gems_given: true, given_date: todayStr() }, match: { id: g.id } });
    }
  });
  // Calculate current balance
  const givenEarned = ledger.filter(g => g.amount > 0 && g.gems_given).reduce((sum, g) => sum + g.amount, 0);
  const spent = ledger.filter(g => g.amount < 0).reduce((sum, g) => sum + g.amount, 0);
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
  const ungiven = ledger.filter(g => !g.gems_given && g.amount > 0)
    .sort((a, b) => b.amount - a.amount); // largest first — fit big entries before small budget runs out
  const total = ungiven.reduce((sum, g) => sum + g.amount, 0);
  const wholeToGive = Math.floor(total);
  if (wholeToGive <= 0) return 0;

  // Greedy: take each entry that still fits in the remaining budget.
  // After largest-first pass, do a smallest-first pass over skipped entries
  // to fill any remaining gap (handles awkward fractional combinations).
  let remaining = wholeToGive;
  const givenIds = new Set();
  for (const g of ungiven) {
    if (remaining <= 0.001) break;
    if (g.amount <= remaining + 0.001) {
      remaining -= g.amount;
      givenIds.add(g.id);
    }
  }
  // Fill gap with skipped (smaller) entries if any remain
  if (remaining > 0.001) {
    const skipped = [...ungiven].reverse(); // smallest first
    for (const g of skipped) {
      if (remaining <= 0.001) break;
      if (givenIds.has(g.id)) continue;
      if (g.amount <= remaining + 0.001) {
        remaining -= g.amount;
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
  return load(`ledger_${childId}`, [])
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
  const ledger = load(`ledger_${childId}`, []);
  const givenEarned = ledger.filter(g => g.amount > 0 && g.gems_given).reduce((s, g) => s + g.amount, 0);
  const spent = ledger.filter(g => g.amount < 0).reduce((s, g) => s + g.amount, 0);
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
      if (idx >= 0) cached[idx] = record;
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
      if (idx >= 0) cached[idx] = record;
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
