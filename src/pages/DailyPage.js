import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import GemIcon from '../components/shared/GemIcon';
import {
  getTaskTemplates, buildTaskTree, getDailyCompletions,
  toggleDailyCompletion, addGemTransaction, removeGemTransaction,
  addTaskTemplate, updateTaskTemplate, deleteTaskTemplate
} from '../database';

export default function DailyPage() {
  const { selectedChild, refreshBalances, showToast } = useApp();
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

  const loadData = useCallback(async () => {
    if (!selectedChild) return;
    setLoading(true);
    try {
      const templates = await getTaskTemplates(selectedChild.id, 'daily');
      const tree = buildTaskTree(templates);
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
        await addGemTransaction(selectedChild.id, subtask.gem_value, 'task', subtask.title, subtask.id);
        setAnimatingGem(subtask.id);
        setTimeout(() => setAnimatingGem(null), 600);
        showToast(`+${subtask.gem_value} gem${subtask.gem_value > 1 ? 's' : ''}!`, 'gem');
      } else {
        await removeGemTransaction(subtask.id);
      }

      // Check if all subtasks now complete → award main task bonus
      const newComps = new Set(completions);
      if (isCompleting) newComps.add(subtask.id);
      else newComps.delete(subtask.id);

      const allSubsDone = mainTask.subtasks.every(s => newComps.has(s.id));
      if (allSubsDone && mainTask.bonus_gems > 0 && !bonusAwarded.has(mainTask.id)) {
        // Auto-complete the main task and award bonus
        await toggleDailyCompletion(selectedChild.id, mainTask.id);
        await addGemTransaction(selectedChild.id, mainTask.bonus_gems, 'task_bonus', `Bonus: ${mainTask.title}`, mainTask.id);
        newComps.add(mainTask.id);
        setBonusAwarded(prev => new Set([...prev, mainTask.id]));
        showToast(`+${mainTask.bonus_gems} BONUS gems! All done!`, 'gem');
      } else if (!allSubsDone && bonusAwarded.has(mainTask.id)) {
        // Uncompleting a subtask — remove bonus
        if (completions.has(mainTask.id)) {
          await toggleDailyCompletion(selectedChild.id, mainTask.id);
          await removeGemTransaction(mainTask.id);
        }
        newComps.delete(mainTask.id);
        setBonusAwarded(prev => {
          const n = new Set(prev);
          n.delete(mainTask.id);
          return n;
        });
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
        // Uncheck all
        for (const sub of mainTask.subtasks) {
          if (completions.has(sub.id)) {
            await toggleDailyCompletion(selectedChild.id, sub.id);
            await removeGemTransaction(sub.id);
          }
        }
        if (completions.has(mainTask.id)) {
          await toggleDailyCompletion(selectedChild.id, mainTask.id);
          await removeGemTransaction(mainTask.id);
        }
      } else {
        // Check all remaining
        let gemsEarned = 0;
        for (const sub of mainTask.subtasks) {
          if (!completions.has(sub.id)) {
            await toggleDailyCompletion(selectedChild.id, sub.id);
            await addGemTransaction(selectedChild.id, sub.gem_value, 'task', sub.title, sub.id);
            gemsEarned += sub.gem_value;
          }
        }
        // Award main task bonus
        if (mainTask.bonus_gems > 0 && !bonusAwarded.has(mainTask.id)) {
          await toggleDailyCompletion(selectedChild.id, mainTask.id);
          await addGemTransaction(selectedChild.id, mainTask.bonus_gems, 'task_bonus', `Bonus: ${mainTask.title}`, mainTask.id);
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
                        {!isEditing && main.bonus_gems > 0 && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${allDone ? 'bg-gold/20 text-gold' : 'bg-cave-600/50 text-gray-400'}`}>
                            +{main.bonus_gems} bonus
                          </span>
                        )}
                      </button>
                      {isEditing ? (
                        <>
                          <button onClick={() => setEditingTask({ id: main.id, title: main.title, bonus_gems: main.bonus_gems, gem_value: 0, isMain: true })}
                            className="text-gold/60 hover:text-gold text-sm p-1.5 bg-gold/10 rounded-lg">✏️</button>
                          <button onClick={() => { if (window.confirm(`Delete "${main.title}" and all subtasks?`)) handleDeleteTask(main.id); }}
                            className="text-gem-ruby/50 hover:text-gem-ruby text-sm p-1.5 bg-gem-ruby/10 rounded-lg">🗑</button>
                          <button onClick={() => setEditingCardId(null)}
                            className="text-xs px-2 py-1 rounded-lg bg-gold/20 text-gold font-semibold">Done</button>
                        </>
                      ) : (
                        <button onClick={() => setEditingCardId(main.id)}
                          className="text-[10px] text-gray-600 hover:text-gray-400 p-1 transition-all opacity-30 hover:opacity-80">✏️</button>
                      )}
                    </div>

                    {/* Subtasks */}
                    {main.subtasks.length > 0 && (
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
                                    className="text-gem-ruby/40 hover:text-gem-ruby text-xs p-1 bg-gem-ruby/10 rounded-lg">🗑</button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* + Add subtask button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setAddMode({ type: 'sub', parentId: main.id }); setNewTitle(''); setNewGems(1); }}
                      className="mt-2 ml-6 text-xs text-gold/40 hover:text-gold/70 transition-colors py-1"
                    >
                      + Add subtask
                    </button>

                    {/* Inline add subtask form */}
                    {addMode?.type === 'sub' && addMode.parentId === main.id && (
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
                    {allDone && main.bonus_gems > 0 && (
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
                <div className="flex gap-3">
                  <button onClick={() => setEditingTask(null)} className="btn-outline flex-1 text-center">Cancel</button>
                  <button onClick={handleSaveEdit} disabled={!editingTask.title.trim()} className="btn-gold flex-1 text-center disabled:opacity-40">Save</button>
                </div>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}
