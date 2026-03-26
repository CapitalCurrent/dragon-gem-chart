import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import ChildSelector from '../components/shared/ChildSelector';
import GemIcon from '../components/shared/GemIcon';
import {
  getTaskTemplates, getWeeklyCompletions, toggleWeeklyCompletion,
  addGemTransaction, removeGemTransaction, mondayOfWeek
} from '../database';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function WeeklyPage() {
  const { selectedChild, refreshBalances, showToast } = useApp();
  const [tasks, setTasks] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [loading, setLoading] = useState(true);
  const [animatingGem, setAnimatingGem] = useState(null);

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
      <ChildSelector />

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
            <div className="gem-counter text-base">💎 {weekGems} this week</div>
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
              <p className="text-gray-400 mb-2">No weekly tasks set up yet!</p>
              <p className="text-gray-500 text-sm">Go to Settings to add tasks</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task, i) => {
                const isDone = isCompletedOnDay(task.id, selectedDay);
                const isAnimating = animatingGem === task.id;
                // Show which day it was completed on (if any)
                const completedDays = completions
                  .filter(c => c.task_template_id === task.id)
                  .map(c => DAYS[c.day_of_week]);

                return (
                  <button
                    key={task.id}
                    onClick={() => handleToggle(task)}
                    className="dragon-card w-full text-left flex items-center gap-3 active:scale-[0.98] transition-transform"
                  >
                    <input type="checkbox" checked={isDone} readOnly className="task-check" />
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium ${isDone ? 'text-gray-400 line-through' : 'text-white'}`}>
                        {task.title}
                      </span>
                      {completedDays.length > 0 && (
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          Done: {completedDays.join(', ')}
                        </p>
                      )}
                    </div>
                    <div className={isAnimating ? 'sparkle-burst' : ''}>
                      <GemIcon earned={isDone} size="sm" colorIndex={i} animate={isAnimating} />
                    </div>
                    <span className={`text-xs font-medium ${isDone ? 'text-gold/60' : 'text-gray-500'}`}>
                      {task.gem_value}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
