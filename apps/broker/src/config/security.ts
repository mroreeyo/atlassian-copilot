const localDevOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5180',
  'http://127.0.0.1:5180'
];

export function getAllowedOrigins(env = process.env): string[] {
  const configured = env.BROKER_ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
  return configured.length > 0 ? configured : localDevOrigins;
}

export function isAllowedBrowserOrigin(origin: string | undefined, env = process.env): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return getAllowedOrigins(env).includes(parsed.origin);
  } catch {
    return false;
  }
}

export function isSafeBrowserMutationSource(origin: string | undefined, referer: string | undefined, env = process.env): boolean {
  if (!origin && !referer) return true;
  if (isAllowedBrowserOrigin(origin, env)) return true;
  if (!referer) return false;
  try {
    return isAllowedBrowserOrigin(new URL(referer).origin, env);
  } catch {
    return false;
  }
}

export function securityHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "form-action 'self'",
      "img-src 'self' data: https:",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' http://localhost:8787 http://127.0.0.1:8787"
    ].join('; '),
    'Cross-Origin-Resource-Policy': 'same-site',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  };
}

export function hasCredentialEnvironment(env = process.env): boolean {
  return Boolean(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || env.CLAUDE_API_KEY || env.ATLASSIAN_URL || env.ATLASSIAN_EMAIL || env.ATLASSIAN_API_TOKEN);
}
