import { create } from 'zustand';
import { HealthSnapshot, Activity, AIInsight } from '../models/HealthSnapshot';

interface HealthState {
  snapshots: HealthSnapshot[];
  activities: Activity[];
  latestInsight: AIInsight | null;
  isLoading: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  proxyReachable: boolean;

  setSnapshots: (snapshots: HealthSnapshot[]) => void;
  setActivities: (activities: Activity[]) => void;
  setInsight: (insight: AIInsight) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setProxyReachable: (reachable: boolean) => void;
  markSynced: () => void;
}

export const useHealthStore = create<HealthState>((set) => ({
  snapshots: [],
  activities: [],
  latestInsight: null,
  isLoading: false,
  lastSyncedAt: null,
  error: null,
  proxyReachable: false,

  setSnapshots: (snapshots) => set({ snapshots }),
  setActivities: (activities) => set({ activities }),
  setInsight: (insight) => set({ latestInsight: insight }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setProxyReachable: (proxyReachable) => set({ proxyReachable }),
  markSynced: () => set({ lastSyncedAt: new Date().toISOString(), error: null }),
}));
