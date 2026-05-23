import { create } from 'zustand';
import { HealthSnapshot, Activity, AIInsight } from '../models/HealthSnapshot';
import { DailyBrief } from '../services/AIOptimizationService';

interface HealthState {
  snapshots: HealthSnapshot[];
  activities: Activity[];
  latestInsight: AIInsight | null;
  cachedBrief: DailyBrief | null;
  cachedBriefDate: string | null;
  cachedBriefAiText: string | null;
  isLoading: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  proxyReachable: boolean;
  fridgeIngredients: string[];

  setSnapshots: (snapshots: HealthSnapshot[]) => void;
  setActivities: (activities: Activity[]) => void;
  setInsight: (insight: AIInsight) => void;
  setCachedBrief: (brief: DailyBrief, date: string) => void;
  setCachedBriefAiText: (text: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setProxyReachable: (reachable: boolean) => void;
  markSynced: () => void;
  setFridgeIngredients: (ingredients: string[]) => void;
  clearFridgeIngredients: () => void;
}

export const useHealthStore = create<HealthState>((set) => ({
  snapshots: [],
  activities: [],
  latestInsight: null,
  cachedBrief: null,
  cachedBriefDate: null,
  cachedBriefAiText: null,
  isLoading: false,
  lastSyncedAt: null,
  error: null,
  proxyReachable: false,
  fridgeIngredients: [],

  setSnapshots: (snapshots) => set({ snapshots }),
  setActivities: (activities) => set({ activities }),
  setInsight: (insight) => set({ latestInsight: insight }),
  setCachedBrief: (brief, date) => set({ cachedBrief: brief, cachedBriefDate: date }),
  setCachedBriefAiText: (text) => set({ cachedBriefAiText: text }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setProxyReachable: (proxyReachable) => set({ proxyReachable }),
  markSynced: () => set({ lastSyncedAt: new Date().toISOString(), error: null }),
  setFridgeIngredients: (fridgeIngredients) => set({ fridgeIngredients }),
  clearFridgeIngredients: () => set({ fridgeIngredients: [] }),
}));
