import { GARMIN_PROXY } from '../../constants/Config';
import { HealthSnapshot, AIInsight } from '../models/HealthSnapshot';
import { HealthGoals } from '../models/Goals';

function fetchWithTimeout(url: string, body: string, ms = 120_000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: controller.signal,
  }).finally(() => clearTimeout(id));
}

// Calls /insights — AI health coach analysis of the past 7 days.
export async function generateInsights(
  snapshots: HealthSnapshot[],
  goals?: HealthGoals,
): Promise<AIInsight> {
  const res = await fetchWithTimeout(
    `${GARMIN_PROXY}/insights`,
    JSON.stringify({ snapshots: snapshots.slice(0, 7), goals: goals ?? {}, model: 'llama-3.3-70b-versatile' }),
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Insights error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return {
    text: data.text,
    generatedAt: new Date().toISOString(),
    basedOnDays: snapshots.length,
  };
}

// Calls /meals — suggests 3 meals based on ingredients + today's data + goals.
export async function generateMealIdeas(
  ingredients: string[],
  todaySnapshot: Partial<HealthSnapshot>,
  goals: HealthGoals,
): Promise<string> {
  const res = await fetchWithTimeout(
    `${GARMIN_PROXY}/meals`,
    JSON.stringify({
      ingredients,
      today_snapshot: todaySnapshot,
      goals,
      model: 'llama-3.3-70b-versatile',
    }),
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meal suggestions error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.text as string;
}
