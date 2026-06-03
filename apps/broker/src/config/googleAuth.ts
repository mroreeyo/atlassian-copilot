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
  const storageDisabledReason = googleAuthStorageDisabledReason(env);
  const disabledReason = !enabledFlag
    ? 'google_auth_disabled'
    : !clientId || !clientSecret
      ? 'google_auth_misconfigured'
      : storageDisabledReason;

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
  if (hasUnsafePathChars(trimmed)) return defaultReturnTo;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) return defaultReturnTo;

  const decoded = decodePossiblyEncoded(trimmed);
  if (decoded !== trimmed && (/^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.startsWith('//') || decoded.includes('\\'))) return defaultReturnTo;

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

export function googleAuthStorageDisabledReason(env = process.env): string | undefined {
  if (env.NODE_ENV !== 'production') return undefined;
  const configuredKey = env.AKC_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!configuredKey) return 'google_auth_secure_storage_required';
  try {
    return Buffer.from(configuredKey, 'base64').length === 32 ? undefined : 'google_auth_secure_storage_invalid';
  } catch {
    return 'google_auth_secure_storage_invalid';
  }
}

export function googleAuthDisabledPayload(config = googleAuthConfig()): { error: string; reason: string } {
  return { error: 'Google 로그인은 아직 사용할 수 없습니다.', reason: config.disabledReason ?? 'google_auth_disabled' };
}

function minutes(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return (Number.isFinite(parsed) && parsed > 0 ? parsed : fallback) * 60 * 1000;
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

function hasUnsafePathChars(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (char === '\\' || code < 32 || code === 127) return true;
  }
  return false;
}
