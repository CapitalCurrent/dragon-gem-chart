import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getChildren, getGemBalance, getTodayGems } from '../database';

const AppContext = createContext({});

export function AppProvider({ children: childrenProp }) {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [balances, setBalances] = useState({});
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
      const bals = {};
      const todays = {};
      for (const child of children) {
        bals[child.id] = await getGemBalance(child.id);
        todays[child.id] = await getTodayGems(child.id);
      }
      setBalances(bals);
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

  const showToast = useCallback((message, variant = 'success') => {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <AppContext.Provider value={{
      children,
      selectedChild,
      setSelectedChild,
      balances,
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
