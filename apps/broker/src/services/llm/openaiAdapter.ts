import { buildSourceBundle, extractCitedSourceIds } from '../openai/sourceBundle.js';
import type { LlmRuntimeConfig } from '../settings/llmSettingsStore.js';
import { providerHttpFailureMessage, providerNetworkFailureMessage, providerStreamFailureMessage } from './providerErrors.js';
import { createProviderTimeout, fetchWithProviderTimeout, readAbortableStream } from './providerTimeout.js';
import type { GroundedSummaryInput, LlmSummaryEvent, LlmTestResult } from './types.js';

interface ResponsesStreamEvent {
  type?: string;
  delta?: string;
  text?: string;
  error?: { message?: string } | string;
}

export async function* streamOpenAiSummary(input: GroundedSummaryInput, config: LlmRuntimeConfig): AsyncGenerator<LlmSummaryEvent> {
  const messageId = input.messageId ?? 'msg_llm_001';
  yield { type: 'llm.started', messageId };

  const bundle = buildSourceBundle(input.question, input.sources);
  let generatedText = '';
  const timeout = createProviderTimeout(process.env, input.signal);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({ model: config.model, input: bundle.prompt, stream: true, store: false }),
      signal: timeout.signal
    });

    if (!response.ok || !response.body) {
      yield { type: 'llm.failed', messageId, error: providerHttpFailureMessage('openai', response.status, '요약 요청') };
      return;
    }

    let completed = false;
    try {
      for await (const event of readOpenAiResponsesStream(response.body, timeout.signal)) {
        if (event.type === 'response.output_text.delta' && event.delta) {
          generatedText += event.delta;
          yield { type: 'llm.delta', messageId, text: event.delta };
          continue;
        }
        if (event.type === 'response.completed' || event.type === 'response.output_text.done') {
          completed = true;
          continue;
        }
        if (event.type === 'response.failed' || event.type === 'error') {
          yield { type: 'llm.failed', messageId, error: responseErrorMessage(event) };
          return;
        }
      }
    } catch {
      yield { type: 'llm.failed', messageId, error: providerStreamFailureMessage('openai') };
      return;
    }

    if (!completed) {
      yield { type: 'llm.failed', messageId, error: 'OpenAI stream ended before a completion event.' };
      return;
    }
    yield { type: 'llm.completed', messageId, confidence: 'high', citationSourceIds: extractCitedSourceIds(generatedText, bundle.sourceIds), reviewRequired: true };
  } finally {
    timeout.clear();
  }
}

export async function testOpenAiConnection(config: LlmRuntimeConfig): Promise<LlmTestResult> {
  try {
    const response = await fetchWithProviderTimeout('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({ model: config.model, input: 'Reply with OK for an Atlassian Copilot connection test.', max_output_tokens: 16, store: false })
    });
    if (!response.ok) return { ok: false, message: providerHttpFailureMessage('openai', response.status) };
    return { ok: true, message: 'OpenAI 연결 테스트를 통과했습니다.' };
  } catch {
    return { ok: false, message: providerNetworkFailureMessage('openai') };
  }
}

export async function* readOpenAiResponsesStream(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<ResponsesStreamEvent> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of readAbortableStream(body, signal)) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const event = parseOpenAiResponsesSsePart(part);
      if (event !== 'done') yield event;
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    const event = parseOpenAiResponsesSsePart(buffer);
    if (event !== 'done') yield event;
  }
}

export function parseOpenAiResponsesSsePart(part: string): ResponsesStreamEvent | 'done' {
  const data = part
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim();
  if (!data || data === '[DONE]') return 'done';
  try {
    return JSON.parse(data) as ResponsesStreamEvent;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(`OpenAI stream emitted malformed JSON: ${message}`, { cause: error });
  }
}

function responseErrorMessage(event: ResponsesStreamEvent): string {
  if (event.error) return providerStreamFailureMessage('openai');
  return 'OpenAI 응답 스트림이 실패했습니다.';
}
