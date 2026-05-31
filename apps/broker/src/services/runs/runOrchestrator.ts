import type { AtlassianSource, CopilotSseEvent, ReadOnlyTool, ToolActionPlan } from '@akc/shared';
import { fictionalSources } from '@akc/shared/mock';
import { streamConfiguredLlmSummary } from '../llm/llmProviderFactory.js';
import { streamMockSummary } from '../llm/mockAdapter.js';
import { genericLlmStreamFailureMessage } from '../llm/providerErrors.js';
import { readMcpEnvironment, runReadOnlyMcpTool } from '../mcp/mcpClient.js';
import { getLlmRuntimeConfig } from '../settings/llmSettingsStore.js';
import { getStoredRun, type StoredRun } from './runStore.js';

const DEMO_LOADING_SPINNER_EXTRA_MS = 1000;

export function createStoredRunEvents(runId: string): CopilotSseEvent[] {
  const run = getStoredRun(runId);
  if (!run) throw new Error(`Unknown run id: ${runId}`);
  return [
    { type: 'run.created', runId: run.runId, createdAt: run.createdAt },
    { type: 'llm.started', messageId: 'msg_001' },
    { type: 'llm.delta', messageId: 'msg_001', text: noDataMessage(run) },
    { type: 'llm.completed', messageId: 'msg_001', confidence: 'low', citationSourceIds: [], reviewRequired: false },
    { type: 'run.completed', runId: run.runId }
  ];
}

export async function* streamStoredRunEvents(runId: string, env = process.env): AsyncGenerator<CopilotSseEvent> {
  const run = getStoredRun(runId);
  if (!run) throw new Error(`Unknown run id: ${runId}`);
  if (run.mode === 'mock') {
    yield* streamDemoRunEvents(run);
    return;
  }
  if (Object.keys(run.actionReviews).length > 0) {
    yield* streamActionReviewRunEvents(run);
    return;
  }
  if (run.scenario === 'assigned_issues') {
    yield* streamReadOnlyRunEvents(run, env);
    return;
  }
  yield* streamNoDataRunEvents(run);
}

async function* streamDemoRunEvents(run: StoredRun): AsyncGenerator<CopilotSseEvent> {
  yield { type: 'run.created', runId: run.runId, createdAt: run.createdAt };
  const readOnlyActions = run.actions.filter((action): action is ToolActionPlan & { tool: ReadOnlyTool } => isReadOnlyTool(action.tool));
  const actions = readOnlyActions.length > 0 ? readOnlyActions : buildDemoReadActions();
  if (run.actions.length > 0) yield { type: 'tool_plan.created', actions: run.actions };

  const demoSources = fictionalSources.map((source): AtlassianSource => ({
    ...source,
    actionId: run.actionIdMap[source.actionId] ?? source.actionId,
    retrievedAt: new Date().toISOString()
  }));

  for (const action of actions) {
    const tool = action.tool as ReadOnlyTool;
    const sourceCount = demoSources.filter((source) => source.actionId === action.id).length;
    yield { type: 'tool.started', actionId: action.id, tool };
    yield { type: 'tool.completed', actionId: action.id, tool, resultSummary: buildToolResultSummary(tool, sourceCount) };
  }

  yield { type: 'evidence.found', sources: demoSources };
  yield { type: 'llm.started', messageId: 'msg_demo_001' };
  await delay(DEMO_LOADING_SPINNER_EXTRA_MS);
  yield {
    type: 'llm.delta',
    messageId: 'msg_demo_001',
    text: '데모 모드입니다. 실제 Jira나 Confluence에 연결하지 않고 가상 자료로 나에게 할당된 JIRA 이슈 5개와 관련 문서 3개를 확인했습니다.\n\n'
  };
  yield {
    type: 'llm.delta',
    messageId: 'msg_demo_001',
    text: '| 항목 | 상태 | 우선순위 | 핵심 내용 |\n| --- | --- | --- | --- |\n| AKC-124 | 진행 중 | High | SSO 로그인 실패 원인 분리 필요 |\n| AKC-117 | 할 일 | High | NFS 권한 동기화 지연 확인 필요 |\n| NFS-42 | 진행 중 | High | 권한 캐시 재검증 배치 실패 |\n| AKC-136 | 리뷰 대기 | Medium | OpenRouter 모델 선택값 저장 확인 |\n| AKC-141 | 백로그 | Low | 첫 방문 안내 문구 개선 |\n\n'
  };
  yield {
    type: 'llm.delta',
    messageId: 'msg_demo_001',
    text: '우선순위는 AKC-124 → AKC-117/NFS-42 → AKC-136 순서가 적절합니다. AX-KB-001, AX-KB-014, AX-KB-008을 함께 열어 보면 장애 대응 순서와 일일 점검 기준까지 설명할 수 있습니다.'
  };
  yield { type: 'llm.completed', messageId: 'msg_demo_001', confidence: 'high', citationSourceIds: demoSources.map((source) => source.id), reviewRequired: false };

  yield { type: 'run.completed', runId: run.runId };
}

async function* streamActionReviewRunEvents(run: StoredRun): AsyncGenerator<CopilotSseEvent> {
  yield { type: 'run.created', runId: run.runId, createdAt: run.createdAt };
  if (run.actions.length > 0) yield { type: 'tool_plan.created', actions: run.actions };
  for (const action of Object.values(run.actionReviews)) {
    yield { type: 'action_review.required', action };
  }
  yield { type: 'llm.started', messageId: 'msg_001' };
  yield {
    type: 'llm.delta',
    messageId: 'msg_001',
    text: actionReviewSummary(run)
  };
  yield { type: 'llm.completed', messageId: 'msg_001', confidence: 'medium', citationSourceIds: [], reviewRequired: true };
  yield { type: 'run.completed', runId: run.runId };
}

async function* streamReadOnlyRunEvents(run: StoredRun, env = process.env): AsyncGenerator<CopilotSseEvent> {
  yield { type: 'run.created', runId: run.runId, createdAt: run.createdAt };
  if (run.actions.length > 0) yield { type: 'tool_plan.created', actions: run.actions };

  const sources: AtlassianSource[] = [];
  for (const action of run.actions) {
    if (!isReadOnlyTool(action.tool)) {
      yield { type: 'tool.failed', actionId: action.id, tool: action.tool, error: '읽기 전용 실행에서는 write/destructive 도구를 실행하지 않습니다.' };
      yield { type: 'run.failed', runId: run.runId, error: '읽기 전용 실행에서 허용되지 않는 도구가 포함되었습니다.' };
      return;
    }

    yield { type: 'tool.started', actionId: action.id, tool: action.tool };
    const result = await runReadOnlyMcpTool(action.tool, run.actionQueries[action.id] ?? run.message, readMcpEnvironment(env));
    if (result.status === 'skipped') {
      yield { type: 'tool.completed', actionId: action.id, tool: action.tool, resultSummary: result.reason ?? buildToolResultSummary(action.tool, 0) };
      const summaryCompleted = yield* streamNoDataSummary(run, 'msg_001', result.reason);
      if (!summaryCompleted) {
        yield { type: 'run.failed', runId: run.runId, error: genericLlmStreamFailureMessage() };
        return;
      }
      yield { type: 'run.completed', runId: run.runId };
      return;
    }
    if (result.status !== 'ok') {
      const error = result.reason ?? 'Atlassian read-only 조회를 완료하지 못했습니다.';
      yield { type: 'tool.failed', actionId: action.id, tool: action.tool, error };
      yield { type: 'run.failed', runId: run.runId, error };
      return;
    }

    const actionSources = result.sources.map((source) => ({
      ...source,
      actionId: action.id,
      retrievedAt: source.retrievedAt ?? new Date().toISOString()
    }));
    sources.push(...actionSources);
    yield { type: 'tool.completed', actionId: action.id, tool: action.tool, resultSummary: buildToolResultSummary(action.tool, actionSources.length) };
    if (actionSources.length > 0) yield { type: 'evidence.found', sources: actionSources };
  }

  const summaryCompleted = yield* streamSummaryForSources(run, sources, env);
  if (!summaryCompleted) {
    yield { type: 'run.failed', runId: run.runId, error: genericLlmStreamFailureMessage() };
    return;
  }
  yield { type: 'run.completed', runId: run.runId };
}

async function* streamSummaryForSources(run: StoredRun, sources: AtlassianSource[], env = process.env, messageId = 'msg_001'): AsyncGenerator<CopilotSseEvent, boolean> {
  if (sources.length === 0) {
    yield* streamNoDataSummary(run, messageId);
    return true;
  }

  const runtime = getLlmRuntimeConfig(env);
  try {
    const stream = runtime
      ? streamConfiguredLlmSummary({ question: run.message, sources, messageId }, runtime)
      : streamMockSummary({ question: run.message, sources, messageId });
    for await (const event of stream) {
      yield event;
      if (event.type === 'llm.failed') return false;
    }
    return true;
  } catch {
    yield { type: 'llm.failed', messageId, error: genericLlmStreamFailureMessage() };
    return false;
  }
}

async function* streamNoDataRunEvents(run: StoredRun): AsyncGenerator<CopilotSseEvent> {
  yield { type: 'run.created', runId: run.runId, createdAt: run.createdAt };
  yield* streamNoDataSummary(run);
  yield { type: 'run.completed', runId: run.runId };
}

async function* streamNoDataSummary(run: StoredRun, messageId = 'msg_001', detail?: string): AsyncGenerator<CopilotSseEvent, boolean> {
  yield { type: 'llm.started', messageId };
  yield { type: 'llm.delta', messageId, text: noDataMessage(run, detail) };
  yield { type: 'llm.completed', messageId, confidence: 'low', citationSourceIds: [], reviewRequired: false };
  return true;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function noDataMessage(run: StoredRun, detail?: string): string {
  const suffix = detail ? ` ${detail}` : '';
  if (run.scenario === 'assigned_issues') return `조회된 Jira 이슈가 없습니다.${suffix}`;
  return `조회된 데이터가 없습니다. Jira/Confluence 연결 상태 또는 검색 조건을 확인해 주세요.${suffix}`;
}

function actionReviewSummary(run: StoredRun): string {
  if (run.mode === 'sandbox-write') return '아직 실행하지 않았습니다. 내용을 확인한 뒤 승인하면 요청한 변경만 진행합니다.';
  if (run.mode === 'mock') return '시연 모드입니다. 실제 서비스에는 변경하지 않고 승인 흐름만 보여줍니다.';
  return '요청한 변경은 확인할 수 있도록 준비했습니다. 현재는 읽기 전용 상태라 승인해도 실제 변경은 하지 않고 기록만 남깁니다.';
}

function buildToolResultSummary(tool: ReadOnlyTool, sourceCount: number): string {
  if (tool === 'jira_search') return `Jira에서 이슈 ${sourceCount}개 발견`;
  if (tool === 'jira_get_issue') return `Jira에서 이슈 ${sourceCount}개 확인`;
  if (tool === 'confluence_search') return `Confluence에서 문서 ${sourceCount}개 발견`;
  return `Confluence에서 문서 ${sourceCount}개 확인`;
}

function buildDemoReadActions(): Array<ToolActionPlan & { tool: ReadOnlyTool }> {
  return [
    {
      id: 'act_001',
      tool: 'jira_search',
      risk: 'read',
      description: '나에게 할당된 Jira 이슈 조회',
      requiresApproval: false,
      inputPreview: { JQL: 'assignee = currentUser() ORDER BY priority DESC, updated DESC' },
      scope: { label: '내 할당 Jira 이슈 데모 데이터', query: 'assignee = currentUser() ORDER BY priority DESC, updated DESC' }
    },
    {
      id: 'act_002',
      tool: 'confluence_search',
      risk: 'read',
      description: '할당 이슈 관련 문서 조회',
      requiresApproval: false,
      inputPreview: { CQL: 'space = AKC AND text ~ "인증 OR 권한 OR 이슈 점검"' },
      scope: { label: '관련 운영 문서 데모 데이터', query: 'space = AKC AND text ~ "인증 OR 권한 OR 이슈 점검"' }
    }
  ];
}

function isReadOnlyTool(tool: string): tool is ReadOnlyTool {
  return tool === 'jira_search' || tool === 'jira_get_issue' || tool === 'confluence_search' || tool === 'confluence_get_page';
}
