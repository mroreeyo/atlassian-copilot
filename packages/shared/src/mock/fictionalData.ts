import type { ActionReviewRequest, AtlassianSource, HistoryResponse, SettingsStatus, ToolActionPlan } from '../contracts/domain.js';
import type { CopilotSseEvent } from '../contracts/events.js';

export const fictionalSources: AtlassianSource[] = [
  {
    id: 'AKC-124',
    sourceType: 'jira',
    origin: 'demo',
    title: 'SSO 로그인 실패 후 메인 화면 이동 불가',
    summary: '높은 우선순위 이슈입니다. 인증 토큰 검증 지연과 세션 정책 충돌 가능성이 언급됨. 오늘 중 1차 원인 분리가 필요합니다.',
    relevanceScore: 96,
    url: 'https://example.atlassian.net/browse/AKC-124',
    actionId: 'act_001',
    retrievedAt: '2026-05-29T02:00:00Z',
    metadata: {
      jira: {
        key: 'AKC-124',
        status: '진행 중',
        assignee: 'Test User',
        priority: 'High',
        issueType: 'Bug',
        projectKey: 'AKC',
        updated: '2026-05-28T09:10:00Z'
      }
    }
  },
  {
    id: 'AKC-117',
    sourceType: 'jira',
    origin: 'demo',
    title: 'NFS 권한 동기화 작업 지연',
    summary: '이번 주 완료되지 않은 높은 우선순위 이슈입니다. 권한 캐시 무효화가 지연되어 파일 접근 권한 반영 시간이 길어졌습니다.',
    relevanceScore: 91,
    url: 'https://example.atlassian.net/browse/AKC-117',
    actionId: 'act_001',
    retrievedAt: '2026-05-29T02:00:00Z',
    metadata: {
      jira: {
        key: 'AKC-117',
        status: '할 일',
        assignee: 'Test User',
        priority: 'High',
        issueType: 'Task',
        projectKey: 'AKC',
        updated: '2026-05-27T05:20:00Z'
      }
    }
  },
  {
    id: 'AKC-136',
    sourceType: 'jira',
    origin: 'demo',
    title: 'OpenRouter 모델 선택값 저장 후 재진입 시 초기화됨',
    summary: '설정 화면에서 선택한 모델이 새로고침 뒤 기본값으로 보이는 문제입니다. 실제 키는 노출되지 않고 서버 저장 상태만 확인하면 됩니다.',
    relevanceScore: 87,
    url: 'https://example.atlassian.net/browse/AKC-136',
    actionId: 'act_001',
    retrievedAt: '2026-05-29T02:00:00Z',
    metadata: {
      jira: {
        key: 'AKC-136',
        status: '리뷰 대기',
        assignee: 'Test User',
        priority: 'Medium',
        issueType: 'Bug',
        projectKey: 'AKC',
        updated: '2026-05-28T13:45:00Z'
      }
    }
  },
  {
    id: 'NFS-42',
    sourceType: 'jira',
    origin: 'demo',
    title: '파일 서버 권한 캐시 재검증 배치 실패',
    summary: '야간 배치 실패로 일부 권한 변경 사항이 다음 동기화까지 반영되지 않았습니다. AKC-117과 같은 원인 후보로 묶어 확인할 수 있습니다.',
    relevanceScore: 85,
    url: 'https://example.atlassian.net/browse/NFS-42',
    actionId: 'act_001',
    retrievedAt: '2026-05-29T02:00:00Z',
    metadata: {
      jira: {
        key: 'NFS-42',
        status: '진행 중',
        assignee: 'Test User',
        priority: 'High',
        issueType: 'Incident',
        projectKey: 'NFS',
        updated: '2026-05-28T16:05:00Z'
      }
    }
  },
  {
    id: 'AKC-141',
    sourceType: 'jira',
    origin: 'demo',
    title: '첫 방문 제품 안내 문구를 비개발자 기준으로 정리',
    summary: '면접관이나 현업 사용자가 처음 봐도 이해할 수 있도록 제품 둘러보기 문구를 더 자연스럽게 다듬는 개선 작업입니다.',
    relevanceScore: 78,
    url: 'https://example.atlassian.net/browse/AKC-141',
    actionId: 'act_001',
    retrievedAt: '2026-05-29T02:00:00Z',
    metadata: {
      jira: {
        key: 'AKC-141',
        status: '백로그',
        assignee: 'Test User',
        priority: 'Low',
        issueType: 'Improvement',
        projectKey: 'AKC',
        updated: '2026-05-26T08:30:00Z'
      }
    }
  },
  {
    id: 'AX-KB-001',
    sourceType: 'confluence',
    origin: 'demo',
    title: 'NFS 인증 장애 대응 Runbook',
    summary: 'SSO, 세션 정책, 권한 캐시 점검 순서가 정리된 가상 runbook입니다.',
    relevanceScore: 94,
    url: 'https://example.atlassian.net/wiki/spaces/AKC/pages/001',
    actionId: 'act_002',
    retrievedAt: '2026-05-29T02:00:00Z',
    metadata: {
      confluence: {
        pageId: 'AX-KB-001',
        spaceKey: 'AKC',
        spaceName: 'Atlassian Demo',
        contentType: 'page',
        updated: '2026-05-26T11:00:00Z'
      }
    }
  },
  {
    id: 'AX-KB-014',
    sourceType: 'confluence',
    origin: 'demo',
    title: '내 할당 Jira 이슈 일일 점검 체크리스트',
    summary: '우선순위, 마감 임박, 차단 여부, 관련 문서 연결 여부를 매일 확인하는 가상 체크리스트입니다.',
    relevanceScore: 89,
    url: 'https://example.atlassian.net/wiki/spaces/AKC/pages/014',
    actionId: 'act_002',
    retrievedAt: '2026-05-29T02:00:00Z',
    metadata: {
      confluence: {
        pageId: 'AX-KB-014',
        spaceKey: 'AKC',
        spaceName: 'Atlassian Demo',
        contentType: 'page',
        updated: '2026-05-27T10:30:00Z'
      }
    }
  },
  {
    id: 'AX-KB-008',
    sourceType: 'confluence',
    origin: 'demo',
    title: '권한 캐시 무효화 운영 절차',
    summary: '권한 변경이 지연될 때 캐시 무효화, 배치 재실행, 사용자 영향 범위 확인 순서를 안내하는 가상 운영 문서입니다.',
    relevanceScore: 86,
    url: 'https://example.atlassian.net/wiki/spaces/AKC/pages/008',
    actionId: 'act_002',
    retrievedAt: '2026-05-29T02:00:00Z',
    metadata: {
      confluence: {
        pageId: 'AX-KB-008',
        spaceKey: 'AKC',
        spaceName: 'Atlassian Demo',
        contentType: 'page',
        updated: '2026-05-25T15:20:00Z'
      }
    }
  }
];

export const mockToolPlan: ToolActionPlan[] = [
  {
    id: 'act_001',
    tool: 'jira_search',
    risk: 'read',
    description: '나에게 할당된 Jira 이슈 검색',
    requiresApproval: false,
    inputPreview: { JQL: 'assignee = currentUser() ORDER BY priority DESC, updated DESC' },
    scope: {
      label: '내 할당 Jira 이슈 데모 범위',
      query: 'assignee = currentUser() ORDER BY priority DESC, updated DESC',
      jiraProjects: ['AKC', 'NFS']
    }
  },
  {
    id: 'act_002',
    tool: 'confluence_search',
    risk: 'read',
    description: '할당 이슈와 관련된 운영 문서 검색',
    requiresApproval: false,
    inputPreview: { CQL: 'space = AKC AND text ~ "인증 OR 권한 OR 이슈 점검"' },
    scope: {
      label: 'Confluence AKC 테스트 범위',
      query: 'space = AKC AND text ~ "인증 OR 권한 OR 이슈 점검"',
      confluenceSpaces: ['AKC']
    }
  },
  {
    id: 'act_003',
    tool: 'jira_add_comment',
    risk: 'write',
    description: 'AKC-124 조치 댓글 작성',
    requiresApproval: true,
    inputPreview: {
      comment: '인증 서버 응답 시간, 세션 정책, 권한 캐시 무효화 순서를 점검해 주세요.'
    },
    scope: { label: '내용 확인 후 진행' }
  }
];

export const mockActionReview: ActionReviewRequest = {
  id: 'act_003',
  tool: 'jira_add_comment',
  risk: 'write',
  target: 'AKC-124',
  inputPreview: {
    comment: '인증 서버 응답 시간, 세션 정책, 권한 캐시 무효화 순서를 점검해 주세요.'
  },
  requiresApproval: true
};

export function createMockRunEvents(runId = 'run_fixture_001'): CopilotSseEvent[] {
  return [
    { type: 'run.created', runId, createdAt: '2026-05-29T02:00:00Z' },
    { type: 'tool_plan.created', actions: mockToolPlan },
    { type: 'tool.started', actionId: 'act_001', tool: 'jira_search' },
    { type: 'tool.completed', actionId: 'act_001', tool: 'jira_search', resultSummary: '테스트 Jira 이슈 5개 발견' },
    { type: 'tool.started', actionId: 'act_002', tool: 'confluence_search' },
    { type: 'tool.completed', actionId: 'act_002', tool: 'confluence_search', resultSummary: '테스트 Confluence 페이지 3개 발견' },
    { type: 'evidence.found', sources: fictionalSources },
    { type: 'llm.started', messageId: 'msg_001' },
    { type: 'llm.delta', messageId: 'msg_001', text: '나에게 할당된 JIRA 이슈 5개를 확인했습니다. High 우선순위 3개는 인증/권한 흐름에 집중되어 있습니다. ' },
    { type: 'llm.delta', messageId: 'msg_001', text: 'AKC-124와 AKC-117, NFS-42는 먼저 묶어서 확인하고, AKC-136은 설정 저장 회귀 여부를 리뷰하면 됩니다. ' },
    { type: 'llm.delta', messageId: 'msg_001', text: 'AX-KB-001, AX-KB-014, AX-KB-008을 함께 보면 장애 대응 순서와 일일 점검 기준까지 설명할 수 있습니다.' },
    { type: 'llm.completed', messageId: 'msg_001', confidence: 'high', citationSourceIds: fictionalSources.map((source) => source.id), reviewRequired: true },
    { type: 'action_review.required', action: mockActionReview },
    { type: 'run.completed', runId }
  ];
}

export const mockSettingsStatus: SettingsStatus = {
  mcpConnected: false,
  mcpConnectionState: 'not_configured',
  mcpStatusMessage: '개인 Atlassian 연결이 아직 없습니다. 실제 조회 데이터가 없으면 데이터 없음으로 응답합니다.',
  openaiConnected: false,
  mode: 'readonly',
  sandboxWriteEnabled: false,
  allowedJiraProjects: ['AKC', 'NFS'],
  allowedConfluenceSpaces: ['AKC'],
  atlassian: {
    source: 'none',
    connectionState: 'not_configured',
    configured: false,
    connected: false,
    tokenConfigured: false,
    allowedJiraProjects: ['AKC', 'NFS'],
    allowedConfluenceSpaces: ['AKC'],
    statusMessage: '개인 Atlassian 연결이 아직 없습니다. 실제 조회 데이터가 없으면 데이터 없음으로 응답합니다.'
  },
  llm: {
    provider: 'mock',
    source: 'none',
    connectionState: 'not_configured',
    configured: false,
    connected: false,
    enabled: false,
    keyConfigured: false,
    statusMessage: '개인 LLM 제공자가 설정되지 않았습니다. 실제 근거가 없으면 데이터 없음 안내만 표시합니다.'
  }
};

export const mockHistory: HistoryResponse = {
  runs: [
    {
      runId: 'run_fixture_001',
      title: '내 할당 이슈 요약',
      createdAt: '2026-05-29T10:00:00+09:00',
      toolCount: 3,
      pendingApprovalCount: 1,
      status: 'completed'
    }
  ]
};
