import { GARMIN_PROXY } from '../../constants/Config';
import { HealthSnapshot, Activity } from '../models/HealthSnapshot';

async function fetchJSON(path: string): Promise<any> {
  const res = await fetch(`${GARMIN_PROXY}${path}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Garmin proxy error ${res.status}`);
  return res.json();
}

function parseSnapshot(raw: any, date: string): Partial<HealthSnapshot> {
  const snap: Partial<HealthSnapshot> = { date };

  // Steps
  if (raw.steps) {
    const total = raw.steps.find((s: any) => s.primaryActivityLevel === undefined);
    snap.steps = raw.steps.reduce((sum: number, s: any) => sum + (s.steps ?? 0), 0);
  }

  // Heart rate
  if (raw.heart_rate) {
    snap.restingHeartRate = raw.heart_rate.restingHeartRate;
  }

  // HRV
  if (raw.hrv?.hrvSummary) {
    snap.hrv = raw.hrv.hrvSummary.lastNight;
  }

  // Body battery — take the max value of the day as the "morning" reading
  if (Array.isArray(raw.body_battery) && raw.body_battery.length > 0) {
    snap.bodyBattery = Math.max(...raw.body_battery.map((b: any) => b.value ?? 0));
  }

  // Sleep
  if (raw.sleep?.dailySleepDTO) {
    const s = raw.sleep.dailySleepDTO;
    snap.sleepHours = (s.sleepTimeSeconds ?? 0) / 3600;
    snap.sleepScore = s.sleepScores?.overall?.value;
    snap.deepSleepHours = (s.deepSleepSeconds ?? 0) / 3600;
    snap.lightSleepHours = (s.lightSleepSeconds ?? 0) / 3600;
    snap.remSleepHours = (s.remSleepSeconds ?? 0) / 3600;
    snap.awakeHours = (s.awakeSleepSeconds ?? 0) / 3600;
    // SpO2 from sleep data
    if (raw.sleep.wellnessSpO2SleepSummary) {
      snap.spo2 = raw.sleep.wellnessSpO2SleepSummary.averageSpO2;
    }
  }

  // Stress
  if (raw.stress?.avgStressLevel !== undefined) {
    snap.avgStress = raw.stress.avgStressLevel;
  }

  // Respiration
  if (raw.respiration?.avgWakingRespirationValue !== undefined) {
    snap.respirationAvg = raw.respiration.avgWakingRespirationValue;
  }

  return snap;
}

export async function fetchGarminSnapshot(date: string): Promise<Partial<HealthSnapshot>> {
  const raw = await fetchJSON(`/garmin/snapshot/${date}`);
  return parseSnapshot(raw, date);
}

export async function fetchGarminActivities(limit = 10): Promise<Activity[]> {
  const raw: any[] = await fetchJSON(`/garmin/activities?limit=${limit}`);
  return raw.map((a) => ({
    id: String(a.activityId),
    name: a.activityName ?? 'Activity',
    type: a.activityType?.typeKey ?? 'unknown',
    date: a.startTimeLocal?.slice(0, 10) ?? '',
    durationMinutes: Math.round((a.duration ?? 0) / 60),
    distanceKm: a.distance ? a.distance / 1000 : undefined,
    avgHeartRate: a.averageHR,
    calories: a.calories,
  }));
}

export async function isGarminProxyReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${GARMIN_PROXY}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
