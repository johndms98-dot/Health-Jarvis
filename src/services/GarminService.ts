import { GARMIN_PROXY } from '../../constants/Config';
import { HealthSnapshot, Activity } from '../models/HealthSnapshot';

function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id));
}

async function fetchJSON(path: string): Promise<any> {
  const res = await fetchWithTimeout(`${GARMIN_PROXY}${path}`);
  if (!res.ok) throw new Error(`Garmin proxy error ${res.status}`);
  return res.json();
}

function parseSnapshot(raw: any, date: string): Partial<HealthSnapshot> {
  const snap: Partial<HealthSnapshot> = { date };

  // ── Steps: sum 15-min interval array ────────────────────────────────────────
  if (Array.isArray(raw.steps)) {
    snap.steps = raw.steps.reduce((sum: number, s: any) => sum + (s.steps ?? 0), 0);
  }

  // ── Heart rate ───────────────────────────────────────────────────────────────
  if (raw.heart_rate) {
    snap.restingHeartRate = raw.heart_rate.restingHeartRate ?? undefined;
  }

  // ── HRV — field is lastNightAvg, not lastNight ───────────────────────────────
  if (raw.hrv?.hrvSummary) {
    const s = raw.hrv.hrvSummary;
    snap.hrv = s.lastNightAvg ?? s.weeklyAvg ?? undefined;
  }

  // ── Body Battery — last value in bodyBatteryValuesArray[n][1] ────────────────
  if (Array.isArray(raw.body_battery) && raw.body_battery.length > 0) {
    const bb = raw.body_battery[0];
    if (Array.isArray(bb.bodyBatteryValuesArray) && bb.bodyBatteryValuesArray.length > 0) {
      // Each entry is [timestamp_ms, battery_level] — take most recent non-zero
      const valid = bb.bodyBatteryValuesArray.filter((v: any[]) => v[1] > 0);
      if (valid.length > 0) {
        snap.bodyBattery = valid[valid.length - 1][1];
      }
    }
  }

  // ── Sleep — all fields live in dailySleepDTO ─────────────────────────────────
  if (raw.sleep?.dailySleepDTO) {
    const s = raw.sleep.dailySleepDTO;
    snap.sleepHours      = (s.sleepTimeSeconds  ?? 0) / 3600;
    snap.deepSleepHours  = (s.deepSleepSeconds  ?? 0) / 3600;
    snap.lightSleepHours = (s.lightSleepSeconds ?? 0) / 3600;
    snap.remSleepHours   = (s.remSleepSeconds   ?? 0) / 3600;
    snap.awakeHours      = (s.awakeSleepSeconds ?? 0) / 3600;
    snap.sleepScore      = s.sleepScores?.overall?.value ?? undefined;
    // SpO2 and respiration live directly in dailySleepDTO
    snap.spo2            = s.averageSpO2Value   ?? undefined;
    snap.respirationAvg  = s.averageRespirationValue ?? undefined;
  }

  // ── Stress ───────────────────────────────────────────────────────────────────
  if (raw.stress) {
    // avgStressLevel can be -1 when no data — guard against it
    const avg = raw.stress.avgStressLevel;
    if (avg != null && avg >= 0) snap.avgStress = avg;
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
    id:              String(a.activityId),
    name:            a.activityName ?? 'Activity',
    type:            a.activityType?.typeKey ?? 'unknown',
    date:            a.startTimeLocal?.slice(0, 10) ?? '',
    durationMinutes: Math.round((a.duration ?? 0) / 60),
    distanceKm:      a.distance ? a.distance / 1000 : undefined,
    avgHeartRate:    a.averageHR,
    calories:        a.calories,
    activeCalories:  a.activeCalories ?? a.calories,
  }));
}

export async function isGarminProxyReachable(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${GARMIN_PROXY}/health`, 3000);
    return res.ok;
  } catch {
    return false;
  }
}
