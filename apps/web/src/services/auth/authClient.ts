import { brokerUrl } from '../copilot/brokerUrl';
import { clearMemoryCsrfToken, csrfHeader, currentMemoryCsrfToken, setMemoryCsrfToken } from './csrfToken';

export const authSessionQueryKey = ['auth', 'session'] as const;
export const authConfigQueryKey = ['auth', 'config'] as const;

const defaultReturnTo = '/settings';
const allowedReturnToPaths = new Set(['/copilot', '/history', '/settings']);

export interface AuthUser {
  id?: string | undefined;
  email: string;
  createdAt?: string | undefined;
  displayName?: string | undefined;
  avatarUrl?: string | undefined;
}

export interface AuthSession {
  user: AuthUser | null;
  csrfToken?: string | undefined;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthConfig {
  googleEnabled: boolean;
  localAuthEnabled: boolean;
}

export async function getAuthConfig(): Promise<AuthConfig> {
  const response = await fetch(brokerUrl('/api/auth/config'), {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '인증 설정 확인 실패'));
  return parseAuthConfig(await response.json());
}

export async function getAuthSession(): Promise<AuthSession> {
  const response = await fetch(brokerUrl('/api/auth/session'), {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (response.status === 401) {
    clearMemoryCsrfToken();
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

export async function logout(): Promise<AuthSession> {
  const response = await fetch(brokerUrl('/api/auth/logout'), {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', ...csrfHeader() }
  });
  clearMemoryCsrfToken();
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '로그아웃 실패'));
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
  if (!trimmed || trimmed.length > 512 || trimmed.startsWith('//') || hasUnsafePathChars(trimmed)) return defaultReturnTo;
  const decoded = decodePossiblyEncoded(trimmed);
  if (decoded !== trimmed && (/^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.startsWith('//') || decoded.includes('\\'))) return defaultReturnTo;

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
  return currentMemoryCsrfToken() ?? null;
}

async function submitAuth(path: string, credentials: AuthCredentials, fallback: string): Promise<AuthSession> {
  const response = await fetch(brokerUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...csrfHeader() },
    body: JSON.stringify({ email: credentials.email.trim().toLowerCase(), password: credentials.password })
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, fallback));
  return rememberSession(parseAuthSession(await response.json()));
}

function parseAuthConfig(payload: unknown): AuthConfig {
  if (!payload || typeof payload !== 'object') return { googleEnabled: false, localAuthEnabled: true };
  return {
    googleEnabled: (payload as { googleEnabled?: unknown }).googleEnabled === true,
    localAuthEnabled: (payload as { localAuthEnabled?: unknown }).localAuthEnabled !== false
  };
}

function parseAuthSession(payload: unknown): AuthSession {
  if (!payload || typeof payload !== 'object') return { user: null };
  const csrfToken = (payload as { csrfToken?: unknown }).csrfToken;
  const user = 'user' in payload ? (payload as { user?: unknown }).user : payload;
  if (!user || typeof user !== 'object') return typeof csrfToken === 'string' ? { user: null, csrfToken } : { user: null };
  const email = (user as { email?: unknown }).email;
  if (typeof email !== 'string' || !email.trim()) return typeof csrfToken === 'string' ? { user: null, csrfToken } : { user: null };
  const id = (user as { id?: unknown }).id;
  const createdAt = (user as { createdAt?: unknown }).createdAt;
  const displayName = (user as { displayName?: unknown }).displayName;
  const avatarUrl = (user as { avatarUrl?: unknown }).avatarUrl;
  return {
    user: {
      email: email.trim().toLowerCase(),
      ...(typeof id === 'string' ? { id } : {}),
      ...(typeof createdAt === 'string' ? { createdAt } : {}),
      ...(typeof displayName === 'string' ? { displayName } : {}),
      ...(typeof avatarUrl === 'string' ? { avatarUrl } : {})
    },
    ...(typeof csrfToken === 'string' && csrfToken.trim() ? { csrfToken } : {})
  };
}

function rememberSession(session: AuthSession): AuthSession {
  if (session.csrfToken) setMemoryCsrfToken(session.csrfToken);
  else clearMemoryCsrfToken();
  return session;
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

function decodePossiblyEncoded(value: string): string {
  let current = value;
  for (let index = 0; index < 2; index += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) return current;
      current = decoded;
    } catch {
      return current;
    }
  }
  return current;
}

function hasUnsafePathChars(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (char === '\\' || code < 32 || code === 127) return true;
  }
  return false;
}
