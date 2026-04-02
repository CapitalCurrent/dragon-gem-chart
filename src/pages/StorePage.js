import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import { CelebrationVideo } from '../components/shared/CelebrationOverlay';
import { getStoreItems, addStoreItem, updateStoreItem, deleteStoreItem, redeemStoreItem, getRedemptionHistory } from '../database';

const STORE_EMOJIS = [
  // Food & Treats
  '🍦', '🍕', '🍩', '🧁', '🍪', '🍬', '🍭', '🍫', '🥤', '🧃', '☕', '🥞', '🍉', '🍓', '🎂', '🥧', '🧇', '🌮', '🍿', '🥨',
  // Activities
  '🎮', '📺', '🎬', '🎲', '♟️', '🧩', '🎯', '🎨', '🎭', '🎪', '🎠', '🛝', '🏊', '🚴', '🛹', '⛷️', '🏕️', '🎣', '🤸', '🧗',
  // Music & Performance
  '🎵', '🎸', '🎤', '🥁', '🎹', '💃', '🪩',
  // Nature & Outdoors
  '🏖️', '🌈', '🦋', '🐚', '🪻', '🌺', '🍀', '🏔️',
  // Toys & Stuff
  '🧸', '🎁', '🧱', '🎫', '💵', '🛍️', '🎒', '🖍️', '✏️', '📖',
  // Special
  '⭐', '🌙', '🏆', '👑', '💎', '🔦', '🏰', '🚀', '🫧', '✨', '🎉', '🥇', '💖', '🦄', '🐉', '🌟', '🛌', '🧺', '🏠', '📸',
];

export default function StorePage() {
  const { selectedChild, collectedBalances, allUngiven, refreshBalances, showToast, syncVersion } = useApp();
  const [items, setItems] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [confirmItem, setConfirmItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCost, setNewCost] = useState(10);
  const [newEmoji, setNewEmoji] = useState('🎁');
  const [newDesc, setNewDesc] = useState('');
  const [showRedeemVideo, setShowRedeemVideo] = useState(false);

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

  useEffect(() => { loadData(); }, [loadData, syncVersion]);

  const balance = selectedChild ? (collectedBalances[selectedChild.id] || 0) : 0;
  const pending = selectedChild ? (allUngiven[selectedChild.id] || 0) : 0;

  const handleRedeem = async (item) => {
    if (!selectedChild) return;
    if (balance < item.gem_cost) {
      showToast('Not enough gems in jar!', 'error');
      return;
    }
    try {
      await redeemStoreItem(selectedChild.id, item);
      await refreshBalances();
      await loadData();
      setConfirmItem(null);
      showToast(`${selectedChild.name} redeemed ${item.name}!`, 'success');
      setShowRedeemVideo(true);
    } catch (err) {
      console.error('Redeem failed:', err);
    }
  };

  const handleAddItem = async () => {
    if (!newName.trim()) return;
    try {
      await addStoreItem({ name: newName.trim(), gem_cost: newCost, emoji: newEmoji, description: newDesc.trim() });
      showToast('Reward added!', 'success');
      setShowAddForm(false);
      setNewName(''); setNewCost(10); setNewEmoji('🎁'); setNewDesc('');
      await loadData();
    } catch (err) { console.error(err); }
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editingItem.name.trim()) return;
    try {
      await updateStoreItem(editingItem.id, {
        name: editingItem.name.trim(),
        gem_cost: editingItem.gem_cost,
        emoji: editingItem.emoji,
        description: editingItem.description?.trim() || '',
      });
      setEditingItem(null);
      await loadData();
      showToast('Reward updated', 'success');
    } catch (err) { console.error(err); }
  };

  const handleDeleteItem = async (id, name) => {
    if (!window.confirm(`Remove "${name}" from the store?`)) return;
    await deleteStoreItem(id);
    await loadData();
    showToast('Reward removed', 'info');
  };

  return (
    <div className="space-y-4">
      {selectedChild && (
        <>
          {/* Store toolbar */}
          <div className="dragon-card flex items-center justify-between py-2">
            <span className="text-sm font-semibold text-gray-400">{items.length} rewards</span>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowAddForm(true); setNewName(''); setNewCost(10); setNewEmoji('🎁'); setNewDesc(''); }}
                className="text-sm px-4 py-2 rounded-xl bg-gold/20 text-gold font-semibold transition-all active:scale-95 border border-gold/30"
              >
                + Add
              </button>
              {items.length > 0 && (
                <button
                  onClick={() => setEditMode(!editMode)}
                  className={`text-sm px-4 py-2 rounded-xl font-semibold transition-all active:scale-95
                    ${editMode ? 'bg-gold/25 text-gold border border-gold/50' : 'bg-cave-700/60 text-gray-300 border border-cave-600/30'}`}
                >
                  {editMode ? '✓ Done' : '✏️ Edit'}
                </button>
              )}
            </div>
          </div>

          {/* Store Items */}
          <div>

            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading store...</div>
            ) : items.length === 0 ? (
              <div className="dragon-card text-center py-8">
                <img src={`${process.env.PUBLIC_URL}/mascots/dragon_store.png`} alt="Empty store" className="w-32 mx-auto mb-3" />
                <p className="text-gray-400 mb-3">No rewards yet!</p>
                <button onClick={() => setShowAddForm(true)} className="btn-gold">+ Add First Reward</button>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map(item => {
                  const canAfford = balance >= item.gem_cost;
                  return (
                    <div
                      key={item.id}
                      className={`dragon-card flex items-center gap-3 transition-all
                        ${!editMode && canAfford ? 'active:scale-[0.98] cursor-pointer' : ''}
                        ${!editMode && !canAfford ? 'opacity-50' : ''}`}
                      onClick={() => !editMode && canAfford && setConfirmItem(item)}
                    >
                      <span className="text-3xl">{item.emoji || '🎁'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm">{item.name}</p>
                        {item.description && (
                          <p className="text-[10px] text-gray-500 truncate">{item.description}</p>
                        )}
                      </div>
                      {!editMode && (
                        <div className={`gem-counter ${canAfford ? '' : 'opacity-50'}`}>
                          💎 {item.gem_cost}
                        </div>
                      )}
                      {editMode && (
                        <div className="flex items-center gap-1.5 ml-auto">
                          <span className="text-[10px] text-gray-500">💎{item.gem_cost}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingItem({ ...item }); }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gold/15 text-sm active:scale-90"
                          >✏️</button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id, item.name); }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/20 text-red-400 text-sm font-bold active:scale-90"
                          >✕</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add Form */}
          {showAddForm && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowAddForm(false)}>
              <div className="dragon-card max-w-sm w-full space-y-3 animate-slide-up" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-gold">Add Reward</h3>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Reward name" autoFocus />
                <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" />
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Gem Cost</label>
                  <GemStepper value={newCost} onChange={setNewCost} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Icon</label>
                  <div className="max-h-36 overflow-y-auto rounded-xl bg-cave-800/30 p-2">
                    <div className="flex gap-1 flex-wrap">
                      {STORE_EMOJIS.map(e => (
                        <button key={e} onClick={() => setNewEmoji(e)}
                          className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all
                            ${newEmoji === e ? 'bg-gold/20 border-2 border-gold/50 scale-110' : 'bg-cave-700/50 border border-cave-600/20'}`}
                        >{e}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowAddForm(false)} className="btn-outline flex-1 text-center">Cancel</button>
                  <button onClick={handleAddItem} disabled={!newName.trim()} className="btn-gold flex-1 text-center disabled:opacity-40">Add</button>
                </div>
              </div>
            </div>
          )}

          {/* Edit Item Modal */}
          {editingItem && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setEditingItem(null)}>
              <div className="dragon-card max-w-sm w-full space-y-3 animate-slide-up" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-gold">Edit Reward</h3>
                <input type="text" value={editingItem.name} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} autoFocus />
                <input type="text" value={editingItem.description || ''} onChange={e => setEditingItem({ ...editingItem, description: e.target.value })} placeholder="Description (optional)" />
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Gem Cost</label>
                  <GemStepper value={editingItem.gem_cost} onChange={v => setEditingItem({ ...editingItem, gem_cost: v })} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Icon</label>
                  <div className="max-h-36 overflow-y-auto rounded-xl bg-cave-800/30 p-2">
                    <div className="flex gap-1 flex-wrap">
                    {STORE_EMOJIS.map(e => (
                      <button key={e} onClick={() => setEditingItem({ ...editingItem, emoji: e })}
                        className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all
                          ${editingItem.emoji === e ? 'bg-gold/20 border-2 border-gold/50 scale-110' : 'bg-cave-700/50 border border-cave-600/20'}`}
                      >{e}</button>
                    ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setEditingItem(null)} className="btn-outline flex-1 text-center">Cancel</button>
                  <button onClick={handleSaveEdit} disabled={!editingItem.name.trim()} className="btn-gold flex-1 text-center disabled:opacity-40">Save</button>
                </div>
              </div>
            </div>
          )}

          {/* Redeem Confirmation Modal */}
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
                  <button onClick={() => handleRedeem(confirmItem)} className="btn-gold flex-1">Redeem!</button>
                </div>
              </div>
            </div>
          )}

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
        </>
      )}

      {/* Store redemption celebration */}
      <CelebrationVideo show={showRedeemVideo} type="redeem" onDone={() => setShowRedeemVideo(false)} />
    </div>
  );
}

function GemStepper({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(1, value - 5))}
        className="w-8 h-8 rounded-lg bg-cave-700/50 text-gray-400 font-bold text-sm hover:bg-cave-600/50 active:scale-95"
      >-5</button>
      <button
        onClick={() => onChange(Math.max(1, value - 1))}
        className="w-8 h-8 rounded-lg bg-cave-700/50 text-gray-400 font-bold text-base hover:bg-cave-600/50 active:scale-95"
      >−</button>
      <div className="flex items-center gap-1 px-3 py-1.5 bg-gold/10 border-2 border-gold/40 rounded-xl min-w-[60px] justify-center">
        <span className="text-sm">💎</span>
        <span className="text-gold font-bold text-base">{value}</span>
      </div>
      <button
        onClick={() => onChange(value + 1)}
        className="w-8 h-8 rounded-lg bg-cave-700/50 text-gray-400 font-bold text-base hover:bg-cave-600/50 active:scale-95"
      >+</button>
      <button
        onClick={() => onChange(value + 5)}
        className="w-8 h-8 rounded-lg bg-cave-700/50 text-gray-400 font-bold text-sm hover:bg-cave-600/50 active:scale-95"
      >+5</button>
    </div>
  );
}
