// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { runReadOnlyMcpTool } from '../services/mcp/mcpClient.js';
import { getOpenAiStatus, streamGroundedSummary } from '../services/openai/openaiProvider.js';
import { buildSourceBundle } from '../services/openai/sourceBundle.js';
import { streamAnthropicSummary } from '../services/llm/anthropicAdapter.js';
import { parseOpenRouterChatSsePart, streamOpenRouterSummary } from '../services/llm/openrouterAdapter.js';

function streamFromText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    }
  });
}

describe('broker integration guards', () => {
  it('skips MCP smoke safely when credentials are absent', async () => {
    const result = await runReadOnlyMcpTool('jira_search', 'test', {});
    expect(result.status).toBe('skipped');
    expect(result.sources).toHaveLength(0);
    expect(result.reason).toContain('Atlassian 연결 정보가 없어 조회를 실행하지 않았습니다');
  });

  it('uses Broker-only Jira read transport when Atlassian credentials are present', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      issues: [
        {
          key: 'AKC-1',
          fields: {
            summary: 'Assigned issue',
            status: { name: 'In Progress' },
            assignee: { displayName: 'Test User' },
            priority: { name: 'Medium' },
            issuetype: { name: 'Task' },
            updated: '2026-05-30T01:00:00.000+0000',
            project: { key: 'AKC' }
          }
        }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await runReadOnlyMcpTool('jira_search', 'test', {
      atlassianUrl: 'https://example.atlassian.net',
      atlassianEmail: 'test@example.com',
      atlassianToken: 'fake-token',
      allowedJiraProjects: ['AKC']
    });
    expect(result.status).toBe('ok');
    expect(result.sources[0]).toMatchObject({
      id: 'AKC-1',
      title: 'Assigned issue',
      sourceType: 'jira',
      origin: 'real',
      url: 'https://example.atlassian.net/browse/AKC-1',
      metadata: { jira: { key: 'AKC-1', projectKey: 'AKC' } }
    });
    expect(result.query).toContain('project in (AKC)');
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(String((init?.headers as Record<string, string>)?.Authorization)).toMatch(/^Basic /);
    expect(JSON.stringify(result)).not.toContain('fake-token');
    vi.restoreAllMocks();
  });

  it('uses Broker-only Confluence read transport and returns canonical page URLs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      results: [
        {
          id: '123',
          title: 'Runbook',
          type: 'page',
          space: { key: 'AKC', name: 'Atlassian Demo' },
          version: { when: '2026-05-30T01:00:00.000Z' },
          body: { view: { value: '<p>SSO 점검 절차</p>' } },
          _links: { webui: '/wiki/spaces/AKC/pages/123/Runbook' }
        }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await runReadOnlyMcpTool('confluence_search', 'type = page', {
      atlassianUrl: 'https://example.atlassian.net',
      atlassianEmail: 'test@example.com',
      atlassianToken: 'fake-token',
      allowedConfluenceSpaces: ['AKC']
    });

    expect(result.status).toBe('ok');
    expect(result.sources[0]).toMatchObject({
      id: '123',
      title: 'Runbook',
      sourceType: 'confluence',
      origin: 'real',
      url: 'https://example.atlassian.net/wiki/spaces/AKC/pages/123/Runbook',
      metadata: { confluence: { pageId: '123', spaceKey: 'AKC', contentType: 'page' } }
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/wiki/rest/api/content/search?'), expect.any(Object));
    expect(JSON.stringify(result)).not.toContain('fake-token');
    vi.restoreAllMocks();
  });

  it('keeps raw site URLs out of LLM answer text while preserving linkable source records', async () => {
    const sources = [
      {
        id: 'AKC-1',
        sourceType: 'jira',
        origin: 'real',
        title: 'Assigned issue',
        summary: '상태: In Progress',
        relevanceScore: 96,
        url: 'https://example.atlassian.net/browse/AKC-1',
        actionId: 'act_jira',
        retrievedAt: '2026-05-30T01:00:00.000Z',
        metadata: { jira: { key: 'AKC-1', projectKey: 'AKC' } }
      },
      {
        id: '123',
        sourceType: 'confluence',
        origin: 'real',
        title: 'Runbook',
        summary: 'SSO 점검 절차',
        relevanceScore: 92,
        url: 'https://example.atlassian.net/wiki/spaces/AKC/pages/123',
        actionId: 'act_conf',
        retrievedAt: '2026-05-30T01:00:00.000Z',
        metadata: { confluence: { pageId: '123', spaceKey: 'AKC', contentType: 'page' } }
      }
    ] as const;
    const bundle = buildSourceBundle('링크를 포함해 요약해줘', [...sources]);
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    expect(bundle.prompt).toContain('Source ID: AKC-1');
    expect(bundle.prompt).toContain('Title: Assigned issue');
    expect(bundle.prompt).toContain('Do not print raw site URLs');
    expect(bundle.prompt).not.toContain('https://example.atlassian.net');

    const events = [];
    for await (const event of streamGroundedSummary('링크를 포함해 요약해줘', {}, [...sources])) events.push(event);

    expect(events).toContainEqual(expect.objectContaining({
      type: 'llm.delta',
      text: expect.stringContaining('AKC-1: Assigned issue')
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'llm.delta',
      text: expect.stringContaining('123: Runbook')
    }));
    expect(JSON.stringify(events)).not.toContain('https://example.atlassian.net');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('sanitizes Atlassian read failures without leaking credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ errorMessages: ['Unauthorized'] }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    const result = await runReadOnlyMcpTool('jira_search', 'assignee = currentUser()', {
      atlassianUrl: 'https://example.atlassian.net',
      atlassianEmail: 'test@example.com',
      atlassianToken: 'fake-token',
      allowedJiraProjects: ['AKC']
    });
    expect(result.status).toBe('failed');
    expect(result.reason).toContain('status 401');
    expect(JSON.stringify(result)).not.toContain('fake-token');
    vi.restoreAllMocks();
  });

  it('fails closed when Jira allowlist is configured but the returned issue has no project key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      issues: [
        {
          key: 'AKC-2',
          fields: {
            summary: 'Missing project key',
            status: { name: 'To Do' }
          }
        }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const result = await runReadOnlyMcpTool('jira_search', 'assignee = currentUser()', {
      atlassianUrl: 'https://example.atlassian.net',
      atlassianEmail: 'test@example.com',
      atlassianToken: 'fake-token',
      allowedJiraProjects: ['AKC']
    });
    expect(result.status).toBe('failed');
    expect(result.reason).toContain('허용 범위');
    expect(result.sources).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it('fails closed when Confluence allowlist is configured but the returned page has no space key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      results: [
        {
          id: '123',
          title: 'Missing space key',
          type: 'page',
          body: { view: { value: '<p>content</p>' } }
        }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const result = await runReadOnlyMcpTool('confluence_search', 'type = page', {
      atlassianUrl: 'https://example.atlassian.net',
      atlassianEmail: 'test@example.com',
      atlassianToken: 'fake-token',
      allowedConfluenceSpaces: ['AKC']
    });
    expect(result.status).toBe('failed');
    expect(result.reason).toContain('허용 범위');
    expect(result.sources).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it('streams mock OpenAI summary when key is absent', async () => {
    const events = [];
    for await (const event of streamGroundedSummary('test', {})) events.push(event);
    expect(events.map((event) => event.type)).toContain('llm.completed');
  });

  it('keeps live OpenAI disabled unless the explicit non-P0 gate is enabled', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const events = [];
    for await (const event of streamGroundedSummary('test', { OPENAI_API_KEY: 'fake' })) events.push(event);
    expect(getOpenAiStatus({ OPENAI_API_KEY: 'fake' })).toMatchObject({ connected: false });
    expect(getOpenAiStatus({ OPENAI_API_KEY: 'fake', AKC_ENABLE_LIVE_OPENAI: 'true' })).toEqual({ connected: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(events.map((event) => event.type)).toContain('llm.completed');
    vi.restoreAllMocks();
  });

  it('maps OpenAI provider failure events to llm.failed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamFromText('data: {"type":"response.failed","error":{"message":"provider failed sk-openai-personal-secret"}}\n\n'), { status: 200 }));
    const events = [];
    for await (const event of streamGroundedSummary('test', { OPENAI_API_KEY: 'fake', AKC_ENABLE_LIVE_OPENAI: 'true' })) events.push(event);
    expect(events).toContainEqual(expect.objectContaining({ type: 'llm.failed', error: expect.stringContaining('OpenAI 응답 스트림이 실패했습니다') }));
    expect(JSON.stringify(events)).not.toContain('sk-openai-personal-secret');
    vi.restoreAllMocks();
  });

  it('maps malformed OpenAI stream JSON to llm.failed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamFromText('data: {bad json}\n\n'), { status: 200 }));
    const events = [];
    for await (const event of streamGroundedSummary('test', { OPENAI_API_KEY: 'fake', AKC_ENABLE_LIVE_OPENAI: 'true' })) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: 'llm.failed' });
    vi.restoreAllMocks();
  });

  it('completes OpenAI stream only after a completion marker', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamFromText('data: {"type":"response.output_text.delta","delta":"hello"}\n\ndata: {"type":"response.completed"}\n\n'), { status: 200 }));
    const events = [];
    for await (const event of streamGroundedSummary('test', { OPENAI_API_KEY: 'fake', AKC_ENABLE_LIVE_OPENAI: 'true' })) events.push(event);
    expect(events).toContainEqual(expect.objectContaining({ type: 'llm.delta', text: 'hello' }));
    expect(events.at(-1)).toMatchObject({ type: 'llm.completed' });
    vi.restoreAllMocks();
  });

  it('maps Anthropic content block deltas to canonical LLM events', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamFromText('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"claude hello"}}\n\ndata: {"type":"message_stop"}\n\n'), { status: 200 }));
    const events = [];
    for await (const event of streamAnthropicSummary({ question: 'test', sources: [] }, { provider: 'anthropic', apiKey: 'fake', model: 'claude-3-5-sonnet-latest', source: 'personal' })) events.push(event);
    expect(events).toContainEqual(expect.objectContaining({ type: 'llm.delta', text: 'claude hello' }));
    expect(events.at(-1)).toMatchObject({ type: 'llm.completed' });
    vi.restoreAllMocks();
  });

  it('maps OpenRouter chat completion deltas to canonical LLM events', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamFromText(': OPENROUTER PROCESSING\n\ndata: {"choices":[{"delta":{"content":"router hello"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'), { status: 200 }));
    const events = [];
    for await (const event of streamOpenRouterSummary({ question: 'test', sources: [] }, { provider: 'openrouter', apiKey: 'fake', model: 'openrouter/auto', source: 'personal' })) events.push(event);
    expect(events).toContainEqual(expect.objectContaining({ type: 'llm.delta', text: 'router hello' }));
    expect(events.at(-1)).toMatchObject({ type: 'llm.completed' });
    vi.restoreAllMocks();
  });

  it('maps OpenRouter stream error events to llm.failed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamFromText('data: {"error":{"message":"router failed sk-or-personal-secret"},"choices":[{"finish_reason":"error"}]}\n\n'), { status: 200 }));
    const events = [];
    for await (const event of streamOpenRouterSummary({ question: 'test', sources: [] }, { provider: 'openrouter', apiKey: 'fake', model: 'openrouter/auto', source: 'personal' })) events.push(event);
    expect(events).toContainEqual(expect.objectContaining({ type: 'llm.failed', error: expect.stringContaining('OpenRouter 응답 스트림이 실패했습니다') }));
    expect(JSON.stringify(events)).not.toContain('sk-or-personal-secret');
    vi.restoreAllMocks();
  });

  it('ignores OpenRouter stream comment frames and rejects malformed JSON', () => {
    expect(parseOpenRouterChatSsePart(': OPENROUTER PROCESSING')).toBeNull();
    expect(() => parseOpenRouterChatSsePart('data: {bad json}')).toThrow('OpenRouter stream emitted malformed JSON');
  });
});
