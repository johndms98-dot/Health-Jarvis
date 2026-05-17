import { useCallback } from 'react';
import { useHealthStore } from '../store/healthStore';
import { fetchGarminSnapshot, fetchGarminActivities, isGarminProxyReachable } from '../services/GarminService';
import { fetchNutrition, isMFPProxyReachable } from '../services/MFPService';
import { fetchLatestMeasurements } from '../services/WithingsService';
import { fetchHealthKitData } from '../services/HealthKitService';
import { HealthSnapshot } from '../models/HealthSnapshot';

function pastDates(days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });
}

function mergeSnapshots(...partials: Array<Partial<HealthSnapshot>>): HealthSnapshot {
  return Object.assign({}, ...partials) as HealthSnapshot;
}

export function useHealthData() {
  const store = useHealthStore();

  const refresh = useCallback(async () => {
    store.setLoading(true);
    store.setError(null);

    try {
      const garminReachable = await isGarminProxyReachable();
      store.setProxyReachable(garminReachable);

      // Withings — latest body composition (not date-specific)
      let withingsData: Partial<HealthSnapshot> = {};
      try { withingsData = await fetchLatestMeasurements(); } catch {}

      const dates = pastDates(7);
      const snapshots: HealthSnapshot[] = await Promise.all(
        dates.map(async (date) => {
          const parts: Partial<HealthSnapshot>[] = [{ date }];

          // Garmin
          if (garminReachable) {
            try { parts.push(await fetchGarminSnapshot(date)); } catch {}
          }

          // MFP
          const mfpReachable = await isMFPProxyReachable();
          if (mfpReachable) {
            try { const n = await fetchNutrition(date); parts.push(n.snapshot); } catch {}
          }

          // Apple Health (supplemental)
          try { parts.push(await fetchHealthKitData(date)); } catch {}

          // Withings (applied to today only — scale data is not strictly daily)
          if (date === dates[0]) parts.push(withingsData);

          return mergeSnapshots(...parts);
        })
      );

      store.setSnapshots(snapshots);

      // Activities
      if (garminReachable) {
        try {
          const activities = await fetchGarminActivities(15);
          store.setActivities(activities);
        } catch {}
      }

      store.markSynced();
    } catch (err: any) {
      store.setError(err.message ?? 'Unknown error during sync');
    } finally {
      store.setLoading(false);
    }
  }, []);

  return { refresh, ...store };
}
