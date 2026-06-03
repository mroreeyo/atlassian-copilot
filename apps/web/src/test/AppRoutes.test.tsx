import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockHistory, mockSettingsStatus } from '@akc/shared/mock';
import { App } from '../app/App';
import { productTourStorageKey, useProductTourStore } from '../features/onboarding/stores/productTourStore';
import { getAuthSession, isLocalAuthEnabled, login, logout, signup, startGoogleLogin } from '../services/auth/authClient';
import { themeStorageKey, useUiStore } from '../stores/uiStore';

vi.mock('../services/auth/authClient', () => ({
  authSessionQueryKey: ['auth', 'session'],
  getAuthSession: vi.fn(async () => ({ user: null })),
  isLocalAuthEnabled: vi.fn(() => true),
  normalizeAuthReturnTo: vi.fn((value: string | null | undefined) => value && value.startsWith('/') && !value.startsWith('//') ? value : '/settings'),
  login: vi.fn(async () => ({ user: { email: 'demo@example.com' } })),
  logout: vi.fn(async () => ({ user: null })),
  signup: vi.fn(async () => ({ user: { email: 'demo@example.com' } })),
  startGoogleLogin: vi.fn()
}));

vi.mock('../services/copilot/brokerCopilotClient', () => ({
  createCopilotRun: vi.fn(async () => ({ runId: 'run_route_test', streamUrl: '/api/copilot/runs/run_route_test/stream' })),
  streamCopilotEvents: vi.fn(async function* () { yield* []; }),
  approveAction: vi.fn(),
  cancelAction: vi.fn(),
  getCopilotSuggestions: vi.fn(async () => ({ suggestions: [] })),
  getHistory: vi.fn(async () => mockHistory),
  getSettingsStatus: vi.fn(async () => mockSettingsStatus),
  saveAtlassianSettings: vi.fn(),
  clearAtlassianSettings: vi.fn(),
  testAtlassianSettings: vi.fn(),
  saveLlmSettings: vi.fn(),
  clearLlmSettings: vi.fn(),
  getLlmProviderModels: vi.fn(async () => ({ source: 'public', cached: false, models: [] })),
  testLlmSettings: vi.fn()
}));

function renderApp(initialRoute = '/copilot') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('route freeze', () => {
  beforeEach(() => {
    vi.mocked(getAuthSession).mockResolvedValue({ user: null });
    vi.mocked(isLocalAuthEnabled).mockReturnValue(true);
    vi.mocked(startGoogleLogin).mockReset();
    vi.mocked(login).mockResolvedValue({ user: { email: 'demo@example.com' } });
    vi.mocked(signup).mockResolvedValue({ user: { email: 'demo@example.com' } });
    vi.mocked(logout).mockResolvedValue({ user: null });
    window.localStorage.setItem(productTourStorageKey, 'true');
    window.localStorage.removeItem(themeStorageKey);
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    useProductTourStore.setState({ currentStep: 0, hasCompleted: true, isOpen: false });
    useUiStore.setState({ contextPanelOpen: false, themeMode: 'dark' });
  });

  it('redirects the root route to the chat-first Copilot route', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Atlassian 코파일럿' })).toBeInTheDocument();
  });

  it('keeps primary navigation limited to Copilot, History, and Settings', () => {
    renderApp('/copilot');
    expect(screen.getByRole('link', { name: 'Atlassian 코파일럿' })).toHaveAttribute('href', '/copilot');
    expect(screen.getByRole('link', { name: '기록' })).toHaveAttribute('href', '/history');
    expect(screen.getByRole('link', { name: '설정' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('button', { name: '빠른 둘러보기' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
  });

  it('keeps the public Copilot demo route available without an auth gate', async () => {
    renderApp('/copilot');

    expect(await screen.findByRole('heading', { name: 'Atlassian 코파일럿' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Atlassian 코파일럿 프롬프트' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '로그인' })).not.toBeInTheDocument();
  });

  it('redirects unauthenticated History access to login', async () => {
    renderApp('/history');

    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '기록' })).not.toBeInTheDocument();
  });

  it('redirects unauthenticated Settings access to login', async () => {
    renderApp('/settings');

    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '설정' })).not.toBeInTheDocument();
  });

  it('shows authenticated shell controls without using browser token storage', async () => {
    vi.mocked(getAuthSession).mockResolvedValue({ user: { email: 'demo@example.com' } });
    renderApp('/copilot');

    expect(await screen.findByText('demo@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    expect(window.localStorage.getItem('auth_token')).toBeNull();
    expect(window.sessionStorage.getItem('auth_token')).toBeNull();
  });

  it('logs in with the local form and returns to the protected route', async () => {
    const user = userEvent.setup();
    renderApp('/settings');

    await user.type(await screen.findByLabelText('이메일'), 'demo@example.com');
    await user.type(screen.getByLabelText('비밀번호'), 'DemoPass123!');
    await user.click(screen.getByRole('button', { name: '로컬 계정으로 로그인' }));

    expect(vi.mocked(login).mock.calls[0]?.[0]).toEqual({ email: 'demo@example.com', password: 'DemoPass123!' });
    expect(await screen.findByRole('heading', { name: '설정' })).toBeInTheDocument();
  });


  it('shows a Google CTA on login and only navigates to the Broker start route', async () => {
    const user = userEvent.setup();
    renderApp('/login');

    const googlePanel = await screen.findByLabelText('Google 로그인');
    expect(within(googlePanel).getByRole('button', { name: 'Google로 계속하기' })).toBeInTheDocument();
    expect(screen.getByText(/Google 토큰이나 코드를 저장하지 않고 Broker 시작 경로로만 이동합니다/)).toBeInTheDocument();

    await user.click(within(googlePanel).getByRole('button', { name: 'Google로 계속하기' }));

    expect(startGoogleLogin).toHaveBeenCalledWith('/settings');
    expect(window.localStorage.getItem('google_token')).toBeNull();
    expect(window.sessionStorage.getItem('google_token')).toBeNull();
  });

  it('shows first-login Google account creation copy on signup', async () => {
    renderApp('/signup');

    expect(await screen.findByRole('heading', { name: 'Google로 작업 공간 만들기' })).toBeInTheDocument();
    expect(screen.getByText(/최초 Google 로그인 시 AX Knowledge Copilot 계정이 생성됩니다/)).toBeInTheDocument();
    expect(screen.getByText(/이메일만으로 계정을 병합하지 않습니다/)).toBeInTheDocument();
    expect(within(screen.getByLabelText('Google 가입')).getByRole('button', { name: 'Google로 계속하기' })).toBeInTheDocument();
  });

  it('hides local email and password forms when local auth is disabled', async () => {
    vi.mocked(isLocalAuthEnabled).mockReturnValue(false);
    renderApp('/login');

    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: '로컬 이메일 로그인' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('이메일')).not.toBeInTheDocument();
    expect(screen.getByText(/로컬 이메일\/비밀번호 로그인은 현재 환경에서 비활성화/)).toBeInTheDocument();
  });

  it('lets users switch between dark and light screen modes from the main navigation', async () => {
    const user = userEvent.setup();
    renderApp('/copilot');

    const toggle = screen.getByRole('button', { name: '밝은 화면으로 보기' });
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(window.localStorage.getItem(themeStorageKey)).toBe('light');
    expect(screen.getByRole('button', { name: '어두운 화면으로 보기' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('redirects unknown/dashboard-like routes back to the chat-first Copilot route', async () => {
    renderApp('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Atlassian 코파일럿' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /dashboard/i })).not.toBeInTheDocument();
  });
});
