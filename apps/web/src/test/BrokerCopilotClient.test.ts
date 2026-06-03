import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockRunEvents, mockHistory, mockSettingsStatus } from '@akc/shared/mock';
import { approveAction, cancelAction, clearAtlassianSettings, clearLlmSettings, createCopilotRun, decodeSseFrames, getCopilotSuggestions, getHistory, getLlmProviderModels, getSettingsStatus, saveAtlassianSettings, saveLlmSettings, streamCopilotEvents, testAtlassianSettings, testLlmSettings } from '../services/copilot/brokerCopilotClient';
import { clearMemoryCsrfToken, setMemoryCsrfToken } from '../services/auth/csrfToken';

function toSse(events: unknown[]): string {
  return events.map((event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}

function responseFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const body = {
    getReader() {
      return {
        async read() {
          if (index >= chunks.length) return { done: true, value: undefined };
          return { done: false, value: encoder.encode(chunks[index++]) };
        }
      };
    }
  } as unknown as ReadableStream<Uint8Array>;

  return { ok: true, status: 200, body } as Response;
}

function expectCsrfHeader(init: RequestInit | undefined, value: string): void {
  expect(init?.headers).toMatchObject({ 'X-CSRF-Token': value });
}

describe('Broker Copilot client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    clearMemoryCsrfToken();
  });

  it('decodes Broker SSE framing into canonical events', () => {
    const events = decodeSseFrames(toSse(createMockRunEvents('run_sse')));
    expect(events[0]).toMatchObject({ type: 'run.created', runId: 'run_sse' });
    expect(events.map((event) => event.type)).toContain('action_review.required');
  });

  it('creates a run and streams events over the Broker HTTP/SSE boundary', async () => {
    setMemoryCsrfToken('csrf-run-create');
    const streamBody = toSse(createMockRunEvents('run_http'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/copilot/runs') && init?.method === 'POST') {
        expect(init.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-run-create' });
        return new Response(JSON.stringify({ runId: 'run_http', streamUrl: '/api/copilot/runs/run_http/stream' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.endsWith('/api/copilot/runs/run_http/stream')) {
        return new Response(streamBody, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }
      return new Response('not found', { status: 404 });
    });

    setMemoryCsrfToken('csrf-run-create-memory-only');
    const run = await createCopilotRun({ message: 'hello', mode: 'readonly' });
    const streamed = [];
    for await (const event of streamCopilotEvents(run.streamUrl)) streamed.push(event);

    expect(fetchMock).toHaveBeenCalledWith('/api/copilot/runs', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-run-create-memory-only' })
    }));
    expect(streamed.map((event) => event.type)).toContain('run.completed');
    expect(streamed.map((event) => event.type)).not.toContain('report_draft.completed');
  });

  it('handles chunked SSE frames without losing events', async () => {
    const body = toSse(createMockRunEvents('run_chunked'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseFromChunks([body.slice(0, 25), body.slice(25, 140), body.slice(140)]));
    const streamed = [];
    for await (const event of streamCopilotEvents('/api/copilot/runs/run_chunked/stream')) streamed.push(event);
    expect(streamed[0]).toMatchObject({ type: 'run.created', runId: 'run_chunked' });
    expect(streamed.at(-1)).toMatchObject({ type: 'run.completed' });
  });

  it('rejects malformed SSE data', () => {
    expect(() => decodeSseFrames('event: run.created\ndata: {bad json}\n\n')).toThrow();
    expect(() => decodeSseFrames('event: run.created\n\n')).toThrow('SSE frame missing data');
  });

  it('fetches copilot suggestions through the relative Broker endpoint with shared schemas', async () => {
    const payload = {
      source: 'fallback',
      suggestions: [
        { id: 'assigned-issues', label: '내 할당 이슈', prompt: '나에게 할당된 JIRA 이슈를 조회해줘.', category: 'jira', requiresConnection: true, requiresWrite: false },
        { id: 'due-today', label: '오늘 마감', prompt: '오늘까지 끝내야 할 이슈들이 있어?', category: 'jira', requiresConnection: true, requiresWrite: false }
      ],
      message: '기본 추천 질문을 표시합니다.'
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

    await expect(getCopilotSuggestions()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith('/api/copilot/suggestions', expect.objectContaining({
      headers: { Accept: 'application/json' }
    }));
  });

  it('fetches history and settings through Broker endpoints with shared schemas', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/history')) return new Response(JSON.stringify(mockHistory), { status: 200 });
      if (url.endsWith('/api/settings/status')) return new Response(JSON.stringify(mockSettingsStatus), { status: 200 });
      return new Response('not found', { status: 404 });
    });
    await expect(getHistory()).resolves.toEqual(mockHistory);
    await expect(getSettingsStatus()).resolves.toEqual(mockSettingsStatus);
    expect(fetchMock).toHaveBeenCalledWith('/api/history', expect.anything());
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/status', expect.anything());
  });

  it('fetches recommended copilot questions through the Broker endpoint', async () => {
    const response = {
      source: 'fallback',
      suggestions: [
        {
          id: 'assigned-issues',
          label: '내 할당 이슈',
          prompt: '나에게 할당된 JIRA 이슈를 조회해줘.',
          category: 'jira',
          requiresConnection: true,
          requiresWrite: false
        }
      ]
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));

    await expect(getCopilotSuggestions()).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith('/api/copilot/suggestions', expect.anything());
  });

  it('saves and clears Atlassian settings through Broker-only endpoints', async () => {
    setMemoryCsrfToken('csrf-atlassian-settings');
    const saved = {
      status: {
        ...mockSettingsStatus,
        mcpConnectionState: 'configured',
        atlassian: {
          ...mockSettingsStatus.atlassian,
          source: 'personal',
          connectionState: 'configured',
          configured: true,
          connected: false,
          siteUrl: 'https://example.atlassian.net',
          email: 'user@example.com',
          tokenConfigured: true,
          statusMessage: 'saved'
        }
      },
      message: 'saved'
    };
    const tested = {
      status: {
        ...saved.status,
        mcpConnected: true,
        mcpConnectionState: 'connected',
        atlassian: {
          ...saved.status.atlassian,
          connectionState: 'connected',
          connected: true,
          statusMessage: 'connected',
          lastValidatedAt: '2026-05-30T06:00:00.000Z'
        }
      },
      ok: true,
      message: 'Atlassian connected'
    };
    const cleared = { status: mockSettingsStatus, message: 'cleared' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/settings/atlassian') && init?.method === 'POST') {
        expectCsrfHeader(init, 'csrf-atlassian-settings');
        expect(init.body).toContain('token_1234567890');
        return new Response(JSON.stringify(saved), { status: 200 });
      }
      if (url.endsWith('/api/settings/atlassian/test') && init?.method === 'POST') {
        expectCsrfHeader(init, 'csrf-atlassian-settings');
        return new Response(JSON.stringify(tested), { status: 200 });
      }
      if (url.endsWith('/api/settings/atlassian') && init?.method === 'DELETE') {
        expectCsrfHeader(init, 'csrf-atlassian-settings');
        return new Response(JSON.stringify(cleared), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    await expect(saveAtlassianSettings({
      siteUrl: 'https://example.atlassian.net',
      email: 'user@example.com',
      apiToken: 'token_1234567890',
      jiraProjectAllowlist: ['AKC'],
      confluenceSpaceAllowlist: ['AKC']
    })).resolves.toEqual(saved);
    await expect(testAtlassianSettings()).resolves.toEqual(tested);
    await expect(clearAtlassianSettings()).resolves.toEqual(cleared);
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/atlassian', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/atlassian/test', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/atlassian', expect.objectContaining({ method: 'DELETE' }));
  });

  it('saves, tests, and clears LLM settings through Broker-only endpoints', async () => {
    setMemoryCsrfToken('csrf-llm-settings');
    const saved = {
      status: {
        ...mockSettingsStatus,
        llm: {
          provider: 'openrouter',
          source: 'personal',
          connectionState: 'configured',
          configured: true,
          connected: false,
          enabled: true,
          keyConfigured: true,
          model: 'openrouter/auto',
          statusMessage: 'saved'
        }
      },
      message: 'saved'
    };
    const tested = { ...saved, provider: 'openrouter', ok: true, message: 'OpenRouter connection test passed.' };
    const cleared = { status: mockSettingsStatus, message: 'cleared' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/settings/llm') && init?.method === 'POST') {
        expectCsrfHeader(init, 'csrf-llm-settings');
        expect(init.body).toContain('sk-or-personal-secret');
        return new Response(JSON.stringify(saved), { status: 200 });
      }
      if (url.endsWith('/api/settings/llm/test') && init?.method === 'POST') {
        expectCsrfHeader(init, 'csrf-llm-settings');
        return new Response(JSON.stringify(tested), { status: 200 });
      }
      if (url.endsWith('/api/settings/llm') && init?.method === 'DELETE') {
        expectCsrfHeader(init, 'csrf-llm-settings');
        return new Response(JSON.stringify(cleared), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    await expect(saveLlmSettings({ provider: 'openrouter', apiKey: 'sk-or-personal-secret', model: 'openrouter/auto', enabled: true })).resolves.toEqual(saved);
    await expect(testLlmSettings()).resolves.toEqual(tested);
    await expect(clearLlmSettings()).resolves.toEqual(cleared);
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/llm', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/llm/test', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/llm', expect.objectContaining({ method: 'DELETE' }));
  });

  it('sends CSRF headers for action review approve and cancel mutations', async () => {
    setMemoryCsrfToken('csrf-action-review');
    const approved = { actionId: 'act_1', status: 'mock_recorded', executed: false, message: 'recorded' };
    const cancelled = { actionId: 'act_1', status: 'cancelled', executed: false, reason: '사용자가 작업 검토에서 취소했습니다.' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/copilot/actions/act_1/approve') && init?.method === 'POST') {
        expectCsrfHeader(init, 'csrf-action-review');
        return new Response(JSON.stringify(approved), { status: 200 });
      }
      if (url.endsWith('/api/copilot/actions/act_1/cancel') && init?.method === 'POST') {
        expectCsrfHeader(init, 'csrf-action-review');
        return new Response(JSON.stringify(cancelled), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    await expect(approveAction('act_1')).resolves.toEqual(approved);
    await expect(cancelAction('act_1')).resolves.toEqual(cancelled);
    expect(fetchMock).toHaveBeenCalledWith('/api/copilot/actions/act_1/approve', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/copilot/actions/act_1/cancel', expect.objectContaining({ method: 'POST' }));
  });

  it('fetches provider model catalogs only through the relative Broker endpoint', async () => {
    const responsePayload = {
      provider: 'openrouter',
      source: 'public',
      defaultModel: 'openrouter/auto',
      selectedModel: 'openrouter/auto',
      models: [
        {
          id: 'openrouter/auto',
          label: 'OpenRouter Auto',
          provider: 'openrouter',
          recommended: true
        }
      ],
      manualEntryAllowed: true,
      cache: { status: 'miss', ttlSeconds: 21600, fetchedAt: '2026-05-30T06:00:00.000Z' }
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

    await expect(getLlmProviderModels('openrouter', true)).resolves.toMatchObject({
      provider: 'openrouter',
      models: [expect.objectContaining({ id: 'openrouter/auto' })],
      manualEntryAllowed: true
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/llm/providers/openrouter/models?refresh=true', expect.objectContaining({
      headers: { Accept: 'application/json' }
    }));
  });

  it('surfaces Broker LLM test errors without parsing failed responses as success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'OpenAI settings are saved but disabled.' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' }
    }));

    await expect(testLlmSettings()).rejects.toThrow('OpenAI settings are saved but disabled.');
  });

  it('rejects absolute or non-Copilot stream URLs from Broker responses', async () => {
    const badUrls = [
      'https://evil.example/sse',
      '//evil.example/sse',
      '/api/history',
      '/api/copilot/runs/run_123/events',
      '/api/copilot/runs//stream',
      '/api/copilot/runs/run_123/stream/extra'
    ];
    for (const url of badUrls) {
      await expect((async () => {
        for await (const _event of streamCopilotEvents(url)) {
          // no-op
        }
      })()).rejects.toThrow('잘못된 응답 스트림 경로');
    }
  });

  it('rejects browser Broker base URLs that embed credentials or auth query values', async () => {
    const unsafeBaseUrls = [
      '//broker.example',
      'https://user:pass@broker.example',
      'https://broker.example?token=secret',
      'https://broker.example?api_key=secret',
      'https://broker.example?apiKey=secret',
      'https://broker.example?accessToken=secret',
      'https://broker.example?oauthToken=secret',
      'https://broker.example?jwt=secret',
      'https://broker.example?locale=ko'
    ];

    for (const unsafeBaseUrl of unsafeBaseUrls) {
      vi.resetModules();
      vi.stubEnv('VITE_BROKER_BASE_URL', unsafeBaseUrl);
      await expect(import('../services/copilot/brokerCopilotClient')).rejects.toThrow('브라우저 Broker URL');
      vi.unstubAllEnvs();
    }
  });
});
