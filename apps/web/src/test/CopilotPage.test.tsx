import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRunEvents, mockActionReview, fictionalSources, mockSettingsStatus } from '@akc/shared/mock';
import { CopilotSseEventSchema, type CopilotSseEvent, type RunMode } from '@akc/shared';
import { CopilotPage } from '../pages/CopilotPage';
import { useCopilotSessionStore } from '../features/copilot/stores/copilotSessionStore';
import { demoModeStorageKey, useUiStore } from '../stores/uiStore';

let runCounter = 0;
let approvalShouldFail = false;
let cancelShouldFail = false;
let lastApprovalInputPreview: Record<string, string> | undefined;
let lastCancelReason: string | undefined;
let streamFailures: Set<string>;
let createRunInputs: Array<{ message: string; mode: RunMode }>;
let streamDelays: Map<string, number>;
let suggestionRequests: number;

function customEvents(runId: string, summary: string): CopilotSseEvent[] {
  return createMockRunEvents(runId).map((event) => {
    if (event.type === 'llm.delta') return { ...event, text: summary };
    if (event.type === 'evidence.found') return { ...event, sources: fictionalSources.map((source) => ({ ...source, id: `${runId}_${source.id}`, title: `${summary} ${source.title}` })) };
    if (event.type === 'llm.completed') return { ...event, citationSourceIds: event.citationSourceIds.map((id) => `${runId}_${id}`) };
    if (event.type === 'action_review.required') return { ...event, action: { ...mockActionReview, id: `${runId}_act_003`, target: `${runId}_target`, inputPreview: { comment: `${summary} action draft` } } };
    return event;
  });
}

vi.mock('../services/copilot/brokerCopilotClient', () => ({
  createCopilotRun: async (input: { message: string; mode: RunMode }) => {
    createRunInputs.push(input);
    runCounter += 1;
    return { runId: `run_test_${runCounter}`, streamUrl: `/api/copilot/runs/run_test_${runCounter}/stream` };
  },
  streamCopilotEvents: async function* (streamUrl: string) {
    const runId = streamUrl.includes('run_test_2') ? 'run_test_2' : 'run_test_1';
    const delay = streamDelays.get(runId);
    if (delay) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (streamFailures.has(runId)) throw new Error(`${runId} provider exploded`);
    const summary = runId === 'run_test_2' ? 'Second run summary' : 'First run summary';
    for (const event of customEvents(runId, summary)) yield CopilotSseEventSchema.parse(event);
  },
  approveAction: async (actionId: string, inputPreview?: Record<string, string>) => {
    if (approvalShouldFail) throw new Error('approval exploded');
    lastApprovalInputPreview = inputPreview;
    return { actionId, status: 'executed', executed: true, message: 'Jira 댓글을 작성했습니다.' };
  },
  getCopilotSuggestions: async () => {
    suggestionRequests += 1;
    return {
      source: 'fallback',
      suggestions: [
        { id: 'assigned-issues', label: '내 할당 이슈', prompt: '나에게 할당된 JIRA 이슈를 조회해줘.', category: 'jira', requiresConnection: true, requiresWrite: false },
        { id: 'due-today', label: '오늘 마감', prompt: '오늘까지 끝내야 할 이슈들이 있어?', category: 'jira', requiresConnection: true, requiresWrite: false }
      ]
    };
  },
  getSettingsStatus: async () => ({
    ...mockSettingsStatus,
    mode: 'mock',
    mcpConnected: false,
    mcpConnectionState: 'not_configured',
    openaiConnected: false,
    atlassian: {
      ...mockSettingsStatus.atlassian,
      source: 'none',
      connectionState: 'not_configured',
      configured: false,
      connected: false,
      tokenConfigured: false
    },
    llm: {
      ...mockSettingsStatus.llm,
      provider: 'mock',
      source: 'none',
      connectionState: 'not_configured',
      configured: false,
      connected: false,
      enabled: false,
      keyConfigured: false
    }
  }),
  cancelAction: async (actionId: string, reason?: string) => {
    if (cancelShouldFail) throw new Error('cancel exploded');
    lastCancelReason = reason;
    return { actionId, status: 'cancelled', executed: false, reason: '사용자가 작업 검토에서 취소했습니다.' };
  }
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CopilotPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function sendButton() {
  return screen.getByRole('button', { name: /메시지 보내기/i });
}

async function submitPrompt(user: ReturnType<typeof userEvent.setup>, prompt = '테스트 질문') {
  await user.type(screen.getByLabelText('Atlassian 코파일럿 프롬프트'), prompt);
  await user.click(sendButton());
}

describe('CopilotPage', () => {
  beforeEach(() => {
    runCounter = 0;
    approvalShouldFail = false;
    cancelShouldFail = false;
    lastApprovalInputPreview = undefined;
    lastCancelReason = undefined;
    streamFailures = new Set();
    createRunInputs = [];
    streamDelays = new Map();
    suggestionRequests = 0;
    useCopilotSessionStore.getState().resetSession();
    window.localStorage.removeItem(demoModeStorageKey);
    useUiStore.getState().setDemoMode(false);
  });

  it('loads broker-owned recommended question chips and submits a selected prompt', async () => {
    const user = userEvent.setup();
    renderPage();

    const suggestions = await screen.findByLabelText('추천 질문');
    expect(suggestions).toHaveTextContent('내 할당 이슈');
    expect(suggestions).toHaveTextContent('오늘 마감');
    expect(suggestions).not.toHaveTextContent('댓글 작성');
    expect(suggestions).not.toHaveTextContent('막힌 업무 찾기');

    await user.click(screen.getByRole('button', { name: '내 할당 이슈' }));

    await waitFor(() => expect(createRunInputs).toHaveLength(1));
    expect(createRunInputs[0]).toEqual({ message: '나에게 할당된 JIRA 이슈를 조회해줘.', mode: 'readonly' });
    expect(suggestionRequests).toBe(1);
  });

  it('does not submit an empty prompt and sends only typed Broker payloads', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(sendButton()).toBeDisabled();
    await submitPrompt(user, '나에게 할당된 이슈 조회');
    await waitFor(() => expect(createRunInputs).toHaveLength(1));
    expect(createRunInputs[0]).toEqual({ message: '나에게 할당된 이슈 조회', mode: 'readonly' });
    expect(await screen.findByLabelText('답변')).toHaveTextContent('First run summary');
  });

  it('surfaces a safe demo mode when Atlassian and LLM connections are not configured', async () => {
    const user = userEvent.setup();
    renderPage();

    const demoMode = await screen.findByRole('region', { name: /(?:데모|시연) 모드/i });
    expect(demoMode).toHaveTextContent(/가상의\s+Jira|가상의\s+Confluence|샘플 데이터/);
    expect(demoMode).toHaveTextContent(/실제 데이터와(?:는)? 분리|실제 계정 연결 없이/);
    expect(demoMode).toHaveTextContent(/가상|샘플|시연/);
    expect(demoMode).not.toHaveTextContent(/API|토큰|OpenAI|MCP/);

    await user.click(within(demoMode).getByRole('button', { name: /(?:데모|시연).*(시작|질문|실행|보기)/ }));

    await waitFor(() => expect(createRunInputs).toHaveLength(1));
    expect(createRunInputs[0]?.mode).toBe('mock');
    expect(createRunInputs[0]?.message).toBe('나에게 할당된 JIRA 이슈를 조회해줘.');
  });

  it('starts new project entries with demo mode enabled by default', async () => {
    window.localStorage.removeItem(demoModeStorageKey);
    useUiStore.getState().initializeDemoMode();
    const user = userEvent.setup();
    renderPage();

    const demoMode = await screen.findByRole('region', { name: /(?:데모|시연) 모드/i });
    expect(within(demoMode).getByRole('button', { name: '시연 모드 끄기' })).toHaveAttribute('aria-pressed', 'true');

    await submitPrompt(user, '시연 기본값 확인');

    await waitFor(() => expect(createRunInputs).toHaveLength(1));
    expect(createRunInputs[0]).toEqual({ message: '시연 기본값 확인', mode: 'mock' });
  });


  it('renders the full P0 mock flow inside chat', async () => {
    const user = userEvent.setup();
    renderPage();
    await submitPrompt(user);
    expect(await screen.findByLabelText('답변')).toHaveTextContent('First run summary');
    expect(screen.getByLabelText('답변')).toHaveTextContent('참고한 항목');
    expect(screen.getByLabelText('답변')).toHaveTextContent('데모 자료');
    expect(screen.getByRole('link', { name: /run_test_1_AKC-124/ })).toHaveAttribute('href', 'https://example.atlassian.net/browse/AKC-124');
    expect(await screen.findByLabelText('작업 검토')).toHaveTextContent('승인 대기');
    expect(screen.getByRole('button', { name: /내용 수정/i })).toBeInTheDocument();
    expect(screen.getByLabelText('도구 실행')).toBeInTheDocument();
    expect(screen.queryByLabelText('조회 계획')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('조회 진행')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('참고한 항목')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('보고서 초안')).not.toBeInTheDocument();
    expect(screen.queryByText('권장 다음 조치')).not.toBeInTheDocument();

    const accordionToggle = screen.getByRole('button', { name: /조회 실행/i });
    expect(accordionToggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(accordionToggle);
    expect(accordionToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('도구 실행')).toHaveTextContent('assignee = currentUser()');
    expect(screen.getByLabelText('도구 실행')).toHaveTextContent('테스트 Jira 이슈 5개 발견');
    expect(screen.getByLabelText('도구 실행')).toHaveTextContent('데모 자료');
    expect(screen.getByLabelText('도구 실행')).not.toHaveTextContent('실제 · Jira');
    expect(screen.getByLabelText('도구 실행')).toHaveTextContent('First run summary SSO 로그인 실패 후 메인 화면 이동 불가');
  });

  it('keeps the composer disabled and loading state visible while a run streams', async () => {
    streamDelays.set('run_test_1', 250);
    const user = userEvent.setup();
    renderPage();
    await submitPrompt(user);
    await waitFor(() => expect(createRunInputs).toHaveLength(1));
    expect(screen.getByText('응답 생성 중')).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();

    await user.click(sendButton());
    expect(createRunInputs).toHaveLength(1);

    expect(await screen.findByLabelText('답변')).toHaveTextContent('First run summary');
    await waitFor(() => expect(screen.queryByText('응답 생성 중')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Atlassian 코파일럿 프롬프트')).toBeEnabled();
    expect(sendButton()).toBeDisabled();
  });

  it('keeps run cards scoped to the assistant message that produced them', async () => {
    const user = userEvent.setup();
    renderPage();
    await submitPrompt(user);
    await waitFor(() => expect(screen.getAllByText(/First run summary/).length).toBeGreaterThan(0));
    await user.type(screen.getByLabelText('Atlassian 코파일럿 프롬프트'), '두 번째 질문');
    await user.click(sendButton());
    await waitFor(() => expect(screen.getAllByText(/Second run summary/).length).toBeGreaterThan(0));

    const assistantMessages = screen.getAllByRole('article').filter((article) => within(article).queryByText('Atlassian 코파일럿'));
    expect(assistantMessages).toHaveLength(2);
    expect(assistantMessages[0]).toHaveTextContent('First run summary');
    expect(assistantMessages[0]).not.toHaveTextContent('Second run summary');
    expect(assistantMessages[1]).toHaveTextContent('Second run summary');
  });

  it('keeps run failures visible on the owning assistant message after later runs', async () => {
    streamFailures.add('run_test_1');
    const user = userEvent.setup();
    renderPage();
    await submitPrompt(user);
    expect(await screen.findByRole('alert', { name: '실행 실패' })).toHaveTextContent('run_test_1 provider exploded');

    await user.type(screen.getByLabelText('Atlassian 코파일럿 프롬프트'), '두 번째 질문');
    await user.click(sendButton());
    await waitFor(() => expect(screen.getAllByText(/Second run summary/).length).toBeGreaterThan(0));

    const assistantMessages = screen.getAllByRole('article').filter((article) => within(article).queryByText('Atlassian 코파일럿'));
    expect(assistantMessages).toHaveLength(2);
    expect(assistantMessages[0]).toHaveTextContent('run_test_1 provider exploded');
    expect(assistantMessages[1]).toHaveTextContent('Second run summary');
    expect(assistantMessages[1]).not.toHaveTextContent('run_test_1 provider exploded');
  });

  it('records approval success and disables repeat submission', async () => {
    const user = userEvent.setup();
    renderPage();
    await submitPrompt(user);
    const approve = await screen.findByRole('button', { name: /승인하고 실행/i });
    await user.click(approve);
    expect(await screen.findByText('Jira 댓글을 작성했습니다.')).toBeInTheDocument();
    expect(screen.queryByLabelText('피드백')).not.toBeInTheDocument();
    expect(approve).toBeDisabled();
  });

  it('records cancellation success without executing a write action', async () => {
    const user = userEvent.setup();
    renderPage();
    await submitPrompt(user);
    const cancel = await screen.findByRole('button', { name: /취소/i });
    await user.click(cancel);
    expect(await screen.findByText('사용자가 작업 검토에서 취소했습니다.')).toBeInTheDocument();
    expect(lastCancelReason).toBe('사용자가 작업 검토에서 취소했습니다.');
    expect(cancel).toBeDisabled();
    expect(screen.queryByLabelText('피드백')).not.toBeInTheDocument();
  });

  it('allows local Action Review edits before approval', async () => {
    const user = userEvent.setup();
    renderPage();
    await submitPrompt(user);
    await user.click(await screen.findByRole('button', { name: /내용 수정/i }));
    const editor = screen.getByLabelText(/수정 가능한 승인 내용/i);
    await user.clear(editor);
    await user.type(editor, 'Edited local-only review draft');
    await user.click(screen.getByRole('button', { name: /수정 완료/i }));
    expect(screen.getByLabelText('작업 검토')).toHaveTextContent('Edited local-only review draft');
    await user.click(screen.getByRole('button', { name: /승인하고 실행/i }));
    await waitFor(() => expect(lastApprovalInputPreview).toEqual({ comment: 'Edited local-only review draft' }));
  });

  it('surfaces approval failures without executing anything', async () => {
    approvalShouldFail = true;
    const user = userEvent.setup();
    renderPage();
    await submitPrompt(user);
    await user.click(await screen.findByRole('button', { name: /승인하고 실행/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('approval exploded');
    expect(screen.getByText(/아무 작업도 실행되지 않았으며/i)).toBeInTheDocument();
  });

  it('keeps the conversation when leaving and returning to the Copilot page', async () => {
    const user = userEvent.setup();
    const firstRender = renderPage();
    await submitPrompt(user, '나에게 할당된 이슈 조회');
    expect(await screen.findByLabelText('답변')).toHaveTextContent('First run summary');

    firstRender.unmount();
    renderPage();

    expect(screen.getByText('나에게 할당된 이슈 조회')).toBeInTheDocument();
    expect(screen.getByLabelText('답변')).toHaveTextContent('First run summary');
  });

  it('defaults the optional context panel closed and exposes disclosure semantics', async () => {
    renderPage();
    const toggle = screen.getByRole('button', { name: /상세 정보 보기/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('상세 정보 패널')).not.toBeInTheDocument();
  });

  it('opens the context panel with active run evidence and approval guard copy', async () => {
    const user = userEvent.setup();
    renderPage();
    await submitPrompt(user);
    expect(await screen.findByLabelText('답변')).toHaveTextContent('First run summary');

    await user.click(screen.getByRole('button', { name: /상세 정보 보기/i }));
    const panel = await screen.findByLabelText('상세 정보 패널');
    expect(panel).toHaveTextContent('참고한 항목 8개');
    expect(panel).toHaveTextContent('검토 필요');
    expect(panel).toHaveTextContent('댓글이나 변경 요청은 내용을 확인한 뒤 진행합니다.');
  });

  it('submits with Enter and keeps Shift+Enter as a newline', async () => {
    const user = userEvent.setup();
    renderPage();
    const prompt = screen.getByLabelText('Atlassian 코파일럿 프롬프트');
    await user.clear(prompt);
    await user.type(prompt, '엔터 전송 질문{Shift>}{Enter}{/Shift}세부 조건');
    expect(prompt).toHaveValue('엔터 전송 질문\n세부 조건');
    await user.keyboard('{Enter}');
    expect(await screen.findByLabelText('답변')).toHaveTextContent('First run summary');
    expect(prompt).toHaveValue('');
  });
});
