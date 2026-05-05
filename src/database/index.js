// ══════════════════════════════════════════════════════════════
// Database Router
// - Supabase configured → offline-first layer (local + sync)
// - No Supabase → demo mode (localStorage only)
// ══════════════════════════════════════════════════════════════

import { isConfigured } from './supabase';

const backend = isConfigured()
  ? require('./offlineFirst')
  : require('./demoData');

// Re-export everything
export const getChildren = backend.getChildren;
export const addChild = backend.addChild;
export const updateChild = backend.updateChild;
export const deleteChild = backend.deleteChild;

export const getTaskTemplates = backend.getTaskTemplates;
export const addTaskTemplate = backend.addTaskTemplate;
export const updateTaskTemplate = backend.updateTaskTemplate;
export const deleteTaskTemplate = backend.deleteTaskTemplate;
export const buildTaskTree = backend.buildTaskTree;

export const getDailyCompletions = backend.getDailyCompletions;
export const toggleDailyCompletion = backend.toggleDailyCompletion;

export const getWeeklyCompletions = backend.getWeeklyCompletions;
export const toggleWeeklyCompletion = backend.toggleWeeklyCompletion;

export const getBonusListening = backend.getBonusListening;
export const addBonusListening = backend.addBonusListening;
export const deleteBonusListening = backend.deleteBonusListening;

export const getGemBalance = backend.getGemBalance;
export const getCollectedBalance = backend.getCollectedBalance;
export const getAllUngiven = backend.getAllUngiven;
export const getTodayGems = backend.getTodayGems;
export const getUngiven = backend.getUngiven;
export const addGemTransaction = backend.addGemTransaction;
export const removeGemTransaction = backend.removeGemTransaction;
export const markGemsGiven = backend.markGemsGiven;
export const reconcileBalance = backend.reconcileBalance || (() => {});
export const getGemHistory = backend.getGemHistory;

export const getStoreItems = backend.getStoreItems;
export const addStoreItem = backend.addStoreItem;
export const updateStoreItem = backend.updateStoreItem;
export const deleteStoreItem = backend.deleteStoreItem;
export const redeemStoreItem = backend.redeemStoreItem;
export const getRedemptionHistory = backend.getRedemptionHistory;

export const today = backend.today;
export const mondayOfWeek = backend.mondayOfWeek;

// Process queued offline writes
export const processQueue = backend.processQueue || (() => {});
export const clearFetchCache = backend.clearFetchCache || (() => {});
export const backgroundSync = backend.backgroundSync || (() => {});
export const subscribeToRealtime = backend.subscribeToRealtime || (() => () => {});
export const getSyncDebugInfo = backend.getSyncDebugInfo || (() => ({}));
