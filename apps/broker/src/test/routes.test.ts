// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { clearAuditEntriesForTests, listAuditEntries } from '../services/audit/auditLog.js';
import { clearStoredRunsForTests } from '../services/runs/runStore.js';
import { clearPersonalAtlassianSettings } from '../services/settings/atlassianSettingsStore.js';
import { clearPersonalLlmSettings } from '../services/settings/llmSettingsStore.js';
import { clearLlmModelCatalogCache } from '../services/llm/modelCatalog.js';

let app: ReturnType<typeof buildApp>;
let stateDir: string;
const originalEnv = {
  AKC_BROKER_STATE_DIR: process.env.AKC_BROKER_STATE_DIR,
  ATLASSIAN_URL: process.env.ATLASSIAN_URL,
  ATLASSIAN_EMAIL: process.env.ATLASSIAN_EMAIL,
  ATLASSIAN_API_TOKEN: process.env.ATLASSIAN_API_TOKEN,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  AKC_ENABLE_LIVE_OPENAI: process.env.AKC_ENABLE_LIVE_OPENAI,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  AKC_ENABLE_LIVE_OPENROUTER: process.env.AKC_ENABLE_LIVE_OPENROUTER,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  AKC_ENABLE_LIVE_ANTHROPIC: process.env.AKC_ENABLE_LIVE_ANTHROPIC
};

beforeAll(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'akc-broker-test-'));
  process.env.AKC_BROKER_STATE_DIR = stateDir;
  delete process.env.ATLASSIAN_URL;
  delete process.env.ATLASSIAN_EMAIL;
  delete process.env.ATLASSIAN_API_TOKEN;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.AKC_ENABLE_LIVE_OPENAI;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
  delete process.env.AKC_ENABLE_LIVE_OPENROUTER;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
  delete process.env.AKC_ENABLE_LIVE_ANTHROPIC;
  app = buildApp();
}, 30_000);

afterEach(() => {
  clearStoredRunsForTests();
  clearAuditEntriesForTests();
  clearPersonalAtlassianSettings();
  clearPersonalLlmSettings();
  clearLlmModelCatalogCache();
  delete process.env.ATLASSIAN_URL;
  delete process.env.ATLASSIAN_EMAIL;
  delete process.env.ATLASSIAN_API_TOKEN;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.AKC_ENABLE_LIVE_OPENAI;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
  delete process.env.AKC_ENABLE_LIVE_OPENROUTER;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
  delete process.env.AKC_ENABLE_LIVE_ANTHROPIC;
  vi.restoreAllMocks();
});

afterAll(async () => {
  await app.close();
  restoreEnv('AKC_BROKER_STATE_DIR', originalEnv.AKC_BROKER_STATE_DIR);
  restoreEnv('ATLASSIAN_URL', originalEnv.ATLASSIAN_URL);
  restoreEnv('ATLASSIAN_EMAIL', originalEnv.ATLASSIAN_EMAIL);
  restoreEnv('ATLASSIAN_API_TOKEN', originalEnv.ATLASSIAN_API_TOKEN);
  restoreEnv('OPENAI_API_KEY', originalEnv.OPENAI_API_KEY);
  restoreEnv('OPENAI_MODEL', originalEnv.OPENAI_MODEL);
  restoreEnv('AKC_ENABLE_LIVE_OPENAI', originalEnv.AKC_ENABLE_LIVE_OPENAI);
  restoreEnv('OPENROUTER_API_KEY', originalEnv.OPENROUTER_API_KEY);
  restoreEnv('OPENROUTER_MODEL', originalEnv.OPENROUTER_MODEL);
  restoreEnv('AKC_ENABLE_LIVE_OPENROUTER', originalEnv.AKC_ENABLE_LIVE_OPENROUTER);
  restoreEnv('ANTHROPIC_API_KEY', originalEnv.ANTHROPIC_API_KEY);
  restoreEnv('CLAUDE_API_KEY', originalEnv.CLAUDE_API_KEY);
  restoreEnv('ANTHROPIC_MODEL', originalEnv.ANTHROPIC_MODEL);
  restoreEnv('AKC_ENABLE_LIVE_ANTHROPIC', originalEnv.AKC_ENABLE_LIVE_ANTHROPIC);
  rmSync(stateDir, { recursive: true, force: true });
}, 30_000);

async function createRun(app: ReturnType<typeof buildApp>, message = 'hello') {
  const created = await app.inject({ method: 'POST', url: '/api/copilot/runs', payload: { message, mode: 'readonly' } });
  const runId = created.json<{ runId: string }>().runId;
  return { runId, actionId: `${runId}_act_003`, streamUrl: created.json<{ streamUrl: string }>().streamUrl };
}

async function saveAtlassianSettingsForAssignedIssues() {
  await app.inject({
    method: 'POST',
    url: '/api/settings/atlassian',
    payload: {
      siteUrl: 'https://example.atlassian.net',
      email: 'user@example.com',
      apiToken: 'token_1234567890',
      jiraProjectAllowlist: ['SCRUM'],
      confluenceSpaceAllowlist: ['AKC']
    }
  });
}

function assignedIssueSearchResponse(): Response {
  return new Response(JSON.stringify({
    issues: [
      {
        key: 'SCRUM-7',
        fields: {
          summary: '나에게 할당된 작업',
          status: { name: 'To Do' },
          assignee: { displayName: 'Broker User' },
          priority: { name: 'High' },
          issuetype: { name: 'Task' },
          updated: '2026-05-30T01:00:00.000+0000',
          project: { key: 'SCRUM' }
        }
      }
    ]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function streamFromText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    }
  });
}

function parseSseDataFrames(body: string): unknown[] {
  return body
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter(Boolean)
    .map((frame) => frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n'))
    .filter(Boolean)
    .map((data) => JSON.parse(data) as unknown);
}

describe('broker routes', () => {
  it('creates a copilot run and exposes a Broker stream URL', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/copilot/runs', payload: { message: 'hello', mode: 'readonly' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ streamUrl: expect.stringContaining('/api/copilot/runs/') });
  }, 30_000);

  it('streams canonical SSE events from the Broker endpoint', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/copilot/runs', payload: { message: 'hello', mode: 'readonly' } });
    const stream = await app.inject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });
    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('event: run.created');
    expect(stream.body).toContain('조회된 데이터가 없습니다');
    expect(stream.body).not.toContain('data: {"type":"tool_plan.created"');
    expect(stream.body).not.toContain('action_review.required');
  }, 30_000);

  it('returns empty history instead of seeded sample runs', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/history' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ runs: [] });
  }, 30_000);

  it('returns broker-owned recommended copilot questions without credentials', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/copilot/suggestions' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      source: 'fallback',
      suggestions: expect.arrayContaining([
        expect.objectContaining({ id: 'assigned-issues', prompt: '나에게 할당된 JIRA 이슈를 조회해줘.', requiresWrite: false }),
        expect.objectContaining({ id: 'due-today', requiresWrite: false }),
        expect.objectContaining({ id: 'recent-updates', requiresWrite: false })
      ])
    });
    expect(response.body).not.toContain('blocked-work');
    expect(response.body).not.toContain('write-comment');
    expect(response.body).not.toContain('막힌 업무 찾기');
    expect(response.body).not.toContain('댓글 작성');
    expect(response.body).not.toContain('token_');
  }, 30_000);

  it('streams real read-only Jira evidence for assigned-issues prompts through the Broker', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(assignedIssueSearchResponse());
    await saveAtlassianSettingsForAssignedIssues();
    const created = await app.inject({ method: 'POST', url: '/api/copilot/runs', payload: { message: '나에게 할당된 이슈들을 조회해줘', mode: 'readonly' } });
    const stream = await app.inject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });
    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('SCRUM-7');
    expect(stream.body).toContain('"origin":"real"');
    expect(stream.body).toContain('"url":"https://example.atlassian.net/browse/SCRUM-7"');
    expect(stream.body).toContain('assignee = currentUser() ORDER BY updated DESC');
    expect(stream.body).toContain('Jira에서 이슈 1개 발견');
    expect(stream.body).not.toContain('action_review.required');
    expect(stream.body).not.toContain('token_1234567890');

    const evidence = parseSseDataFrames(stream.body).find((event): event is { type: 'evidence.found'; sources: Array<{ url: string }> } =>
      typeof event === 'object' && event !== null && 'type' in event && event.type === 'evidence.found'
    );
    expect(evidence?.sources[0]?.url).toBe('https://example.atlassian.net/browse/SCRUM-7');
  }, 30_000);

  it('completes assigned-issues prompts with a no-data answer when Jira returns no issues', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ issues: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await saveAtlassianSettingsForAssignedIssues();
    const created = await app.inject({ method: 'POST', url: '/api/copilot/runs', payload: { message: '나에게 할당된 이슈들을 조회해줘', mode: 'readonly' } });
    const stream = await app.inject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });

    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('Jira에서 이슈 0개 발견');
    expect(stream.body).toContain('조회된 Jira 이슈가 없습니다');
    expect(stream.body).toContain('event: run.completed');
    expect(stream.body).not.toContain('event: evidence.found');
    expect(stream.body).not.toContain('event: report_draft.started');
  }, 30_000);

  it('streams demo Jira and Confluence evidence without credentials or external Atlassian calls', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const created = await app.inject({ method: 'POST', url: '/api/copilot/runs', payload: { message: '나에게 할당된 JIRA 이슈를 조회해줘.', mode: 'mock' } });
    const stream = await app.inject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });

    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('event: tool_plan.created');
    expect(stream.body).toContain('나에게 할당된 Jira 이슈 조회');
    expect(stream.body).toContain('AKC-136');
    expect(stream.body).toContain('NFS-42');
    expect(stream.body).toContain('AX-KB-014');
    expect(stream.body).toContain('AKC-124');
    expect(stream.body).toContain('AX-KB-001');
    expect(stream.body).toContain('실제 Jira나 Confluence에 연결하지 않고');
    expect(stream.body).toContain('"origin":"demo"');
    expect(stream.body).toContain('데모 모드입니다');
    expect(stream.body).toContain('event: run.completed');
    expect(stream.body).not.toContain('Atlassian 연결 정보가 없어');
    expect(stream.body).not.toContain('event: action_review.required');
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);

  it('streams a safe mock demo without calling real Atlassian or LLM providers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const created = await app.inject({
      method: 'POST',
      url: '/api/copilot/runs',
      payload: { message: '인터뷰 시연을 시작해줘', mode: 'mock' }
    });
    const stream = await app.inject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });

    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('데모 모드입니다');
    expect(stream.body).toContain('"origin":"demo"');
    expect(stream.body).toContain('event: tool_plan.created');
    expect(stream.body).toContain('event: evidence.found');
    expect(stream.body).not.toContain('event: action_review.required');
    expect(stream.body).not.toContain('jira_add_comment');
    expect(stream.body).toContain('event: run.completed');
    expect(stream.body).not.toContain('OPENAI_API_KEY');
    expect(stream.body).not.toContain('ATLASSIAN_API_TOKEN');
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);

  it('returns 404 for unknown stream run ids', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/copilot/runs/run_missing/stream' });
    expect(response.statusCode).toBe(404);
  }, 30_000);

  it('does not create seeded Action Review records for normal runs', async () => {
    const { actionId } = await createRun(app);
    const approve = await app.inject({ method: 'POST', url: `/api/copilot/actions/${actionId}/approve`, payload: { approved: true } });
    const cancel = await app.inject({ method: 'POST', url: `/api/copilot/actions/${actionId}/cancel`, payload: { reason: 'No longer needed' } });

    expect(approve.statusCode).toBe(404);
    expect(cancel.statusCode).toBe(404);
    expect(listAuditEntries()).toHaveLength(0);
  }, 30_000);

  it('creates a safe write Action Review without executing Jira writes in readonly mode', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/copilot/runs', payload: { message: 'SCRUM-7에 댓글로 "검토 완료" 남겨줘', mode: 'readonly' } });
    const runId = created.json<{ runId: string }>().runId;
    const actionId = `${runId}_act_jira_comment`;
    const stream = await app.inject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });

    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('event: action_review.required');
    expect(stream.body).toContain('jira_add_comment');
    expect(stream.body).toContain('SCRUM-7');
    expect(stream.body).toContain('현재는 읽기 전용 상태라 승인해도 실제 변경은 하지 않고 기록만 남깁니다.');
    expect(stream.body).not.toContain('Broker');
    expect(stream.body).not.toContain('event: tool.started');

    const approve = await app.inject({
      method: 'POST',
      url: `/api/copilot/actions/${actionId}/approve`,
      payload: { approved: true, inputPreview: { comment: '검토 완료' } }
    });

    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({ status: 'mock_recorded', executed: false });
    expect(listAuditEntries()).toMatchObject([
      expect.objectContaining({
        actionId,
                risk: 'write',
                approvalStatus: 'approved',
                executionResult: 'mock_recorded',
                inputPreview: { comment: '검토 완료' }
      })
    ]);
  }, 30_000);

  it.each([
    ['Jira 이슈 생성', 'Jira 이슈를 생성해줘', 'act_jira_create_issue', 'jira_create_issue'],
    ['Jira 이슈 수정', 'AKC-12 이슈 제목을 수정해줘', 'act_jira_update_issue', 'jira_update_issue'],
    ['Jira 상태 전환', 'AKC-12 상태를 Done으로 전환해줘', 'act_jira_transition', 'jira_transition_issue'],
    ['Confluence 페이지 생성', 'Confluence 페이지를 생성해줘', 'act_confluence_create_page', 'confluence_create_page'],
    ['Confluence 페이지 수정', 'Confluence 문서 내용을 수정해줘', 'act_confluence_update_page', 'confluence_update_page'],
    ['Confluence 댓글', 'Confluence 페이지에 댓글을 남겨줘', 'act_confluence_comment', 'confluence_add_comment']
  ])('creates a safe write Action Review for %s without executing writes in readonly mode', async (_label, message, actionSuffix, tool) => {
    const created = await app.inject({ method: 'POST', url: '/api/copilot/runs', payload: { message, mode: 'readonly' } });
    const runId = created.json<{ runId: string }>().runId;
    const actionId = `${runId}_${actionSuffix}`;
    const stream = await app.inject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });

    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('event: action_review.required');
    expect(stream.body).toContain(`"tool":"${tool}"`);
    expect(stream.body).toContain('현재는 읽기 전용 상태라 승인해도 실제 변경은 하지 않고 기록만 남깁니다.');
    expect(stream.body).not.toContain('Broker');
    expect(stream.body).not.toContain('event: tool.started');

    const approve = await app.inject({
      method: 'POST',
      url: `/api/copilot/actions/${actionId}/approve`,
      payload: { approved: true }
    });

    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({ status: 'mock_recorded', executed: false });
    expect(listAuditEntries()).toContainEqual(expect.objectContaining({
      actionId,
      risk: 'write',
      approvalStatus: 'approved',
      executionResult: 'mock_recorded'
    }));
  }, 30_000);

  it('executes an approved Jira comment through the Broker in sandbox-write mode', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: '10001' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    }));
    await saveAtlassianSettingsForAssignedIssues();
    const created = await app.inject({ method: 'POST', url: '/api/copilot/runs', payload: { message: 'SCRUM-7에 댓글로 "검토 완료" 남겨줘', mode: 'sandbox-write' } });
    const runId = created.json<{ runId: string }>().runId;
    const actionId = `${runId}_act_jira_comment`;

    const stream = await app.inject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });
    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('내용을 확인한 뒤 승인하면 요청한 변경만 진행합니다.');
    expect(stream.body).not.toContain('Broker');

    const approve = await app.inject({
      method: 'POST',
      url: `/api/copilot/actions/${actionId}/approve`,
      payload: { approved: true }
    });

    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({ status: 'executed', executed: true, message: expect.stringContaining('SCRUM-7에 Jira 댓글을 작성했습니다') });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.atlassian.net/rest/api/3/issue/SCRUM-7/comment',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: expect.stringMatching(/^Basic /)
        }),
        body: expect.stringContaining('검토 완료')
      })
    );
    expect(approve.body).not.toContain('token_1234567890');
    expect(listAuditEntries()).toContainEqual(expect.objectContaining({
      actionId,
      risk: 'write',
      approvalStatus: 'approved',
      executionResult: 'executed'
    }));
  }, 30_000);

  it('blocks unsupported approved write tools instead of executing ambiguous writes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await saveAtlassianSettingsForAssignedIssues();
    const created = await app.inject({ method: 'POST', url: '/api/copilot/runs', payload: { message: 'SCRUM-7 상태를 Done으로 전환해줘', mode: 'sandbox-write' } });
    const runId = created.json<{ runId: string }>().runId;
    const actionId = `${runId}_act_jira_transition`;

    const approve = await app.inject({
      method: 'POST',
      url: `/api/copilot/actions/${actionId}/approve`,
      payload: { approved: true }
    });

    expect(approve.statusCode).toBe(400);
    expect(approve.json()).toMatchObject({ status: 'blocked', executed: false, message: expect.stringContaining('현재는 Jira 댓글 작성만 지원합니다') });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listAuditEntries()).toContainEqual(expect.objectContaining({
      actionId,
      risk: 'write',
      approvalStatus: 'blocked',
      executionResult: 'blocked'
    }));
  }, 30_000);

  it('returns 404 for unknown approval action ids', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/copilot/actions/missing/approve', payload: { approved: true } });
    expect(response.statusCode).toBe(404);
  }, 30_000);

  it('does not allow arbitrary browser origins through CORS', async () => {
    const allowed = await app.inject({ method: 'OPTIONS', url: '/api/history', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' } });
    const fallbackAllowed = await app.inject({ method: 'OPTIONS', url: '/api/history', headers: { origin: 'http://localhost:5180', 'access-control-request-method': 'GET' } });
    const denied = await app.inject({ method: 'OPTIONS', url: '/api/history', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(fallbackAllowed.headers['access-control-allow-origin']).toBe('http://localhost:5180');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  }, 30_000);

  it('saves personal Atlassian settings server-side without returning the token', async () => {
    const payload = {
      siteUrl: 'https://example.atlassian.net',
      email: 'user@example.com',
      apiToken: 'token_1234567890',
      jiraProjectAllowlist: ['AKC', 'NFS'],
      confluenceSpaceAllowlist: ['AKC']
    };

    const save = await app.inject({ method: 'POST', url: '/api/settings/atlassian', payload });
    expect(save.statusCode).toBe(200);
    expect(save.body).not.toContain(payload.apiToken);
    expect(save.json()).toMatchObject({
      status: {
        mcpConnected: false,
        mcpConnectionState: 'configured',
        atlassian: {
          source: 'personal',
          configured: true,
          siteUrl: payload.siteUrl,
          email: payload.email,
          tokenConfigured: true,
          allowedJiraProjects: ['AKC', 'NFS'],
          allowedConfluenceSpaces: ['AKC']
        }
      }
    });

    const status = await app.inject({ method: 'GET', url: '/api/settings/status' });
    expect(status.statusCode).toBe(200);
    expect(status.body).not.toContain(payload.apiToken);
    expect(status.json().atlassian).toMatchObject({ source: 'personal', configured: true, tokenConfigured: true });
  }, 30_000);

  it('does not silently persist an environment Atlassian token as a personal token', async () => {
    process.env.ATLASSIAN_URL = 'https://env.atlassian.net';
    process.env.ATLASSIAN_EMAIL = 'env@example.com';
    process.env.ATLASSIAN_API_TOKEN = 'env_token_1234567890';

    const save = await app.inject({
      method: 'POST',
      url: '/api/settings/atlassian',
      payload: {
        siteUrl: 'https://example.atlassian.net',
        email: 'user@example.com',
        jiraProjectAllowlist: ['AKC'],
        confluenceSpaceAllowlist: ['AKC']
      }
    });

    expect(save.statusCode).toBe(400);
    expect(save.body).not.toContain('env_token_1234567890');
    const status = await app.inject({ method: 'GET', url: '/api/settings/status' });
    expect(status.json().atlassian).toMatchObject({ source: 'environment', configured: true, siteUrl: 'https://env.atlassian.net' });
  }, 30_000);

  it('tests saved Atlassian settings and stores validation state without returning the token', async () => {
    const token = 'token_1234567890';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ accountId: 'abc123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    await app.inject({
      method: 'POST',
      url: '/api/settings/atlassian',
      payload: {
        siteUrl: 'https://example.atlassian.net',
        email: 'user@example.com',
        apiToken: token,
        jiraProjectAllowlist: ['AKC'],
        confluenceSpaceAllowlist: ['AKC']
      }
    });

    const test = await app.inject({ method: 'POST', url: '/api/settings/atlassian/test' });

    expect(test.statusCode).toBe(200);
    expect(test.body).not.toContain(token);
    expect(test.json()).toMatchObject({
      ok: true,
      status: {
        mcpConnected: true,
        mcpConnectionState: 'connected',
        atlassian: {
          source: 'personal',
          connectionState: 'connected',
          connected: true,
          lastValidatedAt: expect.any(String)
        }
      }
    });
  }, 30_000);

  it('keeps Atlassian connection test provider details and tokens out of failed responses', async () => {
    const token = 'token_1234567890';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: `bad token ${token}` }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    }));
    await app.inject({
      method: 'POST',
      url: '/api/settings/atlassian',
      payload: {
        siteUrl: 'https://example.atlassian.net',
        email: 'user@example.com',
        apiToken: token,
        jiraProjectAllowlist: ['AKC'],
        confluenceSpaceAllowlist: ['AKC']
      }
    });

    const test = await app.inject({ method: 'POST', url: '/api/settings/atlassian/test' });

    expect(test.statusCode).toBe(200);
    expect(test.body).not.toContain(token);
    expect(test.body).not.toContain('bad token');
    expect(test.json()).toMatchObject({
      ok: false,
      message: 'Atlassian 연결 테스트가 실패했습니다. 상태 401.',
      status: {
        mcpConnected: false,
        mcpConnectionState: 'failed',
        atlassian: {
          source: 'personal',
          connectionState: 'failed',
          lastError: 'Atlassian 연결 테스트가 실패했습니다. 상태 401.'
        }
      }
    });
  }, 30_000);

  it('clears personal Atlassian settings from the Broker', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/settings/atlassian',
      payload: {
        siteUrl: 'https://example.atlassian.net',
        email: 'user@example.com',
        apiToken: 'token_1234567890',
        jiraProjectAllowlist: ['AKC'],
        confluenceSpaceAllowlist: ['AKC']
      }
    });

    const clear = await app.inject({ method: 'DELETE', url: '/api/settings/atlassian' });
    expect(clear.statusCode).toBe(200);
    expect(clear.json()).toMatchObject({
      status: {
        mcpConnectionState: 'not_configured',
        atlassian: { source: 'none', configured: false, tokenConfigured: false }
      }
    });
  }, 30_000);

  it('saves personal OpenAI, Claude, and OpenRouter LLM settings without returning API keys', async () => {
    const openAiKey = 'sk-openai-personal-secret';
    const openAi = await app.inject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: openAiKey, model: 'gpt-4.1-mini', enabled: true } });
    expect(openAi.statusCode).toBe(200);
    expect(openAi.body).not.toContain(openAiKey);
    expect(openAi.json()).toMatchObject({ status: { llm: { provider: 'openai', source: 'personal', configured: true, keyConfigured: true, model: 'gpt-4.1-mini' } } });

    const anthropicKey = 'sk-ant-personal-secret';
    const anthropic = await app.inject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'anthropic', apiKey: anthropicKey, model: 'claude-3-5-sonnet-latest', enabled: true } });
    expect(anthropic.statusCode).toBe(200);
    expect(anthropic.body).not.toContain(anthropicKey);
    expect(anthropic.json()).toMatchObject({ status: { llm: { provider: 'anthropic', source: 'personal', configured: true, keyConfigured: true, model: 'claude-3-5-sonnet-latest' } } });

    const openRouterKey = 'sk-or-personal-secret';
    const openRouter = await app.inject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openrouter', apiKey: openRouterKey, model: 'openrouter/auto', enabled: true } });
    expect(openRouter.statusCode).toBe(200);
    expect(openRouter.body).not.toContain(openRouterKey);
    expect(openRouter.json()).toMatchObject({ status: { llm: { provider: 'openrouter', source: 'personal', configured: true, keyConfigured: true, model: 'openrouter/auto' } } });
  }, 30_000);

  it('clears LLM settings without clearing saved Atlassian settings', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/settings/atlassian',
      payload: {
        siteUrl: 'https://example.atlassian.net',
        email: 'user@example.com',
        apiToken: 'token_1234567890',
        jiraProjectAllowlist: ['AKC'],
        confluenceSpaceAllowlist: ['AKC']
      }
    });
    await app.inject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: 'sk-openai-personal-secret', enabled: true } });

    const clear = await app.inject({ method: 'DELETE', url: '/api/settings/llm' });
    expect(clear.statusCode).toBe(200);
    expect(clear.json()).toMatchObject({
      status: {
        atlassian: { source: 'personal', configured: true, tokenConfigured: true },
        llm: { provider: 'mock', source: 'none', configured: false, keyConfigured: false }
      }
    });
    expect(clear.body).not.toContain('token_1234567890');
    expect(clear.body).not.toContain('sk-openai-personal-secret');
  }, 30_000);

  it('tests saved LLM settings through the Broker and stores sanitized validation state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'resp_test' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await app.inject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: 'sk-openai-personal-secret', enabled: true } });

    const test = await app.inject({ method: 'POST', url: '/api/settings/llm/test' });
    expect(test.statusCode).toBe(200);
    expect(test.body).not.toContain('sk-openai-personal-secret');
    expect(test.json()).toMatchObject({ ok: true, provider: 'openai', status: { llm: { connected: true, connectionState: 'connected' } } });
  }, 30_000);

  it('tests saved OpenRouter settings through the Broker with chat completion headers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'router_test' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await app.inject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openrouter', apiKey: 'sk-or-personal-secret', enabled: true } });

    const test = await app.inject({ method: 'POST', url: '/api/settings/llm/test' });

    expect(test.statusCode).toBe(200);
    expect(test.body).not.toContain('sk-or-personal-secret');
    expect(test.json()).toMatchObject({ ok: true, provider: 'openrouter', status: { llm: { connected: true, connectionState: 'connected', model: 'openrouter/auto' } } });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-or-personal-secret',
          'HTTP-Referer': expect.any(String),
          'X-OpenRouter-Title': 'Atlassian Copilot'
        })
      })
    );
  }, 30_000);

  it('keeps provider error details out of failed LLM connection tests', async () => {
    const secret = 'sk-or-personal-secret';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: `quota failed for ${secret}` } }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    }));
    await app.inject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openrouter', apiKey: secret, enabled: true } });

    const test = await app.inject({ method: 'POST', url: '/api/settings/llm/test' });

    expect(test.statusCode).toBe(200);
    expect(test.body).not.toContain(secret);
    expect(test.body).not.toContain('quota failed');
    expect(test.json()).toMatchObject({ ok: false, provider: 'openrouter', message: 'OpenRouter 연결 테스트가 실패했습니다. 상태 429.' });
    expect(test.json().status.llm.lastError).toBe('OpenRouter 연결 테스트가 실패했습니다. 상태 429.');
  }, 30_000);

  it('supports OpenRouter environment fallback only when explicitly enabled', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-env-secret';
    process.env.OPENROUTER_MODEL = 'openai/gpt-4.1-mini';
    process.env.AKC_ENABLE_LIVE_OPENROUTER = 'false';

    const configured = await app.inject({ method: 'GET', url: '/api/settings/status' });
    expect(configured.json()).toMatchObject({ llm: { provider: 'openrouter', source: 'environment', configured: true, enabled: false, connected: false, model: 'openai/gpt-4.1-mini' } });

    process.env.AKC_ENABLE_LIVE_OPENROUTER = 'true';
    const enabled = await app.inject({ method: 'GET', url: '/api/settings/status' });
    expect(enabled.json()).toMatchObject({ llm: { provider: 'openrouter', source: 'environment', configured: true, enabled: true, connected: true } });

    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.AKC_ENABLE_LIVE_OPENROUTER;
  }, 30_000);

  it('rejects LLM connection tests when no enabled provider is configured', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const test = await app.inject({ method: 'POST', url: '/api/settings/llm/test' });

    expect(test.statusCode).toBe(409);
    expect(test.json()).toMatchObject({
      ok: false,
      provider: 'mock',
      error: expect.stringContaining('테스트할 수 있는 개인 OpenAI, Claude 또는 OpenRouter 제공자가 없습니다'),
      status: { llm: { provider: 'mock', configured: false, enabled: false, connected: false } }
    });
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);

  it('returns fallback model options without calling providers when OpenAI credentials are absent', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const response = await app.inject({ method: 'GET', url: '/api/settings/llm/providers/openai/models' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: 'openai',
      source: 'fallback',
      defaultModel: 'gpt-4.1-mini',
      manualEntryAllowed: true,
      cache: { status: 'disabled', ttlSeconds: 0 },
      warning: expect.stringContaining('저장된 API 키가 없어')
    });
    expect(response.body).not.toContain('OPENAI_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);

  it('fetches and caches normalized OpenAI model catalogs through the Broker only', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      object: 'list',
      data: [
        { id: 'gpt-4.1-mini', object: 'model', created: 1_716_000_000, owned_by: 'openai' },
        { id: 'text-embedding-3-small', object: 'model', created: 1_716_000_000, owned_by: 'openai' }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await app.inject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: 'sk-openai-personal-secret', model: 'gpt-4.1-mini', enabled: true } });

    const first = await app.inject({ method: 'GET', url: '/api/settings/llm/providers/openai/models' });
    const second = await app.inject({ method: 'GET', url: '/api/settings/llm/providers/openai/models' });
    const refreshed = await app.inject({ method: 'GET', url: '/api/settings/llm/providers/openai/models?refresh=true' });

    expect(first.statusCode).toBe(200);
    expect(first.body).not.toContain('sk-openai-personal-secret');
    expect(first.json()).toMatchObject({
      provider: 'openai',
      source: 'personal',
      selectedModel: 'gpt-4.1-mini',
      models: [expect.objectContaining({ id: 'gpt-4.1-mini', provider: 'openai', recommended: true })],
      cache: { status: 'miss', ttlSeconds: 3600 }
    });
    expect(first.body).not.toContain('text-embedding-3-small');
    expect(second.json()).toMatchObject({ cache: { status: 'hit' } });
    expect(refreshed.json()).toMatchObject({ cache: { status: 'miss' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-openai-personal-secret' })
      })
    );
  }, 30_000);

  it('returns sanitized fallback warnings when provider catalog fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'sk-openai-personal-secret leaked provider detail' } }), { status: 500 }));
    await app.inject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: 'sk-openai-personal-secret', model: 'gpt-4.1-mini', enabled: true } });

    const response = await app.inject({ method: 'GET', url: '/api/settings/llm/providers/openai/models' });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('sk-openai-personal-secret');
    expect(response.json()).toMatchObject({
      provider: 'openai',
      source: 'fallback',
      manualEntryAllowed: true,
      warning: '모델 목록을 불러오지 못했습니다. 직접 입력할 수 있습니다.'
    });
  }, 30_000);

  it('uses the public OpenRouter catalog path without browser-visible credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [
        {
          id: 'openrouter/auto',
          name: 'OpenRouter Auto',
          description: 'Auto router',
          context_length: 128000,
          architecture: { input_modalities: ['text'], output_modalities: ['text'] },
          top_provider: { max_completion_tokens: 8192 },
          supported_parameters: ['tools'],
          pricing: { prompt: '0', completion: '0' }
        }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const response = await app.inject({ method: 'GET', url: '/api/settings/llm/providers/openrouter/models' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: 'openrouter',
      source: 'public',
      models: [expect.objectContaining({ id: 'openrouter/auto', contextWindow: 128000, supportedParameters: ['tools'] })],
      cache: { status: 'miss', ttlSeconds: 21600 }
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models?output_modalities=text',
      expect.objectContaining({ method: 'GET', headers: {} })
    );
  }, 30_000);

  it('does not test or record validation for disabled saved LLM settings', async () => {
    const secret = 'sk-disabled-openai-secret';
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await app.inject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: secret, model: 'gpt-4.1-mini', enabled: false } });

    const test = await app.inject({ method: 'POST', url: '/api/settings/llm/test' });

    expect(test.statusCode).toBe(409);
    expect(test.body).not.toContain(secret);
    expect(test.json()).toMatchObject({
      ok: false,
      provider: 'openai',
      error: expect.stringContaining('비활성 상태'),
      status: {
        llm: {
          provider: 'openai',
          source: 'personal',
          configured: true,
          enabled: false,
          connected: false,
          connectionState: 'configured'
        }
      }
    });
    expect(test.json().status.llm.lastValidatedAt).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);

  it('streams configured OpenAI deltas through the Copilot SSE endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/rest/api/3/search/jql')) return assignedIssueSearchResponse();
      if (url === 'https://api.openai.com/v1/responses') return new Response(streamFromText('data: {"type":"response.output_text.delta","delta":"OpenAI provider summary"}\n\ndata: {"type":"response.completed"}\n\n'), { status: 200 });
      return new Response('not found', { status: 404 });
    });
    await app.inject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: 'sk-openai-personal-secret', model: 'gpt-4.1-mini', enabled: true } });
    await saveAtlassianSettingsForAssignedIssues();
    const { streamUrl } = await createRun(app, '나에게 할당된 이슈들을 조회해줘');

    const stream = await app.inject({ method: 'GET', url: streamUrl });
    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('OpenAI provider summary');
    expect(stream.body).toContain('event: run.completed');
  }, 30_000);

  it('terminates Copilot runs as failed when a configured LLM stream fails without leaking provider details', async () => {
    const secret = 'sk-openai-personal-secret';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/rest/api/3/search/jql')) return assignedIssueSearchResponse();
      if (url === 'https://api.openai.com/v1/responses') return new Response(streamFromText(`data: {"type":"response.failed","error":{"message":"quota failed for ${secret}"}}\n\n`), { status: 200 });
      return new Response('not found', { status: 404 });
    });
    await app.inject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: secret, model: 'gpt-4.1-mini', enabled: true } });
    await saveAtlassianSettingsForAssignedIssues();
    const { streamUrl } = await createRun(app, '나에게 할당된 이슈들을 조회해줘');

    const stream = await app.inject({ method: 'GET', url: streamUrl });

    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('event: llm.failed');
    expect(stream.body).toContain('event: run.failed');
    expect(stream.body).not.toContain('event: run.completed');
    expect(stream.body).not.toContain('report_draft.started');
    expect(stream.body).not.toContain(secret);
    expect(stream.body).not.toContain('quota failed');
  }, 30_000);

  it('streams configured Claude deltas through the Copilot SSE endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/rest/api/3/search/jql')) return assignedIssueSearchResponse();
      if (url === 'https://api.anthropic.com/v1/messages') return new Response(streamFromText('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude provider summary"}}\n\ndata: {"type":"message_stop"}\n\n'), { status: 200 });
      return new Response('not found', { status: 404 });
    });
    await app.inject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'anthropic', apiKey: 'sk-ant-personal-secret', model: 'claude-3-5-sonnet-latest', enabled: true } });
    await saveAtlassianSettingsForAssignedIssues();
    const { streamUrl } = await createRun(app, '나에게 할당된 이슈들을 조회해줘');

    const stream = await app.inject({ method: 'GET', url: streamUrl });
    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('Claude provider summary');
    expect(stream.body).toContain('event: run.completed');
  }, 30_000);

  it('streams configured OpenRouter deltas through the Copilot SSE endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/rest/api/3/search/jql')) return assignedIssueSearchResponse();
      if (url === 'https://openrouter.ai/api/v1/chat/completions') return new Response(streamFromText('data: {"choices":[{"delta":{"content":"OpenRouter provider summary"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'), { status: 200 });
      return new Response('not found', { status: 404 });
    });
    await app.inject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openrouter', apiKey: 'sk-or-personal-secret', model: 'openrouter/auto', enabled: true } });
    await saveAtlassianSettingsForAssignedIssues();
    const { streamUrl } = await createRun(app, '나에게 할당된 이슈들을 조회해줘');

    const stream = await app.inject({ method: 'GET', url: streamUrl });
    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('OpenRouter provider summary');
    expect(stream.body).toContain('event: run.completed');
  }, 30_000);
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
