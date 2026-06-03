const defaultReturnTo = '/settings';
const allowedReturnToRoots = new Set(['/copilot', '/history', '/settings']);
const sensitiveUrlKeys = /(?:^|[_-])(code|state|id[_-]?token|access[_-]?token|refresh[_-]?token|csrf|session|jwt|token|api[_-]?key|secret)(?:$|[_-])/i;

export interface GoogleAuthConfig {
  enabled: boolean;
  disabledReason?: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authBaseUrl: string;
  hostedDomain?: string;
  transactionTtlMs: number;
}

export function googleAuthConfig(env = process.env): GoogleAuthConfig {
  const authBaseUrl = stripTrailingSlash(env.AKC_AUTH_BASE_URL?.trim() || 'http://localhost:8787');
  const redirectUri = env.GOOGLE_REDIRECT_URI?.trim() || `${authBaseUrl}/api/auth/google/callback`;
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? '';
  const enabledFlag = env.AKC_ENABLE_GOOGLE_AUTH === 'true';
  const readiness = googleAuthReadiness(env);
  const disabledReason = !enabledFlag
    ? 'google_auth_disabled'
    : !clientId || !clientSecret
      ? 'google_auth_misconfigured'
      : !readiness.ready
        ? readiness.reason
        : undefined;

  return {
    enabled: !disabledReason,
    ...(disabledReason ? { disabledReason } : {}),
    clientId,
    clientSecret,
    redirectUri,
    authBaseUrl,
    ...(env.GOOGLE_ALLOWED_HOSTED_DOMAIN?.trim() ? { hostedDomain: env.GOOGLE_ALLOWED_HOSTED_DOMAIN.trim() } : {}),
    transactionTtlMs: minutes(env.AKC_AUTH_OAUTH_TRANSACTION_TTL_MINUTES, 10)
  };
}

export function sanitizeGoogleReturnTo(input: unknown): string {
  if (typeof input !== 'string') return defaultReturnTo;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 512) return defaultReturnTo;
  if (/[\u0000-\u001f\u007f\\]/.test(trimmed)) return defaultReturnTo;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) return defaultReturnTo;

  const decoded = decodePossiblyEncoded(trimmed);
  if (decoded !== trimmed && (/^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.startsWith('//') || decoded.includes('\\'))) {
    return defaultReturnTo;
  }

  try {
    const parsed = new URL(trimmed, 'http://akc.local');
    if (parsed.origin !== 'http://akc.local') return defaultReturnTo;
    if (!allowedReturnToRoots.has(parsed.pathname)) return defaultReturnTo;
    if (parsed.hash) return parsed.pathname;
    for (const key of parsed.searchParams.keys()) {
      if (sensitiveUrlKeys.test(key)) return parsed.pathname;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return defaultReturnTo;
  }
}

export function googleAuthDisabledPayload(config = googleAuthConfig()): { error: string; reason: string } {
  return { error: 'Google 로그인은 아직 사용할 수 없습니다.', reason: config.disabledReason ?? 'google_auth_disabled' };
}

function googleAuthReadiness(env: NodeJS.ProcessEnv): { ready: boolean; reason?: string } {
  const required = [
    ['AKC_AUTH_DB_FOUNDATION_READY', env.AKC_AUTH_DB_FOUNDATION_READY],
    ['AKC_AUTH_DB_SESSIONS_READY', env.AKC_AUTH_DB_SESSIONS_READY],
    ['AKC_AUTH_CSRF_READY', env.AKC_AUTH_CSRF_READY],
    ['AKC_AUTH_USER_ISOLATION_READY', env.AKC_AUTH_USER_ISOLATION_READY]
  ] as const;
  const missing = required.find(([, value]) => value !== 'true')?.[0];
  return missing ? { ready: false, reason: `missing_readiness_gate:${missing}` } : { ready: true };
}

function minutes(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 60 * 1000 : fallback * 60 * 1000;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
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
