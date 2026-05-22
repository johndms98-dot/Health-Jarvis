import { MFP_PROXY } from '../../constants/Config';
import { HealthSnapshot } from '../models/HealthSnapshot';

function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id));
}

async function fetchJSON(path: string): Promise<any> {
  const res = await fetchWithTimeout(`${MFP_PROXY}${path}`);
  if (!res.ok) throw new Error(`MFP proxy error ${res.status}`);
  return res.json();
}

export interface MealBreakdown {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NutritionDay {
  date: string;
  rawTotals: Record<string, number>;
  snapshot: Partial<HealthSnapshot>;
  meals: MealBreakdown[];
}

export async function fetchNutrition(date: string): Promise<NutritionDay> {
  const raw = await fetchJSON(`/nutrition/${date}`);
  const t = raw.totals ?? {};
  return {
    date,
    rawTotals: t,
    snapshot: {
      date,
      caloriesConsumed: t.calories,
      proteinG: t.protein,
      carbsG: t.carbohydrates,
      fatG: t.fat,
      fiberG: t.fiber,
      sugarG: t.sugar,
      sodiumMg: t.sodium,
    },
    meals: (raw.meals ?? []).map((m: any) => ({
      name: m.name,
      calories: m.totals?.calories ?? 0,
      protein: m.totals?.protein ?? 0,
      carbs: m.totals?.carbohydrates ?? 0,
      fat: m.totals?.fat ?? 0,
    })),
  };
}

export async function isMFPProxyReachable(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${MFP_PROXY}/health`, 3000);
    return res.ok;
  } catch {
    return false;
  }
}
