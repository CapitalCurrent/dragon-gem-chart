import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';

import GemIcon from '../components/shared/GemIcon';
import ChildAvatar from '../components/shared/ChildAvatar';
import { StarburstFlash } from '../components/shared/CelebrationOverlay';
import {
  getTaskTemplates, getWeeklyCompletions, toggleWeeklyCompletion,
  addGemTransaction, removeGemTransaction, mondayOfWeek, addTaskTemplate,
  updateTaskTemplate, deleteTaskTemplate, getGemHistory
} from '../database';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GEM_FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
function gemLabel(v) { return GEM_FRACTIONS[v] || String(v); }

export default function WeeklyPage() {
  const { selectedChild, children, refreshBalances, showToast, syncVersion } = useApp();
  const [tasks, setTasks] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [loading, setLoading] = useState(true);
  const [animatingGem, setAnimatingGem] = useState(null);
  const [showStarburst, setShowStarburst] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGems, setNewGems] = useState(2);
  const [newTarget, setNewTarget] = useState(7);
  const [editMode, setEditMode] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [targetBonuses, setTargetBonuses] = useState(new Set());
  const [cloneMode, setCloneMode] = useState(null);
  const [copyToTask, setCopyToTask] = useState(null);
  const [copyToSelected, setCopyToSelected] = useState(new Set()); // task IDs that already got target bonus this week

  const weekOf = mondayOfWeek();

  const loadData = useCallback(async () => {
    if (!selectedChild) return;
    setLoading(true);
    try {
      const allTasks = await getTaskTemplates(selectedChild.id, 'weekly');
      setTasks(allTasks.filter(t => !t.parent_id));

      const comps = await getWeeklyCompletions(selectedChild.id, weekOf);
      setCompletions(comps);

      // Check which tasks already received target bonus this week
      const history = await getGemHistory(selectedChild.id, 200);
      const weekStart = weekOf + 'T00:00:00';
      const bonused = new Set();
      history.forEach(h => {
        if (h.source === 'task_bonus' && h.created_at >= weekStart && h.description?.startsWith('Weekly target:')) {
          bonused.add(h.reference_id);
        }
      });
      setTargetBonuses(bonused);
    } catch (err) {
      console.error('Failed to load weekly tasks:', err);
    }
    setLoading(false);
  }, [selectedChild, weekOf]);

  useEffect(() => { loadData(); }, [loadData, syncVersion]);

  const isCompletedOnDay = (taskId, dayOfWeek) => {
    return completions.some(c => c.task_template_id === taskId && c.day_of_week === dayOfWeek);
  };

  const getTaskCompletionCount = (taskId) => {
    return completions.filter(c => c.task_template_id === taskId).length;
  };

  const getTaskTarget = (task) => {
    return task.weekly_target || 7;
  };

  const handleToggle = async (task) => {
    if (!selectedChild) return;
    const isCompleting = !isCompletedOnDay(task.id, selectedDay);

    try {
      const result = await toggleWeeklyCompletion(selectedChild.id, task.id, selectedDay, weekOf);

      if (isCompleting) {
        if (!result.alreadySynced) {
          await addGemTransaction(selectedChild.id, task.gem_value, 'task', `${task.title} (${DAYS[selectedDay]})`, task.id);
        }
        setAnimatingGem(task.id);
        setTimeout(() => setAnimatingGem(null), 600);
        showToast(`+${gemLabel(task.gem_value)} gem${task.gem_value !== 1 ? 's' : ''}!`, 'gem');

        // Check if this completion hits the weekly target
        const newCount = getTaskCompletionCount(task.id) + 1;
        const target = getTaskTarget(task);
        const bonus = task.bonus_gems || 0;
        if (newCount === target && bonus > 0 && !targetBonuses.has(task.id) && !result.alreadySynced) {
          await addGemTransaction(selectedChild.id, bonus, 'task_bonus', `Weekly target: ${task.title}`, task.id);
          setTargetBonuses(prev => new Set([...prev, task.id]));
          showToast(`+${bonus} BONUS! Weekly target hit!`, 'gem');
          setShowStarburst(true);
        }
      } else {
        await removeGemTransaction(task.id);

        // If un-completing drops below target, remove target bonus
        const newCount = getTaskCompletionCount(task.id) - 1;
        const target = getTaskTarget(task);
        if (newCount < target && targetBonuses.has(task.id)) {
          // Remove the target bonus from ledger — search by description pattern
          // We can't easily remove by reference_id since task bonus shares the task id
          // Instead we'll just let it stand and not re-award
        }
      }

      await loadData();
      refreshBalances();
    } catch (err) {
      console.error('Toggle weekly failed:', err);
    }
  };

  // ── Computed stats ──
  const weekGems = completions.reduce((sum, c) => {
    const task = tasks.find(t => t.id === c.task_template_id);
    return sum + (task?.gem_value || 0);
  }, 0);

  const totalTargetsMet = tasks.filter(t => getTaskCompletionCount(t.id) >= getTaskTarget(t)).length;
  const totalTasks = tasks.length;
  const overallProgress = totalTasks > 0
    ? Math.round(tasks.reduce((sum, t) => sum + Math.min(getTaskCompletionCount(t.id) / getTaskTarget(t), 1), 0) / totalTasks * 100)
    : 0;
  const bonusGems = tasks.reduce((sum, t) => {
    if (targetBonuses.has(t.id)) return sum + (t.bonus_gems || 0);
    return sum;
  }, 0);

  const otherChildren = children.filter(c => c.id !== selectedChild?.id);

  const handleShowClone = async (child) => {
    const templates = await getTaskTemplates(child.id, 'weekly');
    setCloneMode({ childName: child.name, childEmoji: child.avatar_emoji, tasks: templates.filter(t => !t.parent_id) });
  };

  const handleCloneGoal = async (source) => {
    if (!selectedChild) return;
    try {
      await addTaskTemplate({
        child_id: selectedChild.id, title: source.title, task_type: 'weekly',
        parent_id: null, gem_value: source.gem_value || 2, bonus_gems: source.bonus_gems || 0,
        weekly_target: source.weekly_target || 7, sort_order: tasks.length,
      });
      showToast(`Cloned "${source.title}"!`, 'success');
      setCloneMode(null); setShowAddForm(false);
      await loadData();
    } catch (err) { console.error('Clone failed:', err); }
  };

  const handleCopyToChild = async (task, targetChild) => {
    try {
      const existing = await getTaskTemplates(targetChild.id, 'weekly');
      await addTaskTemplate({
        child_id: targetChild.id, title: task.title, task_type: 'weekly',
        parent_id: null, gem_value: task.gem_value || 2, bonus_gems: task.bonus_gems || 0,
        weekly_target: task.weekly_target || 7, sort_order: existing.length,
      });
      showToast(`Copied to ${targetChild.avatar_emoji} ${targetChild.name}!`, 'success');
    } catch (err) { console.error('Copy failed:', err); }
  };

  return (
    <div className="space-y-4">
      {selectedChild && (
        <>
          {/* ═══ Weekly Summary Card ═══ */}
          {tasks.length > 0 && !loading && (
            <div className="dragon-card">
              <div className="flex items-center gap-4">
                {/* Progress Ring */}
                <div className="relative w-16 h-16 flex-shrink-0">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-cave-700/50" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-gold" strokeWidth="3"
                      strokeDasharray={`${overallProgress * 0.942} 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-gold">{overallProgress}%</span>
                  </div>
                </div>
                {/* Stats */}
                <div className="flex-1 space-y-1">
                  <p className="text-xs text-gray-400">
                    Week of {new Date(weekOf + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-lg font-bold text-gold">{totalTargetsMet}/{totalTasks}</p>
                      <p className="text-[10px] text-gray-500">goals met</p>
                    </div>
                    <div className="w-px h-8 bg-cave-600/30" />
                    <div>
                      <p className="text-lg font-bold text-gem-emerald">+{weekGems + bonusGems}</p>
                      <p className="text-[10px] text-gray-500">gems earned</p>
                    </div>
                  </div>
                </div>
                {/* Edit button */}
                <button
                  onClick={() => setEditMode(!editMode)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all self-start
                    ${editMode ? 'bg-gold/20 text-gold border border-gold/50' : 'text-gray-500 hover:text-gray-300 border border-cave-600/30'}`}
                >
                  {editMode ? '✓ Done' : '✏️ Edit'}
                </button>
              </div>
              {/* All targets met celebration */}
              {totalTargetsMet === totalTasks && totalTasks > 0 && (
                <div className="mt-3 pt-3 border-t border-gold/20 text-center animate-slide-up">
                  <p className="text-sm font-bold text-gold">All weekly goals complete!</p>
                </div>
              )}
            </div>
          )}

          {/* ═══ Day Tabs ═══ */}
          <div className="flex gap-1 bg-cave-800/50 rounded-2xl p-1">
            {DAYS.map((day, i) => {
              const isToday = i === new Date().getDay();
              const isActive = i === selectedDay;
              const dayCompletions = completions.filter(c => c.day_of_week === i).length;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(i)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all relative
                    ${isActive
                      ? 'bg-gradient-to-b from-gold/20 to-gold/10 text-gold border border-gold/30'
                      : isToday
                        ? 'text-gold/60 hover:bg-white/5'
                        : 'text-gray-500 hover:bg-white/5'
                    }`}
                >
                  {day}
                  {dayCompletions > 0 && (
                    <span className="absolute -top-1 -right-0.5 w-3.5 h-3.5 bg-gem-emerald rounded-full text-[8px] font-bold text-white flex items-center justify-center">
                      {dayCompletions}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ═══ Task List ═══ */}
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : tasks.length === 0 ? (
            <div className="dragon-card text-center py-8">
              <img src={`${process.env.PUBLIC_URL}/mascots/dragon_sleepy.png`} alt="No goals" className="w-32 mx-auto mb-3" />
              <p className="text-gray-400 mb-1">No weekly goals yet!</p>
              <p className="text-xs text-gray-500 mb-3">Set goals like "Read 3 times" or "Practice piano 5 days"</p>
              <button
                onClick={() => { setShowAddForm(true); setNewTitle(''); setNewGems(2); setNewTarget(3); }}
                className="btn-gold"
              >
                + Add First Goal
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task, i) => {
                const isDone = isCompletedOnDay(task.id, selectedDay);
                const isAnimating = animatingGem === task.id;
                const count = getTaskCompletionCount(task.id);
                const target = getTaskTarget(task);
                const progress = Math.min(count / target, 1);
                const targetMet = count >= target;

                return (
                  <div
                    key={task.id}
                    className={`dragon-card w-full text-left transition-all ${targetMet ? 'border-gem-emerald/20' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      {editMode && (
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => {
                              if (i > 0) {
                                updateTaskTemplate(task.id, { sort_order: tasks[i-1].sort_order });
                                updateTaskTemplate(tasks[i-1].id, { sort_order: task.sort_order });
                                loadData();
                              }
                            }}
                            disabled={i === 0}
                            className="text-gold/50 hover:text-gold disabled:opacity-20 text-xs leading-none p-0.5"
                          >▲</button>
                          <button
                            onClick={() => {
                              if (i < tasks.length - 1) {
                                updateTaskTemplate(task.id, { sort_order: tasks[i+1].sort_order });
                                updateTaskTemplate(tasks[i+1].id, { sort_order: task.sort_order });
                                loadData();
                              }
                            }}
                            disabled={i === tasks.length - 1}
                            className="text-gold/50 hover:text-gold disabled:opacity-20 text-xs leading-none p-0.5"
                          >▼</button>
                        </div>
                      )}
                      <button
                        onClick={() => !editMode && handleToggle(task)}
                        className="flex items-center gap-3 flex-1 text-left active:scale-[0.98] transition-transform"
                      >
                        {!editMode && <input type="checkbox" checked={isDone} readOnly className="task-check" />}
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-medium ${isDone && !editMode ? 'text-gray-400 line-through' : 'text-white'}`}>
                            {task.title}
                          </span>
                          {/* Progress indicator */}
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="flex-1 h-1.5 bg-cave-700/50 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${targetMet ? 'bg-gem-emerald' : 'bg-gold/60'}`}
                                style={{ width: `${progress * 100}%` }}
                              />
                            </div>
                            <span className={`text-[10px] font-bold ${targetMet ? 'text-gem-emerald' : 'text-gray-500'}`}>
                              {count}/{target}
                            </span>
                          </div>
                        </div>
                        {!editMode && (
                          <>
                            <div className={isAnimating ? 'sparkle-burst' : ''}>
                              <GemIcon earned={isDone} size="sm" colorIndex={i} animate={isAnimating} />
                            </div>
                            <span className={`text-xs font-medium ${isDone ? 'text-gold/60' : 'text-gray-500'}`}>
                              {gemLabel(task.gem_value)}
                            </span>
                          </>
                        )}
                      </button>
                      {editMode && (
                        <>
                          <span className="text-[10px] text-gray-500">💎{gemLabel(task.gem_value)}</span>
                          <button
                            onClick={() => setEditingTask({
                              id: task.id, title: task.title, gem_value: task.gem_value,
                              weekly_target: task.weekly_target || 7, bonus_gems: task.bonus_gems || 0
                            })}
                            className="text-gold/60 hover:text-gold text-sm p-1.5 bg-gold/10 rounded-lg"
                          >✏️</button>
                          {otherChildren.length > 0 && (
                            <button onClick={() => { setCopyToTask(task); setCopyToSelected(new Set()); }}
                              className="text-xs px-2 py-1.5 rounded-lg bg-cave-600/40 text-gray-300 font-semibold active:scale-95">
                              📋→
                            </button>
                          )}
                          <button
                            onClick={() => { deleteTaskTemplate(task.id).then(() => loadData()); }}
                            className="text-gem-ruby/40 hover:text-gem-ruby text-sm p-1.5 bg-gem-ruby/10 rounded-lg"
                          >🗑</button>
                        </>
                      )}
                    </div>
                    {/* Target met bonus indicator */}
                    {targetMet && (task.bonus_gems || 0) > 0 && (
                      <div className="mt-2 pt-2 border-t border-gem-emerald/20 flex items-center justify-end gap-2 animate-slide-up">
                        <span className="text-xs text-gem-emerald/80">Target bonus!</span>
                        <GemIcon earned={true} size="sm" colorIndex={0} animate={true} />
                        <span className="text-xs font-bold text-gem-emerald">+{task.bonus_gems}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ═══ + Add Weekly Goal ═══ */}
          <div
            onClick={() => { setShowAddForm(true); setNewTitle(''); setNewGems(2); setNewTarget(3); }}
            className="dragon-card flex items-center justify-center gap-2 py-4 cursor-pointer border-gold/30 hover:border-gold/50 active:scale-[0.98] transition-all"
          >
            <span className="text-2xl text-gold">＋</span>
            <span className="text-gold font-semibold">Add Weekly Goal</span>
          </div>

          {/* ═══ Add Form ═══ */}
          {showAddForm && (
            <div className="dragon-card space-y-3 border-gold/30 animate-slide-up">
              {/* Clone from other child */}
              {otherChildren.length > 0 && !cloneMode && (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-gray-400">Clone from:</span>
                  {otherChildren.map(oc => (
                    <button key={oc.id} onClick={() => handleShowClone(oc)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cave-600/40 text-gray-300 active:scale-95">
                      <ChildAvatar emoji={oc.avatar_emoji} size="xs" /> {oc.name}
                    </button>
                  ))}
                </div>
              )}
              {cloneMode && (
                <div className="space-y-2 animate-slide-up">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gold font-semibold flex items-center gap-1"><ChildAvatar emoji={cloneMode.childEmoji} size="xs" /> {cloneMode.childName}'s goals</span>
                    <button onClick={() => setCloneMode(null)} className="text-xs text-gray-500">Cancel</button>
                  </div>
                  {cloneMode.tasks.length === 0 ? (
                    <p className="text-xs text-gray-500 py-2">No goals to clone</p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {cloneMode.tasks.map(t => (
                        <button key={t.id} onClick={() => handleCloneGoal(t)}
                          className="w-full text-left px-3 py-2 rounded-xl bg-cave-700/40 hover:bg-cave-600/40 active:scale-[0.98] transition-all">
                          <span className="text-sm text-white font-medium">{t.title}</span>
                          <span className="text-[10px] text-gray-500 ml-2">{t.weekly_target || 7}x/wk · 💎{t.gem_value}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {!cloneMode && (
              <>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Goal name (e.g., Read a book)"
                autoFocus
                onKeyDown={async e => {
                  if (e.key === 'Enter' && newTitle.trim() && selectedChild) {
                    await addTaskTemplate({
                      child_id: selectedChild.id, title: newTitle.trim(), task_type: 'weekly',
                      parent_id: null, gem_value: newGems, bonus_gems: newTarget < 7 ? 1 : 0,
                      weekly_target: newTarget, sort_order: tasks.length
                    });
                    showToast('Goal added!', 'success');
                    setShowAddForm(false); setNewTitle('');
                    await loadData();
                  }
                }}
              />
              {/* Weekly target picker */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">How many days per week?</label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map(n => (
                    <button
                      key={n}
                      onClick={() => setNewTarget(n)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all
                        ${newTarget === n ? 'bg-gold/20 border border-gold/50 text-gold' : 'bg-cave-700/50 text-gray-500'}`}
                    >
                      {n === 7 ? 'Daily' : `${n}x`}
                    </button>
                  ))}
                </div>
              </div>
              {/* Gems per completion */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Gems each:</span>
                {[0.25, 0.5, 1, 2, 3, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setNewGems(n)}
                    className={`px-2 py-1 rounded-lg text-xs font-bold transition-all
                      ${newGems === n ? 'bg-gold/20 border border-gold/50 text-gold' : 'bg-cave-700/50 text-gray-500'}`}
                  >
                    {gemLabel(n)}
                  </button>
                ))}
                <span className="flex-1" />
                <button onClick={() => setShowAddForm(false)} className="text-xs text-gray-500 px-2 py-1">Cancel</button>
                <button
                  disabled={!newTitle.trim()}
                  onClick={async () => {
                    if (!newTitle.trim() || !selectedChild) return;
                    await addTaskTemplate({
                      child_id: selectedChild.id, title: newTitle.trim(), task_type: 'weekly',
                      parent_id: null, gem_value: newGems, bonus_gems: newTarget < 7 ? 1 : 0,
                      weekly_target: newTarget, sort_order: tasks.length
                    });
                    showToast('Goal added!', 'success');
                    setShowAddForm(false); setNewTitle('');
                    await loadData();
                  }}
                  className="btn-gold text-xs py-1 px-3 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              </>
              )}
            </div>
          )}

          {/* ═══ Edit Task Modal ═══ */}
          {editingTask && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setEditingTask(null)}>
              <div className="dragon-card max-w-sm w-full space-y-4 animate-slide-up" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-gold">Edit Weekly Goal</h3>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
                  autoFocus
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && editingTask.title.trim()) {
                      await updateTaskTemplate(editingTask.id, {
                        title: editingTask.title.trim(), gem_value: editingTask.gem_value,
                        weekly_target: editingTask.weekly_target, bonus_gems: editingTask.bonus_gems
                      });
                      setEditingTask(null);
                      await loadData();
                      showToast('Goal updated', 'success');
                    }
                  }}
                />
                {/* Weekly target */}
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Days per week target</label>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7].map(n => (
                      <button
                        key={n}
                        onClick={() => setEditingTask({ ...editingTask, weekly_target: n })}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all
                          ${editingTask.weekly_target === n
                            ? 'bg-gold/20 border-2 border-gold/50 text-gold'
                            : 'bg-cave-700/50 border-2 border-cave-600/30 text-gray-400'}`}
                      >
                        {n === 7 ? 'Daily' : `${n}x`}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Gems per completion */}
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Gems per completion</label>
                  <div className="flex gap-2">
                    {[0.25, 0.5, 1, 2, 3, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setEditingTask({ ...editingTask, gem_value: n })}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all
                          ${editingTask.gem_value === n
                            ? 'bg-gold/20 border-2 border-gold/50 text-gold'
                            : 'bg-cave-700/50 border-2 border-cave-600/30 text-gray-400'}`}
                      >
                        💎{gemLabel(n)}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Bonus gems for hitting target */}
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Bonus for hitting target</label>
                  <div className="flex gap-2">
                    {[0, 1, 2, 3, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setEditingTask({ ...editingTask, bonus_gems: n })}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all
                          ${editingTask.bonus_gems === n
                            ? 'bg-gem-emerald/20 border-2 border-gem-emerald/50 text-gem-emerald'
                            : 'bg-cave-700/50 border-2 border-cave-600/30 text-gray-400'}`}
                      >
                        {n === 0 ? '—' : `+${n}`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setEditingTask(null)} className="btn-outline flex-1 text-center">Cancel</button>
                  <button
                    disabled={!editingTask.title.trim()}
                    onClick={async () => {
                      await updateTaskTemplate(editingTask.id, {
                        title: editingTask.title.trim(), gem_value: editingTask.gem_value,
                        weekly_target: editingTask.weekly_target, bonus_gems: editingTask.bonus_gems
                      });
                      setEditingTask(null);
                      await loadData();
                      showToast('Goal updated', 'success');
                    }}
                    className="btn-gold flex-1 text-center disabled:opacity-40"
                  >Save</button>
                </div>
              </div>
            </div>
          )}
          {/* Copy To Modal */}
          {copyToTask && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setCopyToTask(null)}>
              <div className="dragon-card max-w-sm w-full space-y-4 animate-slide-up" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-gold">Copy "{copyToTask.title}" to...</h3>
                <div className="space-y-2">
                  {otherChildren.map(oc => {
                    const checked = copyToSelected.has(oc.id);
                    return (
                      <button key={oc.id}
                        onClick={() => setCopyToSelected(prev => {
                          const next = new Set(prev);
                          if (next.has(oc.id)) next.delete(oc.id); else next.add(oc.id);
                          return next;
                        })}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all active:scale-[0.98]
                          ${checked ? 'bg-gold/15 border-2 border-gold/40' : 'bg-cave-700/40 border-2 border-cave-600/20'}`}
                      >
                        <input type="checkbox" checked={checked} readOnly className="task-check" />
                        <ChildAvatar emoji={oc.avatar_emoji} size="md" />
                        <span className={`text-sm font-medium ${checked ? 'text-gold' : 'text-gray-300'}`}>{oc.name}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setCopyToTask(null)} className="btn-outline flex-1 text-center">Cancel</button>
                  <button
                    disabled={copyToSelected.size === 0}
                    onClick={async () => {
                      for (const childId of copyToSelected) {
                        const child = children.find(c => c.id === childId);
                        if (child) await handleCopyToChild(copyToTask, child);
                      }
                      setCopyToTask(null);
                    }}
                    className="btn-gold flex-1 text-center disabled:opacity-40"
                  >
                    Copy ({copyToSelected.size})
                  </button>
                </div>
              </div>
            </div>
          )}

        </>
      )}

      <StarburstFlash show={showStarburst} onDone={() => setShowStarburst(false)} />
    </div>
  );
}
