import { supabase } from './supabase';

// ── Helper: today's date as YYYY-MM-DD ──
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── Helper: Monday of current week ──
export const mondayOfWeek = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ══════════════════════════════════════
// Children
// ══════════════════════════════════════

export async function getChildren() {
  const { data, error } = await supabase
    .from('children')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return data;
}

export async function addChild(name, avatarColor = '#9b59b6', avatarEmoji = '🐉') {
  const { data, error } = await supabase
    .from('children')
    .insert({ name, avatar_color: avatarColor, avatar_emoji: avatarEmoji })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateChild(id, updates) {
  const { data, error } = await supabase
    .from('children')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteChild(id) {
  const { error } = await supabase.from('children').delete().eq('id', id);
  if (error) throw error;
}

// ══════════════════════════════════════
// Task Templates
// ══════════════════════════════════════

export async function getTaskTemplates(childId, taskType) {
  let query = supabase
    .from('task_templates')
    .select('*')
    .eq('active', true)
    .order('sort_order');

  if (childId) query = query.eq('child_id', childId);
  if (taskType) query = query.eq('task_type', taskType);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function addTaskTemplate(template) {
  const { data, error } = await supabase
    .from('task_templates')
    .insert(template)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTaskTemplate(id, updates) {
  const { data, error } = await supabase
    .from('task_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTaskTemplate(id) {
  const { error } = await supabase.from('task_templates').delete().eq('id', id);
  if (error) throw error;
}

// Build tree structure: main tasks with nested subtasks
export function buildTaskTree(templates) {
  const mainTasks = templates.filter(t => !t.parent_id);
  return mainTasks.map(main => ({
    ...main,
    subtasks: templates
      .filter(t => t.parent_id === main.id)
      .sort((a, b) => a.sort_order - b.sort_order),
  }));
}

// ══════════════════════════════════════
// Daily Completions
// ══════════════════════════════════════

export async function getDailyCompletions(childId, date = today()) {
  const { data, error } = await supabase
    .from('daily_completions')
    .select('*')
    .eq('child_id', childId)
    .eq('completion_date', date);
  if (error) throw error;
  return data;
}

export async function toggleDailyCompletion(childId, taskTemplateId, date = today(), completedBy = '') {
  // Check if already completed
  const { data: existing } = await supabase
    .from('daily_completions')
    .select('id')
    .eq('child_id', childId)
    .eq('task_template_id', taskTemplateId)
    .eq('completion_date', date)
    .maybeSingle();

  if (existing) {
    // Remove completion
    await supabase.from('daily_completions').delete().eq('id', existing.id);
    return { completed: false };
  } else {
    // Add completion
    await supabase.from('daily_completions').insert({
      child_id: childId,
      task_template_id: taskTemplateId,
      completion_date: date,
      completed_by: completedBy,
    });
    return { completed: true };
  }
}

// ══════════════════════════════════════
// Weekly Completions
// ══════════════════════════════════════

export async function getWeeklyCompletions(childId, weekOf = mondayOfWeek()) {
  const { data, error } = await supabase
    .from('weekly_completions')
    .select('*')
    .eq('child_id', childId)
    .eq('week_of', weekOf);
  if (error) throw error;
  return data;
}

export async function toggleWeeklyCompletion(childId, taskTemplateId, dayOfWeek, weekOf = mondayOfWeek(), completedBy = '') {
  const { data: existing } = await supabase
    .from('weekly_completions')
    .select('id')
    .eq('child_id', childId)
    .eq('task_template_id', taskTemplateId)
    .eq('week_of', weekOf)
    .eq('day_of_week', dayOfWeek)
    .maybeSingle();

  if (existing) {
    await supabase.from('weekly_completions').delete().eq('id', existing.id);
    return { completed: false };
  } else {
    await supabase.from('weekly_completions').insert({
      child_id: childId,
      task_template_id: taskTemplateId,
      week_of: weekOf,
      day_of_week: dayOfWeek,
      completed_by: completedBy,
    });
    return { completed: true };
  }
}

// ══════════════════════════════════════
// Bonus Listening
// ══════════════════════════════════════

export async function getBonusListening(childId, date) {
  let query = supabase
    .from('bonus_listening')
    .select('*')
    .order('created_at', { ascending: false });

  if (childId) query = query.eq('child_id', childId);
  if (date) query = query.eq('event_date', date);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function addBonusListening(childId, description, gemsAwarded, awardedBy = '') {
  const { data, error } = await supabase
    .from('bonus_listening')
    .insert({
      child_id: childId,
      description,
      gems_awarded: gemsAwarded,
      awarded_by: awardedBy,
      event_date: today(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBonusListening(id) {
  const { error } = await supabase.from('bonus_listening').delete().eq('id', id);
  if (error) throw error;
}

// ══════════════════════════════════════
// Gem Ledger
// ══════════════════════════════════════

export async function getGemBalance(childId) {
  const { data, error } = await supabase
    .from('gem_ledger')
    .select('amount')
    .eq('child_id', childId);
  if (error) throw error;
  return data.reduce((sum, row) => sum + row.amount, 0);
}

export async function getCollectedBalance(childId) {
  const { data, error } = await supabase
    .from('gem_ledger')
    .select('amount, gems_given')
    .eq('child_id', childId);
  if (error) throw error;
  const givenEarned = data.filter(g => g.amount > 0 && g.gems_given).reduce((sum, g) => sum + g.amount, 0);
  const spent = data.filter(g => g.amount < 0).reduce((sum, g) => sum + g.amount, 0);
  return givenEarned + spent;
}

export async function getAllUngiven(childId) {
  const { data, error } = await supabase
    .from('gem_ledger')
    .select('amount')
    .eq('child_id', childId)
    .eq('gems_given', false)
    .gt('amount', 0);
  if (error) throw error;
  return data.reduce((sum, g) => sum + g.amount, 0);
}

export async function getTodayGems(childId) {
  const { data, error } = await supabase
    .from('gem_ledger')
    .select('amount, gems_given')
    .eq('child_id', childId)
    .gte('created_at', today() + 'T00:00:00')
    .gt('amount', 0);
  if (error) throw error;
  return {
    earned: data.reduce((sum, r) => sum + r.amount, 0),
    given: data.filter(r => r.gems_given).reduce((sum, r) => sum + r.amount, 0),
    ungiven: data.filter(r => !r.gems_given).reduce((sum, r) => sum + r.amount, 0),
  };
}

export async function getUngiven(childId) {
  const { data, error } = await supabase
    .from('gem_ledger')
    .select('*')
    .eq('child_id', childId)
    .eq('gems_given', false)
    .gt('amount', 0)
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function addGemTransaction(childId, amount, source, description, referenceId = null, createdBy = '') {
  const { data, error } = await supabase
    .from('gem_ledger')
    .insert({
      child_id: childId,
      amount,
      source,
      description,
      reference_id: referenceId,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeGemTransaction(referenceId) {
  // Only remove if gems haven't been collected into jar yet
  const { error } = await supabase
    .from('gem_ledger')
    .delete()
    .eq('reference_id', referenceId)
    .eq('gems_given', false);
  if (error) throw error;
}

export async function markGemsGiven(childId) {
  const { error } = await supabase
    .from('gem_ledger')
    .update({ gems_given: true, given_date: today() })
    .eq('child_id', childId)
    .eq('gems_given', false)
    .gt('amount', 0);
  if (error) throw error;
}

export async function getGemHistory(childId, limit = 50) {
  const { data, error } = await supabase
    .from('gem_ledger')
    .select('*')
    .eq('child_id', childId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// ══════════════════════════════════════
// Store
// ══════════════════════════════════════

export async function getStoreItems() {
  const { data, error } = await supabase
    .from('store_items')
    .select('*')
    .eq('active', true)
    .order('sort_order');
  if (error) throw error;
  return data;
}

export async function addStoreItem(item) {
  const { data, error } = await supabase
    .from('store_items')
    .insert(item)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateStoreItem(id, updates) {
  const { data, error } = await supabase
    .from('store_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteStoreItem(id) {
  const { error } = await supabase
    .from('store_items')
    .update({ active: false })
    .eq('id', id);
  if (error) throw error;
}

export async function redeemStoreItem(childId, storeItem, redeemedBy = '') {
  // Insert redemption record
  await supabase.from('store_redemptions').insert({
    child_id: childId,
    store_item_id: storeItem.id,
    item_name: storeItem.name,
    gems_spent: storeItem.gem_cost,
    redeemed_by: redeemedBy,
  });

  // Deduct gems from ledger
  await addGemTransaction(
    childId,
    -storeItem.gem_cost,
    'store',
    `Redeemed: ${storeItem.name}`,
    storeItem.id,
    redeemedBy
  );
}

export async function getRedemptionHistory(childId) {
  const { data, error } = await supabase
    .from('store_redemptions')
    .select('*')
    .eq('child_id', childId)
    .order('redeemed_at', { ascending: false });
  if (error) throw error;
  return data;
}
