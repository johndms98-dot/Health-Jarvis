import { Storage } from '../utils/storage';
import { HealthGoals, DEFAULT_GOALS } from '../models/Goals';

const GOALS_KEY = 'health_goals_v1';
const RECENT_INGREDIENTS_KEY = 'recent_ingredients_v1';

export async function loadGoals(): Promise<HealthGoals> {
  try {
    const raw = await Storage.get(GOALS_KEY);
    if (!raw) return { ...DEFAULT_GOALS };
    return { ...DEFAULT_GOALS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_GOALS };
  }
}

export async function saveGoals(goals: HealthGoals): Promise<void> {
  await Storage.set(GOALS_KEY, JSON.stringify(goals));
}

export async function loadRecentIngredients(): Promise<string[]> {
  try {
    const raw = await Storage.get(RECENT_INGREDIENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addRecentIngredients(newOnes: string[]): Promise<string[]> {
  const existing = await loadRecentIngredients();
  const merged = [...new Set([...newOnes, ...existing])].slice(0, 30);
  await Storage.set(RECENT_INGREDIENTS_KEY, JSON.stringify(merged));
  return merged;
}
