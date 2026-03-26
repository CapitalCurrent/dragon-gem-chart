import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';

import GemIcon from '../components/shared/GemIcon';
import {
  getTaskTemplates, getWeeklyCompletions, toggleWeeklyCompletion,
  addGemTransaction, removeGemTransaction, mondayOfWeek, addTaskTemplate,
  updateTaskTemplate, deleteTaskTemplate
} from '../database';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function WeeklyPage() {
  const { selectedChild, refreshBalances, showToast } = useApp();
  const [tasks, setTasks] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [loading, setLoading] = useState(true);
  const [animatingGem, setAnimatingGem] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGems, setNewGems] = useState(2);
  const [editMode, setEditMode] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const weekOf = mondayOfWeek();

  const loadData = useCallback(async () => {
    if (!selectedChild) return;
    setLoading(true);
    try {
      const allTasks = await getTaskTemplates(selectedChild.id, 'weekly');
      // Weekly tasks are flat (no tree structure needed)
      setTasks(allTasks.filter(t => !t.parent_id));

      const comps = await getWeeklyCompletions(selectedChild.id, weekOf);
      setCompletions(comps);
    } catch (err) {
      console.error('Failed to load weekly tasks:', err);
    }
    setLoading(false);
  }, [selectedChild, weekOf]);

  useEffect(() => { loadData(); }, [loadData]);

  const isCompletedOnDay = (taskId, dayOfWeek) => {
    return completions.some(c => c.task_template_id === taskId && c.day_of_week === dayOfWeek);
  };

  const handleToggle = async (task) => {
    if (!selectedChild) return;
    const isCompleting = !isCompletedOnDay(task.id, selectedDay);

    try {
      await toggleWeeklyCompletion(selectedChild.id, task.id, selectedDay, weekOf);

      if (isCompleting) {
        await addGemTransaction(selectedChild.id, task.gem_value, 'task', `${task.title} (${DAYS[selectedDay]})`, task.id);
        setAnimatingGem(task.id);
        setTimeout(() => setAnimatingGem(null), 600);
        showToast(`+${task.gem_value} gem${task.gem_value > 1 ? 's' : ''}!`, 'gem');
      } else {
        await removeGemTransaction(task.id);
      }

      await loadData();
      refreshBalances();
    } catch (err) {
      console.error('Toggle weekly failed:', err);
    }
  };

  const weekGems = completions.reduce((sum, c) => {
    const task = tasks.find(t => t.id === c.task_template_id);
    return sum + (task?.gem_value || 0);
  }, 0);

  return (
    <div className="space-y-4">
      {selectedChild && (
        <>
          {/* Header */}
          <div className="dragon-card flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gold flex items-center gap-2">
                {selectedChild.avatar_emoji} Weekly Tasks
              </h2>
              <p className="text-xs text-gray-400">Week of {new Date(weekOf + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
            </div>
            <div className="flex items-center gap-2">
              {tasks.length > 0 && (
                <button
                  onClick={() => setEditMode(!editMode)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all
                    ${editMode ? 'bg-gold/20 text-gold border border-gold/50' : 'text-gray-500 hover:text-gray-300 border border-cave-600/30'}`}
                >
                  {editMode ? '✓ Done' : '✏️ Edit'}
                </button>
              )}
              <div className="gem-counter text-sm">💎 {weekGems}</div>
            </div>
          </div>

          {/* Day Tabs */}
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

          {/* Task List */}
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : tasks.length === 0 ? (
            <div className="dragon-card text-center py-8">
              <p className="text-4xl mb-3">📅</p>
              <p className="text-gray-400 mb-3">No weekly tasks yet!</p>
              <button
                onClick={() => { setShowAddForm(true); setNewTitle(''); setNewGems(2); }}
                className="btn-gold"
              >
                + Add First Task
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task, i) => {
                const isDone = isCompletedOnDay(task.id, selectedDay);
                const isAnimating = animatingGem === task.id;
                const completedDays = completions
                  .filter(c => c.task_template_id === task.id)
                  .map(c => DAYS[c.day_of_week]);

                return (
                  <div
                    key={task.id}
                    className="dragon-card w-full text-left flex items-center gap-2 active:scale-[0.98] transition-transform"
                  >
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
                      className="flex items-center gap-3 flex-1 text-left"
                    >
                      {!editMode && <input type="checkbox" checked={isDone} readOnly className="task-check" />}
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${isDone && !editMode ? 'text-gray-400 line-through' : 'text-white'}`}>
                          {task.title}
                        </span>
                        {completedDays.length > 0 && !editMode && (
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            Done: {completedDays.join(', ')}
                          </p>
                        )}
                      </div>
                      {!editMode && (
                        <>
                          <div className={isAnimating ? 'sparkle-burst' : ''}>
                            <GemIcon earned={isDone} size="sm" colorIndex={i} animate={isAnimating} />
                          </div>
                          <span className={`text-xs font-medium ${isDone ? 'text-gold/60' : 'text-gray-500'}`}>
                            {task.gem_value}
                          </span>
                        </>
                      )}
                    </button>
                    {editMode && (
                      <>
                        <span className="text-[10px] text-gray-500">💎{task.gem_value}</span>
                        <button
                          onClick={() => setEditingTask({ id: task.id, title: task.title, gem_value: task.gem_value })}
                          className="text-gold/60 hover:text-gold text-sm p-1.5 bg-gold/10 rounded-lg"
                        >✏️</button>
                        <button
                          onClick={() => { deleteTaskTemplate(task.id).then(() => loadData()); }}
                          className="text-gem-ruby/40 hover:text-gem-ruby text-sm p-1.5 bg-gem-ruby/10 rounded-lg"
                        >🗑</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* + Add Weekly Task */}
          <div
            onClick={() => { setShowAddForm(true); setNewTitle(''); setNewGems(2); }}
            className="dragon-card flex items-center justify-center gap-2 py-4 cursor-pointer border-gold/30 hover:border-gold/50 active:scale-[0.98] transition-all"
          >
            <span className="text-2xl text-gold">＋</span>
            <span className="text-gold font-semibold">Add Weekly Task</span>
          </div>

          {showAddForm && (
            <div className="dragon-card space-y-3 border-gold/30 animate-slide-up">
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Task name (e.g., Clean room)"
                autoFocus
                onKeyDown={async e => {
                  if (e.key === 'Enter' && newTitle.trim() && selectedChild) {
                    await addTaskTemplate({ child_id: selectedChild.id, title: newTitle.trim(), task_type: 'weekly', parent_id: null, gem_value: newGems, bonus_gems: 0, sort_order: tasks.length });
                    showToast('Task added!', 'success');
                    setShowAddForm(false); setNewTitle('');
                    await loadData();
                  }
                }}
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
                <button onClick={() => setShowAddForm(false)} className="text-xs text-gray-500 px-2 py-1">Cancel</button>
                <button
                  disabled={!newTitle.trim()}
                  onClick={async () => {
                    if (!newTitle.trim() || !selectedChild) return;
                    await addTaskTemplate({ child_id: selectedChild.id, title: newTitle.trim(), task_type: 'weekly', parent_id: null, gem_value: newGems, bonus_gems: 0, sort_order: tasks.length });
                    showToast('Task added!', 'success');
                    setShowAddForm(false); setNewTitle('');
                    await loadData();
                  }}
                  className="btn-gold text-xs py-1 px-3 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Edit Task Modal */}
          {editingTask && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setEditingTask(null)}>
              <div className="dragon-card max-w-sm w-full space-y-4 animate-slide-up" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-gold">Edit Task</h3>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
                  autoFocus
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && editingTask.title.trim()) {
                      await updateTaskTemplate(editingTask.id, { title: editingTask.title.trim(), gem_value: editingTask.gem_value });
                      setEditingTask(null);
                      await loadData();
                      showToast('Task updated', 'success');
                    }
                  }}
                />
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Gems per completion</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setEditingTask({ ...editingTask, gem_value: n })}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all
                          ${editingTask.gem_value === n
                            ? 'bg-gold/20 border-2 border-gold/50 text-gold'
                            : 'bg-cave-700/50 border-2 border-cave-600/30 text-gray-400'}`}
                      >
                        💎{n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setEditingTask(null)} className="btn-outline flex-1 text-center">Cancel</button>
                  <button
                    disabled={!editingTask.title.trim()}
                    onClick={async () => {
                      await updateTaskTemplate(editingTask.id, { title: editingTask.title.trim(), gem_value: editingTask.gem_value });
                      setEditingTask(null);
                      await loadData();
                      showToast('Task updated', 'success');
                    }}
                    className="btn-gold flex-1 text-center disabled:opacity-40"
                  >Save</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
