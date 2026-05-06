import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getChildren, getCollectedBalance, getAllUngiven, getTodayGems, processQueue, clearFetchCache, backgroundSync, subscribeToRealtime, getSyncStatus } from '../database';

const AppContext = createContext({});

export function AppProvider({ children: childrenProp }) {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [collectedBalances, setCollectedBalances] = useState({});
  const [allUngiven, setAllUngiven] = useState({});
  const [todayGems, setTodayGems] = useState({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [syncVersion, setSyncVersion] = useState(0);
  const [syncStatus, setSyncStatus] = useState({ queueSize: 0, pendingCount: 0, lastSync: null, online: true });

  // Refresh sync status periodically
  useEffect(() => {
    const tick = () => setSyncStatus(getSyncStatus());
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [syncVersion]);

  const loadChildren = useCallback(async () => {
    try {
      const kids = await getChildren();
      setChildren(kids);
      if (kids.length > 0 && !selectedChild) {
        setSelectedChild(kids[0]);
      }
    } catch (err) {
      console.error('Failed to load children:', err);
    }
  }, [selectedChild]);

  const refreshBalances = useCallback(async () => {
    try {
      const cols = {};
      const ung = {};
      const todays = {};
      for (const child of children) {
        cols[child.id] = await getCollectedBalance(child.id);
        ung[child.id] = await getAllUngiven(child.id);
        todays[child.id] = await getTodayGems(child.id);
      }
      setCollectedBalances(cols);
      setAllUngiven(ung);
      setTodayGems(todays);
    } catch (err) {
      console.error('Failed to load balances:', err);
    }
  }, [children]);

  useEffect(() => {
    loadChildren().then(() => setLoading(false));
  }, [loadChildren]);

  useEffect(() => {
    if (children.length > 0) refreshBalances();
  }, [children, refreshBalances]);

  // Process offline write queue on load and when coming back online
  useEffect(() => {
    processQueue();

    const handleOnline = () => {
      processQueue();
      clearFetchCache();
      loadChildren();
      if (children.length > 0) refreshBalances();
    };

    // Re-sync when app returns from background (phone sleep, tab switch)
    // Process queue FIRST (wait for pending pushes to land), then pull fresh data
    // trustServer=true: clear pending ops and accept server as truth
    // Double-sync: immediate + delayed catch-up for in-flight writes
    const handleVisible = async () => {
      if (document.visibilityState === 'visible') {
        await processQueue();
        await backgroundSync();
        refreshBalances();
        setSyncVersion(v => v + 1);
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [loadChildren, refreshBalances, children]);

  // Realtime sync — instant push-based updates from Supabase
  // Use ref for the refresh callback so the subscription doesn't tear down on every render
  const realtimeRefresh = useRef(null);
  realtimeRefresh.current = () => {
    refreshBalances();
    setSyncVersion(v => v + 1);
  };

  useEffect(() => {
    if (children.length === 0) return;
    let debounceTimer = null;
    const unsubscribe = subscribeToRealtime(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (realtimeRefresh.current) realtimeRefresh.current();
      }, 300);
    });
    return () => { clearTimeout(debounceTimer); unsubscribe(); };
    // Only re-subscribe when children list actually changes (not on every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.length]);

  // Fallback poll — catch anything Realtime missed (reconnection, edge cases)
  useEffect(() => {
    if (children.length === 0) return;
    const interval = setInterval(async () => {
      await backgroundSync();
      refreshBalances();
      setSyncVersion(v => v + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, [children, refreshBalances]);

  const showToast = useCallback((message, variant = 'success') => {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <AppContext.Provider value={{
      children,
      selectedChild,
      setSelectedChild,
      collectedBalances,
      allUngiven,
      todayGems,
      loading,
      loadChildren,
      refreshBalances,
      syncVersion,
      syncStatus,
      toast,
      showToast,
    }}>
      {childrenProp}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
