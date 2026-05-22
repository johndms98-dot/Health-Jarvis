/**
 * AIOptimizationService
 * The "morning brief" — takes all of today's data and generates
 * a personalized daily optimization plan: calorie target, protein target,
 * workout recommendation, and focus for the day.
 *
 * Also handles deep trend analysis across 30-90 days.
 */

import { GARMIN_PROXY } from '../../constants/Config';
import { HealthSnapshot } from '../models/HealthSnapshot';
import { HealthGoals as Goals } from '../models/Goals';

export type PrimaryGoal = 'weight_loss' | 'race_pace' | 'muscle_gain' | 'general_health';

export interface DailyBrief {
  // Targets for today
  calorieTarget: number;
  proteinTarget: number;
  carbTarget: number;
  fatTarget: number;
  stepTarget: number;
  waterTarget: number;
  // Workout recommendation
  workoutRecommendation: 'rest' | 'easy' | 'moderate' | 'hard';
  workoutReason: string;
  // Recovery score 0-100
  recoveryScore: number;
  recoveryLabel: 'poor' | 'low' | 'moderate' | 'good' | 'excellent';
  // One-line summary
  headline: string;
  // Detailed AI brief (from Groq)
  aiText?: string;
  model?: string;
}

export interface DeepInsight {
  generated_at: string;
  headline: string;
  findings: string[];   // 5-10 specific data-backed findings
  patterns: string[];   // correlations discovered
  actions: string[];    // concrete things to change
  raw: string;
  model?: string;
}

// ─── Recovery score calculation ───────────────────────────────────────────────

function computeRecoveryScore(today: Partial<HealthSnapshot>, sevenDayAvg: Partial<HealthSnapshot>): number {
  let score = 50; // baseline

  // HRV vs 7-day average (most important signal)
  if (today.hrv != null && sevenDayAvg.hrv != null && sevenDayAvg.hrv > 0) {
    const ratio = today.hrv / sevenDayAvg.hrv;
    if (ratio >= 1.1)      score += 20;
    else if (ratio >= 1.0) score += 10;
    else if (ratio >= 0.9) score += 0;
    else if (ratio >= 0.8) score -= 10;
    else                   score -= 20;
  }

  // Sleep hours vs ideal (7.5-9h is optimal)
  const sleep = today.sleepHours ?? 0;
  if (sleep >= 8)       score += 15;
  else if (sleep >= 7)  score += 8;
  else if (sleep >= 6)  score += 0;
  else if (sleep >= 5)  score -= 10;
  else                  score -= 20;

  // Body battery (Garmin's own recovery metric)
  const bb = today.bodyBattery ?? 50;
  if (bb >= 80)     score += 15;
  else if (bb >= 60) score += 8;
  else if (bb >= 40) score += 0;
  else if (bb >= 20) score -= 8;
  else               score -= 15;

  // Resting HR vs average (elevated = not recovered)
  if (today.restingHeartRate != null && sevenDayAvg.restingHeartRate != null && sevenDayAvg.restingHeartRate > 0) {
    const diff = today.restingHeartRate - sevenDayAvg.restingHeartRate;
    if (diff <= -2)      score += 5;
    else if (diff <= 2)  score += 0;
    else if (diff <= 5)  score -= 8;
    else                 score -= 15;
  }

  // Sleep score from Garmin
  if (today.sleepScore != null) {
    if (today.sleepScore >= 80)      score += 10;
    else if (today.sleepScore >= 60) score += 5;
    else if (today.sleepScore < 40)  score -= 10;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

function recoveryLabel(score: number): DailyBrief['recoveryLabel'] {
  if (score >= 80) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 45) return 'moderate';
  if (score >= 30) return 'low';
  return 'poor';
}

function workoutFromRecovery(score: number, goals: Goals): DailyBrief['workoutRecommendation'] {
  if (score >= 75) return 'hard';
  if (score >= 55) return 'moderate';
  if (score >= 35) return 'easy';
  return 'rest';
}

function workoutReason(score: number, today: Partial<HealthSnapshot>): string {
  if (score >= 75) return `HRV and body battery are high — great day to push hard.`;
  if (score >= 55) return `Recovery is solid. Moderate training is ideal today.`;
  if (score >= 35) {
    const reasons = [];
    if ((today.sleepHours ?? 8) < 7) reasons.push('short sleep');
    if ((today.bodyBattery ?? 50) < 40) reasons.push('low body battery');
    if ((today.hrv ?? 50) < 40) reasons.push('depressed HRV');
    return `Recovery is low${reasons.length ? ` (${reasons.join(', ')})` : ''}. Keep it easy.`;
  }
  return `Your body needs rest today. Walk, stretch, or take the day off.`;
}

// ─── Target calculation ───────────────────────────────────────────────────────

function computeTargets(goals: Goals, recoveryScore: number, today: Partial<HealthSnapshot>): Pick<DailyBrief, 'calorieTarget' | 'proteinTarget' | 'carbTarget' | 'fatTarget' | 'stepTarget' | 'waterTarget'> {
  const base = {
    cal: goals.dailyCalories ?? 2000,
    protein: goals.proteinG ?? 150,
    carbs: goals.carbsG ?? 200,
    fat: goals.fatG ?? 65,
    steps: goals.dailySteps ?? 10000,
    water: goals.waterCups ?? 8,
  };

  const activeCal = today.activeCalories ?? 0;
  const isHighActivity = activeCal > 400 || (today.steps ?? 0) > 12000;

  // Weight loss: keep deficit even on high activity days
  // Race pace / muscle gain: fuel more aggressively
  const goalMultiplier =
    goals.primaryGoal === 'weight_loss' ? 0.6 :
    goals.primaryGoal === 'race_pace'   ? 0.8 :
    goals.primaryGoal === 'muscle_gain' ? 0.85 : 0.7;

  const calBoost = isHighActivity ? Math.round(activeCal * goalMultiplier) : 0;

  // On poor recovery days, slightly bump protein (muscle repair) and cut carbs
  const recoveryProteinBoost = recoveryScore < 40 ? 15 : 0;
  const recoveryCarbCut = recoveryScore < 40 ? -20 : 0;

  // Race pace goal: extra carbs on training days
  const raceCarbBoost = (goals.primaryGoal === 'race_pace' && recoveryScore >= 55) ? 30 : 0;

  return {
    calorieTarget: base.cal + calBoost,
    proteinTarget: base.protein + recoveryProteinBoost + Math.round(activeCal * 0.03),
    carbTarget: base.carbs + recoveryCarbCut + raceCarbBoost + Math.round(calBoost * 0.5 / 4),
    fatTarget: base.fat,
    stepTarget: recoveryScore < 35 ? Math.round(base.steps * 0.6) : base.steps,
    waterTarget: isHighActivity ? base.water + 2 : base.water,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Generate today's optimization brief */
export async function getDailyBrief(
  today: Partial<HealthSnapshot>,
  recentSnapshots: Partial<HealthSnapshot>[],
  goals: Goals,
): Promise<DailyBrief> {
  // 7-day averages for comparison
  const avg7 = compute7DayAvg(recentSnapshots.slice(1, 8));

  const recoveryScore = computeRecoveryScore(today, avg7);
  const label = recoveryLabel(recoveryScore);
  const workout = workoutFromRecovery(recoveryScore, goals);
  const reason = workoutReason(recoveryScore, today);
  const targets = computeTargets(goals, recoveryScore, today);

  const goalLabel =
    goals.primaryGoal === 'weight_loss' ? 'weight loss' :
    goals.primaryGoal === 'race_pace'   ? `${goals.raceDistanceKm ?? '?'}km race pace` :
    goals.primaryGoal === 'muscle_gain' ? 'muscle gain' : 'general health';

  const headline = `Recovery: ${label} (${recoveryScore}/100) · ${workout} day · ${targets.calorieTarget} kcal target`;

  // Get AI brief from proxy
  let aiText: string | undefined;
  let model: string | undefined;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(`${GARMIN_PROXY}/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        today,
        avg7,
        goals: { ...goals, primaryGoal: goalLabel },
        recovery_score: recoveryScore,
        targets,
        workout_recommendation: workout,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      aiText = data.text;
      model = data.model;
    }
  } catch { /* non-fatal — local calc still works */ }

  return {
    ...targets,
    workoutRecommendation: workout,
    workoutReason: reason,
    recoveryScore,
    recoveryLabel: label,
    headline,
    aiText,
    model,
  };
}

/** Generate deep trend analysis across 30-90 days */
export async function getDeepInsights(
  snapshots: Partial<HealthSnapshot>[],
  goals: Goals,
  foodLogs?: any[],
): Promise<DeepInsight | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000); // AI needs more time for deep analysis
    const res = await fetch(`${GARMIN_PROXY}/deep-insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshots, goals, food_logs: foodLogs ?? [] }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compute7DayAvg(snapshots: Partial<HealthSnapshot>[]): Partial<HealthSnapshot> {
  if (!snapshots.length) return {};
  const keys: (keyof HealthSnapshot)[] = ['steps', 'hrv', 'restingHeartRate', 'sleepHours', 'bodyBattery', 'sleepScore', 'avgStress', 'activeCalories'];
  const result: Partial<HealthSnapshot> = {};
  for (const key of keys) {
    const vals = snapshots.map(s => s[key] as number | undefined).filter((v): v is number => v != null);
    if (vals.length) (result as any)[key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return result;
}
