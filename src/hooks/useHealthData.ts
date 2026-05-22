import { useCallback } from 'react';
import { useHealthStore } from '../store/healthStore';
import { fetchGarminSnapshot, fetchGarminActivities, isGarminProxyReachable } from '../services/GarminService';
import { fetchLatestMeasurements } from '../services/WithingsService';
import { fetchHealthKitData } from '../services/HealthKitService';
import { resolveMetrics, RawSources } from '../services/DataResolutionService';
import { upsertHealthSnapshot, getHealthSnapshots } from '../services/SupabaseService';
import { HealthSnapshot } from '../models/HealthSnapshot';

function pastDates(days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });
}

/** Map a flat Partial<HealthSnapshot> (Garmin) → garmin sub-object for DataResolutionService */
function toGarminSource(s: Partial<HealthSnapshot>): RawSources['garmin'] {
  return {
    steps: s.steps,
    restingHR: s.restingHeartRate,
    sleepHours: s.sleepHours,
    deepSleepHours: s.deepSleepHours,
    remSleepHours: s.remSleepHours,
    hrv: s.hrv,
    activeCalories: s.activeCalories,
    spo2: s.spo2,
    avgStress: s.avgStress,
    bodyBattery: s.bodyBattery,
    sleepScore: s.sleepScore,
    respiration: s.respirationAvg,
  };
}

/** Map a flat Partial<HealthSnapshot> (Apple Health) → apple sub-object for DataResolutionService */
function toAppleSource(s: Partial<HealthSnapshot>): RawSources['apple'] {
  return {
    steps: s.steps,
    restingHR: s.restingHeartRate,
    sleepHours: s.sleepHours,
    deepSleepHours: s.deepSleepHours,
    remSleepHours: s.remSleepHours,
    hrv: s.hrv,
    activeCalories: s.activeCalories,
    weightKg: s.weightKg,
    mindfulMinutes: s.mindfulMinutes,
    workoutMinutes: s.workoutMinutes,
  };
}

export function useHealthData() {
  const store = useHealthStore();

  const refresh = useCallback(async () => {
    store.setLoading(true);
    store.setError(null);

    try {
      const garminReachable = await isGarminProxyReachable();
      store.setProxyReachable(garminReachable);

      // Load cached snapshots from Supabase immediately so UI isn't empty
      let cachedSnapshots: HealthSnapshot[] = [];
      try {
        cachedSnapshots = await getHealthSnapshots(7);
        if (cachedSnapshots.length > 0) store.setSnapshots(cachedSnapshots);
      } catch {}

      // Withings — latest body composition (not date-specific)
      let withingsData: Partial<HealthSnapshot> = {};
      try { withingsData = await fetchLatestMeasurements(); } catch {}

      const dates = pastDates(7);
      const snapshots: HealthSnapshot[] = await Promise.all(
        dates.map(async (date) => {
          const cached: Partial<HealthSnapshot> = cachedSnapshots.find(s => s.date === date) ?? {};

          // Fetch from each source independently
          let garminData: Partial<HealthSnapshot> = {};
          let appleData: Partial<HealthSnapshot> = {};

          if (garminReachable) {
            try { garminData = await fetchGarminSnapshot(date); } catch {}
          }

          try { appleData = await fetchHealthKitData(date); } catch {}

          // Data resolution — picks best source per metric (steps, HR, sleep, HRV, calories)
          const rawSources: RawSources = {
            garmin: toGarminSource(garminData),
            apple: toAppleSource(appleData),
          };
          const resolved = resolveMetrics(rawSources);

          // Merge everything into a final HealthSnapshot
          const snapshot: HealthSnapshot = {
            date,
            // Resolved best-source metrics
            steps: resolved.steps,
            restingHeartRate: resolved.restingHR,
            sleepHours: resolved.sleepHours,
            deepSleepHours: resolved.deepSleepHours,
            remSleepHours: resolved.remSleepHours,
            hrv: resolved.hrv,
            activeCalories: resolved.activeCalories,
            // Garmin-only metrics (no Apple equivalent)
            bodyBattery: resolved.bodyBattery ?? garminData.bodyBattery ?? cached.bodyBattery,
            sleepScore: resolved.sleepScore ?? garminData.sleepScore ?? cached.sleepScore,
            spo2: resolved.spo2 ?? garminData.spo2 ?? cached.spo2,
            avgStress: resolved.avgStress ?? garminData.avgStress ?? cached.avgStress,
            respirationAvg: resolved.respiration ?? garminData.respirationAvg ?? cached.respirationAvg,
            lightSleepHours: garminData.lightSleepHours ?? cached.lightSleepHours,
            totalCalories: garminData.totalCalories ?? cached.totalCalories,
            // Apple-only supplements
            mindfulMinutes: appleData.mindfulMinutes ?? cached.mindfulMinutes,
            workoutMinutes: appleData.workoutMinutes ?? cached.workoutMinutes,
            // Withings body composition (today only)
            weightKg: date === dates[0] ? (withingsData.weightKg ?? appleData.weightKg ?? cached.weightKg) : cached.weightKg,
            bodyFatPct: date === dates[0] ? (withingsData.bodyFatPct ?? cached.bodyFatPct) : cached.bodyFatPct,
            muscleMassKg: date === dates[0] ? (withingsData.muscleMassKg ?? cached.muscleMassKg) : cached.muscleMassKg,
            boneMassKg: date === dates[0] ? (withingsData.boneMassKg ?? cached.boneMassKg) : cached.boneMassKg,
            // Nutrition from Supabase (logged separately via food logger, kept from cache)
            caloriesConsumed: cached.caloriesConsumed,
            proteinG: cached.proteinG,
            carbsG: cached.carbsG,
            fatG: cached.fatG,
            fiberG: cached.fiberG,
            waterCups: cached.waterCups,
          };

          // Cache resolved snapshot to Supabase
          upsertHealthSnapshot(snapshot).catch(() => {});

          return snapshot;
        })
      );

      store.setSnapshots(snapshots);

      // Activities (recent workouts from Garmin)
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
