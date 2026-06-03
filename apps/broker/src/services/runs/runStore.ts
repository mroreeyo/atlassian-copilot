import type { ActionApprovalResponse, ActionCancelResponse, ActionReviewRequest, RunMode, ToolActionPlan, WriteTool } from '@akc/shared';
import { mockToolPlan } from '@akc/shared/mock';

export type StoredActionStatus = 'pending' | 'approved' | 'blocked' | 'cancelled';
export type RunScenario =
  | 'empty'
  | 'assigned_issues'
  | 'write_jira_create_issue'
  | 'write_jira_update_issue'
  | 'write_jira_add_comment'
  | 'write_jira_transition_issue'
  | 'write_confluence_create_page'
  | 'write_confluence_update_page'
  | 'write_confluence_add_comment';

export interface StoredActionResolution {
  status: StoredActionStatus;
  response?: ActionApprovalResponse | ActionCancelResponse;
  updatedAt?: string;
}

export interface StoredRun {
  runId: string;
  message: string;
  mode: RunMode;
  scenario: RunScenario;
  actionIdMap: Record<string, string>;
  actions: ToolActionPlan[];
  actionQueries: Record<string, string>;
  actionReviews: Record<string, ActionReviewRequest>;
  actionResolutions: Record<string, StoredActionResolution>;
  createdAt: string;
  userId?: string | null | undefined;
}


const runs = new Map<string, StoredRun>();

export function storeRun(run: { runId: string; message: string; mode: RunMode; userId?: string | null | undefined }): StoredRun {
  const scenario = detectRunScenario(run.message);
  const plan = run.mode === 'mock' ? buildDemoActionPlan() : buildActionPlan(scenario, run.message);
  const actionIdMap = Object.fromEntries(plan.actions.map((action) => [action.id, `${run.runId}_${action.id}`]));
  const actions = plan.actions.map((action) => ({ ...action, id: actionIdMap[action.id] ?? action.id }));
  const actionQueries = Object.fromEntries(Object.entries(plan.actionQueries).map(([actionId, query]) => [actionIdMap[actionId] ?? actionId, query]));
  const actionReviews = Object.fromEntries(Object.entries(plan.actionReviews).map(([actionId, action]) => {
    const id = actionIdMap[actionId] ?? action.id;
    return [id, { ...action, id }];
  }));
  const stored: StoredRun = {
    ...run,
    scenario,
    actionIdMap,
    actions,
    actionQueries,
    actionReviews,
    actionResolutions: Object.fromEntries(Object.keys(actionReviews).map((id) => [id, { status: 'pending' as const }])),
    createdAt: new Date().toISOString()
  };
  runs.set(run.runId, stored);
  return stored;
}

function buildDemoActionPlan(): { actions: ToolActionPlan[]; actionQueries: Record<string, string>; actionReviews: Record<string, ActionReviewRequest> } {
  const readOnlyDemoActions: ToolActionPlan[] = [
    {
      ...mockToolPlan[0]!,
      description: '나에게 할당된 Jira 이슈 조회',
      inputPreview: { JQL: 'assignee = currentUser() ORDER BY priority DESC, updated DESC' },
      scope: { label: '내 할당 Jira 이슈 데모 데이터', query: 'assignee = currentUser() ORDER BY priority DESC, updated DESC' }
    },
    {
      ...mockToolPlan[1]!,
      description: '할당 이슈 관련 문서 조회',
      inputPreview: { CQL: 'space = AKC AND text ~ "인증 OR 권한 OR 이슈 점검"' },
      scope: { label: '관련 운영 문서 데모 데이터', query: 'space = AKC AND text ~ "인증 OR 권한 OR 이슈 점검"' }
    }
  ];
  return {
    actions: readOnlyDemoActions,
    actionQueries: {
      act_001: readOnlyDemoActions[0]?.scope?.query ?? 'assignee = currentUser() ORDER BY priority DESC, updated DESC',
      act_002: readOnlyDemoActions[1]?.scope?.query ?? 'space = AKC AND text ~ "인증 OR 권한 OR 이슈 점검"'
    },
    actionReviews: {}
  };
}

export function getStoredRun(runId: string, userId?: string | null): StoredRun | undefined {
  const run = runs.get(runId);
  if (!run) return undefined;
  if (userId === undefined) return run;
  if (run.userId && run.userId !== userId) return undefined;
  return run;
}

export function findActionReview(actionId: string, userId?: string | null): { run: StoredRun; action: ActionReviewRequest; resolution: StoredActionResolution } | undefined {
  for (const run of runs.values()) {
    if (run.userId && run.userId !== userId) continue;
    const action = run.actionReviews[actionId];
    if (action) return { run, action, resolution: run.actionResolutions[actionId] ?? { status: 'pending' } };
  }
  return undefined;
}

export function resolveAction(run: StoredRun, actionId: string, resolution: StoredActionResolution): void {
  run.actionResolutions[actionId] = { ...resolution, updatedAt: new Date().toISOString() };
}

export function clearStoredRunsForTests(): void {
  runs.clear();
}

function detectRunScenario(message: string): RunScenario {
  const normalized = message.toLowerCase();
  const writeScenario = detectWriteScenario(message, normalized);
  if (writeScenario) return writeScenario;

  const asksForAssignedIssues =
    /(나|내|본인|me|my).*(할당|assigned|assignee|이슈|issue)/i.test(message) ||
    /(할당|assigned|assignee).*(나|내|본인|me|my|이슈|issue)/i.test(message);
  if (asksForAssignedIssues || (normalized.includes('assigned') && normalized.includes('issue'))) return 'assigned_issues';
  return 'empty';
}

function detectWriteScenario(message: string, normalized: string): RunScenario | null {
  const hasJiraTarget = /(jira|지라|이슈|issue|티켓|ticket|스크럼|scrum-\d+|[A-Z][A-Z0-9]+-\d+)/i.test(message);
  const hasConfluenceTarget = /(confluence|컨플루언스|페이지|문서|page|space|스페이스)/i.test(message);
  const asksForComment =
    /(댓글|comment|코멘트).*(달|작성|추가|남겨|초안|draft|add|create|write|post)/i.test(message) ||
    /(달|작성|추가|남겨|초안|add|create|write|post).*(댓글|comment|코멘트)/i.test(message);
  const asksForTransition = /(상태|status|전환|transition|완료|done|진행|progress|해결|resolve|닫|close).*(바꿔|변경|전환|이동|해줘|처리|mark|move|set)/i.test(message) ||
    /(바꿔|변경|전환|이동|처리|mark|move|set).*(상태|status|완료|done|진행|progress|해결|resolve|닫|close)/i.test(message);
  const asksForCreate = /(생성|새|신규|만들|작성|create|new|open).*(이슈|issue|티켓|ticket|페이지|문서|page)/i.test(message) ||
    /(이슈|issue|티켓|ticket|페이지|문서|page).*(생성|새|신규|만들|작성|create|new|open)/i.test(message);
  const asksForUpdate = /(수정|업데이트|변경|편집|갱신|update|edit|change).*(이슈|issue|티켓|ticket|페이지|문서|page|제목|본문|내용|상태)/i.test(message) ||
    /(이슈|issue|티켓|ticket|페이지|문서|page|제목|본문|내용|상태).*(수정|업데이트|변경|편집|갱신|update|edit|change)/i.test(message);
  const hasWriteVerb = /(작성|생성|수정|업데이트|변경|추가|남겨|달|전환|이동|처리|create|update|edit|change|add|post|transition|move|set)/i.test(message);

  if (asksForComment && hasConfluenceTarget) return 'write_confluence_add_comment';
  if (asksForComment) return 'write_jira_add_comment';
  if (asksForTransition && hasJiraTarget) return 'write_jira_transition_issue';
  if (asksForCreate && hasConfluenceTarget) return 'write_confluence_create_page';
  if (asksForUpdate && hasConfluenceTarget) return 'write_confluence_update_page';
  if (asksForCreate && hasJiraTarget) return 'write_jira_create_issue';
  if (asksForUpdate && hasJiraTarget) return 'write_jira_update_issue';
  if (hasWriteVerb && hasConfluenceTarget && normalized.includes('comment')) return 'write_confluence_add_comment';
  if (hasWriteVerb && hasConfluenceTarget) return 'write_confluence_update_page';
  if (hasWriteVerb && hasJiraTarget) return 'write_jira_update_issue';
  return null;
}

function buildActionPlan(scenario: RunScenario, message: string): { actions: ToolActionPlan[]; actionQueries: Record<string, string>; actionReviews: Record<string, ActionReviewRequest> } {
  if (scenario === 'assigned_issues') {
    return {
      actions: [
        {
          id: 'act_assigned_issues',
          tool: 'jira_search',
          risk: 'read',
          description: '나에게 할당된 Jira 이슈 조회',
          requiresApproval: false,
          inputPreview: {
            JQL: 'assignee = currentUser() ORDER BY updated DESC'
          },
          scope: {
            label: '허용된 Jira 프로젝트에서 내 할당 이슈',
            query: 'assignee = currentUser() ORDER BY updated DESC'
          }
        }
      ],
      actionQueries: {
        act_assigned_issues: 'assignee = currentUser() ORDER BY updated DESC'
      },
      actionReviews: {}
    };
  }
  const writePlan = writeActionPlan(scenario, message);
  if (writePlan) return writePlan;
  return { actions: [], actionQueries: {}, actionReviews: {} };
}

function writeActionPlan(scenario: RunScenario, message: string): { actions: ToolActionPlan[]; actionQueries: Record<string, string>; actionReviews: Record<string, ActionReviewRequest> } | null {
  const definitions: Partial<Record<RunScenario, {
    id: string;
    tool: WriteTool;
    description: string;
    target: string;
    scopeLabel: string;
    inputPreview: Record<string, string>;
  }>> = {
    write_jira_create_issue: {
      id: 'act_jira_create_issue',
      tool: 'jira_create_issue',
      description: 'Jira 이슈 생성 승인 준비',
      target: 'Jira 이슈 생성',
      scopeLabel: '사용자가 지정한 Jira 프로젝트',
      inputPreview: {
        summary: '요청 내용을 바탕으로 새 Jira 이슈 생성을 준비했습니다.',
        description: '승인하면 허용 범위 안에서 생성 가능 여부를 검증합니다.'
      }
    },
    write_jira_update_issue: {
      id: 'act_jira_update_issue',
      tool: 'jira_update_issue',
      description: 'Jira 이슈 수정 승인 준비',
      target: 'Jira 이슈 수정',
      scopeLabel: '사용자가 지정한 Jira 이슈',
      inputPreview: {
        fields: '요청 내용을 바탕으로 수정할 필드 확인이 필요합니다.',
        note: '승인하면 허용 범위 안에서 수정 가능 여부를 검증합니다.'
      }
    },
    write_jira_add_comment: {
      id: 'act_jira_comment',
      tool: 'jira_add_comment',
      description: 'Jira 댓글 작성 승인 준비',
      target: 'Jira 댓글 작성',
      scopeLabel: '사용자가 지정한 Jira 이슈',
      inputPreview: {
        comment: extractCommentText(message) ?? '작성할 댓글 내용을 입력하세요.'
      }
    },
    write_jira_transition_issue: {
      id: 'act_jira_transition',
      tool: 'jira_transition_issue',
      description: 'Jira 상태 전환 승인 준비',
      target: 'Jira 상태 전환',
      scopeLabel: '사용자가 지정한 Jira 이슈 상태',
      inputPreview: {
        transition: extractTransitionText(message) ?? '전환할 상태를 확인하세요.',
        note: '승인하면 허용 범위 안에서 상태 전환 가능 여부를 검증합니다.'
      }
    },
    write_confluence_create_page: {
      id: 'act_confluence_create_page',
      tool: 'confluence_create_page',
      description: 'Confluence 페이지 생성 승인 준비',
      target: 'Confluence 페이지 생성',
      scopeLabel: '사용자가 지정한 Confluence 스페이스',
      inputPreview: {
        title: '생성할 페이지 제목을 확인하세요.',
        body: '승인하면 허용 범위 안에서 생성 가능 여부를 검증합니다.'
      }
    },
    write_confluence_update_page: {
      id: 'act_confluence_update_page',
      tool: 'confluence_update_page',
      description: 'Confluence 페이지 수정 승인 준비',
      target: 'Confluence 페이지 수정',
      scopeLabel: '사용자가 지정한 Confluence 페이지',
      inputPreview: {
        changes: '수정할 페이지 내용을 확인하세요.',
        note: '승인하면 허용 범위 안에서 수정 가능 여부를 검증합니다.'
      }
    },
    write_confluence_add_comment: {
      id: 'act_confluence_comment',
      tool: 'confluence_add_comment',
      description: 'Confluence 댓글 작성 승인 준비',
      target: 'Confluence 댓글 작성',
      scopeLabel: '사용자가 지정한 Confluence 페이지',
      inputPreview: {
        comment: extractCommentText(message) ?? '작성할 댓글 내용을 입력하세요.'
      }
    }
  };
  const definition = definitions[scenario];
  if (!definition) return null;
  const target = extractWriteTarget(scenario, message, definition.target);
  const inputPreview = {
    ...definition.inputPreview,
    request: previewOriginalRequest(message)
  };
  const action: ToolActionPlan = {
    id: definition.id,
    tool: definition.tool,
    risk: 'write',
    description: definition.description,
    requiresApproval: true,
    inputPreview,
    scope: {
      label: target === definition.target ? definition.scopeLabel : target
    }
  };
  return {
    actions: [action],
    actionQueries: {},
    actionReviews: {
      [definition.id]: {
        id: definition.id,
        tool: definition.tool,
        risk: 'write',
        target,
        inputPreview,
        requiresApproval: true
      }
    }
  };
}

function extractWriteTarget(scenario: RunScenario, message: string, fallback: string): string {
  if (scenario.startsWith('write_jira')) {
    const issueKey = message.match(/\b[A-Z][A-Z0-9]+-\d+\b/i)?.[0]?.toUpperCase();
    if (issueKey) return `${issueKey} · ${fallback}`;
  }
  const quoted = message.match(/["“'‘]([^"”'’]{2,80})["”'’]/)?.[1]?.trim();
  return quoted ? `${quoted} · ${fallback}` : fallback;
}

function previewOriginalRequest(message: string): string {
  const trimmed = message.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '사용자 요청을 바탕으로 작업 내용을 준비했습니다.';
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

function extractCommentText(message: string): string | null {
  const quoted = message.match(/["“'‘]([^"”'’]{1,1000})["”'’]/)?.[1]?.trim();
  if (quoted) return quoted;

  const commentMatch = message.match(/(?:댓글|comment|코멘트)(?:로|:|：)?\s*(.+?)(?:\s*(?:남겨|달아|작성|추가|post|add|write|해줘|해주세요).*)?$/i)?.[1]?.trim();
  if (commentMatch && !/^(초안|draft)$/i.test(commentMatch)) return cleanExtractedText(commentMatch);

  const afterIssueKey = message.match(/\b[A-Z][A-Z0-9]+-\d+\b\s*(?:에|에다가|에 대해)?\s*(.+)$/i)?.[1]?.trim();
  if (afterIssueKey) {
    const cleaned = afterIssueKey
      .replace(/^(댓글|comment|코멘트)(?:로|:|：)?\s*/i, '')
      .replace(/\s*(?:댓글|comment|코멘트)?\s*(?:남겨|달아|작성|추가|post|add|write|해줘|해주세요).*$/i, '')
      .trim();
    if (cleaned) return cleanExtractedText(cleaned);
  }

  return null;
}

function extractTransitionText(message: string): string | null {
  const quoted = message.match(/["“'‘]([^"”'’]{1,80})["”'’]/)?.[1]?.trim();
  if (quoted) return quoted;
  const known = message.match(/\b(done|in progress|to do|resolved|closed)\b/i)?.[1]?.trim();
  if (known) return known;
  const korean = message.match(/(완료|진행 중|진행|할 일|해결|닫힘|종료)/)?.[1]?.trim();
  return korean ?? null;
}

function cleanExtractedText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[.。]?\s*$/, '')
    .trim()
    .slice(0, 1000);
}
