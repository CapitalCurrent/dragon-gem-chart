import React, { useState, useEffect, useCallback } from 'react';

import { useApp } from '../contexts/AppContext';

import {
  getGemHistory, getUngiven, markGemsGiven, reconcileBalance,
  deleteLedgerEntries, updateLedgerEntry,
  restoreLedgerEntries, addGemTransaction,
  getFailedWrites, clearFailedWrite, clearAllFailedWrites,
  getLostLedgerEntries, clearLostLedgerEntries,
  getBonusListening,
} from '../database';

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

  const handleIntegrityCheck = async () => {
    if (!selectedChild) return;
    let fullLedger = [];
    try {
      const raw = localStorage.getItem(`dgc_ledger_${selectedChild.id}`);
      fullLedger = raw ? JSON.parse(raw) : [];
    } catch { fullLedger = []; }

    // Sums exclude soft-deleted rows (those live in the Removed panel).
    const liveLedger = fullLedger.filter(g => !g.deleted_at);
    const deletedEntries = fullLedger.filter(g => g.deleted_at);

    const givenEarned = liveLedger.filter(g => g.amount > 0 && g.gems_given).reduce((s, g) => s + (Number(g.amount) || 0), 0);
    const ungivenEarned = liveLedger.filter(g => g.amount > 0 && !g.gems_given).reduce((s, g) => s + (Number(g.amount) || 0), 0);
    const spent = liveLedger.filter(g => g.amount < 0).reduce((s, g) => s + (Number(g.amount) || 0), 0);
    const expectedJar = Math.floor(givenEarned + spent);
    const expectedUngiven = ungivenEarned;
    const displayedJar = balance;
    const displayedUngiven = ungivenTotal;

    // Duplicate detection — only on live entries, and only when reference_id is non-null
    // (null reference_ids on different entries would falsely group).
    const groups = {};
    liveLedger.forEach(g => {
      if (!g.reference_id || !g.created_at) return;
      const ct = new Date(g.created_at);
      if (isNaN(ct.getTime())) return;
      const localDate = `${ct.getFullYear()}-${String(ct.getMonth() + 1).padStart(2, '0')}-${String(ct.getDate()).padStart(2, '0')}`;
      const key = `${g.reference_id}|${g.source}|${localDate}`;
      (groups[key] = groups[key] || []).push(g);
    });
    const duplicates = Object.values(groups).filter(arr => arr.length > 1);
    const duplicateExtra = duplicates.reduce((sum, arr) => sum + (arr.length - 1), 0);

    // Ghost-bonus check: a bonus_listening row with no matching gem_ledger entry
    // (live OR soft-deleted) is a ghost — gems were promised but never recorded.
    let ghostBonuses = [];
    try {
      const bonuses = await getBonusListening(selectedChild.id);
      const ledgerRefIds = new Set(fullLedger.filter(g => g.source === 'bonus' && g.reference_id).map(g => g.reference_id));
      ghostBonuses = bonuses.filter(b => !ledgerRefIds.has(b.id));
    } catch (err) {
      console.warn('Ghost-bonus check failed:', err);
    }

    // Failed writes that never reached Supabase (type/constraint errors, stale queue items).
    const failedWrites = getFailedWrites();
    // Tombstones for ledger rows wiped via realtime DELETE (e.g. older client hard-delete).
    const lostEntries = getLostLedgerEntries().filter(t => {
      // Only show tombstones whose original entry was for this child
      return t.child_id === selectedChild.id;
    });

    const issues = [];
    if (Math.abs(expectedJar - displayedJar) > 0.01) {
      issues.push(`Jar mismatch: shown ${displayedJar}, ledger says ${expectedJar}`);
    }
    if (Math.abs(expectedUngiven - displayedUngiven) > 0.01) {
      issues.push(`Ungiven mismatch: shown ${displayedUngiven}, ledger says ${expectedUngiven}`);
    }
    const orphaned = liveLedger.filter(g => g.amount === undefined || g.amount === null || isNaN(Number(g.amount)));
    if (orphaned.length > 0) issues.push(`${orphaned.length} entries with bad amount`);
    const noDate = liveLedger.filter(g => !g.created_at);
    if (noDate.length > 0) issues.push(`${noDate.length} entries missing created_at`);
    if (duplicateExtra > 0) issues.push(`${duplicateExtra} duplicate gem entries (same task, same day) — click "Clean up duplicates" below`);
    if (ghostBonuses.length > 0) {
      const totalGhost = ghostBonuses.reduce((s, b) => s + (Number(b.gems_awarded) || 0), 0);
      issues.push(`${ghostBonuses.length} ghost bonus${ghostBonuses.length > 1 ? 'es' : ''} — bonus shown but no ledger entry (+${totalGhost} 💎 unaccounted)`);
    }
    if (failedWrites.length > 0) {
      issues.push(`${failedWrites.length} failed sync write${failedWrites.length > 1 ? 's' : ''} (couldn't reach Supabase)`);
    }
    if (lostEntries.length > 0) {
      const totalLost = lostEntries.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      issues.push(`${lostEntries.length} entries hard-deleted via realtime sync (${totalLost > 0 ? '+' : ''}${totalLost} 💎)`);
    }

    setIntegrityResult({
      ok: issues.length === 0,
      total: liveLedger.length,
      totalDeleted: deletedEntries.length,
      givenEarned: Math.round(givenEarned * 100) / 100,
      ungivenEarned: Math.round(ungivenEarned * 100) / 100,
      spent: Math.round(spent * 100) / 100,
      expectedJar,
      expectedUngiven: Math.round(expectedUngiven * 100) / 100,
      issues,
      duplicates,
      ghostBonuses,
      failedWrites,
      lostEntries,
      deletedEntries,
    });
  };

  const handleRestoreDeleted = async (id) => {
    if (!selectedChild) return;
    try {
      await restoreLedgerEntries(selectedChild.id, [id]);
      showToast('Entry restored', 'success');
      await refreshBalances();
      await loadData();
      await handleIntegrityCheck();
    } catch (err) {
      console.error('Restore failed:', err);
      showToast('Restore failed', 'error');
    }
  };

  const handleRecreateGhostBonus = async (bonus) => {
    if (!selectedChild) return;
    const ok = window.confirm(
      `Recreate ledger entry for "${bonus.description}" (+${bonus.gems_awarded} 💎)?\n\n` +
      `This adds the missing ledger row so the gems show up in the owed pot.`
    );
    if (!ok) return;
    try {
      await addGemTransaction(selectedChild.id, Number(bonus.gems_awarded), 'bonus', `Bonus: ${bonus.description}`, bonus.id);
      showToast(`+${bonus.gems_awarded} bonus restored`, 'gem');
      await refreshBalances();
      await loadData();
      await handleIntegrityCheck();
    } catch (err) {
      console.error('Recreate ghost bonus failed:', err);
      showToast('Recreate failed', 'error');
    }
  };

  const handleClearFailedWrite = (id) => {
    clearFailedWrite(id);
    handleIntegrityCheck();
  };

  const handleClearAllFailedWrites = () => {
    if (!window.confirm('Discard all failed sync writes? They will not be retried.')) return;
    clearAllFailedWrites();
    handleIntegrityCheck();
  };

  const handleClearLostEntries = () => {
    if (!window.confirm('Discard tombstones for hard-deleted entries? They will be removed from this list.')) return;
    clearLostLedgerEntries();
    handleIntegrityCheck();
  };

  const handleCleanupDuplicates = async () => {
    if (!selectedChild || !integrityResult?.duplicates?.length) return;

    // For each duplicate group: keep the OLDEST entry, remove the rest.
    // Promote the keeper to gems_given=true if any duplicate was already given.
    const idsToRemove = [];
    const keeperUpdates = [];
    for (const group of integrityResult.duplicates) {
      const sorted = [...group].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      const keep = sorted[0];
      const anyGiven = group.some(g => g.gems_given);
      if (anyGiven && !keep.gems_given) {
        const givenDate = group.find(g => g.given_date)?.given_date || null;
        keeperUpdates.push({ id: keep.id, patch: { gems_given: true, given_date: givenDate } });
      }
      sorted.slice(1).forEach(g => idsToRemove.push(g.id));
    }

    try {
      for (const u of keeperUpdates) await updateLedgerEntry(selectedChild.id, u.id, u.patch);
      await deleteLedgerEntries(selectedChild.id, idsToRemove);
      showToast(`Cleaned up ${idsToRemove.length} duplicate entries`, 'success');
      setIntegrityResult(null);
      await refreshBalances();
      await loadData();
    } catch (err) {
      console.error('Duplicate cleanup failed:', err);
      showToast('Cleanup failed — try again', 'error');
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
                <p>Total entries: {integrityResult.total}{integrityResult.totalDeleted > 0 && ` (+${integrityResult.totalDeleted} removed)`}</p>
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
              {integrityResult.duplicates && integrityResult.duplicates.length > 0 && (
                <button
                  onClick={handleCleanupDuplicates}
                  className="mt-2 w-full text-[11px] py-2 rounded-xl bg-gem-ruby/15 text-gem-ruby border border-gem-ruby/40 font-semibold hover:bg-gem-ruby/25 transition-colors"
                >
                  🧹 Clean up duplicates ({integrityResult.duplicates.reduce((s, a) => s + (a.length - 1), 0)} extras)
                </button>
              )}

              {/* Ghost bonuses — bonus_listening rows with no matching ledger entry */}
              {integrityResult.ghostBonuses && integrityResult.ghostBonuses.length > 0 && (
                <div className="mt-3 pt-2 border-t border-cave-600/30">
                  <p className="text-[11px] font-semibold text-gem-ruby mb-1.5">👻 Ghost bonuses (no ledger entry)</p>
                  <div className="space-y-1">
                    {integrityResult.ghostBonuses.map(b => (
                      <div key={b.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gem-ruby/10 border border-gem-ruby/30">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-gray-200 truncate">{b.description}</p>
                          <p className="text-[10px] text-gray-500">+{b.gems_awarded} 💎 · {b.event_date || (b.created_at || '').slice(0,10)}</p>
                        </div>
                        <button
                          onClick={() => handleRecreateGhostBonus(b)}
                          className="text-[10px] px-2 py-1 rounded-md bg-gem-emerald/20 text-gem-emerald border border-gem-emerald/40 font-semibold hover:bg-gem-emerald/30"
                        >
                          ↻ Recreate
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Soft-deleted entries — recoverable */}
              {integrityResult.deletedEntries && integrityResult.deletedEntries.length > 0 && (
                <div className="mt-3 pt-2 border-t border-cave-600/30">
                  <p className="text-[11px] font-semibold text-gold mb-1.5">🗑 Removed entries ({integrityResult.deletedEntries.length})</p>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {integrityResult.deletedEntries.slice(0, 20).map(e => (
                      <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-cave-700/40 border border-cave-600/30">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-gray-300 truncate">{e.description}</p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {e.amount > 0 ? '+' : ''}{e.amount} 💎 · {e.deleted_reason || 'no reason'} · {(e.deleted_at || '').slice(0, 16).replace('T', ' ')}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRestoreDeleted(e.id)}
                          className="text-[10px] px-2 py-1 rounded-md bg-gem-emerald/20 text-gem-emerald border border-gem-emerald/40 font-semibold hover:bg-gem-emerald/30"
                        >
                          ↻ Restore
                        </button>
                      </div>
                    ))}
                    {integrityResult.deletedEntries.length > 20 && (
                      <p className="text-[10px] text-gray-500 text-center pt-1">…and {integrityResult.deletedEntries.length - 20} more</p>
                    )}
                  </div>
                </div>
              )}

              {/* Failed writes — never reached Supabase */}
              {integrityResult.failedWrites && integrityResult.failedWrites.length > 0 && (
                <div className="mt-3 pt-2 border-t border-cave-600/30">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] font-semibold text-gem-ruby">⚠ Failed sync writes ({integrityResult.failedWrites.length})</p>
                    <button onClick={handleClearAllFailedWrites} className="text-[10px] text-gray-500 hover:text-gem-ruby">Clear all</button>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {integrityResult.failedWrites.slice(-10).reverse().map(f => (
                      <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gem-ruby/10 border border-gem-ruby/30">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-gray-200 truncate">
                            {f.op?.table} · {f.op?.action} {f.op?.data?.description ? `· "${f.op.data.description}"` : ''}
                          </p>
                          <p className="text-[10px] text-gray-500 truncate">{f.error} · {(f.failedAt || '').slice(0, 16).replace('T', ' ')}</p>
                        </div>
                        <button
                          onClick={() => handleClearFailedWrite(f.id)}
                          className="text-[10px] px-2 py-1 rounded-md bg-cave-600/40 text-gray-400 border border-cave-500/30 hover:text-gray-200"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lost ledger tombstones (realtime DELETE from older client) */}
              {integrityResult.lostEntries && integrityResult.lostEntries.length > 0 && (
                <div className="mt-3 pt-2 border-t border-cave-600/30">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] font-semibold text-gem-ruby">⚰ Hard-deleted tombstones ({integrityResult.lostEntries.length})</p>
                    <button onClick={handleClearLostEntries} className="text-[10px] text-gray-500 hover:text-gem-ruby">Clear all</button>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {integrityResult.lostEntries.slice(-10).reverse().map((t, i) => (
                      <div key={(t.id || '') + i} className="px-2 py-1.5 rounded-lg bg-gem-ruby/10 border border-gem-ruby/30">
                        <p className="text-[11px] text-gray-200 truncate">{t.description}</p>
                        <p className="text-[10px] text-gray-500 truncate">
                          {t.amount > 0 ? '+' : ''}{t.amount} 💎 · {t.lostVia || 'unknown'} · {(t.lostAt || '').slice(0, 16).replace('T', ' ')}
                        </p>
                      </div>
                    ))}
                  </div>
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
