import { brokerUrl } from '../copilot/brokerUrl';
import { clearMemoryCsrfToken, setMemoryCsrfToken, csrfHeader } from './csrfToken';

export const authSessionQueryKey = ['auth', 'session'] as const;

const defaultReturnTo = '/settings';
const allowedReturnToPaths = new Set(['/copilot', '/history', '/settings']);
let csrfTokenInMemory: string | null = null;

export interface AuthUser {
  id?: string | undefined;
  email: string;
}

export interface AuthSession {
  user: AuthUser | null;
  csrfToken?: string | undefined;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export async function getAuthSession(): Promise<AuthSession> {
  const response = await fetch(brokerUrl('/api/auth/session'), {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (response.status === 401) {
    rememberCsrfToken(null);
    return { user: null };
  }
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '세션 확인 실패'));
  return rememberSession(parseAuthSession(await response.json()));
}

export async function login(credentials: AuthCredentials): Promise<AuthSession> {
  return submitAuth('/api/auth/login', credentials, '로그인 실패');
}

export async function signup(credentials: AuthCredentials): Promise<AuthSession> {
  return submitAuth('/api/auth/signup', credentials, '가입 실패');
}

export function startGoogleLogin(returnTo = '/settings'): void {
  window.location.assign(brokerUrl(`/api/auth/google/start?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`));
}

export async function logout(): Promise<AuthSession> {
  const response = await fetch(brokerUrl('/api/auth/logout'), {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', ...csrfHeader() }
  });
  rememberCsrfToken(null);
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '로그아웃 실패'));
  clearMemoryCsrfToken();
  return { user: null };
}

export function startGoogleLogin(returnTo: string = defaultReturnTo): void {
  window.location.assign(buildGoogleLoginStartUrl(returnTo));
}

export function buildGoogleLoginStartUrl(returnTo: string = defaultReturnTo): string {
  const query = new URLSearchParams({ returnTo: normalizeAuthReturnTo(returnTo) });
  return brokerUrl(`/api/auth/google/start?${query.toString()}`);
}

export function normalizeAuthReturnTo(value: string | null | undefined): string {
  if (!value) return defaultReturnTo;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.includes('\\') || /[\u0000-\u001f\u007f]/.test(trimmed)) return defaultReturnTo;

  let parsed: URL;
  try {
    parsed = new URL(trimmed, 'http://akc.local');
  } catch {
    return defaultReturnTo;
  }

  if (parsed.origin !== 'http://akc.local' || !allowedReturnToPaths.has(parsed.pathname)) return defaultReturnTo;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function isLocalAuthEnabled(): boolean {
  const value = import.meta.env.VITE_AKC_ENABLE_LOCAL_AUTH;
  if (typeof value !== 'string' || !value.trim()) return true;
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
}

export function currentCsrfTokenForTest(): string | null {
  return csrfTokenInMemory;
}

async function submitAuth(path: string, credentials: AuthCredentials, fallback: string): Promise<AuthSession> {
  const response = await fetch(brokerUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: csrfHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({ email: credentials.email.trim().toLowerCase(), password: credentials.password })
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, fallback));
  return rememberSession(parseAuthSession(await response.json()));
}

function csrfHeaders(base: Record<string, string>): Record<string, string> {
  if (!csrfTokenInMemory) return base;
  return { ...base, 'X-CSRF-Token': csrfTokenInMemory };
}

function parseAuthSession(payload: unknown): AuthSession {
  if (!payload || typeof payload !== 'object') {
    rememberCsrfToken(null);
    return { user: null };
  }

  const csrfToken = (payload as { csrfToken?: unknown }).csrfToken;
  rememberCsrfToken(typeof csrfToken === 'string' && csrfToken.trim() ? csrfToken : null);

  const user = 'user' in payload ? (payload as { user?: unknown }).user : payload;
  if (!user || typeof user !== 'object') return csrfTokenInMemory ? { user: null, csrfToken: csrfTokenInMemory } : { user: null };
  const email = (user as { email?: unknown }).email;
  const id = (user as { id?: unknown }).id;
  const csrfToken = (payload as { csrfToken?: unknown }).csrfToken;
  return typeof email === 'string' && email.trim()
    ? { user: { email, ...(typeof id === 'string' ? { id } : {}) }, ...(typeof csrfToken === 'string' ? { csrfToken } : {}) }
    : { user: null };
}

function rememberSession(session: AuthSession): AuthSession {
  setMemoryCsrfToken(session.csrfToken);
  return session;
}

function safeReturnTo(path: string): string {
  try {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin) return '/settings';
    if (!['/copilot', '/history', '/settings'].includes(url.pathname)) return '/settings';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/settings';
  }
}


async function brokerErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.clone().json() as { error?: unknown; message?: unknown };
    if (typeof payload.error === 'string' && payload.error) return payload.error;
    if (typeof payload.message === 'string' && payload.message) return payload.message;
  } catch {
    // Non-JSON error body; use the status-bearing fallback.
  }
  return `${fallback} (상태 ${response.status})`;
}
