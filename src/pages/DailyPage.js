import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import ChildSelector from '../components/shared/ChildSelector';
import GemIcon, { GemCount } from '../components/shared/GemIcon';
import {
  getTaskTemplates, buildTaskTree, getDailyCompletions,
  toggleDailyCompletion, addGemTransaction, removeGemTransaction
} from '../database';

export default function DailyPage() {
  const { selectedChild, refreshBalances, showToast, todayGems } = useApp();
  const [taskTree, setTaskTree] = useState([]);
  const [completions, setCompletions] = useState(new Set());
  const [bonusAwarded, setBonusAwarded] = useState(new Set());
  const [animatingGem, setAnimatingGem] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const childTodayGems = selectedChild ? todayGems[selectedChild.id] : null;

  return (
    <div className="space-y-4">
      {/* Child Selector */}
      <ChildSelector />

      {selectedChild && (
        <>
          {/* Date & Today's Gems Header */}
          <div className="dragon-card flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gold flex items-center gap-2">
                {selectedChild.avatar_emoji} {selectedChild.name}'s Day
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">{dateStr}</p>
            </div>
            <div className="text-right">
              <GemCount count={childTodayGems?.earned || 0} />
              <p className="text-[10px] text-gray-500 mt-1">today</p>
            </div>
          </div>

          {/* Task Tree */}
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading tasks...</div>
          ) : taskTree.length === 0 ? (
            <div className="dragon-card text-center py-8">
              <p className="text-4xl mb-3">🐉</p>
              <p className="text-gray-400 mb-2">No daily tasks set up yet!</p>
              <p className="text-gray-500 text-sm">Go to Settings to add tasks</p>
            </div>
          ) : (
            <div className="space-y-3">
              {taskTree.map((main, mi) => {
                const allDone = main.subtasks.length > 0
                  ? main.subtasks.every(s => completions.has(s.id))
                  : completions.has(main.id);

                return (
                  <div key={main.id} className="dragon-card animate-fade-in" style={{ animationDelay: `${mi * 50}ms` }}>
                    {/* Main Task Header */}
                    <button
                      onClick={() => main.subtasks.length > 0 ? handleToggleMainTask(main) : handleToggleSubtask(main, main)}
                      className="flex items-center gap-3 w-full text-left"
                    >
                      <input
                        type="checkbox"
                        checked={allDone}
                        readOnly
                        className="task-check main-task-check"
                      />
                      <span className={`flex-1 font-semibold text-base ${allDone ? 'text-gold line-through opacity-70' : 'text-white'}`}>
                        {main.title}
                      </span>
                      {main.bonus_gems > 0 && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${allDone ? 'bg-gold/20 text-gold' : 'bg-cave-600/50 text-gray-400'}`}>
                          +{main.bonus_gems} bonus
                        </span>
                      )}
                    </button>

                    {/* Subtasks */}
                    {main.subtasks.length > 0 && (
                      <div className="mt-3 ml-2 space-y-1.5">
                        {main.subtasks.map((sub, si) => {
                          const isDone = completions.has(sub.id);
                          const isAnimating = animatingGem === sub.id;

                          return (
                            <button
                              key={sub.id}
                              onClick={() => handleToggleSubtask(sub, main)}
                              className="flex items-center gap-3 w-full text-left py-1.5 px-2 rounded-xl hover:bg-white/5 transition-colors active:scale-[0.98]"
                            >
                              {/* Tree connector */}
                              <span className="text-cave-600 text-xs w-4">
                                {si === main.subtasks.length - 1 ? '└' : '├'}
                              </span>

                              <input
                                type="checkbox"
                                checked={isDone}
                                readOnly
                                className="task-check"
                              />

                              <span className={`flex-1 text-sm ${isDone ? 'text-gray-400 line-through' : 'text-gray-200'}`}>
                                {sub.title}
                              </span>

                              {/* Gem indicator */}
                              <div className={isAnimating ? 'sparkle-burst' : ''}>
                                <GemIcon
                                  earned={isDone}
                                  size="sm"
                                  colorIndex={mi + si}
                                  animate={isAnimating}
                                />
                              </div>
                              <span className={`text-xs font-medium ${isDone ? 'text-gold/60' : 'text-gray-500'}`}>
                                {sub.gem_value}
                              </span>
                            </button>
                          );
                        })}
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
            </div>
          )}

          {/* Cashout Section */}
          {childTodayGems && childTodayGems.ungiven > 0 && (
            <CashoutBar childId={selectedChild.id} ungiven={childTodayGems.ungiven} />
          )}
        </>
      )}
    </div>
  );
}

function CashoutBar({ childId, ungiven }) {
  const { refreshBalances, showToast } = useApp();
  const { markGemsGiven } = require('../database');

  const handleCashout = async () => {
    try {
      await markGemsGiven(childId);
      await refreshBalances();
      showToast(`${ungiven} gems marked as given!`, 'success');
    } catch (err) {
      console.error('Cashout failed:', err);
    }
  };

  return (
    <div className="dragon-card border-gold/30 bg-gradient-to-r from-gold/10 to-gold/5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gold">Gems to give out</p>
          <p className="text-xs text-gray-400">Physical gems for the jar</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-gold">{ungiven}</span>
          <button onClick={handleCashout} className="btn-gold text-xs py-2 px-4">
            ✓ Given
          </button>
        </div>
      </div>
    </div>
  );
}
