// ══════════════════════════════════════════════════════════════
// Database Router — uses Supabase when configured, localStorage demo mode otherwise
// ══════════════════════════════════════════════════════════════

import { isConfigured } from './supabase';
import { buildTaskTree, today, mondayOfWeek } from './db';

// Dynamically choose backend
const backend = isConfigured()
  ? require('./db')
  : require('./demoData');

// Re-export everything from the chosen backend
export const getChildren = backend.getChildren;
export const addChild = backend.addChild;
export const updateChild = backend.updateChild;
export const deleteChild = backend.deleteChild;

export const getTaskTemplates = backend.getTaskTemplates;
export const addTaskTemplate = backend.addTaskTemplate;
export const updateTaskTemplate = backend.updateTaskTemplate;
export const deleteTaskTemplate = backend.deleteTaskTemplate;

export const getDailyCompletions = backend.getDailyCompletions;
export const toggleDailyCompletion = backend.toggleDailyCompletion;

export const getWeeklyCompletions = backend.getWeeklyCompletions;
export const toggleWeeklyCompletion = backend.toggleWeeklyCompletion;

export const getBonusListening = backend.getBonusListening;
export const addBonusListening = backend.addBonusListening;
export const deleteBonusListening = backend.deleteBonusListening;

export const getGemBalance = backend.getGemBalance;
export const getTodayGems = backend.getTodayGems;
export const getUngiven = backend.getUngiven;
export const addGemTransaction = backend.addGemTransaction;
export const removeGemTransaction = backend.removeGemTransaction;
export const markGemsGiven = backend.markGemsGiven;
export const getGemHistory = backend.getGemHistory;

export const getStoreItems = backend.getStoreItems;
export const addStoreItem = backend.addStoreItem;
export const updateStoreItem = backend.updateStoreItem;
export const deleteStoreItem = backend.deleteStoreItem;
export const redeemStoreItem = backend.redeemStoreItem;
export const getRedemptionHistory = backend.getRedemptionHistory;

// Always from db.js (pure functions)
export { buildTaskTree, today, mondayOfWeek };
