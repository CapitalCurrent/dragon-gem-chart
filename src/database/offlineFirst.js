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
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Pending ops tracker ──
// Tracks IDs of completions that haven't been confirmed on the server yet.
// backgroundSync will preserve these instead of overwriting them.
function getPending() { return load('pendingOps', {}); }
function savePending(p) { save('pendingOps', p); }
function markPending(id, action) {
  const p = getPending(); p[id] = action; savePending(p);  // action: 'insert' | 'delete'
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

  const serverIds = new Set(serverData.map(r => r.id));
  const merged = [...serverData];

  for (const id of pendingIds) {
    if (pending[id] === 'insert' && !serverIds.has(id)) {
      // Local insert not yet on server — keep it
      const local = localData.find(r => r.id === id);
      if (local) merged.push(local);
    } else if (pending[id] === 'delete' && serverIds.has(id)) {
      // Local delete not yet on server — remove it from merged
      const idx = merged.findIndex(r => r.id === id);
      if (idx >= 0) merged.splice(idx, 1);
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

      // Today's completions — merge with any pending local writes
      const { data: dailyComps } = await supabase.from('daily_completions').select('*')
        .eq('child_id', child.id).eq('completion_date', todayStr());
      const dailyKey = `daily_comp_${child.id}_${todayStr()}`;
      save(dailyKey, mergeWithPending(dailyComps || [], load(dailyKey, [])));

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

      // Today's daily completions — merge with pending local writes
      const { data: dailyComps } = await supabase.from('daily_completions').select('*')
        .eq('child_id', child.id).eq('completion_date', todayStr());
      const dailyKey = `daily_comp_${child.id}_${todayStr()}`;
      save(dailyKey, mergeWithPending(dailyComps || [], load(dailyKey, [])));

      // This week's weekly completions — merge with pending local writes
      const wk = mondayOfWeek();
      const { data: weeklyComps } = await supabase.from('weekly_completions').select('*')
        .eq('child_id', child.id).eq('week_of', wk);
      const weeklyKey = `weekly_comp_${child.id}_${wk}`;
      save(weeklyKey, mergeWithPending(weeklyComps || [], load(weeklyKey, [])));

      // Ledger (for balance accuracy)
      const { data: ledger } = await supabase.from('gem_ledger').select('*').eq('child_id', child.id);
      save(`ledger_${child.id}`, ledger || []);
    }
  } catch (err) {
    // Silent fail — this is a background poll, don't disrupt the user
  }
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
  const todayStart = todayStr() + 'T00:00:00';
  const data = load(`ledger_${childId}`, []).filter(g => g.created_at >= todayStart && g.amount > 0);
  return {
    earned: data.reduce((sum, r) => sum + r.amount, 0),
    given: data.filter(r => r.gems_given).reduce((sum, r) => sum + r.amount, 0),
    ungiven: data.filter(r => !r.gems_given).reduce((sum, r) => sum + r.amount, 0),
  };
}

export async function getUngiven(childId) {
  return load(`ledger_${childId}`, []).filter(g => !g.gems_given && g.amount > 0);
}

// Compact ledger entries older than 30 days into a single summary row per child
// Safe across multiple cycles — previous compact summaries get folded into new ones
export async function compactLedger(childId, daysToKeep = 30) {
  if (!isConfigured() || !navigator.onLine) return; // only compact when online

  const key = `ledger_${childId}`;

  // Pull fresh ledger from Supabase first to avoid race with other device
  const { data: freshLedger } = await supabase.from('gem_ledger').select('*').eq('child_id', childId);
  if (!freshLedger) return;
  save(key, freshLedger);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);
  const cutoffLocal = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  const cutoffISO = cutoff.toISOString();

  // Everything older than cutoff gets compacted
  const old = freshLedger.filter(g => g.created_at < cutoffISO);
  const recent = freshLedger.filter(g => g.created_at >= cutoffISO);

  if (old.length < 5) return; // not worth compacting yet

  // Split into given (positive + spent) and ungiven
  const givenAmount = old.filter(g => g.gems_given || g.amount < 0).reduce((sum, g) => sum + g.amount, 0);
  const ungivenAmount = old.filter(g => !g.gems_given && g.amount > 0).reduce((sum, g) => sum + g.amount, 0);

  const entries = [];
  if (Math.abs(givenAmount) > 0.001) {
    entries.push({
      id: uid(), child_id: childId, amount: givenAmount, source: 'compact',
      description: `Compacted: ${old.length} entries (${daysToKeep}+ days old)`,
      reference_id: null, gems_given: true, given_date: todayStr(),
      created_at: cutoffISO, created_by: '',
    });
  }
  if (ungivenAmount > 0.001) {
    entries.push({
      id: uid(), child_id: childId, amount: ungivenAmount, source: 'compact',
      description: `Compacted ungiven gems (${daysToKeep}+ days old)`,
      reference_id: null, gems_given: false, given_date: null,
      created_at: cutoffISO, created_by: '',
    });
  }

  // Batch delete old entries from Supabase (single query, not per-row)
  try {
    const oldIds = old.map(g => g.id);
    await supabase.from('gem_ledger').delete().in('id', oldIds);
    for (const e of entries) {
      await supabase.from('gem_ledger').insert(e);
    }
  } catch (err) {
    console.warn('Ledger compaction failed:', err);
    return; // don't update local if Supabase failed
  }

  // Save locally only after Supabase succeeded
  save(key, [...entries, ...recent]);

  // Clean up old completions (>30 days) — gems already earned
  try {
    await supabase.from('daily_completions')
      .delete()
      .eq('child_id', childId)
      .lt('completion_date', cutoffLocal);
    await supabase.from('weekly_completions')
      .delete()
      .eq('child_id', childId)
      .lt('week_of', cutoffLocal);
  } catch { /* silent — cleanup is best-effort */ }
}

export async function addGemTransaction(childId, amount, source, description, referenceId = null, createdBy = '') {
  const entry = { id: uid(), child_id: childId, amount, source, description, reference_id: referenceId, gems_given: false, given_date: null, created_at: nowStr(), created_by: createdBy };
  const key = `ledger_${childId}`;
  const cached = load(key, []); cached.push(entry); save(key, cached);
  tryPush({ table: 'gem_ledger', action: 'insert', data: entry });
  return entry;
}

export async function removeGemTransaction(referenceId) {
  load('children', []).forEach(child => {
    const key = `ledger_${child.id}`;
    const ledger = load(key, []);
    // Only remove if gems haven't been collected into jar yet
    save(key, ledger.filter(g => !(g.reference_id === referenceId && !g.gems_given)));
  });
  // Only delete from Supabase if ungiven
  tryPush({ table: 'gem_ledger', action: 'delete', match: { reference_id: referenceId, gems_given: false } });
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
    .sort((a, b) => a.amount - b.amount); // smallest first so large entries don't block
  const total = ungiven.reduce((sum, g) => sum + g.amount, 0);
  const wholeToGive = Math.floor(total);
  if (wholeToGive <= 0) return 0;

  // Mark entries as given until we've accounted for wholeToGive gems
  let remaining = wholeToGive;
  const givenIds = [];
  for (const g of ungiven) {
    if (remaining <= 0) break;
    if (g.amount <= remaining + 0.001) { // small epsilon for float rounding
      g.gems_given = true;
      g.given_date = todayStr();
      remaining -= g.amount;
      givenIds.push(g.id);
    }
  }
  save(key, ledger);
  // Push each marked entry to Supabase
  for (const id of givenIds) {
    tryPush({ table: 'gem_ledger', action: 'update',
      data: { gems_given: true, given_date: todayStr() },
      match: { id }
    });
  }
  return wholeToGive;
}

export async function getGemHistory(childId, limit = 50) {
  return load(`ledger_${childId}`, []).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
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

let _realtimeChannel = null;

export function subscribeToRealtime(onUpdate) {
  if (!isConfigured() || !supabase) return () => {};

  // Clean up any existing subscription
  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }

  _realtimeChannel = supabase.channel('db-sync')
    // Daily completions
    .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_completions' }, (payload) => {
      handleRealtimeEvent('daily_completions', payload);
      onUpdate();
    })
    // Weekly completions
    .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_completions' }, (payload) => {
      handleRealtimeEvent('weekly_completions', payload);
      onUpdate();
    })
    // Gem ledger
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gem_ledger' }, (payload) => {
      handleRealtimeEvent('gem_ledger', payload);
      onUpdate();
    })
    // Task templates
    .on('postgres_changes', { event: '*', schema: 'public', table: 'task_templates' }, (payload) => {
      handleRealtimeEvent('task_templates', payload);
      onUpdate();
    })
    // Children
    .on('postgres_changes', { event: '*', schema: 'public', table: 'children' }, (payload) => {
      handleRealtimeEvent('children', payload);
      onUpdate();
    })
    // Store items
    .on('postgres_changes', { event: '*', schema: 'public', table: 'store_items' }, (payload) => {
      handleRealtimeEvent('store_items', payload);
      onUpdate();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Realtime connected');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Realtime connection issue:', status);
      }
    });

  return () => {
    if (_realtimeChannel) {
      supabase.removeChannel(_realtimeChannel);
      _realtimeChannel = null;
    }
  };
}

function handleRealtimeEvent(table, payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  const pending = getPending();
  const record = newRow || oldRow;
  if (!record) return;

  // Skip events for records we're currently pushing (prevent echo)
  if (record.id && pending[record.id]) return;

  if (table === 'daily_completions') {
    const childId = record.child_id;
    const date = record.completion_date;
    if (!childId || !date) return;
    const key = `daily_comp_${childId}_${date}`;
    const cached = load(key, []);

    if (eventType === 'INSERT') {
      if (!cached.find(c => c.id === record.id)) {
        cached.push(record);
        save(key, cached);
      }
    } else if (eventType === 'DELETE') {
      save(key, cached.filter(c => c.id !== oldRow.id));
    }

  } else if (table === 'weekly_completions') {
    const childId = record.child_id;
    const weekOf = record.week_of;
    if (!childId || !weekOf) return;
    const key = `weekly_comp_${childId}_${weekOf}`;
    const cached = load(key, []);

    if (eventType === 'INSERT') {
      if (!cached.find(c => c.id === record.id)) {
        cached.push(record);
        save(key, cached);
      }
    } else if (eventType === 'DELETE') {
      save(key, cached.filter(c => c.id !== oldRow.id));
    }

  } else if (table === 'gem_ledger') {
    const childId = record.child_id;
    if (!childId) return;
    const key = `ledger_${childId}`;
    const cached = load(key, []);

    if (eventType === 'INSERT') {
      if (!cached.find(g => g.id === record.id)) {
        cached.push(record);
        save(key, cached);
      }
    } else if (eventType === 'UPDATE') {
      const idx = cached.findIndex(g => g.id === record.id);
      if (idx >= 0) cached[idx] = record; else cached.push(record);
      save(key, cached);
    } else if (eventType === 'DELETE') {
      save(key, cached.filter(g => g.id !== oldRow.id));
    }

  } else if (table === 'task_templates') {
    // Refresh all task caches for affected child
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
    } else if (eventType === 'DELETE') {
      // Remove task and its subtasks
      save(key, cached.filter(t => t.id !== oldRow.id && t.parent_id !== oldRow.id));
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
