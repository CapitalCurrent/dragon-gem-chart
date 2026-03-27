import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import GemIcon from '../components/shared/GemIcon';
import {
  getTaskTemplates, buildTaskTree, getDailyCompletions,
  toggleDailyCompletion, addGemTransaction, removeGemTransaction,
  addTaskTemplate, updateTaskTemplate, deleteTaskTemplate
} from '../database';

export default function DailyPage() {
  const { selectedChild, children, refreshBalances, showToast } = useApp();
  const [taskTree, setTaskTree] = useState([]);
  const [completions, setCompletions] = useState(new Set());
  const [bonusAwarded, setBonusAwarded] = useState(new Set());
  const [animatingGem, setAnimatingGem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState(null); // null | { type: 'main' } | { type: 'sub', parentId }
  const [newTitle, setNewTitle] = useState('');
  const [newGems, setNewGems] = useState(1);
  const [newBonus, setNewBonus] = useState(2);
  const [editingCardId, setEditingCardId] = useState(null); // which main task card is in edit mode
  const [editingTask, setEditingTask] = useState(null); // { id, title, gem_value, bonus_gems }
  const [cloneMode, setCloneMode] = useState(null); // null | { childId, tasks[] }
  const [copyToTask, setCopyToTask] = useState(null); // main task being copied
  const [copyToSelected, setCopyToSelected] = useState(new Set()); // selected child IDs
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('dgc_collapsed') || '[]')); }
    catch { return new Set(); }
  });

  const toggleCollapse = (mainId) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(mainId)) next.delete(mainId);
      else next.add(mainId);
      localStorage.setItem('dgc_collapsed', JSON.stringify([...next]));
      return next;
    });
  };

  const loadData = useCallback(async () => {
    if (!selectedChild) return;
    setLoading(true);
    try {
      const templates = await getTaskTemplates(selectedChild.id, 'daily');
      const todayDay = new Date().getDay(); // 0=Sun, 6=Sat
      // Filter templates by active_days (null/undefined = every day)
      const filtered = templates.filter(t => {
        if (!t.active_days || t.active_days.length === 0 || t.active_days.length === 7) return true;
        // For subtasks, check the parent's active_days instead
        if (t.parent_id) {
          const parent = templates.find(p => p.id === t.parent_id);
          if (parent && parent.active_days && parent.active_days.length > 0 && parent.active_days.length < 7) {
            return parent.active_days.includes(todayDay);
          }
          return true;
        }
        return t.active_days.includes(todayDay);
      });
      const tree = buildTaskTree(filtered);
      setTaskTree(tree);

      const comps = await getDailyCompletions(selectedChild.id);
      const compSet = new Set(comps.map(c => c.task_template_id));
      setCompletions(compSet);

      // Check which main tasks have all subtasks completed (for bonus tracking)
      const bonusSet = new Set();
      tree.forEach(main => {
        if (main.subtasks.length > 0) {
          const allDone = main.subtasks.every(sub => compSet.has(sub.id));
          if (allDone && compSet.has(main.id)) bonusSet.add(main.id);
        }
      });
      setBonusAwarded(bonusSet);
    } catch (err) {
      console.error('Failed to load daily tasks:', err);
    }
    setLoading(false);
  }, [selectedChild]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggleSubtask = async (subtask, mainTask) => {
    if (!selectedChild) return;
    const isCompleting = !completions.has(subtask.id);

    try {
      await toggleDailyCompletion(selectedChild.id, subtask.id);

      if (isCompleting) {
        addGemTransaction(selectedChild.id, subtask.gem_value, 'task', subtask.title, subtask.id);
        setAnimatingGem(subtask.id);
        setTimeout(() => setAnimatingGem(null), 600);
        showToast(`+${subtask.gem_value} gem${subtask.gem_value > 1 ? 's' : ''}!`, 'gem');
      } else {
        removeGemTransaction(subtask.id);
      }

      const newComps = new Set(completions);
      if (isCompleting) newComps.add(subtask.id);
      else newComps.delete(subtask.id);

      const allSubsDone = mainTask.subtasks.every(s => newComps.has(s.id));
      if (allSubsDone && mainTask.bonus_gems > 0 && !newComps.has(mainTask.id)) {
        await toggleDailyCompletion(selectedChild.id, mainTask.id);
        addGemTransaction(selectedChild.id, mainTask.bonus_gems, 'task_bonus', `Bonus: ${mainTask.title}`, mainTask.id);
        newComps.add(mainTask.id);
        setBonusAwarded(prev => new Set([...prev, mainTask.id]));
        showToast(`+${mainTask.bonus_gems} BONUS gems! All done!`, 'gem');
      } else if (!allSubsDone && newComps.has(mainTask.id)) {
        await toggleDailyCompletion(selectedChild.id, mainTask.id);
        removeGemTransaction(mainTask.id);
        newComps.delete(mainTask.id);
        setBonusAwarded(prev => { const n = new Set(prev); n.delete(mainTask.id); return n; });
      }

      setCompletions(newComps);
      refreshBalances();
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  const handleToggleMainTask = async (mainTask) => {
    if (!selectedChild) return;
    const allSubsDone = mainTask.subtasks.every(s => completions.has(s.id));

    try {
      if (allSubsDone) {
        // Uncheck all — do each one sequentially to avoid race conditions
        const toRemove = [...mainTask.subtasks.filter(s => completions.has(s.id)), ...(completions.has(mainTask.id) ? [mainTask] : [])];
        for (const task of toRemove) {
          await toggleDailyCompletion(selectedChild.id, task.id);
          removeGemTransaction(task.id); // fire-and-forget, no await needed
        }
        setBonusAwarded(prev => { const n = new Set(prev); n.delete(mainTask.id); return n; });
      } else {
        // Check all remaining
        let gemsEarned = 0;
        for (const sub of mainTask.subtasks) {
          if (!completions.has(sub.id)) {
            await toggleDailyCompletion(selectedChild.id, sub.id);
            addGemTransaction(selectedChild.id, sub.gem_value, 'task', sub.title, sub.id);
            gemsEarned += sub.gem_value;
          }
        }
        if (mainTask.bonus_gems > 0 && !completions.has(mainTask.id)) {
          await toggleDailyCompletion(selectedChild.id, mainTask.id);
          addGemTransaction(selectedChild.id, mainTask.bonus_gems, 'task_bonus', `Bonus: ${mainTask.title}`, mainTask.id);
          gemsEarned += mainTask.bonus_gems;
          setBonusAwarded(prev => new Set([...prev, mainTask.id]));
        }
        showToast(`+${gemsEarned} gems! All tasks done!`, 'gem');
      }

      await loadData();
      refreshBalances();
    } catch (err) {
      console.error('Toggle main failed:', err);
    }
  };

  const handleMoveMain = async (mainTask, direction) => {
    const mains = taskTree;
    const idx = mains.findIndex(m => m.id === mainTask.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= mains.length) return;
    try {
      await updateTaskTemplate(mains[idx].id, { sort_order: mains[swapIdx].sort_order });
      await updateTaskTemplate(mains[swapIdx].id, { sort_order: mains[idx].sort_order });
      await loadData();
    } catch (err) { console.error('Reorder failed:', err); }
  };

  const handleMoveSub = async (mainTask, subtask, direction) => {
    const subs = mainTask.subtasks;
    const idx = subs.findIndex(s => s.id === subtask.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= subs.length) return;
    try {
      await updateTaskTemplate(subs[idx].id, { sort_order: subs[swapIdx].sort_order });
      await updateTaskTemplate(subs[swapIdx].id, { sort_order: subs[idx].sort_order });
      await loadData();
    } catch (err) { console.error('Reorder failed:', err); }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await deleteTaskTemplate(taskId);
      await loadData();
      showToast('Task removed', 'info');
    } catch (err) { console.error('Delete failed:', err); }
  };

  const handleSaveEdit = async () => {
    if (!editingTask || !editingTask.title.trim()) return;
    try {
      const updates = { title: editingTask.title.trim() };
      if (editingTask.isMain) {
        updates.bonus_gems = editingTask.bonus_gems;
        updates.active_days = editingTask.active_days;
      } else {
        updates.gem_value = editingTask.gem_value;
      }
      await updateTaskTemplate(editingTask.id, updates);
      setEditingTask(null);
      await loadData();
      showToast('Task updated', 'success');
    } catch (err) { console.error('Save edit failed:', err); }
  };

  const handleAddTask = async () => {
    if (!selectedChild || !newTitle.trim() || !addMode) return;
    try {
      const templates = await getTaskTemplates(selectedChild.id, 'daily');
      await addTaskTemplate({
        child_id: selectedChild.id,
        title: newTitle.trim(),
        task_type: 'daily',
        parent_id: addMode.type === 'sub' ? addMode.parentId : null,
        gem_value: addMode.type === 'sub' ? newGems : 0,
        bonus_gems: addMode.type === 'main' ? newBonus : 0,
        sort_order: templates.length,
      });
      showToast('Task added!', 'success');
      setAddMode(null);
      setNewTitle('');
      setNewGems(1);
      setNewBonus(2);
      await loadData();
    } catch (err) {
      console.error('Add task failed:', err);
    }
  };

  const otherChildren = children.filter(c => c.id !== selectedChild?.id);

  const handleShowClone = async (child) => {
    const templates = await getTaskTemplates(child.id, 'daily');
    const tree = buildTaskTree(templates);
    setCloneMode({ childId: child.id, childName: child.name, childEmoji: child.avatar_emoji, tasks: tree });
  };

  const handleCloneTask = async (sourceMain) => {
    if (!selectedChild) return;
    try {
      const existing = await getTaskTemplates(selectedChild.id, 'daily');
      const mainTask = await addTaskTemplate({
        child_id: selectedChild.id, title: sourceMain.title, task_type: 'daily',
        parent_id: null, gem_value: 0, bonus_gems: sourceMain.bonus_gems || 0,
        sort_order: existing.length, active_days: sourceMain.active_days || null,
      });
      for (let i = 0; i < sourceMain.subtasks.length; i++) {
        const sub = sourceMain.subtasks[i];
        await addTaskTemplate({
          child_id: selectedChild.id, title: sub.title, task_type: 'daily',
          parent_id: mainTask.id, gem_value: sub.gem_value || 1, bonus_gems: 0,
          sort_order: i,
        });
      }
      showToast(`Cloned "${sourceMain.title}" with ${sourceMain.subtasks.length} subtasks!`, 'success');
      setCloneMode(null);
      setAddMode(null);
      await loadData();
    } catch (err) { console.error('Clone failed:', err); }
  };

  const handleCopyToChild = async (main, targetChild) => {
    try {
      const existing = await getTaskTemplates(targetChild.id, 'daily');
      const mainTask = await addTaskTemplate({
        child_id: targetChild.id, title: main.title, task_type: 'daily',
        parent_id: null, gem_value: 0, bonus_gems: main.bonus_gems || 0,
        sort_order: existing.length, active_days: main.active_days || null,
      });
      for (let i = 0; i < main.subtasks.length; i++) {
        const sub = main.subtasks[i];
        await addTaskTemplate({
          child_id: targetChild.id, title: sub.title, task_type: 'daily',
          parent_id: mainTask.id, gem_value: sub.gem_value || 1, bonus_gems: 0,
          sort_order: i,
        });
      }
      showToast(`Copied to ${targetChild.avatar_emoji} ${targetChild.name}!`, 'success');
    } catch (err) { console.error('Copy failed:', err); }
  };

  return (
    <div className="space-y-3">
      {selectedChild && (
        <>
          {/* Task Tree */}
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading tasks...</div>
          ) : taskTree.length === 0 ? (
            <div className="dragon-card text-center py-8">
              <p className="text-4xl mb-3">🐉</p>
              <p className="text-gray-400 mb-3">No daily tasks yet!</p>
              <button
                onClick={() => { setAddMode({ type: 'main' }); setNewTitle(''); setNewBonus(2); }}
                className="btn-gold"
              >
                + Add First Task
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {taskTree.map((main, mi) => {
                const allDone = main.subtasks.length > 0
                  ? main.subtasks.every(s => completions.has(s.id))
                  : completions.has(main.id);
                const isEditing = editingCardId === main.id;
                const isCollapsed = collapsed.has(main.id) && !isEditing;
                const doneCount = main.subtasks.filter(s => completions.has(s.id)).length;
                const totalCount = main.subtasks.length;

                return (
                  <div key={main.id} className={`dragon-card animate-fade-in ${isEditing ? 'border-gold/40' : ''}`} style={{ animationDelay: `${mi * 50}ms` }}>
                    {/* Main Task Header */}
                    <div className="flex items-center gap-2">
                      {isEditing && (
                        <div className="flex flex-col gap-0.5 mr-1">
                          <button onClick={() => handleMoveMain(main, -1)} disabled={mi === 0}
                            className="text-gold/50 hover:text-gold disabled:opacity-20 text-xs leading-none p-0.5">▲</button>
                          <button onClick={() => handleMoveMain(main, 1)} disabled={mi === taskTree.length - 1}
                            className="text-gold/50 hover:text-gold disabled:opacity-20 text-xs leading-none p-0.5">▼</button>
                        </div>
                      )}
                      {/* Collapse chevron */}
                      {!isEditing && main.subtasks.length > 0 && (
                        <button
                          onClick={() => toggleCollapse(main.id)}
                          className="text-gray-500 hover:text-gray-300 text-xs p-1 transition-transform"
                          style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                        >
                          ▼
                        </button>
                      )}
                      <button
                        onClick={() => !isEditing && (main.subtasks.length > 0 ? handleToggleMainTask(main) : handleToggleSubtask(main, main))}
                        className="flex items-center gap-3 flex-1 text-left"
                      >
                        {!isEditing && (
                          <input type="checkbox" checked={allDone} readOnly className="task-check main-task-check" />
                        )}
                        <span className={`flex-1 font-semibold text-base ${allDone && !isEditing ? 'text-gold line-through opacity-70' : 'text-white'}`}>
                          {main.title}
                        </span>
                        {/* Collapsed: show compact counter */}
                        {!isEditing && isCollapsed && totalCount > 0 && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${allDone ? 'bg-gem-emerald/20 text-gem-emerald' : 'bg-cave-600/50 text-gray-400'}`}>
                            {doneCount}/{totalCount}
                          </span>
                        )}
                        {!isEditing && !isCollapsed && main.bonus_gems > 0 && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${allDone ? 'bg-gold/20 text-gold' : 'bg-cave-600/50 text-gray-400'}`}>
                            +{main.bonus_gems} bonus
                          </span>
                        )}
                      </button>
                      {isEditing ? (
                        <>
                          <button onClick={() => setEditingTask({ id: main.id, title: main.title, bonus_gems: main.bonus_gems, gem_value: 0, isMain: true, active_days: main.active_days || null })}
                            className="text-gold/60 hover:text-gold text-sm p-1.5 bg-gold/10 rounded-lg">✏️</button>
                          {otherChildren.length > 0 && (
                            <button onClick={() => { setCopyToTask(main); setCopyToSelected(new Set()); }}
                              className="text-xs px-2 py-1.5 rounded-lg bg-cave-600/40 text-gray-300 font-semibold active:scale-95 whitespace-nowrap">
                              📋→
                            </button>
                          )}
                          <button onClick={() => { if (window.confirm(`Delete "${main.title}" and all subtasks?`)) handleDeleteTask(main.id); }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/20 text-red-400 text-sm font-bold active:scale-90">✕</button>
                          <button onClick={() => setEditingCardId(null)}
                            className="text-xs px-2 py-1 rounded-lg bg-gold/20 text-gold font-semibold">Done</button>
                        </>
                      ) : (
                        <button onClick={() => setEditingCardId(main.id)}
                          className="text-[10px] text-gray-600 hover:text-gray-400 p-1 transition-all opacity-30 hover:opacity-80">✏️</button>
                      )}
                    </div>

                    {/* Subtasks */}
                    {main.subtasks.length > 0 && !isCollapsed && (
                      <div className="mt-3 ml-2 space-y-1.5">
                        {main.subtasks.map((sub, si) => {
                          const isDone = completions.has(sub.id);
                          const isAnimating = animatingGem === sub.id;

                          return (
                            <div key={sub.id} className="flex items-center gap-1 py-1.5 px-2 rounded-xl hover:bg-white/5 transition-colors">
                              {isEditing && (
                                <div className="flex flex-col gap-0 mr-0.5">
                                  <button onClick={() => handleMoveSub(main, sub, -1)} disabled={si === 0}
                                    className="text-gold/40 hover:text-gold disabled:opacity-20 text-[10px] leading-none p-0.5">▲</button>
                                  <button onClick={() => handleMoveSub(main, sub, 1)} disabled={si === main.subtasks.length - 1}
                                    className="text-gold/40 hover:text-gold disabled:opacity-20 text-[10px] leading-none p-0.5">▼</button>
                                </div>
                              )}
                              <button
                                onClick={() => !isEditing && handleToggleSubtask(sub, main)}
                                className="flex items-center gap-3 flex-1 text-left active:scale-[0.98]"
                              >
                                {!isEditing && (
                                  <span className="text-cave-600 text-xs w-4">
                                    {si === main.subtasks.length - 1 ? '└' : '├'}
                                  </span>
                                )}
                                {!isEditing && (
                                  <input type="checkbox" checked={isDone} readOnly className="task-check" />
                                )}
                                <span className={`flex-1 text-sm ${isDone && !isEditing ? 'text-gray-400 line-through' : 'text-gray-200'}`}>
                                  {sub.title}
                                </span>
                                {!isEditing && (
                                  <>
                                    <div className={isAnimating ? 'sparkle-burst' : ''}>
                                      <GemIcon earned={isDone} size="sm" colorIndex={mi + si} animate={isAnimating} />
                                    </div>
                                    <span className={`text-xs font-medium ${isDone ? 'text-gold/60' : 'text-gray-500'}`}>
                                      {sub.gem_value}
                                    </span>
                                  </>
                                )}
                              </button>
                              {isEditing && (
                                <>
                                  <span className="text-[10px] text-gray-500">💎{sub.gem_value}</span>
                                  <button onClick={() => setEditingTask({ id: sub.id, title: sub.title, gem_value: sub.gem_value, bonus_gems: 0, isMain: false })}
                                    className="text-gold/60 hover:text-gold text-xs p-1 bg-gold/10 rounded-lg">✏️</button>
                                  <button onClick={() => handleDeleteTask(sub.id)}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/20 text-red-400 text-xs font-bold active:scale-90">✕</button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* + Add subtask button */}
                    {!isCollapsed && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setAddMode({ type: 'sub', parentId: main.id }); setNewTitle(''); setNewGems(1); }}
                      className="mt-2 ml-6 text-xs text-gold/40 hover:text-gold/70 transition-colors py-1"
                    >
                      + Add subtask
                    </button>
                    )}

                    {/* Inline add subtask form */}
                    {!isCollapsed && addMode?.type === 'sub' && addMode.parentId === main.id && (
                      <div className="mt-2 ml-4 p-3 bg-cave-800/50 rounded-xl space-y-2 animate-slide-up">
                        <input
                          type="text"
                          value={newTitle}
                          onChange={e => setNewTitle(e.target.value)}
                          placeholder="Subtask name..."
                          autoFocus
                          className="text-sm"
                          onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">Gems:</span>
                          {[1, 2, 3, 5].map(n => (
                            <button
                              key={n}
                              onClick={() => setNewGems(n)}
                              className={`px-2 py-1 rounded-lg text-xs font-bold transition-all
                                ${newGems === n ? 'bg-gold/20 border border-gold/50 text-gold' : 'bg-cave-700/50 text-gray-500'}`}
                            >
                              {n}
                            </button>
                          ))}
                          <span className="flex-1" />
                          <button onClick={() => setAddMode(null)} className="text-xs text-gray-500 px-2 py-1">Cancel</button>
                          <button onClick={handleAddTask} disabled={!newTitle.trim()} className="btn-gold text-xs py-1 px-3 disabled:opacity-40">Add</button>
                        </div>
                      </div>
                    )}

                    {/* Bonus gems row (visible when all done) */}
                    {!isCollapsed && allDone && main.bonus_gems > 0 && (
                      <div className="mt-2 pt-2 border-t border-gold/20 flex items-center justify-end gap-2 animate-slide-up">
                        <span className="text-xs text-gold/80">Bonus earned!</span>
                        <GemIcon earned={true} size="sm" colorIndex={0} animate={true} />
                        <span className="text-xs font-bold text-gold">+{main.bonus_gems}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* + Add Main Task button */}
              <div
                onClick={() => { setAddMode({ type: 'main' }); setNewTitle(''); setNewBonus(2); }}
                className="dragon-card flex items-center justify-center gap-2 py-4 cursor-pointer border-gold/30 hover:border-gold/50 active:scale-[0.98] transition-all"
              >
                <span className="text-2xl text-gold">＋</span>
                <span className="text-gold font-semibold">Add Main Task</span>
              </div>

            </div>
          )}

          {/* Inline add main task form — always accessible */}
          {addMode?.type === 'main' && (
            <div className="dragon-card space-y-3 border-gold/30 animate-slide-up">
              {/* Clone from other child */}
              {otherChildren.length > 0 && !cloneMode && (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-gray-400">Clone from:</span>
                  {otherChildren.map(oc => (
                    <button key={oc.id} onClick={() => handleShowClone(oc)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cave-600/40 text-gray-300 active:scale-95">
                      {oc.avatar_emoji} {oc.name}
                    </button>
                  ))}
                </div>
              )}
              {/* Clone picker */}
              {cloneMode && (
                <div className="space-y-2 animate-slide-up">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gold font-semibold">{cloneMode.childEmoji} {cloneMode.childName}'s tasks</span>
                    <button onClick={() => setCloneMode(null)} className="text-xs text-gray-500">Cancel</button>
                  </div>
                  {cloneMode.tasks.length === 0 ? (
                    <p className="text-xs text-gray-500 py-2">No tasks to clone</p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {cloneMode.tasks.map(t => (
                        <button key={t.id} onClick={() => handleCloneTask(t)}
                          className="w-full text-left px-3 py-2 rounded-xl bg-cave-700/40 hover:bg-cave-600/40 active:scale-[0.98] transition-all">
                          <span className="text-sm text-white font-medium">{t.title}</span>
                          {t.subtasks.length > 0 && (
                            <span className="text-[10px] text-gray-500 ml-2">({t.subtasks.length} subtasks)</span>
                          )}
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
                    placeholder="Main task name (e.g., After School)"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Bonus gems:</span>
                    {[0, 1, 2, 3, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setNewBonus(n)}
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition-all
                          ${newBonus === n ? 'bg-gold/20 border border-gold/50 text-gold' : 'bg-cave-700/50 text-gray-500'}`}
                      >
                        {n === 0 ? '—' : n}
                      </button>
                    ))}
                    <span className="flex-1" />
                    <button onClick={() => setAddMode(null)} className="text-xs text-gray-500 px-2 py-1">Cancel</button>
                    <button onClick={handleAddTask} disabled={!newTitle.trim()} className="btn-gold text-xs py-1 px-3 disabled:opacity-40">Add</button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Edit Task Modal */}
          {editingTask && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setEditingTask(null)}>
              <div className="dragon-card max-w-sm w-full space-y-4 animate-slide-up" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-gold">
                  {editingTask.isMain ? 'Edit Main Task' : 'Edit Subtask'}
                </h3>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                />
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">
                    {editingTask.isMain ? 'Bonus gems (all subtasks done)' : 'Gems per completion'}
                  </label>
                  <div className="flex gap-2">
                    {(editingTask.isMain ? [0, 1, 2, 3, 5] : [1, 2, 3, 5]).map(n => (
                      <button
                        key={n}
                        onClick={() => setEditingTask({
                          ...editingTask,
                          ...(editingTask.isMain ? { bonus_gems: n } : { gem_value: n })
                        })}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all
                          ${(editingTask.isMain ? editingTask.bonus_gems : editingTask.gem_value) === n
                            ? 'bg-gold/20 border-2 border-gold/50 text-gold'
                            : 'bg-cave-700/50 border-2 border-cave-600/30 text-gray-400'}`}
                      >
                        {editingTask.isMain && n === 0 ? '—' : `💎${n}`}
                      </button>
                    ))}
                  </div>
                </div>
                {editingTask.isMain && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">Active days</label>
                    <div className="flex gap-1">
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, i) => {
                        const days = editingTask.active_days || [0,1,2,3,4,5,6];
                        const isActive = days.includes(i);
                        return (
                          <button
                            key={day}
                            onClick={() => {
                              const newDays = isActive ? days.filter(d => d !== i) : [...days, i].sort();
                              setEditingTask({ ...editingTask, active_days: newDays.length === 7 ? null : newDays });
                            }}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all
                              ${isActive
                                ? 'bg-gold/20 border border-gold/50 text-gold'
                                : 'bg-cave-700/50 border border-cave-600/30 text-gray-600'}`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[9px] text-gray-600 mt-1">Tap to toggle. All selected = every day.</p>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setEditingTask(null)} className="btn-outline flex-1 text-center">Cancel</button>
                  <button onClick={handleSaveEdit} disabled={!editingTask.title.trim()} className="btn-gold flex-1 text-center disabled:opacity-40">Save</button>
                </div>
              </div>
            </div>
          )}

          {/* Copy To Modal */}
          {copyToTask && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setCopyToTask(null)}>
              <div className="dragon-card max-w-sm w-full space-y-4 animate-slide-up" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-gold">Copy "{copyToTask.title}" to...</h3>
                <p className="text-[10px] text-gray-500">
                  {copyToTask.subtasks.length > 0 ? `Includes ${copyToTask.subtasks.length} subtasks` : 'No subtasks'}
                </p>
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
                        <span className="text-lg">{oc.avatar_emoji}</span>
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
    </div>
  );
}
