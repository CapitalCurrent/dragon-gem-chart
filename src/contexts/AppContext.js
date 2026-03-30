import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getChildren, getCollectedBalance, getAllUngiven, getTodayGems, processQueue, clearFetchCache, backgroundSync, reconcileBalance } from '../database';

const AppContext = createContext({});

export function AppProvider({ children: childrenProp }) {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [collectedBalances, setCollectedBalances] = useState({});
  const [allUngiven, setAllUngiven] = useState({});
  const [todayGems, setTodayGems] = useState({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

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

  // One-time balance reconciliation (v0.9.21)
  useEffect(() => {
    if (children.length === 0) return;
    const RECONCILE_KEY = 'dgc_reconciled_v0921';
    if (localStorage.getItem(RECONCILE_KEY)) return;
    const targets = { 'Iona': 29, 'Jude': 26 };
    (async () => {
      for (const child of children) {
        const target = targets[child.name];
        if (target !== undefined) {
          await reconcileBalance(child.id, target);
        }
      }
      localStorage.setItem(RECONCILE_KEY, 'done');
      refreshBalances();
    })();
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

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [loadChildren, refreshBalances, children]);

  // Background sync — poll Supabase every 30s for multi-device changes
  useEffect(() => {
    if (children.length === 0) return;
    const interval = setInterval(async () => {
      await backgroundSync();
      refreshBalances();
    }, 30000);
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
      toast,
      showToast,
    }}>
      {childrenProp}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
