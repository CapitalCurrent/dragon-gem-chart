import React, { useState, useEffect, useCallback } from 'react';

import { useApp } from '../contexts/AppContext';

import { getGemHistory, getUngiven, markGemsGiven } from '../database';

export default function HistoryPage() {
  const { selectedChild, collectedBalances, refreshBalances, showToast } = useApp();
  const [history, setHistory] = useState([]);
  const [ungiven, setUngiven] = useState([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { loadData(); }, [loadData]);

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

  return (
    <div className="space-y-4">
      {selectedChild && (
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
                const date = new Date(entry.created_at);
                const showDateHeader = i === 0 ||
                  new Date(history[i-1].created_at).toDateString() !== date.toDateString();

                return (
                  <React.Fragment key={entry.id}>
                    {showDateHeader && (
                      <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wide pt-3 pb-1 px-1">
                        {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
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
      )}
    </div>
  );
}
