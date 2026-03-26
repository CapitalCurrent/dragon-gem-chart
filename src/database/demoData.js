// ══════════════════════════════════════════════════════════════
// Demo Mode — localStorage backend when Supabase is not configured
// Full CRUD that mirrors the real db.js API
// ══════════════════════════════════════════════════════════════

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().split('T')[0];

function load(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem('dgc_' + key)) || fallback; }
  catch { return fallback; }
}
function save(key, data) { localStorage.setItem('dgc_' + key, JSON.stringify(data)); }

// ── Seed defaults on first run ──
function ensureSeeded() {
  if (localStorage.getItem('dgc_seeded')) return;

  const iona = { id: uid(), name: 'Iona', avatar_color: '#e0115f', avatar_emoji: '🐉', sort_order: 0, created_at: now() };
  const jude = { id: uid(), name: 'Jude', avatar_color: '#0f52ba', avatar_emoji: '🐲', sort_order: 1, created_at: now() };
  save('children', [iona, jude]);

  // Sample daily tasks for Iona
  const morningId = uid();
  const eveningId = uid();
  const templates = [
    { id: morningId, child_id: iona.id, title: 'Morning Routine', task_type: 'daily', parent_id: null, gem_value: 0, bonus_gems: 2, sort_order: 0, active: true },
    { id: uid(), child_id: iona.id, title: 'Brush teeth', task_type: 'daily', parent_id: morningId, gem_value: 1, bonus_gems: 0, sort_order: 0, active: true },
    { id: uid(), child_id: iona.id, title: 'Make bed', task_type: 'daily', parent_id: morningId, gem_value: 1, bonus_gems: 0, sort_order: 1, active: true },
    { id: uid(), child_id: iona.id, title: 'Get dressed', task_type: 'daily', parent_id: morningId, gem_value: 1, bonus_gems: 0, sort_order: 2, active: true },
    { id: eveningId, child_id: iona.id, title: 'Evening Routine', task_type: 'daily', parent_id: null, gem_value: 0, bonus_gems: 1, sort_order: 1, active: true },
    { id: uid(), child_id: iona.id, title: 'Clean up toys', task_type: 'daily', parent_id: eveningId, gem_value: 1, bonus_gems: 0, sort_order: 0, active: true },
    { id: uid(), child_id: iona.id, title: 'Bath / shower', task_type: 'daily', parent_id: eveningId, gem_value: 1, bonus_gems: 0, sort_order: 1, active: true },
    { id: uid(), child_id: iona.id, title: 'Brush teeth (night)', task_type: 'daily', parent_id: eveningId, gem_value: 1, bonus_gems: 0, sort_order: 2, active: true },
    // Weekly for Iona
    { id: uid(), child_id: iona.id, title: 'Clean room', task_type: 'weekly', parent_id: null, gem_value: 3, bonus_gems: 0, sort_order: 0, active: true },
    { id: uid(), child_id: iona.id, title: 'Help with laundry', task_type: 'weekly', parent_id: null, gem_value: 2, bonus_gems: 0, sort_order: 1, active: true },
  ];

  // Same structure for Jude
  const jMorningId = uid();
  const jEveningId = uid();
  templates.push(
    { id: jMorningId, child_id: jude.id, title: 'Morning Routine', task_type: 'daily', parent_id: null, gem_value: 0, bonus_gems: 2, sort_order: 0, active: true },
    { id: uid(), child_id: jude.id, title: 'Brush teeth', task_type: 'daily', parent_id: jMorningId, gem_value: 1, bonus_gems: 0, sort_order: 0, active: true },
    { id: uid(), child_id: jude.id, title: 'Make bed', task_type: 'daily', parent_id: jMorningId, gem_value: 1, bonus_gems: 0, sort_order: 1, active: true },
    { id: uid(), child_id: jude.id, title: 'Get dressed', task_type: 'daily', parent_id: jMorningId, gem_value: 1, bonus_gems: 0, sort_order: 2, active: true },
    { id: jEveningId, child_id: jude.id, title: 'Evening Routine', task_type: 'daily', parent_id: null, gem_value: 0, bonus_gems: 1, sort_order: 1, active: true },
    { id: uid(), child_id: jude.id, title: 'Clean up toys', task_type: 'daily', parent_id: jEveningId, gem_value: 1, bonus_gems: 0, sort_order: 0, active: true },
    { id: uid(), child_id: jude.id, title: 'Bath / shower', task_type: 'daily', parent_id: jEveningId, gem_value: 1, bonus_gems: 0, sort_order: 1, active: true },
    { id: uid(), child_id: jude.id, title: 'Brush teeth (night)', task_type: 'daily', parent_id: jEveningId, gem_value: 1, bonus_gems: 0, sort_order: 2, active: true },
    { id: uid(), child_id: jude.id, title: 'Clean room', task_type: 'weekly', parent_id: null, gem_value: 3, bonus_gems: 0, sort_order: 0, active: true },
    { id: uid(), child_id: jude.id, title: 'Help with laundry', task_type: 'weekly', parent_id: null, gem_value: 2, bonus_gems: 0, sort_order: 1, active: true },
  );
  save('task_templates', templates);

  // Store items
  save('store_items', [
    // ── Free / Quality Time (3-8 gems) ──
    { id: uid(), name: 'Extra Bedtime Story', gem_cost: 3, emoji: '📖', description: 'Pick one extra book!', active: true, sort_order: 0 },
    { id: uid(), name: 'Dance Party with Mom & Dad', gem_cost: 5, emoji: '💃', description: '3 songs, you pick the music!', active: true, sort_order: 1 },
    { id: uid(), name: 'Pick the Car Music', gem_cost: 3, emoji: '🎵', description: 'DJ for the whole car ride!', active: true, sort_order: 2 },
    { id: uid(), name: 'Pillow Fort Time', gem_cost: 8, emoji: '🏰', description: 'Build an epic fort together!', active: true, sort_order: 3 },
    { id: uid(), name: 'Flashlight Hide & Seek', gem_cost: 8, emoji: '🔦', description: 'After-dark adventure!', active: true, sort_order: 4 },
    { id: uid(), name: 'Choose Breakfast for Dinner', gem_cost: 5, emoji: '🥞', description: 'Pancakes? Waffles? You pick!', active: true, sort_order: 5 },
    { id: uid(), name: 'Eat Dinner Picnic Style', gem_cost: 5, emoji: '🧺', description: 'On the floor with a blanket!', active: true, sort_order: 6 },
    { id: uid(), name: 'PJs All Morning', gem_cost: 3, emoji: '🛌', description: 'No getting dressed till lunch (weekend)', active: true, sort_order: 7 },
    { id: uid(), name: 'Parent Plays Your Game', gem_cost: 8, emoji: '🎲', description: 'Mom or Dad plays YOUR game for 15 min', active: true, sort_order: 8 },
    { id: uid(), name: 'Use the Fancy Cup', gem_cost: 3, emoji: '🏆', description: 'Drink from the special cup today!', active: true, sort_order: 9 },
    { id: uid(), name: 'Chess Game with Dad', gem_cost: 15, emoji: '♟️', description: 'One game before bedtime!', active: true, sort_order: 10 },
    { id: uid(), name: 'Pick a YouTube Video', gem_cost: 5, emoji: '📺', description: 'One video, your choice!', active: true, sort_order: 11 },
    { id: uid(), name: 'Face Paint / Makeup Fun', gem_cost: 8, emoji: '🎨', description: 'Get creative with colors!', active: true, sort_order: 12 },
    { id: uid(), name: 'Stuffed Animal Sleepover', gem_cost: 3, emoji: '🧸', description: 'Extra stuffies in bed tonight!', active: true, sort_order: 13 },
    { id: uid(), name: 'Bike Ride with Parent', gem_cost: 10, emoji: '🚴', description: 'Pick the route!', active: true, sort_order: 14 },

    // ── Screen Time (10-15 gems) ──
    { id: uid(), name: '30min Extra Screen Time', gem_cost: 10, emoji: '🎮', description: 'Tablet, TV, or games!', active: true, sort_order: 15 },
    { id: uid(), name: 'Movie Night Pick', gem_cost: 12, emoji: '🎬', description: 'You choose the movie!', active: true, sort_order: 16 },
    { id: uid(), name: 'Stay Up 30min Late', gem_cost: 15, emoji: '🌙', description: 'Extra time before bed!', active: true, sort_order: 17 },

    // ── Treats ($0.50-$2, 6-12 gems) ──
    { id: uid(), name: 'Hot Cocoa & Marshmallows', gem_cost: 6, emoji: '☕', description: 'With extra marshmallows!', active: true, sort_order: 18 },
    { id: uid(), name: 'Gummy Bears Pack', gem_cost: 6, emoji: '🍬', description: 'One pack of gummies!', active: true, sort_order: 19 },
    { id: uid(), name: 'Special Juice Box', gem_cost: 5, emoji: '🧃', description: 'The fancy kind!', active: true, sort_order: 20 },
    { id: uid(), name: 'Glow Stick Bath', gem_cost: 8, emoji: '✨', description: 'Bath time rave!', active: true, sort_order: 21 },
    { id: uid(), name: 'Ice Cream Trip', gem_cost: 15, emoji: '🍦', description: 'One scoop, any flavor!', active: true, sort_order: 22 },
    { id: uid(), name: 'Cookie Decorating', gem_cost: 10, emoji: '🍪', description: 'Bake & decorate together!', active: true, sort_order: 23 },
    { id: uid(), name: 'Pick Dinner Tonight', gem_cost: 12, emoji: '🍕', description: 'You pick what we eat!', active: true, sort_order: 24 },
    { id: uid(), name: 'Smoothie of Your Choice', gem_cost: 8, emoji: '🥤', description: 'Pick all the ingredients!', active: true, sort_order: 25 },

    // ── Small Buys ($1-5, 10-45 gems) ──
    { id: uid(), name: '$1 Toy Fund Voucher', gem_cost: 10, emoji: '🎫', description: 'Save up for something big!', active: true, sort_order: 26 },
    { id: uid(), name: 'Dollar Store Pick', gem_cost: 12, emoji: '🛍️', description: 'One item from the dollar store!', active: true, sort_order: 27 },
    { id: uid(), name: 'Sticker Sheet', gem_cost: 8, emoji: '⭐', description: 'Fun stickers to collect!', active: true, sort_order: 28 },
    { id: uid(), name: 'Temporary Tattoos', gem_cost: 8, emoji: '🦋', description: 'Cool designs!', active: true, sort_order: 29 },
    { id: uid(), name: 'Bath Bomb', gem_cost: 10, emoji: '🫧', description: 'Fizzy colorful bath!', active: true, sort_order: 30 },
    { id: uid(), name: 'Bubbles & Wand', gem_cost: 10, emoji: '🫧', description: 'Outdoor bubble time!', active: true, sort_order: 31 },
    { id: uid(), name: 'Sidewalk Chalk Pack', gem_cost: 12, emoji: '🖍️', description: 'Draw on the driveway!', active: true, sort_order: 32 },
    { id: uid(), name: 'Play-Doh (new color)', gem_cost: 15, emoji: '🎭', description: 'Pick a brand new color!', active: true, sort_order: 33 },
    { id: uid(), name: 'Mini Lego Set', gem_cost: 25, emoji: '🧱', description: 'Polybag Lego build!', active: true, sort_order: 34 },
    { id: uid(), name: '$5 Toy Fund Voucher', gem_cost: 45, emoji: '💵', description: 'Goes toward any toy you want!', active: true, sort_order: 35 },

    // ── Big Rewards (30-100 gems) ──
    { id: uid(), name: 'Pick from Surprise Bag', gem_cost: 30, emoji: '🎒', description: 'Choose one mystery prize!', active: true, sort_order: 36 },
    { id: uid(), name: 'Friend Sleepover', gem_cost: 50, emoji: '🏠', description: 'Have a friend stay over!', active: true, sort_order: 37 },
    { id: uid(), name: 'Special Outing', gem_cost: 75, emoji: '🎡', description: 'Park, zoo, museum — you pick!', active: true, sort_order: 38 },
    { id: uid(), name: 'Big Toy', gem_cost: 100, emoji: '🎁', description: 'Save up for something awesome!', active: true, sort_order: 39 },
  ]);

  save('daily_completions', []);
  save('weekly_completions', []);
  save('bonus_listening', []);
  save('gem_ledger', []);
  save('store_redemptions', []);

  localStorage.setItem('dgc_seeded', '1');
}

// Initialize on import
ensureSeeded();

// ══════════════════════════════════════
// Children
// ══════════════════════════════════════

export async function getChildren() {
  return load('children');
}

export async function addChild(name, avatarColor = '#9b59b6', avatarEmoji = '🐉') {
  const children = load('children');
  const child = { id: uid(), name, avatar_color: avatarColor, avatar_emoji: avatarEmoji, sort_order: children.length, created_at: now() };
  children.push(child);
  save('children', children);
  return child;
}

export async function updateChild(id, updates) {
  const children = load('children');
  const idx = children.findIndex(c => c.id === id);
  if (idx >= 0) Object.assign(children[idx], updates);
  save('children', children);
  return children[idx];
}

export async function deleteChild(id) {
  save('children', load('children').filter(c => c.id !== id));
  // Clean up related data
  save('task_templates', load('task_templates').filter(t => t.child_id !== id));
  save('daily_completions', load('daily_completions').filter(c => c.child_id !== id));
  save('weekly_completions', load('weekly_completions').filter(c => c.child_id !== id));
  save('bonus_listening', load('bonus_listening').filter(b => b.child_id !== id));
  save('gem_ledger', load('gem_ledger').filter(g => g.child_id !== id));
  save('store_redemptions', load('store_redemptions').filter(r => r.child_id !== id));
}

// ══════════════════════════════════════
// Task Templates
// ══════════════════════════════════════

export async function getTaskTemplates(childId, taskType) {
  let templates = load('task_templates').filter(t => t.active);
  if (childId) templates = templates.filter(t => t.child_id === childId);
  if (taskType) templates = templates.filter(t => t.task_type === taskType);
  return templates.sort((a, b) => a.sort_order - b.sort_order);
}

export async function addTaskTemplate(template) {
  const templates = load('task_templates');
  const t = { id: uid(), ...template, active: true, created_at: now() };
  templates.push(t);
  save('task_templates', templates);
  return t;
}

export async function updateTaskTemplate(id, updates) {
  const templates = load('task_templates');
  const idx = templates.findIndex(t => t.id === id);
  if (idx >= 0) Object.assign(templates[idx], updates);
  save('task_templates', templates);
  return templates[idx];
}

export async function deleteTaskTemplate(id) {
  // Delete the task and its subtasks
  const templates = load('task_templates');
  save('task_templates', templates.filter(t => t.id !== id && t.parent_id !== id));
}

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

export async function getDailyCompletions(childId, date) {
  const d = date || todayStr();
  return load('daily_completions').filter(c => c.child_id === childId && c.completion_date === d);
}

export async function toggleDailyCompletion(childId, taskTemplateId, date, completedBy = '') {
  const d = date || todayStr();
  const completions = load('daily_completions');
  const idx = completions.findIndex(c => c.child_id === childId && c.task_template_id === taskTemplateId && c.completion_date === d);

  if (idx >= 0) {
    completions.splice(idx, 1);
    save('daily_completions', completions);
    return { completed: false };
  } else {
    completions.push({ id: uid(), child_id: childId, task_template_id: taskTemplateId, completion_date: d, completed_by: completedBy, completed_at: now() });
    save('daily_completions', completions);
    return { completed: true };
  }
}

// ══════════════════════════════════════
// Weekly Completions
// ══════════════════════════════════════

export async function getWeeklyCompletions(childId, weekOf) {
  return load('weekly_completions').filter(c => c.child_id === childId && c.week_of === weekOf);
}

export async function toggleWeeklyCompletion(childId, taskTemplateId, dayOfWeek, weekOf, completedBy = '') {
  const completions = load('weekly_completions');
  const idx = completions.findIndex(c =>
    c.child_id === childId && c.task_template_id === taskTemplateId &&
    c.week_of === weekOf && c.day_of_week === dayOfWeek
  );

  if (idx >= 0) {
    completions.splice(idx, 1);
    save('weekly_completions', completions);
    return { completed: false };
  } else {
    completions.push({ id: uid(), child_id: childId, task_template_id: taskTemplateId, week_of: weekOf, day_of_week: dayOfWeek, completed_by: completedBy, completed_at: now() });
    save('weekly_completions', completions);
    return { completed: true };
  }
}

// ══════════════════════════════════════
// Bonus Listening
// ══════════════════════════════════════

export async function getBonusListening(childId, date) {
  let data = load('bonus_listening');
  if (childId) data = data.filter(b => b.child_id === childId);
  if (date) data = data.filter(b => b.event_date === date);
  return data.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addBonusListening(childId, description, gemsAwarded, awardedBy = '') {
  const list = load('bonus_listening');
  const bonus = { id: uid(), child_id: childId, description, gems_awarded: gemsAwarded, awarded_by: awardedBy, event_date: todayStr(), created_at: now() };
  list.push(bonus);
  save('bonus_listening', list);
  return bonus;
}

export async function deleteBonusListening(id) {
  save('bonus_listening', load('bonus_listening').filter(b => b.id !== id));
}

// ══════════════════════════════════════
// Gem Ledger
// ══════════════════════════════════════

export async function getGemBalance(childId) {
  return load('gem_ledger')
    .filter(g => g.child_id === childId)
    .reduce((sum, g) => sum + g.amount, 0);
}

// Collected balance = only given (collected) positive gems + all negative (spent) gems
export async function getCollectedBalance(childId) {
  const ledger = load('gem_ledger').filter(g => g.child_id === childId);
  const givenEarned = ledger.filter(g => g.amount > 0 && g.gems_given).reduce((sum, g) => sum + g.amount, 0);
  const spent = ledger.filter(g => g.amount < 0).reduce((sum, g) => sum + g.amount, 0);
  return givenEarned + spent; // spent is negative
}

// All ungiven gems across all days (not just today)
export async function getAllUngiven(childId) {
  return load('gem_ledger')
    .filter(g => g.child_id === childId && !g.gems_given && g.amount > 0)
    .reduce((sum, g) => sum + g.amount, 0);
}

export async function getTodayGems(childId) {
  const todayStart = todayStr() + 'T00:00:00';
  const data = load('gem_ledger').filter(g => g.child_id === childId && g.created_at >= todayStart && g.amount > 0);
  return {
    earned: data.reduce((sum, r) => sum + r.amount, 0),
    given: data.filter(r => r.gems_given).reduce((sum, r) => sum + r.amount, 0),
    ungiven: data.filter(r => !r.gems_given).reduce((sum, r) => sum + r.amount, 0),
  };
}

export async function getUngiven(childId) {
  return load('gem_ledger')
    .filter(g => g.child_id === childId && !g.gems_given && g.amount > 0)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function addGemTransaction(childId, amount, source, description, referenceId = null, createdBy = '') {
  const ledger = load('gem_ledger');
  const entry = { id: uid(), child_id: childId, amount, source, description, reference_id: referenceId, gems_given: false, given_date: null, created_at: now(), created_by: createdBy };
  ledger.push(entry);
  save('gem_ledger', ledger);
  return entry;
}

export async function removeGemTransaction(referenceId) {
  save('gem_ledger', load('gem_ledger').filter(g => g.reference_id !== referenceId));
}

export async function markGemsGiven(childId) {
  const ledger = load('gem_ledger');
  ledger.forEach(g => {
    if (g.child_id === childId && !g.gems_given && g.amount > 0) {
      g.gems_given = true;
      g.given_date = todayStr();
    }
  });
  save('gem_ledger', ledger);
}

export async function getGemHistory(childId, limit = 50) {
  return load('gem_ledger')
    .filter(g => g.child_id === childId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

// ══════════════════════════════════════
// Store
// ══════════════════════════════════════

export async function getStoreItems() {
  return load('store_items').filter(i => i.active).sort((a, b) => a.sort_order - b.sort_order);
}

export async function addStoreItem(item) {
  const items = load('store_items');
  const i = { id: uid(), ...item, active: true, sort_order: items.length, created_at: now() };
  items.push(i);
  save('store_items', items);
  return i;
}

export async function updateStoreItem(id, updates) {
  const items = load('store_items');
  const idx = items.findIndex(i => i.id === id);
  if (idx >= 0) Object.assign(items[idx], updates);
  save('store_items', items);
  return items[idx];
}

export async function deleteStoreItem(id) {
  const items = load('store_items');
  const idx = items.findIndex(i => i.id === id);
  if (idx >= 0) items[idx].active = false;
  save('store_items', items);
}

export async function redeemStoreItem(childId, storeItem, redeemedBy = '') {
  const redemptions = load('store_redemptions');
  redemptions.push({ id: uid(), child_id: childId, store_item_id: storeItem.id, item_name: storeItem.name, gems_spent: storeItem.gem_cost, redeemed_at: now(), redeemed_by: redeemedBy });
  save('store_redemptions', redemptions);
  await addGemTransaction(childId, -storeItem.gem_cost, 'store', `Redeemed: ${storeItem.name}`, storeItem.id, redeemedBy);
}

export async function getRedemptionHistory(childId) {
  return load('store_redemptions')
    .filter(r => r.child_id === childId)
    .sort((a, b) => b.redeemed_at.localeCompare(a.redeemed_at));
}
