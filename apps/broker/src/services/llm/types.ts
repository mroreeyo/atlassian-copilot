import type { AtlassianSource, CopilotSseEvent } from '@akc/shared';
import type { LlmRuntimeConfig } from '../settings/llmSettingsStore.js';

export interface GroundedSummaryInput {
  question: string;
  sources: AtlassianSource[];
  messageId?: string;
  signal?: AbortSignal;
}

export interface LlmTestResult {
  ok: boolean;
  message: string;
}

export type LlmSummaryEvent = Extract<CopilotSseEvent, { type: 'llm.started' | 'llm.delta' | 'llm.completed' | 'llm.failed' }>;

export interface LlmProviderAdapter {
  streamSummary(input: GroundedSummaryInput, config: LlmRuntimeConfig): AsyncGenerator<LlmSummaryEvent>;
  testConnection(config: LlmRuntimeConfig): Promise<LlmTestResult>;
}
