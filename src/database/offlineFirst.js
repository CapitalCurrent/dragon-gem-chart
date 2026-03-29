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

// ── Initial Sync: Supabase → localStorage (runs once on app load) ──
let _synced = false;

export async function initialSync() {
  if (!isConfigured() || !navigator.onLine || _synced) return;

  // If we already have local data, don't overwrite — local is source of truth
  const hasLocalData = load('children', []).length > 0;

  try {
    if (!hasLocalData) {
      // First-time sync: pull everything from Supabase
      const [children, templates, storeItems] = await Promise.all([
        supabase.from('children').select('*').order('sort_order').then(r => r.data || []),
        supabase.from('task_templates').select('*').eq('active', true).order('sort_order').then(r => r.data || []),
        supabase.from('store_items').select('*').eq('active', true).order('sort_order').then(r => r.data || []),
      ]);

      save('children', children);
      save('store_items', storeItems);

      for (const child of children) {
        save(`tasks_${child.id}_daily`, templates.filter(t => t.child_id === child.id && t.task_type === 'daily'));
        save(`tasks_${child.id}_weekly`, templates.filter(t => t.child_id === child.id && t.task_type === 'weekly'));

        const { data: ledger } = await supabase.from('gem_ledger').select('*').eq('child_id', child.id);
        save(`ledger_${child.id}`, ledger || []);

        const { data: dailyComps } = await supabase.from('daily_completions').select('*')
          .eq('child_id', child.id).eq('completion_date', todayStr());
        save(`daily_comp_${child.id}_${todayStr()}`, dailyComps || []);

        const wk = mondayOfWeek();
        const { data: weeklyComps } = await supabase.from('weekly_completions').select('*')
          .eq('child_id', child.id).eq('week_of', wk);
        save(`weekly_comp_${child.id}_${wk}`, weeklyComps || []);

        const { data: bonuses } = await supabase.from('bonus_listening').select('*')
          .eq('child_id', child.id).order('created_at', { ascending: false });
        save(`bonus_${child.id}`, bonuses || []);

        const { data: redemptions } = await supabase.from('store_redemptions').select('*')
          .eq('child_id', child.id).order('redeemed_at', { ascending: false });
        save(`redemptions_${child.id}`, redemptions || []);
      }
      console.log('Initial sync complete (first-time pull)');
    } else {
      // Subsequent loads: only sync completions and ledger (transactional data)
      // NEVER overwrite task templates or store items — local edits are authoritative
      const children = load('children', []);
      for (const child of children) {
        const { data: dailyComps } = await supabase.from('daily_completions').select('*')
          .eq('child_id', child.id).eq('completion_date', todayStr());
        save(`daily_comp_${child.id}_${todayStr()}`, dailyComps || []);

        const wk = mondayOfWeek();
        const { data: weeklyComps } = await supabase.from('weekly_completions').select('*')
          .eq('child_id', child.id).eq('week_of', wk);
        save(`weekly_comp_${child.id}_${wk}`, weeklyComps || []);
      }
      // Process any queued writes that failed earlier
      await processQueue();
      console.log('Sync complete (completions only, local data preserved)');
    }

    _synced = true;
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
function tryPush(op) {
  if (!isConfigured()) return;
  if (navigator.onLine) {
    pushToSupabase(op).catch(err => {
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
  for (const op of q) {
    try { await pushToSupabase(op); }
    catch { remaining.push(op); }
  }
  saveQueue(remaining);
}

export function clearFetchCache() {
  _synced = false;
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
    save(key, load(key, []).filter(g => g.reference_id !== referenceId));
  });
  tryPush({ table: 'gem_ledger', action: 'delete', match: { reference_id: referenceId } });
}

// One-time cleanup: mark ALL ungiven as given, then add an adjustment entry
// to round the balance to a target whole number
export async function reconcileBalance(childId, targetBalance) {
  const key = `ledger_${childId}`;
  const ledger = load(key, []);
  // Mark everything as given
  ledger.forEach(g => {
    if (!g.gems_given && g.amount > 0) { g.gems_given = true; g.given_date = todayStr(); }
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
  const ungiven = ledger.filter(g => !g.gems_given && g.amount > 0);
  const total = ungiven.reduce((sum, g) => sum + g.amount, 0);
  const wholeToGive = Math.floor(total);
  if (wholeToGive <= 0) return 0;

  // Mark entries as given until we've accounted for wholeToGive gems
  let remaining = wholeToGive;
  const givenIds = [];
  for (const g of ungiven) {
    if (remaining <= 0) break;
    if (g.amount <= remaining) {
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

// ── Helpers ──
export const today = todayStr;
export function mondayOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}
