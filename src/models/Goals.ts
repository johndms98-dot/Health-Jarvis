export interface HealthGoals {
  // Weight (stored and displayed in lbs — Renpho manual entry until EAS + HealthKit)
  currentWeightLbs?: number;
  targetWeightLbs?: number;
  targetBodyFatPct?: number;

  // Daily nutrition — base targets (auto-adjusted for activity at render time)
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterCups: number;
  fiberG: number;

  // Activity
  dailySteps: number;
  weeklyWorkouts: number;

  // Sleep
  sleepHours: number;
  bedtime: string;   // "23:00"
  wakeTime: string;  // "07:00"
}

export const DEFAULT_GOALS: HealthGoals = {
  dailyCalories: 2000,
  proteinG: 150,
  carbsG: 200,
  fatG: 65,
  waterCups: 8,
  fiberG: 30,
  dailySteps: 10000,
  weeklyWorkouts: 4,
  sleepHours: 8,
  bedtime: '23:00',
  wakeTime: '07:00',
};

/**
 * Auto-adjusts daily nutrition targets based on today's activity.
 * Eats back 70% of active calories, distributing extra into carbs (recovery) and protein.
 */
export function adjustedTargets(
  goals: HealthGoals,
  activeCalories?: number,
  steps?: number,
): { calories: number; protein: number; carbs: number; fat: number } {
  const burnBonus = activeCalories ?? 0;
  const highStepBonus = steps != null && steps > 12000 ? 50 : 0;
  const totalExtra = burnBonus + highStepBonus;

  return {
    calories: Math.round(goals.dailyCalories + totalExtra * 0.7),
    protein:  Math.round(goals.proteinG + totalExtra * 0.04),
    carbs:    Math.round(goals.carbsG   + totalExtra * 0.12),
    fat:      goals.fatG,
  };
}

/**
 * Adjusts the Garmin body battery by adding nutrition-based factors Garmin can't see.
 * Garmin already accounts for sleep and activity — we only add dietary context.
 */
export function computeAdjustedBattery(
  garminBB: number | undefined,
  proteinG: number | undefined,
  caloriesConsumed: number | undefined,
  waterCups: number | undefined,
  targets: { protein: number; calories: number },
  goalWaterCups: number,
): number | undefined {
  if (garminBB == null) return undefined;

  let adj = 0;

  // Protein — fueling muscle recovery
  if (proteinG != null && targets.protein > 0) {
    const ratio = proteinG / targets.protein;
    if (ratio >= 0.85) adj += 3;
    else if (ratio < 0.5) adj -= 3;
  }

  // Calories — adequate but not excessive
  if (caloriesConsumed != null && targets.calories > 0) {
    const ratio = caloriesConsumed / targets.calories;
    if (ratio >= 0.75 && ratio <= 1.1) adj += 2;
    else if (ratio < 0.45) adj -= 4;  // underfueled
    else if (ratio > 1.4)  adj -= 2;  // significantly over
  }

  // Hydration
  if (waterCups != null && goalWaterCups > 0 && waterCups >= goalWaterCups * 0.8) {
    adj += 2;
  }

  return Math.min(100, Math.max(0, garminBB + adj));
}
