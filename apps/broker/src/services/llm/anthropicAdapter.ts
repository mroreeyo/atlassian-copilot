import { buildSourceBundle, extractCitedSourceIds } from '../openai/sourceBundle.js';
import type { LlmRuntimeConfig } from '../settings/llmSettingsStore.js';
import { providerHttpFailureMessage, providerNetworkFailureMessage, providerStreamFailureMessage } from './providerErrors.js';
import { createProviderTimeout, fetchWithProviderTimeout, readAbortableStream } from './providerTimeout.js';
import type { GroundedSummaryInput, LlmSummaryEvent, LlmTestResult } from './types.js';

interface AnthropicStreamEvent {
  type?: string;
  delta?: { type?: string; text?: string };
  error?: { message?: string } | string;
}

const anthropicVersion = '2023-06-01';

export async function* streamAnthropicSummary(input: GroundedSummaryInput, config: LlmRuntimeConfig): AsyncGenerator<LlmSummaryEvent> {
  const messageId = input.messageId ?? 'msg_llm_001';
  yield { type: 'llm.started', messageId };

  const bundle = buildSourceBundle(input.question, input.sources);
  let generatedText = '';
  const timeout = createProviderTimeout(process.env, input.signal);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': anthropicVersion
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1024,
        stream: true,
        system: 'You are Atlassian Copilot. Use only provided Jira/Confluence summaries and cite source IDs.',
        messages: [{ role: 'user', content: bundle.prompt }]
      }),
      signal: timeout.signal
    });

    if (!response.ok || !response.body) {
      yield { type: 'llm.failed', messageId, error: providerHttpFailureMessage('anthropic', response.status, '요약 요청') };
      return;
    }

    let completed = false;
    for await (const event of readAnthropicMessagesStream(response.body, timeout.signal)) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        generatedText += event.delta.text;
        yield { type: 'llm.delta', messageId, text: event.delta.text };
        continue;
      }
      if (event.type === 'message_stop') {
        completed = true;
        continue;
      }
      if (event.type === 'error') {
        yield { type: 'llm.failed', messageId, error: anthropicErrorMessage(event) };
        return;
      }
    }

    if (!completed) {
      yield { type: 'llm.failed', messageId, error: 'Claude stream ended before a message_stop event.' };
      return;
    }
    yield { type: 'llm.completed', messageId, confidence: 'high', citationSourceIds: extractCitedSourceIds(generatedText, bundle.sourceIds), reviewRequired: true };
  } finally {
    timeout.clear();
  }
}

export async function testAnthropicConnection(config: LlmRuntimeConfig): Promise<LlmTestResult> {
  try {
    const response = await fetchWithProviderTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': anthropicVersion
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with OK for an Atlassian Copilot connection test.' }]
      })
    });
    if (!response.ok) return { ok: false, message: providerHttpFailureMessage('anthropic', response.status) };
    return { ok: true, message: 'Claude 연결 테스트를 통과했습니다.' };
  } catch {
    return { ok: false, message: providerNetworkFailureMessage('anthropic') };
  }
}

export async function* readAnthropicMessagesStream(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<AnthropicStreamEvent> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of readAbortableStream(body, signal)) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) yield parseAnthropicMessagesSsePart(part);
  }
  buffer += decoder.decode();
  if (buffer.trim()) yield parseAnthropicMessagesSsePart(buffer);
}

export function parseAnthropicMessagesSsePart(part: string): AnthropicStreamEvent {
  const data = part
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim();
  if (!data) return {};
  try {
    return JSON.parse(data) as AnthropicStreamEvent;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(`Claude stream emitted malformed JSON: ${message}`, { cause: error });
  }
}

function anthropicErrorMessage(event: AnthropicStreamEvent): string {
  if (event.error) return providerStreamFailureMessage('anthropic');
  return 'Claude 응답 스트림이 실패했습니다.';
}
