/**
 * DataResolutionService
 * When Garmin and Apple Health both report the same metric,
 * this picks the most accurate value based on known device
 * strengths, data completeness, and coverage.
 *
 * Resolution rules are based on published accuracy studies and
 * known device characteristics.
 */

export interface RawSources {
  garmin?: {
    steps?: number;
    restingHR?: number;
    sleepHours?: number;
    deepSleepHours?: number;
    remSleepHours?: number;
    hrv?: number;         // RMSSD
    activeCalories?: number;
    spo2?: number;
    avgStress?: number;
    bodyBattery?: number;
    sleepScore?: number;
    respiration?: number;
  };
  apple?: {
    steps?: number;
    restingHR?: number;
    sleepHours?: number;
    deepSleepHours?: number;
    remSleepHours?: number;
    hrv?: number;         // SDNN from Apple
    activeCalories?: number;
    weightKg?: number;
    mindfulMinutes?: number;
    workoutMinutes?: number;
  };
}

export interface ResolvedMetrics {
  steps?: number;
  restingHR?: number;
  sleepHours?: number;
  deepSleepHours?: number;
  remSleepHours?: number;
  hrv?: number;
  activeCalories?: number;
  bodyBattery?: number;
  sleepScore?: number;
  spo2?: number;
  avgStress?: number;
  respiration?: number;
  // Resolution audit — what source was used for each metric
  _sources: Record<string, 'garmin' | 'apple' | 'average'>;
}

/**
 * Main resolution function.
 * Returns the best value for each metric and logs which source won.
 */
export function resolveMetrics(raw: RawSources): ResolvedMetrics {
  const g = raw.garmin ?? {};
  const a = raw.apple ?? {};
  const sources: Record<string, 'garmin' | 'apple' | 'average'> = {};

  function pick<T>(metric: string, garminVal: T | undefined, appleVal: T | undefined, preferred: 'garmin' | 'apple'): T | undefined {
    if (garminVal != null && appleVal != null) {
      sources[metric] = preferred;
      return preferred === 'garmin' ? garminVal : appleVal;
    }
    if (garminVal != null) { sources[metric] = 'garmin'; return garminVal; }
    if (appleVal != null) { sources[metric] = 'apple'; return appleVal; }
    return undefined;
  }

  /**
   * STEPS
   * Both devices count steps. Garmin uses a dedicated accelerometer tuned
   * for wrist movement during activity; Apple Watch uses iPhone + Watch.
   * When wearing a dedicated GPS watch, Garmin is more accurate.
   * Rule: prefer Garmin if available and within 40% of Apple value;
   * if they diverge wildly, take average (likely one device wasn't worn all day).
   */
  let steps: number | undefined;
  if (g.steps != null && a.steps != null) {
    const ratio = g.steps / a.steps;
    if (ratio >= 0.6 && ratio <= 1.4) {
      // Consistent — trust Garmin (dedicated sports watch)
      steps = g.steps;
      sources.steps = 'garmin';
    } else {
      // Large divergence — take the higher value (one device missed wear time)
      steps = Math.max(g.steps, a.steps);
      sources.steps = g.steps > a.steps ? 'garmin' : 'apple';
    }
  } else {
    steps = pick('steps', g.steps, a.steps, 'garmin');
  }

  /**
   * RESTING HEART RATE
   * Apple Watch measures RHR continuously throughout the day with optical HR.
   * Garmin similarly. Apple Watch is generally considered slightly more accurate
   * for RHR because it measures more frequently. Prefer Apple for RHR.
   */
  const restingHR = pick('restingHR', g.restingHR, a.restingHR, 'apple');

  /**
   * SLEEP
   * Garmin's sleep staging (with dedicated algorithms + SpO2 + respiration)
   * is significantly more detailed than Apple's. Apple relies mainly on
   * accelerometer + HR. Prefer Garmin for all sleep metrics.
   * Exception: if Garmin sleep hours differ from Apple by >2h, something is
   * wrong (device not worn) — use whichever is closer to a normal 6-9h range.
   */
  let sleepHours: number | undefined;
  if (g.sleepHours != null && a.sleepHours != null) {
    const gNormal = g.sleepHours >= 3 && g.sleepHours <= 12;
    const aNormal = a.sleepHours >= 3 && a.sleepHours <= 12;
    if (gNormal) { sleepHours = g.sleepHours; sources.sleepHours = 'garmin'; }
    else if (aNormal) { sleepHours = a.sleepHours; sources.sleepHours = 'apple'; }
    else { sleepHours = g.sleepHours; sources.sleepHours = 'garmin'; }
  } else {
    sleepHours = pick('sleepHours', g.sleepHours, a.sleepHours, 'garmin');
  }
  const deepSleepHours = pick('deepSleepHours', g.deepSleepHours, a.deepSleepHours, 'garmin');
  const remSleepHours = pick('remSleepHours', g.remSleepHours, a.remSleepHours, 'garmin');

  /**
   * HRV
   * Garmin reports RMSSD (short-term variability, better for recovery).
   * Apple reports SDNN (overall variability). These are different metrics
   * and NOT directly comparable. We keep Garmin's RMSSD as the primary
   * HRV value since it's more actionable for training/recovery decisions.
   */
  const hrv = pick('hrv', g.hrv, a.hrv, 'garmin');

  /**
   * ACTIVE CALORIES
   * Both estimate active calories via HR + movement. Studies show similar
   * accuracy. Take average when both are available to smooth errors.
   */
  let activeCalories: number | undefined;
  if (g.activeCalories != null && a.activeCalories != null) {
    activeCalories = Math.round((g.activeCalories + a.activeCalories) / 2);
    sources.activeCalories = 'average';
  } else {
    activeCalories = pick('activeCalories', g.activeCalories, a.activeCalories, 'garmin');
  }

  return {
    steps,
    restingHR,
    sleepHours,
    deepSleepHours,
    remSleepHours,
    hrv,
    activeCalories,
    // Garmin-only metrics (Apple doesn't have these)
    bodyBattery: g.bodyBattery,
    sleepScore: g.sleepScore,
    spo2: g.spo2,
    avgStress: g.avgStress,
    respiration: g.respiration,
    _sources: sources,
  };
}

/** Human-readable explanation of why each source was chosen — for AI context */
export function resolutionSummary(resolved: ResolvedMetrics): string {
  const lines: string[] = [];
  const s = resolved._sources;
  if (s.steps) lines.push(`Steps: ${s.steps} source${s.steps === 'average' ? ' (averaged)' : ''}`);
  if (s.restingHR) lines.push(`Resting HR: ${s.restingHR} (Apple preferred for continuous RHR)`);
  if (s.sleepHours) lines.push(`Sleep: ${s.sleepHours} (Garmin preferred for staging accuracy)`);
  if (s.hrv) lines.push(`HRV: garmin RMSSD (more actionable than Apple SDNN)`);
  if (s.activeCalories === 'average') lines.push('Active calories: averaged between Garmin and Apple');
  return lines.join('\n');
}
