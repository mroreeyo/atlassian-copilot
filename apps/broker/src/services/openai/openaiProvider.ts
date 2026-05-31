import type { AtlassianSource, CopilotSseEvent } from '@akc/shared';
import { streamMockSummary } from '../llm/mockAdapter.js';
import { streamOpenAiSummary } from '../llm/openaiAdapter.js';

export interface OpenAiProviderStatus {
  connected: boolean;
  reason?: string;
}

export function getOpenAiStatus(env = process.env): OpenAiProviderStatus {
  if (!env.OPENAI_API_KEY) return { connected: false, reason: 'OPENAI_API_KEY missing; local no-data summary used.' };
  if (env.AKC_ENABLE_LIVE_OPENAI !== 'true') {
    return { connected: false, reason: 'AKC_ENABLE_LIVE_OPENAI is not true; local no-data summary used even when OPENAI_API_KEY exists.' };
  }
  return { connected: true };
}

export async function* streamGroundedSummary(question: string, env = process.env, sources: AtlassianSource[] = []): AsyncGenerator<CopilotSseEvent> {
  const messageId = 'msg_openai_001';
  const status = getOpenAiStatus(env);
  if (!status.connected) {
    yield* streamMockSummary({ question, sources, messageId });
    return;
  }

  yield* streamOpenAiSummary(
    { question, sources, messageId },
    {
      provider: 'openai',
      apiKey: env.OPENAI_API_KEY as string,
      model: env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
      source: 'environment'
    }
  );
}
