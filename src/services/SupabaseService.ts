import { createClient } from '@supabase/supabase-js';

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

// ─── Health Snapshots ─────────────────────────────────────────────────────────

export async function upsertHealthSnapshot(snapshot: HealthSnapshotRow): Promise<void> {
  const { error } = await supabase
    .from('health_snapshots')
    .upsert(snapshot, { onConflict: 'date' });
  if (error) console.error('upsertHealthSnapshot error:', error);
}

export async function getHealthSnapshots(days: number = 30): Promise<HealthSnapshotRow[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const { data, error } = await supabase
    .from('health_snapshots')
    .select('*')
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: false });
  if (error) { console.error('getHealthSnapshots error:', error); return []; }
  return data ?? [];
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
