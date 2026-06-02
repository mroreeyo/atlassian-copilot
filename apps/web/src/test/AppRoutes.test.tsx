import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockHistory, mockSettingsStatus } from '@akc/shared/mock';
import { App } from '../app/App';
import { productTourStorageKey, useProductTourStore } from '../features/onboarding/stores/productTourStore';
import { getAuthSession, login, logout, signup } from '../services/auth/authClient';
import { themeStorageKey, useUiStore } from '../stores/uiStore';

vi.mock('../services/auth/authClient', () => ({
  authSessionQueryKey: ['auth', 'session'],
  getAuthSession: vi.fn(async () => ({ user: null })),
  login: vi.fn(async () => ({ user: { email: 'demo@example.com' } })),
  logout: vi.fn(async () => ({ user: null })),
  signup: vi.fn(async () => ({ user: { email: 'demo@example.com' } }))
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
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login');
    expect(screen.queryByText(/로그인이 필요|sign in required|authenticate|권한이 필요/i)).not.toBeInTheDocument();
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
