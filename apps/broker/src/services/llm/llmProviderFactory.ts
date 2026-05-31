import type { LlmRuntimeConfig } from '../settings/llmSettingsStore.js';
import { testAnthropicConnection, streamAnthropicSummary } from './anthropicAdapter.js';
import { testOpenAiConnection, streamOpenAiSummary } from './openaiAdapter.js';
import { testOpenRouterConnection, streamOpenRouterSummary } from './openrouterAdapter.js';
import type { GroundedSummaryInput, LlmSummaryEvent, LlmTestResult } from './types.js';

export async function* streamConfiguredLlmSummary(input: GroundedSummaryInput, config: LlmRuntimeConfig): AsyncGenerator<LlmSummaryEvent> {
  if (config.provider === 'openai') yield* streamOpenAiSummary(input, config);
  else if (config.provider === 'openrouter') yield* streamOpenRouterSummary(input, config);
  else yield* streamAnthropicSummary(input, config);
}

export async function testConfiguredLlmConnection(config: LlmRuntimeConfig): Promise<LlmTestResult> {
  if (config.provider === 'openai') return testOpenAiConnection(config);
  if (config.provider === 'openrouter') return testOpenRouterConnection(config);
  return testAnthropicConnection(config);
}
