import { describe, expect, it } from 'vitest';
import { AtlassianSourceSchema, CopilotSseEventSchema, LlmProviderModelsResponseSchema, LlmSettingsRequestSchema, SettingsStatusSchema, RunCreateRequestSchema, decideActionExecution, reduceCopilotEvent, initialCopilotRunView } from '../index.js';
import { createMockRunEvents, fictionalSources, mockSettingsStatus } from '../mock.js';

const events = createMockRunEvents('run_test');

describe('shared contracts', () => {
  it('validates the canonical mock SSE event sequence', () => {
    for (const event of events) {
      expect(() => CopilotSseEventSchema.parse(event)).not.toThrow();
    }
  });

  it('rejects non-http source URLs in evidence contracts', () => {
    const source = fictionalSources[0]!;
    expect(() => AtlassianSourceSchema.parse({ ...source, url: 'javascript:alert(1)' })).toThrow();
    expect(() => AtlassianSourceSchema.parse({ ...source, url: 'data:text/html,hello' })).toThrow();
    expect(AtlassianSourceSchema.parse(source).url).toMatch(/^https?:\/\//);
  });

  it('preserves Jira and Confluence URLs through evidence events and run reduction', () => {
    const evidenceEvent = CopilotSseEventSchema.parse({
      type: 'evidence.found',
      sources: fictionalSources
    });
    const runView = reduceCopilotEvent(initialCopilotRunView, evidenceEvent);

    expect(runView.sources.map((source) => source.url)).toEqual([
      'https://example.atlassian.net/browse/AKC-124',
      'https://example.atlassian.net/browse/AKC-117',
      'https://example.atlassian.net/browse/AKC-136',
      'https://example.atlassian.net/browse/NFS-42',
      'https://example.atlassian.net/browse/AKC-141',
      'https://example.atlassian.net/wiki/spaces/AKC/pages/001',
      'https://example.atlassian.net/wiki/spaces/AKC/pages/014',
      'https://example.atlassian.net/wiki/spaces/AKC/pages/008'
    ]);
  });

  it('defaults run mode to readonly', () => {
    expect(RunCreateRequestSchema.parse({ message: 'hello' }).mode).toBe('readonly');
  });

  it('validates provider-neutral LLM settings and status contracts', () => {
    expect(LlmSettingsRequestSchema.parse({ provider: 'openai', apiKey: 'sk-test-key', model: 'gpt-4.1-mini', enabled: true })).toMatchObject({ provider: 'openai', enabled: true });
    expect(LlmSettingsRequestSchema.parse({ provider: 'openrouter', apiKey: 'sk-or-test-key', model: 'openrouter/auto', enabled: true })).toMatchObject({ provider: 'openrouter', enabled: true });
    expect(LlmSettingsRequestSchema.parse({ provider: 'mock', enabled: false })).toMatchObject({ provider: 'mock', enabled: false });
    expect(SettingsStatusSchema.parse(mockSettingsStatus)).toMatchObject({
      atlassian: { connectionState: 'not_configured', connected: false, statusMessage: expect.any(String) },
      llm: { provider: 'mock', keyConfigured: false }
    });
  });

  it('validates normalized provider model catalog responses for each live provider', () => {
    const responses = [
      {
        provider: 'openai',
        source: 'personal',
        defaultModel: 'gpt-4.1-mini',
        selectedModel: 'gpt-4.1-mini',
        models: [
          {
            id: 'gpt-4.1-mini',
            label: 'gpt-4.1-mini',
            provider: 'openai',
            owner: 'openai',
            createdAt: '2026-05-30T06:00:00.000Z',
            recommended: true
          }
        ],
        manualEntryAllowed: true,
        cache: { status: 'miss', ttlSeconds: 3600, fetchedAt: '2026-05-30T06:00:00.000Z' }
      },
      {
        provider: 'anthropic',
        source: 'environment',
        defaultModel: 'claude-3-5-sonnet-latest',
        models: [
          {
            id: 'claude-3-5-sonnet-latest',
            label: 'Claude 3.5 Sonnet',
            provider: 'anthropic',
            createdAt: '2026-05-30T06:00:00.000Z',
            recommended: true
          }
        ],
        manualEntryAllowed: true,
        cache: { status: 'hit', ttlSeconds: 3600, fetchedAt: '2026-05-30T06:00:00.000Z' },
        page: { hasMore: true, firstId: 'claude-3-5-sonnet-latest', lastId: 'claude-3-5-haiku-latest' }
      },
      {
        provider: 'openrouter',
        source: 'public',
        defaultModel: 'openrouter/auto',
        selectedModel: 'anthropic/claude-3.5-sonnet',
        models: [
          {
            id: 'openrouter/auto',
            label: 'OpenRouter Auto',
            provider: 'openrouter',
            description: 'Automatically route to an available text model.',
            contextWindow: 128000,
            maxOutputTokens: 8192,
            inputModalities: ['text'],
            outputModalities: ['text'],
            supportedParameters: ['tools'],
            pricing: { prompt: '0', completion: '0' },
            recommended: true
          }
        ],
        manualEntryAllowed: true,
        cache: { status: 'miss', ttlSeconds: 21600, fetchedAt: '2026-05-30T06:00:00.000Z' },
        page: { hasMore: false, firstId: 'openrouter/auto', lastId: 'openrouter/auto' }
      }
    ];

    const parsed = responses.map((response) => LlmProviderModelsResponseSchema.parse(response));

    expect(parsed.map((response) => response.provider)).toEqual(['openai', 'anthropic', 'openrouter']);
    expect(parsed.every((response) => response.manualEntryAllowed)).toBe(true);
    expect(parsed.flatMap((response) => response.models)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'openrouter/auto', provider: 'openrouter', recommended: true })
    ]));
  });

  it('validates fallback model catalog responses without credentials', () => {
    expect(LlmProviderModelsResponseSchema.parse({
      provider: 'anthropic',
      source: 'fallback',
      defaultModel: 'claude-3-5-sonnet-latest',
      models: [
        {
          id: 'claude-3-5-sonnet-latest',
          label: 'Claude 3.5 Sonnet',
          provider: 'anthropic',
          recommended: true
        }
      ],
      manualEntryAllowed: true,
      cache: {
        status: 'disabled',
        ttlSeconds: 0
      },
      warning: '저장된 API 키가 없어 기본 추천 모델만 표시합니다.'
    })).toMatchObject({
      provider: 'anthropic',
      source: 'fallback',
      manualEntryAllowed: true,
      cache: { status: 'disabled' }
    });
  });
});

describe('copilot reducer', () => {
  it('reduces the full mock flow into a completed assistant view', () => {
    const finalState = events.reduce(reduceCopilotEvent, initialCopilotRunView);
    expect(finalState.status).toBe('completed');
    expect(finalState.sources).toHaveLength(8);
    expect(finalState.sources[0]).toMatchObject({ origin: 'demo', metadata: { jira: { key: 'AKC-124' } } });
    expect(finalState.toolPlan[0]?.scope?.query).toContain('assignee = currentUser()');
    expect(finalState.summaryText).toContain('JIRA 이슈 5개');
    expect(finalState.actionReview?.requiresApproval).toBe(true);
    expect(finalState.actionReviewStatus).toBe('pending');
    expect(finalState.reportDraft).toBeNull();
  });

  it('reduces canonical Action Review resolution into run state', () => {
    const pendingState = events.reduce(reduceCopilotEvent, initialCopilotRunView);
    const resolvedState = reduceCopilotEvent(pendingState, {
      type: 'action_review.resolved',
      actionId: pendingState.actionReview?.id ?? 'missing',
      status: 'mock_recorded',
      message: 'Approval recorded for read-only review.'
    });
    expect(resolvedState.actionReviewStatus).toBe('mock_recorded');
    expect(resolvedState.actionReviewMessage).toBe('Approval recorded for read-only review.');
  });
});

describe('action guard', () => {
  it('blocks destructive actions', () => {
    expect(decideActionExecution({ tool: 'jira_delete_issue', mode: 'sandbox-write', approved: true, sandboxTarget: true })).toMatchObject({ allowed: false, executes: false });
  });

  it('records staged write approvals without execution', () => {
    expect(decideActionExecution({ tool: 'jira_add_comment', mode: 'readonly', approved: true })).toMatchObject({ allowed: true, executes: false });
  });

  it('allows approved non-destructive writes in sandbox-write mode', () => {
    expect(decideActionExecution({ tool: 'jira_add_comment', mode: 'sandbox-write', approved: true })).toMatchObject({ allowed: true, executes: true });
  });

  it('allows read-only tools to execute through the server path', () => {
    expect(decideActionExecution({ tool: 'jira_search', mode: 'readonly' })).toMatchObject({ allowed: true, executes: true });
  });
});
