import { createClient } from '@supabase/supabase-js';
import { HealthSnapshot } from '../models/HealthSnapshot';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FoodLog {
  id?: string;
  logged_at?: string;
  date: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  food_name: string;
  barcode?: string;
  open_food_facts_id?: string;
  usda_fdc_id?: string;
  serving_qty: number;
  serving_unit: string;
  serving_weight_g?: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  saturated_fat_g?: number;
  cholesterol_mg?: number;
  potassium_mg?: number;
  vitamin_c_mg?: number;
  calcium_mg?: number;
  iron_mg?: number;
}

export interface CustomFood {
  id?: string;
  name: string;
  brand?: string;
  barcode?: string;
  serving_qty: number;
  serving_unit: string;
  serving_weight_g?: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  use_count?: number;
}

export interface HealthSnapshotRow {
  date: string;
  fetched_at?: string;
  // Garmin
  garmin_steps?: number;
  garmin_body_battery?: number;
  garmin_resting_hr?: number;
  garmin_hrv_rmssd?: number;
  garmin_sleep_hours?: number;
  garmin_sleep_score?: number;
  garmin_deep_sleep_hours?: number;
  garmin_light_sleep_hours?: number;
  garmin_rem_sleep_hours?: number;
  garmin_spo2?: number;
  garmin_avg_stress?: number;
  garmin_active_calories?: number;
  garmin_respiration?: number;
  // Apple Health
  apple_steps?: number;
  apple_resting_hr?: number;
  apple_sleep_hours?: number;
  apple_deep_sleep_hours?: number;
  apple_rem_sleep_hours?: number;
  apple_hrv_rmssd?: number;
  apple_active_calories?: number;
  apple_weight_kg?: number;
  apple_mindful_minutes?: number;
  apple_workout_minutes?: number;
  // Resolved best-source values
  steps?: number;
  resting_hr?: number;
  sleep_hours?: number;
  deep_sleep_hours?: number;
  rem_sleep_hours?: number;
  hrv_rmssd?: number;
  active_calories?: number;
  body_battery?: number;
  sleep_score?: number;
  spo2?: number;
  avg_stress?: number;
  // Withings
  weight_kg?: number;
  body_fat_pct?: number;
  muscle_mass_kg?: number;
  bone_mass_kg?: number;
  hydration_kg?: number;
  // Nutrition
  calories_consumed?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  water_cups?: number;
  // Vitality
  vitality_score?: number;
}

export interface DBGoals {
  id?: string;
  current_weight_lbs?: number;
  target_weight_lbs?: number;
  weekly_weight_loss_lbs?: number;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  water_cups?: number;
  steps?: number;
  active_calories?: number;
  sleep_hours?: number;
  primary_goal?: string;
  race_distance_km?: number;
  target_race_pace_min_per_km?: number;
  target_race_date?: string;
}

// ─── Food Logs ────────────────────────────────────────────────────────────────

export async function logFood(entry: FoodLog): Promise<FoodLog | null> {
  const { data, error } = await supabase
    .from('food_logs')
    .insert(entry)
    .select()
    .single();
  if (error) { console.error('logFood error:', error); return null; }
  return data;
}

export async function getFoodLogs(date: string): Promise<FoodLog[]> {
  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .eq('date', date)
    .order('logged_at', { ascending: true });
  if (error) { console.error('getFoodLogs error:', error); return []; }
  return data ?? [];
}

export async function deleteFoodLog(id: string): Promise<void> {
  await supabase.from('food_logs').delete().eq('id', id);
}

export async function getFoodLogRange(startDate: string, endDate: string): Promise<FoodLog[]> {
  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });
  if (error) { console.error('getFoodLogRange error:', error); return []; }
  return data ?? [];
}

// ─── Custom Foods ─────────────────────────────────────────────────────────────

export async function saveCustomFood(food: CustomFood): Promise<CustomFood | null> {
  const { data, error } = await supabase
    .from('custom_foods')
    .upsert({ ...food, use_count: (food.use_count ?? 0) + 1 }, { onConflict: 'name' })
    .select()
    .single();
  if (error) { console.error('saveCustomFood error:', error); return null; }
  return data;
}

export async function searchCustomFoods(query: string): Promise<CustomFood[]> {
  const { data, error } = await supabase
    .from('custom_foods')
    .select('*')
    .ilike('name', `%${query}%`)
    .order('use_count', { ascending: false })
    .limit(20);
  if (error) return [];
  return data ?? [];
}

export async function getCustomFoodByBarcode(barcode: string): Promise<CustomFood | null> {
  const { data, error } = await supabase
    .from('custom_foods')
    .select('*')
    .eq('barcode', barcode)
    .single();
  if (error) return null;
  return data;
}

// ─── Health Snapshots — camelCase ↔ snake_case converters ────────────────────

/** Convert app's camelCase HealthSnapshot → Supabase snake_case row */
export function snapshotToRow(s: HealthSnapshot): HealthSnapshotRow {
  return {
    date: s.date,
    garmin_steps: s.steps,
    garmin_body_battery: s.bodyBattery,
    garmin_resting_hr: s.restingHeartRate,
    garmin_hrv_rmssd: s.hrv,
    garmin_sleep_hours: s.sleepHours,
    garmin_sleep_score: s.sleepScore,
    garmin_deep_sleep_hours: s.deepSleepHours,
    garmin_light_sleep_hours: s.lightSleepHours,
    garmin_rem_sleep_hours: s.remSleepHours,
    garmin_spo2: s.spo2,
    garmin_avg_stress: s.avgStress,
    garmin_active_calories: s.activeCalories,
    // resolved values
    steps: s.steps,
    resting_hr: s.restingHeartRate,
    sleep_hours: s.sleepHours,
    deep_sleep_hours: s.deepSleepHours,
    rem_sleep_hours: s.remSleepHours,
    hrv_rmssd: s.hrv,
    active_calories: s.activeCalories,
    body_battery: s.bodyBattery,
    sleep_score: s.sleepScore,
    spo2: s.spo2,
    avg_stress: s.avgStress,
    weight_kg: s.weightKg,
    body_fat_pct: s.bodyFatPct,
    muscle_mass_kg: s.muscleMassKg,
    calories_consumed: s.caloriesConsumed,
    protein_g: s.proteinG,
    carbs_g: s.carbsG,
    fat_g: s.fatG,
    fiber_g: s.fiberG,
    water_cups: s.waterCups,
  };
}

/** Convert Supabase row → app's camelCase HealthSnapshot */
export function rowToSnapshot(r: HealthSnapshotRow): HealthSnapshot {
  return {
    date: r.date,
    steps: r.steps ?? r.garmin_steps,
    bodyBattery: r.body_battery ?? r.garmin_body_battery,
    restingHeartRate: r.resting_hr ?? r.garmin_resting_hr,
    hrv: r.hrv_rmssd ?? r.garmin_hrv_rmssd,
    sleepHours: r.sleep_hours ?? r.garmin_sleep_hours,
    sleepScore: r.sleep_score ?? r.garmin_sleep_score,
    deepSleepHours: r.deep_sleep_hours ?? r.garmin_deep_sleep_hours,
    lightSleepHours: r.garmin_light_sleep_hours,
    remSleepHours: r.rem_sleep_hours ?? r.garmin_rem_sleep_hours,
    spo2: r.spo2 ?? r.garmin_spo2,
    avgStress: r.avg_stress ?? r.garmin_avg_stress,
    activeCalories: r.active_calories ?? r.garmin_active_calories,
    weightKg: r.weight_kg,
    bodyFatPct: r.body_fat_pct,
    muscleMassKg: r.muscle_mass_kg,
    caloriesConsumed: r.calories_consumed,
    proteinG: r.protein_g,
    carbsG: r.carbs_g,
    fatG: r.fat_g,
    fiberG: r.fiber_g,
    waterCups: r.water_cups,
  };
}

export async function upsertHealthSnapshot(snapshot: HealthSnapshot): Promise<void> {
  const row = snapshotToRow(snapshot);
  const { error } = await supabase
    .from('health_snapshots')
    .upsert(row, { onConflict: 'date' });
  if (error) console.error('upsertHealthSnapshot error:', error);
}

export async function getHealthSnapshots(days: number = 30): Promise<HealthSnapshot[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const { data, error } = await supabase
    .from('health_snapshots')
    .select('*')
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: false });
  if (error) { console.error('getHealthSnapshots error:', error); return []; }
  return (data ?? []).map(rowToSnapshot);
}

export async function getHealthSnapshot(date: string): Promise<HealthSnapshotRow | null> {
  const { data, error } = await supabase
    .from('health_snapshots')
    .select('*')
    .eq('date', date)
    .single();
  if (error) return null;
  return data;
}

// ─── Goals ────────────────────────────────────────────────────────────────────

export async function loadDBGoals(): Promise<DBGoals | null> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error) return null;
  return data;
}

export async function saveDBGoals(goals: DBGoals): Promise<void> {
  if (goals.id) {
    await supabase.from('goals').update({ ...goals, updated_at: new Date().toISOString() }).eq('id', goals.id);
  } else {
    await supabase.from('goals').insert(goals);
  }
}

// ─── AI Insights ─────────────────────────────────────────────────────────────

export async function saveInsight(content: string, type: string, startDate?: string, endDate?: string, model?: string): Promise<void> {
  await supabase.from('ai_insights').insert({
    insight_type: type,
    date_range_start: startDate,
    date_range_end: endDate,
    content,
    model,
  });
}

export async function getRecentInsights(limit = 10) {
  const { data } = await supabase
    .from('ai_insights')
    .select('*')
    .order('generated_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ─── Recent Ingredients ───────────────────────────────────────────────────────

export async function getRecentIngredients(limit = 20): Promise<string[]> {
  const { data } = await supabase
    .from('recent_ingredients')
    .select('name')
    .order('last_used_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: any) => r.name);
}

export async function addRecentIngredient(name: string): Promise<void> {
  await supabase.from('recent_ingredients').upsert(
    { name, last_used_at: new Date().toISOString(), use_count: 1 },
    { onConflict: 'name' }
  );
}
