import { GARMIN_PROXY } from '../../constants/Config';
import { HealthSnapshot } from '../models/HealthSnapshot';
import { HealthGoals } from '../models/Goals';
import { DailyBrief } from './AIOptimizationService';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatAction {
  type: 'update_goal';
  field: string;
  value: string | number;
}

export interface ChatResponse {
  reply: string;
  action?: ChatAction | null;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  snapshots: Partial<HealthSnapshot>[],
  goals: HealthGoals,
  brief?: DailyBrief | null,
): Promise<ChatResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(`${GARMIN_PROXY}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        context: {
          snapshots: snapshots.slice(0, 14),
          goals,
          brief: brief ?? undefined,
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail ?? `Chat error ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}
