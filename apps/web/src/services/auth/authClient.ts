import { brokerUrl } from '../copilot/brokerUrl';

export const authSessionQueryKey = ['auth', 'session'] as const;

export interface AuthUser {
  email: string;
}

export interface AuthSession {
  user: AuthUser | null;
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
  if (response.status === 401) return { user: null };
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '세션 확인 실패'));
  return parseAuthSession(await response.json());
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
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '로그아웃 실패'));
  return { user: null };
}

async function submitAuth(path: string, credentials: AuthCredentials, fallback: string): Promise<AuthSession> {
  const response = await fetch(brokerUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: credentials.email.trim().toLowerCase(), password: credentials.password })
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, fallback));
  return parseAuthSession(await response.json());
}

function parseAuthSession(payload: unknown): AuthSession {
  if (!payload || typeof payload !== 'object') return { user: null };
  const user = 'user' in payload ? (payload as { user?: unknown }).user : payload;
  if (!user || typeof user !== 'object') return { user: null };
  const email = (user as { email?: unknown }).email;
  return typeof email === 'string' && email.trim() ? { user: { email } } : { user: null };
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
