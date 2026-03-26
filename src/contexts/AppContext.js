import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getChildren, getCollectedBalance, getAllUngiven, getTodayGems } from '../database';

const AppContext = createContext({});

export function AppProvider({ children: childrenProp }) {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [collectedBalances, setCollectedBalances] = useState({}); // gems in jar (given - spent)
  const [allUngiven, setAllUngiven] = useState({}); // total ungiven across all days
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

  const showToast = useCallback((message, variant = 'success') => {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <AppContext.Provider value={{
      children,
      selectedChild,
      setSelectedChild,
      collectedBalances,  // what's in the jar (spendable)
      allUngiven,         // pending collection across all days
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
