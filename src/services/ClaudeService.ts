import { ANTHROPIC_API_KEY, CLAUDE_MODEL } from '../../constants/Config';
import { HealthSnapshot, AIInsight } from '../models/HealthSnapshot';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are a personal health coach reviewing one week of data from a person's Garmin watch, Withings scale, and MyFitnessPal food log. Your job is to identify patterns, flag any concerns, and give 3-5 specific, actionable recommendations.

Guidelines:
- Be concise and direct. Speak to the user as "you".
- Reference actual numbers from the data (e.g. "Your HRV dropped to 28ms on Tuesday").
- Prioritize sleep quality, recovery (body battery/HRV), and nutrition balance.
- If data is missing for a metric, don't guess — just skip it.
- No markdown headers or bullet symbols. Write in short paragraphs.`;

function formatSnapshot(s: HealthSnapshot): string {
  const parts: string[] = [`Date: ${s.date}`];
  if (s.steps != null) parts.push(`Steps: ${s.steps.toLocaleString()}`);
  if (s.bodyBattery != null) parts.push(`Body Battery: ${s.bodyBattery}/100`);
  if (s.sleepHours != null) parts.push(`Sleep: ${s.sleepHours.toFixed(1)}h (score ${s.sleepScore ?? 'N/A'}, deep ${s.deepSleepHours?.toFixed(1) ?? '?'}h, REM ${s.remSleepHours?.toFixed(1) ?? '?'}h)`);
  if (s.hrv != null) parts.push(`HRV: ${s.hrv}ms`);
  if (s.restingHeartRate != null) parts.push(`RHR: ${s.restingHeartRate}bpm`);
  if (s.spo2 != null) parts.push(`SpO2: ${s.spo2.toFixed(1)}%`);
  if (s.avgStress != null) parts.push(`Stress: ${s.avgStress}/100`);
  if (s.weightKg != null) parts.push(`Weight: ${s.weightKg.toFixed(1)}kg | Fat: ${s.bodyFatPct?.toFixed(1) ?? '?'}% | Muscle: ${s.muscleMassKg?.toFixed(1) ?? '?'}kg`);
  if (s.caloriesConsumed != null) parts.push(`Nutrition: ${s.caloriesConsumed}kcal | P: ${s.proteinG ?? '?'}g | C: ${s.carbsG ?? '?'}g | F: ${s.fatG ?? '?'}g | Fiber: ${s.fiberG ?? '?'}g`);
  if (s.waterCups != null) parts.push(`Water: ${s.waterCups} cups`);
  return parts.join(' | ');
}

export async function generateInsights(snapshots: HealthSnapshot[]): Promise<AIInsight> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set in .env.local');

  const userContent = snapshots
    .slice(0, 7)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(formatSnapshot)
    .join('\n');

  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      { role: 'user', content: `Here is my health data for the past week:\n\n${userContent}\n\nPlease give me your analysis and recommendations.` },
    ],
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content?.[0]?.text ?? 'No response received.';

  return {
    text,
    generatedAt: new Date().toISOString(),
    basedOnDays: snapshots.length,
  };
}
