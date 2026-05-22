// MFPService — DEPRECATED. MyFitnessPal has been replaced with the built-in
// barcode scanner + Open Food Facts + USDA FoodData Central + Supabase food logs.
// This file is kept to avoid breaking any lingering imports during migration.

export interface MealBreakdown {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export async function fetchNutrition(_date: string) {
  return { date: _date, rawTotals: {}, snapshot: { date: _date }, meals: [] as MealBreakdown[] };
}

export async function isMFPProxyReachable(): Promise<boolean> {
  return false;
}
