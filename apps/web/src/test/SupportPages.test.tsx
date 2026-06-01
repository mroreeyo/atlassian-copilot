import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockHistory, mockSettingsStatus } from '@akc/shared/mock';
import { HistoryPage } from '../pages/HistoryPage';
import { SettingsPage } from '../pages/SettingsPage';
import { saveAtlassianSettings, saveLlmSettings, testAtlassianSettings, testLlmSettings } from '../services/copilot/brokerCopilotClient';

vi.mock('../services/copilot/brokerCopilotClient', () => ({
  getHistory: async () => ({
    runs: [
      { ...mockHistory.runs[0], title: '저장된 답변 기록', status: 'completed' },
      { ...mockHistory.runs[0], runId: 'run_failed', title: '실패한 답변 실행', status: 'failed' },
      { ...mockHistory.runs[0], runId: 'run_running', title: '실행 중인 답변 실행', status: 'running' }
    ]
  }),
  getSettingsStatus: async () => ({ ...mockSettingsStatus, mode: 'mock' }),
  getLlmProviderModels: vi.fn(async (provider) => ({
    provider,
    source: provider === 'openrouter' ? 'public' : 'fallback',
    defaultModel: provider === 'anthropic' ? 'claude-3-5-sonnet-latest' : provider === 'openrouter' ? 'openrouter/auto' : 'gpt-4.1-mini',
    selectedModel: provider === 'anthropic' ? 'claude-3-5-sonnet-latest' : provider === 'openrouter' ? 'openrouter/auto' : 'gpt-4.1-mini',
    models: provider === 'openrouter'
      ? [{ id: 'openrouter/auto', label: 'OpenRouter Auto', provider: 'openrouter', recommended: true }]
      : [{ id: provider === 'anthropic' ? 'claude-3-5-sonnet-latest' : 'gpt-4.1-mini', label: provider === 'anthropic' ? 'Claude 3.5 Sonnet' : 'gpt-4.1-mini', provider, recommended: true }],
    manualEntryAllowed: true,
    cache: { status: 'miss', ttlSeconds: provider === 'openrouter' ? 21600 : 3600 }
  })),
  saveAtlassianSettings: vi.fn(async (request) => ({
    message: 'Atlassian 연결을 저장했습니다. 브라우저에는 토큰을 저장하지 않았습니다.',
    status: {
      ...mockSettingsStatus,
      mcpConnectionState: 'configured',
      atlassian: {
        source: 'personal',
        connectionState: 'configured',
        configured: true,
        connected: false,
        siteUrl: request.siteUrl,
        email: request.email,
        tokenConfigured: true,
        allowedJiraProjects: request.jiraProjectAllowlist,
        allowedConfluenceSpaces: request.confluenceSpaceAllowlist,
        statusMessage: 'Atlassian 연결이 저장되었습니다. 연결 테스트로 조회 가능 여부를 확인하세요.'
      },
      allowedJiraProjects: request.jiraProjectAllowlist,
      allowedConfluenceSpaces: request.confluenceSpaceAllowlist
    }
  })),
  clearAtlassianSettings: vi.fn(async () => ({
    message: '개인 Atlassian 연결을 지웠습니다.',
    status: mockSettingsStatus
  })),
  testAtlassianSettings: vi.fn(async () => ({
    ok: true,
    message: 'Atlassian 연결 테스트를 통과했습니다.',
    status: {
      ...mockSettingsStatus,
      mcpConnected: true,
      mcpConnectionState: 'connected',
      atlassian: {
        source: 'personal',
        connectionState: 'connected',
        configured: true,
        connected: true,
        siteUrl: 'https://example.atlassian.net',
        email: 'user@example.com',
        tokenConfigured: true,
        allowedJiraProjects: ['AKC', 'NFS'],
        allowedConfluenceSpaces: ['AKC'],
        statusMessage: 'Atlassian 연결이 저장되었고 마지막 연결 테스트가 통과했습니다.'
      }
    }
  })),
  saveLlmSettings: vi.fn(async (request) => ({
    message: 'LLM 설정을 저장했습니다. 브라우저에는 API 키를 저장하지 않았습니다.',
    status: {
      ...mockSettingsStatus,
      llm: {
        provider: request.provider,
        source: 'personal',
        connectionState: 'configured',
        configured: request.provider !== 'mock',
        connected: false,
        enabled: request.enabled,
        keyConfigured: request.provider !== 'mock',
        model: request.model,
        statusMessage: 'LLM 설정이 저장되었습니다. 연결 테스트로 키를 검증하세요.'
      }
    }
  })),
  clearLlmSettings: vi.fn(async () => ({
    message: '개인 LLM 설정을 지웠습니다.',
    status: mockSettingsStatus
  })),
  testLlmSettings: vi.fn(async () => ({
    provider: 'anthropic',
    ok: true,
    message: 'Claude 연결 테스트를 통과했습니다.',
    status: {
      ...mockSettingsStatus,
      llm: {
        provider: 'anthropic',
        source: 'personal',
        connectionState: 'connected',
        configured: true,
        connected: true,
        enabled: true,
        keyConfigured: true,
        model: 'claude-3-5-sonnet-latest',
        statusMessage: 'Claude 설정이 저장되었고 마지막 연결 테스트가 통과했습니다.'
      }
    }
  }))
}));

function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('support pages', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders History with semantic status tones', async () => {
    renderWithQuery(<HistoryPage />);
    expect(await screen.findByText('저장된 답변 기록')).toBeInTheDocument();
    expect(screen.getByText('완료')).toHaveClass('success');
    expect(screen.getByText('실패')).toHaveClass('danger');
    expect(screen.getByText('실행 중')).toHaveClass('ai');
  });

  it('renders Settings with only connection status cards', async () => {
    renderWithQuery(<SettingsPage />);
    const statusGrid = await screen.findByLabelText('연결 상태');
    expect(within(statusGrid).getByText('Atlassian 연결')).toBeInTheDocument();
    expect(within(statusGrid).getByText('LLM 제공자')).toBeInTheDocument();
    expect(within(statusGrid).getByText('LLM 미사용')).toBeInTheDocument();
    expect(within(statusGrid).queryByText('기본 실행')).not.toBeInTheDocument();
    expect(within(statusGrid).queryByText('쓰기 방식')).not.toBeInTheDocument();
  });

  it('keeps Settings safety copy user-facing instead of exposing implementation storage terms', async () => {
    renderWithQuery(<SettingsPage />);
    expect(await screen.findByText('개인 연결 설정입니다. 비밀 값은 안전하게 서버로만 전달되며 이 기기에는 저장하지 않습니다.')).toBeInTheDocument();
    expect(screen.queryByText(/브라우저 env|localStorage|프론트엔드 코드/)).not.toBeInTheDocument();
  });

  it('guides new users from demo mode to real Atlassian and answer-provider setup', async () => {
    renderWithQuery(<SettingsPage />);

    const guide = await screen.findByRole('region', { name: '처음 설정 안내' });
    expect(guide).toHaveTextContent('실제 업무 자료로 답변하려면 두 가지만 연결하세요');
    expect(guide).toHaveTextContent('시연 모드로 흐름을 먼저 확인');
    expect(guide).toHaveTextContent('Atlassian 연결');
    expect(guide).toHaveTextContent('답변 제공자 연결');
    expect(guide).toHaveTextContent('연결 테스트 후 질문');
    expect(within(guide).getByText('Atlassian 연결 값 확인하기')).toBeInTheDocument();
    expect(within(guide).getByText('답변 제공자 키 준비하기')).toBeInTheDocument();
    expect(within(guide).getByRole('link', { name: /시연 화면으로 돌아가기|Copilot에서 질문하기/ })).toHaveAttribute('href', '/copilot');
    expect(guide).not.toHaveTextContent(/Broker|MCP|P0|아코디언|스키마|라우트/);
  });

  it('saves Atlassian personal settings and clears the token field', async () => {
    const user = userEvent.setup();
    renderWithQuery(<SettingsPage />);

    await user.clear(await screen.findByLabelText('사이트 URL'));
    await user.type(screen.getByLabelText('사이트 URL'), 'https://example.atlassian.net');
    await user.clear(screen.getByLabelText('이메일'));
    await user.type(screen.getByLabelText('이메일'), 'user@example.com');
    await user.type(screen.getByLabelText('API 토큰'), 'token_1234567890');
    await user.clear(screen.getByLabelText('Jira 프로젝트 허용 목록'));
    await user.type(screen.getByLabelText('Jira 프로젝트 허용 목록'), 'AKC,NFS');
    await user.clear(screen.getByLabelText('Confluence 스페이스 허용 목록'));
    await user.type(screen.getByLabelText('Confluence 스페이스 허용 목록'), 'AKC');
    await user.click(screen.getByRole('button', { name: 'Atlassian 연결 저장' }));

    expect(await screen.findByText('Atlassian 연결을 저장했습니다. 브라우저에는 토큰을 저장하지 않았습니다.')).toBeInTheDocument();
    expect(vi.mocked(saveAtlassianSettings).mock.calls[0]?.[0]).toEqual({
      siteUrl: 'https://example.atlassian.net',
      email: 'user@example.com',
      apiToken: 'token_1234567890',
      jiraProjectAllowlist: ['AKC', 'NFS'],
      confluenceSpaceAllowlist: ['AKC']
    });
    expect(screen.getByLabelText('API 토큰')).toHaveValue('');
    expect(screen.getByText('저장됨 · 테스트 필요')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Atlassian 연결 테스트' }));
    expect(await screen.findByText('Atlassian 연결 테스트를 통과했습니다.')).toBeInTheDocument();
    expect(screen.getByText('검증됨').closest('.status-card')).toHaveClass('active');
    expect(testAtlassianSettings).toHaveBeenCalledTimes(1);
  });

  it('shows a clear validation message instead of silently ignoring invalid settings', async () => {
    const user = userEvent.setup();
    renderWithQuery(<SettingsPage />);

    await user.clear(await screen.findByLabelText('사이트 URL'));
    await user.type(screen.getByLabelText('사이트 URL'), 'example.atlassian.net');
    await user.clear(screen.getByLabelText('이메일'));
    await user.type(screen.getByLabelText('이메일'), 'user@example.com');
    await user.clear(screen.getByLabelText('Jira 프로젝트 허용 목록'));
    await user.type(screen.getByLabelText('Jira 프로젝트 허용 목록'), 'AKC');
    await user.clear(screen.getByLabelText('Confluence 스페이스 허용 목록'));
    await user.type(screen.getByLabelText('Confluence 스페이스 허용 목록'), 'AKC');
    await user.click(screen.getByRole('button', { name: 'Atlassian 연결 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('API 토큰');
    expect(saveAtlassianSettings).not.toHaveBeenCalled();
  });

  it('saves and tests personal LLM settings and clears the key field', async () => {
    const user = userEvent.setup();
    renderWithQuery(<SettingsPage />);

    await user.selectOptions(await screen.findByLabelText('LLM 제공자'), 'openrouter');
    await user.type(screen.getByLabelText('LLM API 키'), 'sk-or-personal-secret');
    await screen.findByRole('option', { name: /OpenRouter Auto/ });
    await user.selectOptions(screen.getByLabelText('모델'), 'openrouter/auto');
    await user.click(screen.getByRole('button', { name: 'LLM 설정 저장' }));

    expect(await screen.findByText('LLM 설정을 저장했습니다. 브라우저에는 API 키를 저장하지 않았습니다.')).toBeInTheDocument();
    expect(vi.mocked(saveLlmSettings).mock.calls[0]?.[0]).toEqual({
      provider: 'openrouter',
      apiKey: 'sk-or-personal-secret',
      model: 'openrouter/auto',
      enabled: true
    });
    expect(screen.getByLabelText('LLM API 키')).toHaveValue('');

    vi.mocked(testLlmSettings).mockResolvedValueOnce({
      provider: 'openrouter',
      ok: true,
      message: 'OpenRouter 연결 테스트를 통과했습니다.',
      status: {
        ...mockSettingsStatus,
        llm: {
          provider: 'openrouter',
          source: 'personal',
          connectionState: 'connected',
          configured: true,
          connected: true,
          enabled: true,
          keyConfigured: true,
          model: 'openrouter/auto',
          statusMessage: 'OpenRouter 설정이 저장되었고 마지막 연결 테스트가 통과했습니다.'
        }
      }
    });

    await user.click(screen.getByRole('button', { name: 'LLM 연결 테스트' }));
    expect(await screen.findByText('OpenRouter 연결 테스트를 통과했습니다.')).toBeInTheDocument();
    expect(screen.getByText('OpenRouter 연결됨').closest('.status-card')).toHaveClass('active');
    expect(testLlmSettings).toHaveBeenCalledTimes(1);
  });

  it('keeps saved disabled LLM settings disabled after status hydration', async () => {
    const user = userEvent.setup();
    renderWithQuery(<SettingsPage />);

    await user.type(await screen.findByLabelText('LLM API 키'), 'sk-disabled-openai-secret');
    await user.selectOptions(screen.getByLabelText('Atlassian 코파일럿 요약에 사용'), 'disabled');
    await user.click(screen.getByRole('button', { name: 'LLM 설정 저장' }));

    expect(await screen.findByText('OpenAI 저장됨, 비활성')).toBeInTheDocument();
    expect(vi.mocked(saveLlmSettings).mock.calls[0]?.[0]).toMatchObject({
      provider: 'openai',
      apiKey: 'sk-disabled-openai-secret',
      enabled: false
    });
    expect(screen.getByLabelText('Atlassian 코파일럿 요약에 사용')).toHaveValue('disabled');
    expect(screen.getByRole('button', { name: 'LLM 연결 테스트' })).toBeDisabled();
  });

  it('surfaces failed LLM validation in the readiness grid', async () => {
    vi.mocked(saveLlmSettings).mockResolvedValueOnce({
      message: 'LLM 설정을 저장했습니다. 브라우저에는 API 키를 저장하지 않았습니다.',
      status: {
        ...mockSettingsStatus,
        llm: {
          provider: 'openrouter',
          source: 'personal',
          connectionState: 'failed',
          configured: true,
          connected: false,
          enabled: true,
          keyConfigured: true,
          model: 'openrouter/auto',
          statusMessage: 'OpenRouter 설정은 저장되었지만 마지막 연결 테스트가 실패했습니다.',
          lastError: 'OpenRouter 연결 테스트가 실패했습니다. 상태 429.'
        }
      }
    });
    const user = userEvent.setup();
    renderWithQuery(<SettingsPage />);

    await user.selectOptions(await screen.findByLabelText('LLM 제공자'), 'openrouter');
    await user.type(screen.getByLabelText('LLM API 키'), 'sk-or-personal-secret');
    await user.click(screen.getByRole('button', { name: 'LLM 설정 저장' }));

    expect(await screen.findByText('OpenRouter 테스트 실패')).toBeInTheDocument();
    expect(screen.getByText('OpenRouter 테스트 실패').closest('.status-card')).toHaveClass('failed');
    expect(screen.getByText('OpenRouter 테스트 실패').closest('.status-card')?.querySelector('.badge')).toHaveClass('danger');
  });
});
