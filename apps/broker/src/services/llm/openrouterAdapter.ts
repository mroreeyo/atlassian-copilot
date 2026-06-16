import { buildSourceBundle, extractCitedSourceIds } from '../openai/sourceBundle.js';
import type { LlmRuntimeConfig } from '../settings/llmSettingsStore.js';
import { providerHttpFailureMessage, providerNetworkFailureMessage, providerStreamFailureMessage } from './providerErrors.js';
import { createProviderTimeout, fetchWithProviderTimeout, readAbortableStream } from './providerTimeout.js';
import type { GroundedSummaryInput, LlmSummaryEvent, LlmTestResult } from './types.js';

interface OpenRouterChatStreamEvent {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
    error?: { message?: string } | string;
  }>;
  error?: { message?: string } | string;
}

const openRouterChatCompletionsUrl = 'https://openrouter.ai/api/v1/chat/completions';
const openRouterSystemPrompt = 'You are Atlassian Copilot. Use only provided Jira/Confluence summaries and cite source IDs.';

export async function* streamOpenRouterSummary(input: GroundedSummaryInput, config: LlmRuntimeConfig): AsyncGenerator<LlmSummaryEvent> {
  const messageId = input.messageId ?? 'msg_llm_001';
  yield { type: 'llm.started', messageId };

  const bundle = buildSourceBundle(input.question, input.sources);
  let generatedText = '';
  const timeout = createProviderTimeout(process.env, input.signal);
  try {
    const response = await fetch(openRouterChatCompletionsUrl, {
      method: 'POST',
      headers: openRouterHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: openRouterSystemPrompt },
          { role: 'user', content: bundle.prompt }
        ],
        stream: true
      }),
      signal: timeout.signal
    });

    if (!response.ok || !response.body) {
      yield { type: 'llm.failed', messageId, error: providerHttpFailureMessage('openrouter', response.status, '요약 요청') };
      return;
    }

    let completed = false;
    for await (const event of readOpenRouterChatStream(response.body, timeout.signal)) {
      if (event === 'done') {
        completed = true;
        continue;
      }

      const topLevelError = openRouterErrorMessage(event.error);
      if (topLevelError) {
        yield { type: 'llm.failed', messageId, error: topLevelError };
        return;
      }

      for (const choice of event.choices ?? []) {
        const choiceError = openRouterErrorMessage(choice.error);
        if (choiceError) {
          yield { type: 'llm.failed', messageId, error: choiceError };
          return;
        }
        if (choice.delta?.content) {
          generatedText += choice.delta.content;
          yield { type: 'llm.delta', messageId, text: choice.delta.content };
        }
        if (choice.finish_reason) {
          if (choice.finish_reason === 'error') {
            yield { type: 'llm.failed', messageId, error: 'OpenRouter stream terminated with finish_reason=error.' };
            return;
          }
          completed = true;
        }
      }
    }

    if (!completed) {
      yield { type: 'llm.failed', messageId, error: 'OpenRouter stream ended before a completion marker.' };
      return;
    }
    yield { type: 'llm.completed', messageId, confidence: 'high', citationSourceIds: extractCitedSourceIds(generatedText, bundle.sourceIds), reviewRequired: true };
  } finally {
    timeout.clear();
  }
}

export async function testOpenRouterConnection(config: LlmRuntimeConfig): Promise<LlmTestResult> {
  try {
    const response = await fetchWithProviderTimeout(openRouterChatCompletionsUrl, {
      method: 'POST',
      headers: openRouterHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Reply with OK for an Atlassian Copilot connection test.' }],
        max_tokens: 16,
        stream: false
      })
    });
    if (!response.ok) return { ok: false, message: providerHttpFailureMessage('openrouter', response.status) };
    return { ok: true, message: 'OpenRouter 연결 테스트를 통과했습니다.' };
  } catch {
    return { ok: false, message: providerNetworkFailureMessage('openrouter') };
  }
}

export async function* readOpenRouterChatStream(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<OpenRouterChatStreamEvent | 'done'> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of readAbortableStream(body, signal)) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const event = parseOpenRouterChatSsePart(part);
      if (event) yield event;
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    const event = parseOpenRouterChatSsePart(buffer);
    if (event) yield event;
  }
}

export function parseOpenRouterChatSsePart(part: string): OpenRouterChatStreamEvent | 'done' | null {
  const data = part
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim();
  if (!data) return null;
  if (data === '[DONE]') return 'done';
  try {
    return JSON.parse(data) as OpenRouterChatStreamEvent;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(`OpenRouter stream emitted malformed JSON: ${message}`, { cause: error });
  }
}

function openRouterHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER?.trim() || process.env.OPENROUTER_SITE_URL?.trim() || 'http://localhost:5180',
    'X-OpenRouter-Title': process.env.OPENROUTER_APP_TITLE?.trim() || 'Atlassian Copilot'
  };
}

function openRouterErrorMessage(error: OpenRouterChatStreamEvent['error']): string | null {
  if (!error) return null;
  return providerStreamFailureMessage('openrouter');
}
