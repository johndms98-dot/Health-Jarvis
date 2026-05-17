import { GARMIN_PROXY } from '../../constants/Config';
import { HealthSnapshot, AIInsight } from '../models/HealthSnapshot';

// Calls the /insights endpoint on the Mac proxy, which forwards to Ollama (llama3.1:8b).
// Completely free — runs locally on your Mac, no API key needed.
export async function generateInsights(snapshots: HealthSnapshot[]): Promise<AIInsight> {
  const res = await fetch(`${GARMIN_PROXY}/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshots: snapshots.slice(0, 7), model: 'llama3.1:8b' }),
    signal: AbortSignal.timeout(120_000), // Ollama can take up to ~60s on first run
  });

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
