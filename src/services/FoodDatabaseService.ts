/**
 * FoodDatabaseService
 * Looks up food by barcode or text search using:
 *   1. Open Food Facts (3M+ products, completely free)
 *   2. USDA FoodData Central (authoritative US nutrition data, free API key)
 * Falls back to user's saved custom foods in Supabase.
 */

import { getCustomFoodByBarcode, searchCustomFoods, CustomFood, FoodLog } from './SupabaseService';

const USDA_API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY ?? 'DEMO_KEY';
const OFF_BASE = 'https://world.openfoodfacts.org';
const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

// ─── Normalised food result ───────────────────────────────────────────────────

export interface FoodResult {
  name: string;
  brand?: string;
  barcode?: string;
  source: 'open_food_facts' | 'usda' | 'custom';
  source_id?: string;
  // Per-serving (as packaged or per 100g)
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

// ─── Open Food Facts ──────────────────────────────────────────────────────────

async function lookupOFF(barcode: string): Promise<FoodResult | null> {
  try {
    const res = await fetch(`${OFF_BASE}/api/v2/product/${barcode}.json?fields=product_name,brands,nutriments,serving_size,serving_quantity`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;
    return parseOFFProduct(json.product, barcode);
  } catch { return null; }
}

async function searchOFF(query: string): Promise<FoodResult[]> {
  try {
    const res = await fetch(`${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10&fields=product_name,brands,nutriments,serving_size,serving_quantity,code`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.products ?? []).map((p: any) => parseOFFProduct(p, p.code)).filter(Boolean) as FoodResult[];
  } catch { return []; }
}

function parseOFFProduct(p: any, barcode?: string): FoodResult | null {
  const n = p.nutriments ?? {};
  const cal = n['energy-kcal_serving'] ?? n['energy-kcal_100g'];
  if (!cal) return null;
  const per100 = !n['energy-kcal_serving'];
  const factor = per100 ? (p.serving_quantity ? parseFloat(p.serving_quantity) / 100 : 1) : 1;

  return {
    name: p.product_name ?? 'Unknown',
    brand: p.brands,
    barcode,
    source: 'open_food_facts',
    source_id: barcode,
    serving_qty: 1,
    serving_unit: p.serving_size ?? (per100 ? '100g' : 'serving'),
    serving_weight_g: p.serving_quantity ? parseFloat(p.serving_quantity) : undefined,
    calories: Math.round((n['energy-kcal_serving'] ?? (n['energy-kcal_100g'] ?? 0) * factor)),
    protein_g: round1((n['proteins_serving'] ?? (n['proteins_100g'] ?? 0) * factor)),
    carbs_g: round1((n['carbohydrates_serving'] ?? (n['carbohydrates_100g'] ?? 0) * factor)),
    fat_g: round1((n['fat_serving'] ?? (n['fat_100g'] ?? 0) * factor)),
    fiber_g: round1opt(n['fiber_serving'] ?? (n['fiber_100g'] != null ? n['fiber_100g'] * factor : undefined)),
    sugar_g: round1opt(n['sugars_serving'] ?? (n['sugars_100g'] != null ? n['sugars_100g'] * factor : undefined)),
    sodium_mg: round1opt(n['sodium_serving'] != null ? n['sodium_serving'] * 1000 : (n['sodium_100g'] != null ? n['sodium_100g'] * 1000 * factor : undefined)),
    saturated_fat_g: round1opt(n['saturated-fat_serving'] ?? (n['saturated-fat_100g'] != null ? n['saturated-fat_100g'] * factor : undefined)),
  };
}

// ─── USDA FoodData Central ────────────────────────────────────────────────────

async function searchUSDA(query: string): Promise<FoodResult[]> {
  try {
    const res = await fetch(`${USDA_BASE}/foods/search?query=${encodeURIComponent(query)}&pageSize=10&api_key=${USDA_API_KEY}`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.foods ?? []).map(parseUSDAFood).filter(Boolean) as FoodResult[];
  } catch { return []; }
}

function parseUSDAFood(f: any): FoodResult | null {
  const nutrients = f.foodNutrients ?? [];
  const get = (name: string) => nutrients.find((n: any) => n.nutrientName === name)?.value;
  const cal = get('Energy');
  if (!cal) return null;
  return {
    name: f.description,
    brand: f.brandOwner,
    source: 'usda',
    source_id: String(f.fdcId),
    serving_qty: 1,
    serving_unit: f.servingSize ? `${f.servingSize}${f.servingSizeUnit ?? 'g'}` : '100g',
    serving_weight_g: f.servingSize,
    calories: Math.round(cal),
    protein_g: round1(get('Protein') ?? 0),
    carbs_g: round1(get('Carbohydrate, by difference') ?? 0),
    fat_g: round1(get('Total lipid (fat)') ?? 0),
    fiber_g: round1opt(get('Fiber, total dietary')),
    sugar_g: round1opt(get('Sugars, total including NLEA')),
    sodium_mg: round1opt(get('Sodium, Na')),
    saturated_fat_g: round1opt(get('Fatty acids, total saturated')),
    cholesterol_mg: round1opt(get('Cholesterol')),
    potassium_mg: round1opt(get('Potassium, K')),
    vitamin_c_mg: round1opt(get('Vitamin C, total ascorbic acid')),
    calcium_mg: round1opt(get('Calcium, Ca')),
    iron_mg: round1opt(get('Iron, Fe')),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Look up by barcode — tries custom foods, then OFF, then USDA */
export async function lookupBarcode(barcode: string): Promise<FoodResult | null> {
  // 1. User's own saved foods
  const custom = await getCustomFoodByBarcode(barcode);
  if (custom) return customToResult(custom);
  // 2. Open Food Facts
  const off = await lookupOFF(barcode);
  if (off) return off;
  // 3. USDA (rare for barcodes but worth trying)
  const usdaResults = await searchUSDA(barcode);
  return usdaResults[0] ?? null;
}

/** Text search — combines OFF + USDA + custom foods */
export async function searchFood(query: string): Promise<FoodResult[]> {
  const [offResults, usdaResults, customResults] = await Promise.all([
    searchOFF(query),
    searchUSDA(query),
    searchCustomFoods(query),
  ]);
  const customMapped = customResults.map(customToResult);
  // Deduplicate by name+brand, prefer custom > OFF > USDA
  const seen = new Set<string>();
  const combined: FoodResult[] = [];
  for (const item of [...customMapped, ...offResults, ...usdaResults]) {
    const key = `${item.name.toLowerCase()}|${(item.brand ?? '').toLowerCase()}`;
    if (!seen.has(key)) { seen.add(key); combined.push(item); }
  }
  return combined.slice(0, 20);
}

/** Convert a FoodResult to a FoodLog entry ready to insert */
export function foodResultToLog(
  food: FoodResult,
  date: string,
  mealType: FoodLog['meal_type'],
  servingQty: number = food.serving_qty,
): FoodLog {
  const factor = servingQty / food.serving_qty;
  return {
    date,
    meal_type: mealType,
    food_name: food.name,
    barcode: food.barcode,
    open_food_facts_id: food.source === 'open_food_facts' ? food.source_id : undefined,
    usda_fdc_id: food.source === 'usda' ? food.source_id : undefined,
    serving_qty: servingQty,
    serving_unit: food.serving_unit,
    serving_weight_g: food.serving_weight_g ? food.serving_weight_g * factor : undefined,
    calories: Math.round(food.calories * factor),
    protein_g: round1(food.protein_g * factor),
    carbs_g: round1(food.carbs_g * factor),
    fat_g: round1(food.fat_g * factor),
    fiber_g: food.fiber_g != null ? round1(food.fiber_g * factor) : undefined,
    sugar_g: food.sugar_g != null ? round1(food.sugar_g * factor) : undefined,
    sodium_mg: food.sodium_mg != null ? round1(food.sodium_mg * factor) : undefined,
    saturated_fat_g: food.saturated_fat_g != null ? round1(food.saturated_fat_g * factor) : undefined,
    cholesterol_mg: food.cholesterol_mg != null ? round1(food.cholesterol_mg * factor) : undefined,
    potassium_mg: food.potassium_mg != null ? round1(food.potassium_mg * factor) : undefined,
    vitamin_c_mg: food.vitamin_c_mg != null ? round1(food.vitamin_c_mg * factor) : undefined,
    calcium_mg: food.calcium_mg != null ? round1(food.calcium_mg * factor) : undefined,
    iron_mg: food.iron_mg != null ? round1(food.iron_mg * factor) : undefined,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function customToResult(c: CustomFood): FoodResult {
  return {
    name: c.name,
    brand: c.brand,
    barcode: c.barcode,
    source: 'custom',
    serving_qty: c.serving_qty,
    serving_unit: c.serving_unit,
    serving_weight_g: c.serving_weight_g,
    calories: c.calories,
    protein_g: c.protein_g,
    carbs_g: c.carbs_g,
    fat_g: c.fat_g,
    fiber_g: c.fiber_g,
    sugar_g: c.sugar_g,
    sodium_mg: c.sodium_mg,
  };
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
function round1opt(n: number | undefined): number | undefined {
  return n != null ? round1(n) : undefined;
}
