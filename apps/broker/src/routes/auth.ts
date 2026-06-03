import type { FastifyInstance } from 'fastify';
import { AuthLoginRequestSchema, AuthSessionResponseSchema, AuthSignupRequestSchema } from '@akc/shared';
import { AuthStoreError, createSession, isLocalAuthEnabled, loginLocalUser, signupLocalUser } from '../services/auth/authStore.js';
import { issueCsrfToken } from '../services/auth/authDb.js';
import { appendSetCookie, clearSessionCookie, currentAuthSession, invalidateRequestSession, readCookie, requireCsrf, rotateRequestSession, setSessionCookie, shouldUseSecureCookie } from '../services/auth/sessionCookie.js';
import { completeGoogleOidcCallback, GoogleAuthConfigError, googleAuthConfigured, googleAuthEnabledFlag, GoogleOidcError, startGoogleOidc } from '../services/auth/googleOidc.js';
import { sanitizeGoogleReturnTo } from '../config/googleAuth.js';

export function registerAuthRoutes(app: FastifyInstance): void {
  app.get('/api/auth/config', async (_request, reply) => {
    return reply.send({ googleEnabled: googleAuthConfigured(), localAuthEnabled: isLocalAuthEnabled() });
  });

  app.post('/api/auth/signup', async (request, reply) => {
    const parsed = AuthSignupRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '가입 정보가 올바르지 않습니다.' });
    try {
      const user = await signupLocalUser(parsed.data);
      const session = createSession(user);
      setSessionCookie(reply, request, session.sessionId);
      return reply.code(201).send(AuthSessionResponseSchema.parse({ user: session.user, csrfToken: session.csrfToken }));
    } catch (error) {
      return authErrorReply(reply, error, '가입할 수 없습니다.');
    }
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = AuthLoginRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    try {
      const session = await loginLocalUser(parsed.data, authRateLimitKey(request.ip));
      rotateRequestSession(request);
      setSessionCookie(reply, request, session.sessionId);
      return reply.send(AuthSessionResponseSchema.parse({ user: session.user, csrfToken: session.csrfToken }));
    } catch (error) {
      return authErrorReply(reply, error, '이메일 또는 비밀번호가 올바르지 않습니다.');
    }
  });

  app.get('/api/auth/session', async (request, reply) => {
    const session = currentAuthSession(request);
    if (!session) return reply.code(401).send({ error: '로그인이 필요합니다.' });
    return reply.send(AuthSessionResponseSchema.parse({ user: session.user, csrfToken: issueCsrfToken(session) }));
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const session = currentAuthSession(request);
    if (!session) return reply.code(401).send({ error: '로그인이 필요합니다.' });
    if (!requireCsrf(request, reply, session)) return;
    invalidateRequestSession(request);
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  app.get('/api/auth/google/start', async (request, reply) => {
    try {
      const query = request.query as { returnTo?: string };
      const result = startGoogleOidc(sanitizeGoogleReturnTo(query.returnTo));
      setOAuthTransactionCookie(reply, request, result.transactionCookie.value, result.transactionCookie.maxAgeSeconds);
      return reply.header('Cache-Control', 'no-store').redirect(result.url, 302);
    } catch (error) {
      const status = error instanceof GoogleAuthConfigError ? (googleAuthEnabledFlag() ? 503 : 404) : 400;
      const reason = error instanceof GoogleAuthConfigError ? error.code : 'google_start_failed';
      return reply.header('Cache-Control', 'no-store').code(status).send({ error: 'Google 로그인을 시작할 수 없습니다.', reason });
    }
  });

  app.get('/api/auth/google/callback', async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };
    reply.header('Cache-Control', 'no-store');
    clearOAuthTransactionCookie(reply);
    if (query.error) return reply.redirect(`/login?authError=${encodeURIComponent('google_denied')}`, 302);
    try {
      const callbackInput: { code?: string; state?: string; browserBinding?: string } = {};
      if (query.code) callbackInput.code = query.code;
      if (query.state) callbackInput.state = query.state;
      const browserBinding = readOAuthTransactionCookie(request);
      if (browserBinding) callbackInput.browserBinding = browserBinding;
      const result = await completeGoogleOidcCallback(callbackInput);
      rotateRequestSession(request);
      setSessionCookie(reply, request, result.session.sessionId);
      return reply.redirect(result.returnTo, 302);
    } catch (error) {
      return reply.redirect(`/login?authError=${encodeURIComponent(safeGoogleCallbackError(error))}`, 302);
    }
  });
}

const oauthTransactionCookieName = 'akc_oauth_tx';
const safeGoogleOidcErrorCodes = new Set([
  'invalid_oauth_transaction',
  'invalid_issuer',
  'invalid_audience',
  'invalid_authorized_party',
  'token_expired',
  'token_issued_in_future',
  'invalid_nonce',
  'invalid_subject',
  'invalid_email',
  'email_not_verified',
  'hosted_domain_denied',
  'missing_id_token',
  'missing_id_token_payload'
]);

function readOAuthTransactionCookie(request: Parameters<typeof shouldUseSecureCookie>[0]): string | undefined {
  return shouldUseSecureCookie(request) ? readCookie(request, `__Host-${oauthTransactionCookieName}`) : readCookie(request, oauthTransactionCookieName);
}

function setOAuthTransactionCookie(reply: Parameters<typeof appendSetCookie>[0], request: Parameters<typeof shouldUseSecureCookie>[0], value: string, maxAgeSeconds: number): void {
  const secure = shouldUseSecureCookie(request);
  const name = secure ? `__Host-${oauthTransactionCookieName}` : oauthTransactionCookieName;
  const path = secure ? '/' : '/api/auth/google';
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'SameSite=Lax',
    `Path=${path}`,
    `Max-Age=${Math.max(1, Math.floor(maxAgeSeconds))}`
  ];
  if (secure) parts.push('Secure');
  appendSetCookie(reply, parts.join('; '));
}

function clearOAuthTransactionCookie(reply: Parameters<typeof appendSetCookie>[0]): void {
  appendSetCookie(reply, [
    `${oauthTransactionCookieName}=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0`,
    `${oauthTransactionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    `__Host-${oauthTransactionCookieName}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  ]);
}

function safeGoogleCallbackError(error: unknown): string {
  if (error instanceof GoogleAuthConfigError) return 'google_not_configured';
  if (error instanceof GoogleOidcError && safeGoogleOidcErrorCodes.has(error.code)) return error.code;
  return 'google_callback_failed';
}

function authRateLimitKey(ip: string): string {
  return (ip || 'unknown').slice(0, 128);
}

function authErrorReply(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }, error: unknown, fallback: string) {
  if (error instanceof AuthStoreError && error.code === 'duplicate_user') return reply.code(409).send({ error: error.message });
  if (error instanceof AuthStoreError && error.code === 'rate_limited') return reply.code(429).send({ error: error.message });
  if (error instanceof AuthStoreError && error.code === 'local_auth_disabled') return reply.code(403).send({ error: error.message });
  return reply.code(401).send({ error: fallback });
}
