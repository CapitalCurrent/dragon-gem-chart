import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import ChildSelector from '../components/shared/ChildSelector';

import { getStoreItems, redeemStoreItem, getRedemptionHistory } from '../database';

export default function StorePage() {
  const { selectedChild, balances, refreshBalances, showToast } = useApp();
  const [items, setItems] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [confirmItem, setConfirmItem] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const storeItems = await getStoreItems();
      setItems(storeItems);
      if (selectedChild) {
        const hist = await getRedemptionHistory(selectedChild.id);
        setRedemptions(hist);
      }
    } catch (err) {
      console.error('Failed to load store:', err);
    }
    setLoading(false);
  }, [selectedChild]);

  useEffect(() => { loadData(); }, [loadData]);

  const balance = selectedChild ? (balances[selectedChild.id] || 0) : 0;

  const handleRedeem = async (item) => {
    if (!selectedChild) return;
    if (balance < item.gem_cost) {
      showToast('Not enough gems!', 'error');
      return;
    }
    try {
      await redeemStoreItem(selectedChild.id, item);
      await refreshBalances();
      await loadData();
      setConfirmItem(null);
      showToast(`${selectedChild.name} redeemed ${item.name}!`, 'success');
    } catch (err) {
      console.error('Redeem failed:', err);
    }
  };

  return (
    <div className="space-y-4">
      <ChildSelector />

      {selectedChild && (
        <>
          {/* Balance Header */}
          <div className="dragon-card text-center">
            <p className="text-xs text-gray-400 mb-1">{selectedChild.name}'s Treasure</p>
            <div className="text-3xl font-bold text-gold flex items-center justify-center gap-2">
              <span className="text-4xl">💎</span>
              {balance}
            </div>
            <p className="text-xs text-gray-500 mt-1">gems available to spend</p>
          </div>

          {/* Store Items */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-2 px-1 flex items-center gap-2">
              🏪 Dragon Gem Store
            </h3>

            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading store...</div>
            ) : items.length === 0 ? (
              <div className="dragon-card text-center py-8">
                <p className="text-4xl mb-3">🏪</p>
                <p className="text-gray-400">No store items yet!</p>
                <p className="text-gray-500 text-sm">Go to Settings to add rewards</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map(item => {
                  const canAfford = balance >= item.gem_cost;
                  return (
                    <button
                      key={item.id}
                      onClick={() => canAfford ? setConfirmItem(item) : null}
                      className={`dragon-card w-full text-left flex items-center gap-3 transition-all
                        ${canAfford ? 'active:scale-[0.98] cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                    >
                      <span className="text-3xl">{item.emoji || '🎁'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm">{item.name}</p>
                        {item.description && (
                          <p className="text-[10px] text-gray-500 truncate">{item.description}</p>
                        )}
                      </div>
                      <div className={`gem-counter ${canAfford ? '' : 'opacity-50'}`}>
                        💎 {item.gem_cost}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Redemption History */}
          {redemptions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-2 px-1">Recent Redemptions</h3>
              <div className="space-y-1.5">
                {redemptions.slice(0, 10).map(r => (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-2 bg-cave-800/30 rounded-xl text-sm">
                    <span className="text-gray-400">{r.item_name}</span>
                    <span className="flex-1" />
                    <span className="text-gem-ruby text-xs">-💎{r.gems_spent}</span>
                    <span className="text-[10px] text-gray-600">
                      {new Date(r.redeemed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirmation Modal */}
          {confirmItem && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setConfirmItem(null)}>
              <div className="dragon-card max-w-sm w-full text-center space-y-4 animate-slide-up" onClick={e => e.stopPropagation()}>
                <span className="text-5xl block">{confirmItem.emoji || '🎁'}</span>
                <h3 className="text-lg font-bold text-white">{confirmItem.name}</h3>
                <p className="text-sm text-gray-400">
                  Trade <span className="text-gold font-bold">{confirmItem.gem_cost} gems</span> for this reward?
                </p>
                <p className="text-xs text-gray-500">
                  {selectedChild.name} will have {balance - confirmItem.gem_cost} gems remaining
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmItem(null)} className="btn-outline flex-1">Cancel</button>
                  <button onClick={() => handleRedeem(confirmItem)} className="btn-gold flex-1">
                    Redeem!
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
