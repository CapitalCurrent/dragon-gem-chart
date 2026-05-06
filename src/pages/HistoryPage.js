import React, { useState, useEffect, useCallback } from 'react';

import { useApp } from '../contexts/AppContext';

import { getGemHistory, getUngiven, markGemsGiven, addGemTransaction, reconcileBalance } from '../database';

export default function HistoryPage() {
  const { selectedChild, collectedBalances, refreshBalances, showToast, syncVersion } = useApp();
  const [history, setHistory] = useState([]);
  const [ungiven, setUngiven] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdjust, setShowAdjust] = useState(false);
  const [jarTarget, setJarTarget] = useState('');
  const [filter, setFilter] = useState('all'); // 'all', 'tasks', 'bonuses', 'redemptions', 'adjustments'
  const [integrityResult, setIntegrityResult] = useState(null);

  const loadData = useCallback(async () => {
    if (!selectedChild) return;
    setLoading(true);
    try {
      const hist = await getGemHistory(selectedChild.id, 100);
      setHistory(hist);
      const ug = await getUngiven(selectedChild.id);
      setUngiven(ug);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
    setLoading(false);
  }, [selectedChild]);

  useEffect(() => { loadData(); }, [loadData, syncVersion]);

  const handleMarkAllGiven = async () => {
    if (!selectedChild) return;
    try {
      await markGemsGiven(selectedChild.id);
      await refreshBalances();
      await loadData();
      showToast('All gems marked as given!', 'success');
    } catch (err) {
      console.error('Mark given failed:', err);
    }
  };

  const handleIntegrityCheck = () => {
    if (!selectedChild) return;
    let fullLedger = [];
    try {
      const raw = localStorage.getItem(`dgc_ledger_${selectedChild.id}`);
      fullLedger = raw ? JSON.parse(raw) : [];
    } catch { fullLedger = []; }

    const givenEarned = fullLedger.filter(g => g.amount > 0 && g.gems_given).reduce((s, g) => s + (Number(g.amount) || 0), 0);
    const ungivenEarned = fullLedger.filter(g => g.amount > 0 && !g.gems_given).reduce((s, g) => s + (Number(g.amount) || 0), 0);
    const spent = fullLedger.filter(g => g.amount < 0).reduce((s, g) => s + (Number(g.amount) || 0), 0);
    const expectedJar = Math.floor(givenEarned + spent);
    const expectedUngiven = ungivenEarned;
    const displayedJar = balance;
    const displayedUngiven = ungivenTotal;

    const issues = [];
    if (Math.abs(expectedJar - displayedJar) > 0.01) {
      issues.push(`Jar mismatch: shown ${displayedJar}, ledger says ${expectedJar}`);
    }
    if (Math.abs(expectedUngiven - displayedUngiven) > 0.01) {
      issues.push(`Ungiven mismatch: shown ${displayedUngiven}, ledger says ${expectedUngiven}`);
    }
    const orphaned = fullLedger.filter(g => g.amount === undefined || g.amount === null || isNaN(Number(g.amount)));
    if (orphaned.length > 0) issues.push(`${orphaned.length} entries with bad amount`);
    const noDate = fullLedger.filter(g => !g.created_at);
    if (noDate.length > 0) issues.push(`${noDate.length} entries missing created_at`);

    setIntegrityResult({
      ok: issues.length === 0,
      total: fullLedger.length,
      givenEarned: Math.round(givenEarned * 100) / 100,
      ungivenEarned: Math.round(ungivenEarned * 100) / 100,
      spent: Math.round(spent * 100) / 100,
      expectedJar,
      expectedUngiven: Math.round(expectedUngiven * 100) / 100,
      issues,
    });
  };

  const handleSetJar = async () => {
    const target = parseInt(jarTarget);
    if (!selectedChild || isNaN(target) || target < 0) return;
    try {
      await reconcileBalance(selectedChild.id, target);
      showToast(`Jar set to ${target} gems`, 'success');
      setShowAdjust(false);
      setJarTarget('');
      await refreshBalances();
      await loadData();
    } catch (err) {
      console.error('Set jar failed:', err);
    }
  };

  const balance = selectedChild ? (collectedBalances[selectedChild.id] || 0) : 0;
  const ungivenTotal = ungiven.reduce((sum, r) => sum + r.amount, 0);

  const matchesFilter = (entry) => {
    if (filter === 'all') return true;
    if (filter === 'tasks') return entry.source === 'task' || entry.source === 'task_bonus';
    if (filter === 'bonuses') return entry.source === 'bonus';
    if (filter === 'redemptions') return entry.source === 'store';
    if (filter === 'adjustments') return entry.source === 'manual' || entry.source === 'compact';
    return true;
  };

  const sourceIcon = (source) => {
    switch (source) {
      case 'task': return '✅';
      case 'task_bonus': return '🌟';
      case 'bonus': return '⭐';
      case 'store': return '🏪';
      case 'manual': return '✏️';
      default: return '💎';
    }
  };

  if (!selectedChild) {
    return (
      <div className="space-y-4">
        <div className="dragon-card text-center py-8">
          <p className="text-gray-400">Select a child to view gem history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
        <>
          {/* Balance Overview */}
          <div className="dragon-card">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gold">{selectedChild.name}'s Ledger</h2>
                <p className="text-xs text-gray-400">All gem transactions</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gold">💎 {balance}</p>
                <p className="text-[10px] text-gray-500">total balance</p>
              </div>
            </div>
            {/* Adjust button inside the card */}
            <div className="mt-3 pt-3 border-t border-cave-600/30 flex justify-end">
              <button
                onClick={() => setShowAdjust(!showAdjust)}
                className={`text-xs px-4 py-2 rounded-xl font-semibold transition-all
                  ${showAdjust ? 'bg-gold/20 text-gold border-2 border-gold/50' : 'bg-cave-700/50 text-gold/70 hover:text-gold border-2 border-cave-500/30'}`}
              >
                {showAdjust ? '✕ Cancel' : '✏️ Adjust Gems'}
              </button>
            </div>
          </div>

          {/* Ungiven Gems Alert */}
          {ungivenTotal > 0 && (
            <div className="dragon-card border-gold/30 bg-gradient-to-r from-gold/10 to-gold/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gold">{ungivenTotal} gems not yet given</p>
                  <p className="text-[10px] text-gray-400">Physical gems to put in jar</p>
                </div>
                <button onClick={handleMarkAllGiven} className="btn-gold text-xs py-2 px-4">
                  ✓ All Given
                </button>
              </div>
            </div>
          )}

          {/* Manual Adjustment Form */}
          {showAdjust && (
            <div className="dragon-card space-y-3 border-gold/30 animate-slide-up">
              <h3 className="text-sm font-semibold text-gold">Set Jar Balance</h3>
              <p className="text-[10px] text-gray-400">This collects all pending gems and sets the jar to the exact number you choose.</p>
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setJarTarget(String(Math.max(0, (parseInt(jarTarget) || balance) - 1)))}
                  className="w-12 h-12 rounded-xl bg-gem-ruby/20 border-2 border-gem-ruby/40 text-gem-ruby text-2xl font-bold active:scale-90 transition-transform"
                >
                  −
                </button>
                <input
                  type="number"
                  value={jarTarget}
                  onChange={e => setJarTarget(e.target.value)}
                  placeholder={String(balance)}
                  className="w-24 text-center text-2xl font-bold bg-cave-800/80 border-2 border-gold/40 rounded-xl py-2 text-gold"
                  min="0"
                />
                <button
                  onClick={() => setJarTarget(String((parseInt(jarTarget) || balance) + 1))}
                  className="w-12 h-12 rounded-xl bg-gem-emerald/20 border-2 border-gem-emerald/40 text-gem-emerald text-2xl font-bold active:scale-90 transition-transform"
                >
                  +
                </button>
              </div>
              <button
                onClick={handleSetJar}
                disabled={jarTarget === '' || parseInt(jarTarget) < 0}
                className="btn-gold w-full text-center disabled:opacity-40"
              >
                Set jar to {jarTarget || balance} 💎
              </button>
            </div>
          )}

          {/* Filter chips + integrity check */}
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { key: 'all', label: 'All' },
              { key: 'tasks', label: '✅ Tasks' },
              { key: 'bonuses', label: '⭐ Bonuses' },
              { key: 'redemptions', label: '🏪 Redeemed' },
              { key: 'adjustments', label: '✏️ Adjustments' },
            ].map(c => (
              <button
                key={c.key}
                onClick={() => setFilter(c.key)}
                className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all border
                  ${filter === c.key
                    ? 'bg-gold/20 text-gold border-gold/50'
                    : 'bg-cave-700/40 text-gray-400 border-cave-600/30 hover:text-gray-200'
                  }`}
              >
                {c.label}
              </button>
            ))}
            <button
              onClick={handleIntegrityCheck}
              className="text-[11px] px-2.5 py-1 rounded-full font-semibold bg-cave-700/40 text-gem-emerald border border-cave-600/30 hover:bg-gem-emerald/10 ml-auto"
            >
              🔍 Verify
            </button>
          </div>

          {/* Integrity check result */}
          {integrityResult && (
            <div className={`dragon-card text-xs border-2 ${integrityResult.ok ? 'border-gem-emerald/40' : 'border-gem-ruby/50'}`}>
              <div className="flex items-center justify-between mb-2">
                <p className={`font-bold ${integrityResult.ok ? 'text-gem-emerald' : 'text-gem-ruby'}`}>
                  {integrityResult.ok ? '✓ Ledger looks good' : '⚠ Issues found'}
                </p>
                <button onClick={() => setIntegrityResult(null)} className="text-gray-500 text-xs">✕</button>
              </div>
              <div className="space-y-0.5 text-gray-400 text-[11px]">
                <p>Total entries: {integrityResult.total}</p>
                <p>Earned (given): +{integrityResult.givenEarned}</p>
                <p>Earned (pending): +{integrityResult.ungivenEarned}</p>
                <p>Spent: {integrityResult.spent}</p>
                <p>Expected jar: {integrityResult.expectedJar} (showing {balance})</p>
                <p>Expected ungiven: {integrityResult.expectedUngiven} (showing {ungivenTotal})</p>
              </div>
              {integrityResult.issues.length > 0 && (
                <div className="mt-2 pt-2 border-t border-cave-600/30 space-y-1">
                  {integrityResult.issues.map((issue, i) => (
                    <p key={i} className="text-gem-ruby text-[11px]">• {issue}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Transaction History */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : history.length === 0 ? (
            <div className="dragon-card text-center py-8">
              <p className="text-4xl mb-3">📜</p>
              <p className="text-gray-400">No transactions yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {(() => {
                // Running JAR balance — uses full ledger (not just top 100) for accuracy.
                const contributesToJar = (e) => (e.gems_given || e.amount < 0) ? (Number(e.amount) || 0) : 0;
                let fullLedger = [];
                try {
                  const raw = localStorage.getItem(`dgc_ledger_${selectedChild.id}`);
                  fullLedger = raw ? JSON.parse(raw) : [];
                } catch { fullLedger = history; }
                const jarTotal = fullLedger.reduce((sum, e) => sum + contributesToJar(e), 0);
                let runningAfter = jarTotal;
                const withBalance = history.map(entry => {
                  const balanceAfter = runningAfter;
                  runningAfter -= contributesToJar(entry);
                  return { entry, balanceAfter };
                });

                // Filter, but keep balance attached to original (pre-filter) entries
                const visible = withBalance.filter(({ entry }) => matchesFilter(entry));

                if (visible.length === 0) {
                  return (
                    <div className="dragon-card text-center py-6">
                      <p className="text-sm text-gray-400">No entries match this filter</p>
                    </div>
                  );
                }

                // Pre-compute daily totals (sum of amounts per local date) using full history
                const dailyTotals = {};
                history.forEach(e => {
                  if (!matchesFilter(e)) return;
                  const d = e.created_at ? new Date(e.created_at) : null;
                  if (!d || isNaN(d.getTime())) return;
                  const key = d.toDateString();
                  dailyTotals[key] = (dailyTotals[key] || 0) + (Number(e.amount) || 0);
                });

                return visible.map(({ entry, balanceAfter }, i) => {
                  const isEarned = entry.amount > 0;
                  const date = entry.created_at ? new Date(entry.created_at) : new Date();
                  const dateStr = isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  const prevEntry = i > 0 ? visible[i-1].entry : null;
                  const prevDate = prevEntry?.created_at ? new Date(prevEntry.created_at) : null;
                  const showDateHeader = i === 0 || !prevDate || isNaN(prevDate.getTime()) ||
                    prevDate.toDateString() !== date.toDateString();
                  const balanceLabel = Number.isInteger(balanceAfter) ? balanceAfter : balanceAfter.toFixed(2).replace(/\.?0+$/, '');
                  const dayTotal = dailyTotals[date.toDateString()] || 0;
                  const dayLabel = dayTotal === 0 ? '' : (dayTotal > 0 ? `+${Number.isInteger(dayTotal) ? dayTotal : dayTotal.toFixed(2).replace(/\.?0+$/, '')}` : Number.isInteger(dayTotal) ? dayTotal : dayTotal.toFixed(2).replace(/\.?0+$/, ''));

                  return (
                    <React.Fragment key={entry.id || i}>
                      {showDateHeader && (
                        <div className="flex items-center justify-between pt-3 pb-1 px-1">
                          <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wide">
                            {dateStr}
                          </p>
                          {dayLabel && (
                            <p className={`text-[10px] font-bold tabular-nums ${dayTotal > 0 ? 'text-gem-emerald/80' : 'text-gem-ruby/80'}`}>
                              {dayLabel} 💎
                            </p>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2 px-3 py-2 bg-cave-800/20 rounded-xl">
                        <span className="text-sm">{sourceIcon(entry.source)}</span>
                        <span className="flex-1 text-sm text-gray-300 truncate">{entry.description}</span>
                        <span className={`text-sm font-bold ${isEarned ? 'text-gem-emerald' : 'text-gem-ruby'}`}>
                          {isEarned ? '+' : ''}{entry.amount}
                        </span>
                        <span className="text-xs">💎</span>
                        <span className="text-[10px] text-gray-500 tabular-nums min-w-[2.5rem] text-right" title="Running total after this transaction">
                          → {balanceLabel}
                        </span>
                        {!entry.gems_given && isEarned && (
                          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" title="Not yet given" />
                        )}
                      </div>
                    </React.Fragment>
                  );
                });
              })()}
            </div>
          )}
        </>
    </div>
  );
}
