import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';

import { addBonusListening, getBonusListening, addGemTransaction, deleteBonusListening, removeGemTransaction, today } from '../database';

const GEM_AMOUNTS = [1, 2, 3, 5];

export default function BonusPage() {
  const { selectedChild, refreshBalances, showToast } = useApp();
  const [description, setDescription] = useState('');
  const [gems, setGems] = useState(1);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!selectedChild) return;
    try {
      const data = await getBonusListening(selectedChild.id);
      setHistory(data);
    } catch (err) {
      console.error('Failed to load bonus history:', err);
    }
  }, [selectedChild]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleAward = async () => {
    if (!selectedChild || !description.trim()) return;
    setLoading(true);
    try {
      const bonus = await addBonusListening(selectedChild.id, description.trim(), gems);
      await addGemTransaction(selectedChild.id, gems, 'bonus', `Bonus: ${description.trim()}`, bonus.id);
      showToast(`+${gems} bonus gem${gems > 1 ? 's' : ''} for ${selectedChild.name}!`, 'gem');
      setDescription('');
      setGems(1);
      await loadHistory();
      await refreshBalances();
    } catch (err) {
      console.error('Award bonus failed:', err);
    }
    setLoading(false);
  };

  const handleDelete = async (bonus) => {
    try {
      await removeGemTransaction(bonus.id);
      await deleteBonusListening(bonus.id);
      await loadHistory();
      await refreshBalances();
      showToast('Bonus removed', 'info');
    } catch (err) {
      console.error('Delete bonus failed:', err);
    }
  };

  return (
    <div className="space-y-4">
      {selectedChild && (
        <>
          {/* Header */}
          <div className="dragon-card">
            <h2 className="text-lg font-bold text-gold flex items-center gap-2">
              ⭐ Bonus Listening
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Award surprise gems for great listening!
            </p>
          </div>

          {/* Award Form */}
          <div className="dragon-card space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">What did {selectedChild.name} do?</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Helped set the table without being asked..."
                rows={2}
                className="w-full resize-none"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Gems to award</label>
              <div className="flex gap-2">
                {GEM_AMOUNTS.map(n => (
                  <button
                    key={n}
                    onClick={() => setGems(n)}
                    className={`flex-1 py-3 rounded-xl text-center font-bold transition-all
                      ${gems === n
                        ? 'bg-gradient-to-b from-gold/25 to-gold/15 border-2 border-gold/50 text-gold shadow-lg shadow-gold/10'
                        : 'bg-cave-700/50 border-2 border-cave-600/30 text-gray-400 hover:border-cave-500'
                      }`}
                  >
                    <span className="text-lg">💎</span>
                    <span className="block text-sm mt-0.5">{n}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleAward}
              disabled={loading || !description.trim()}
              className="btn-gold w-full disabled:opacity-40 disabled:cursor-not-allowed text-center"
            >
              ✨ Award {gems} Gem{gems > 1 ? 's' : ''} to {selectedChild.name}
            </button>
          </div>

          {/* Recent Bonus History */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-2 px-1">Recent Bonuses</h3>
            {history.length === 0 ? (
              <div className="dragon-card text-center py-6">
                <p className="text-gray-500 text-sm">No bonus gems awarded yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.slice(0, 20).map(bonus => (
                  <div key={bonus.id} className="dragon-card flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{bonus.description}</p>
                      <p className="text-[10px] text-gray-500">
                        {new Date(bonus.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {bonus.awarded_by && ` by ${bonus.awarded_by}`}
                      </p>
                    </div>
                    <span className="gem-counter text-sm">💎 {bonus.gems_awarded}</span>
                    <button
                      onClick={() => handleDelete(bonus)}
                      className="text-gray-600 hover:text-gem-ruby text-xs p-1 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
