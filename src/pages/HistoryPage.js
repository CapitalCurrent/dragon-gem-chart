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

  const [debugInfo, setDebugInfo] = useState('waiting...');
  const loadData = useCallback(async () => {
    if (!selectedChild) { setDebugInfo('no child selected'); return; }
    setLoading(true);
    try {
      // Raw localStorage check
      const rawKey = `dgc_ledger_${selectedChild.id}`;
      const raw = localStorage.getItem(rawKey);
      const rawCount = raw ? JSON.parse(raw).length : 0;
      const hist = await getGemHistory(selectedChild.id, 100);
      setDebugInfo(`raw: ${rawCount}, hist: ${hist.length}, first: ${hist[0] ? JSON.stringify(hist[0]).slice(0, 80) : 'none'}`);
      setHistory(hist);
      const ug = await getUngiven(selectedChild.id);
      setUngiven(ug);
    } catch (err) {
      setDebugInfo(`ERROR: ${err.message}`);
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
          {/* DEBUG — REMOVE AFTER */}
          <div className="bg-red-900 border-4 border-yellow-400 p-3 rounded-xl">
            <p className="text-yellow-300 font-bold text-xs">DEBUG v1.5.25</p>
            <p className="text-white text-[11px] break-all">{debugInfo}</p>
          </div>

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
              {history.map((entry, i) => {
                const isEarned = entry.amount > 0;
                const date = entry.created_at ? new Date(entry.created_at) : new Date();
                const dateStr = isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const prevDate = i > 0 && history[i-1].created_at ? new Date(history[i-1].created_at) : null;
                const showDateHeader = i === 0 || !prevDate || isNaN(prevDate.getTime()) ||
                  prevDate.toDateString() !== date.toDateString();

                return (
                  <React.Fragment key={entry.id || i}>
                    {showDateHeader && (
                      <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wide pt-3 pb-1 px-1">
                        {dateStr}
                      </p>
                    )}
                    <div className="flex items-center gap-2 px-3 py-2 bg-cave-800/20 rounded-xl">
                      <span className="text-sm">{sourceIcon(entry.source)}</span>
                      <span className="flex-1 text-sm text-gray-300 truncate">{entry.description}</span>
                      <span className={`text-sm font-bold ${isEarned ? 'text-gem-emerald' : 'text-gem-ruby'}`}>
                        {isEarned ? '+' : ''}{entry.amount}
                      </span>
                      <span className="text-xs">💎</span>
                      {!entry.gems_given && isEarned && (
                        <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" title="Not yet given" />
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </>
    </div>
  );
}
