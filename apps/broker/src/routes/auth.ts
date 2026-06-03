import type { FastifyInstance } from 'fastify';
import { AuthLoginRequestSchema, AuthSessionResponseSchema, AuthSignupRequestSchema } from '@akc/shared';
import { AuthStoreError, loginLocalUser, signupLocalUser } from '../services/auth/authStore.js';
import { clearSessionCookie, currentAuthUser, invalidateRequestSession, setSessionCookie } from '../services/auth/sessionCookie.js';
import { registerGoogleAuthRoutes } from './googleAuth.js';

export function registerAuthRoutes(app: FastifyInstance): void {
  registerGoogleAuthRoutes(app);
  app.post('/api/auth/signup', async (request, reply) => {
    const parsed = AuthSignupRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '가입 정보가 올바르지 않습니다.' });
    try {
      const user = await signupLocalUser(parsed.data);
      const session = await loginLocalUser({ email: parsed.data.email, password: parsed.data.password }, authRateLimitKey(request.ip, request.headers['x-forwarded-for']));
      setSessionCookie(reply, request, session.sessionId);
      return reply.code(201).send(AuthSessionResponseSchema.parse({ user, csrfToken: session.csrfToken }));
    } catch (error) {
      return authErrorReply(reply, error, '가입할 수 없습니다.');
    }
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = AuthLoginRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    try {
      const session = await loginLocalUser(parsed.data, authRateLimitKey(request.ip, request.headers['x-forwarded-for']));
      setSessionCookie(reply, request, session.sessionId);
      return reply.send(AuthSessionResponseSchema.parse({ user: session.user, csrfToken: session.csrfToken }));
    } catch (error) {
      return authErrorReply(reply, error, '이메일 또는 비밀번호가 올바르지 않습니다.');
    }
  });

  app.get('/api/auth/session', async (request, reply) => {
    const session = currentAuthSession(request);
    if (!session) return reply.code(401).send({ error: '로그인이 필요합니다.' });
    return reply.send(AuthSessionResponseSchema.parse({ user: session.user }));
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
      const result = startGoogleOidc(safeReturnTo(query.returnTo));
      return reply.redirect(result.url, 302);
    } catch (error) {
      const status = error instanceof GoogleAuthConfigError ? (googleAuthEnabledFlag() ? 503 : 404) : 400;
      return reply.code(status).send({ error: error instanceof Error ? error.message : 'Google 로그인을 시작할 수 없습니다.' });
    }
  });

  app.get('/api/auth/google/callback', async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };
    if (query.error) return reply.redirect(`/login?authError=${encodeURIComponent('google_denied')}`, 302);
    try {
      rotateRequestSession(request);
      const result = await completeGoogleOidcCallback({ code: query.code, state: query.state });
      if (!result) return reply.redirect(`/login?authError=${encodeURIComponent('google_callback_failed')}`, 302);
      setSessionCookie(reply, request, result.session.sessionId);
      return reply.redirect(result.returnTo, 302);
    } catch (error) {
      const reason = error instanceof GoogleAuthConfigError ? 'google_not_configured' : 'google_callback_failed';
      return reply.redirect(`/login?authError=${encodeURIComponent(reason)}`, 302);
    }
  });
}

export function safeReturnTo(value: string | undefined): string {
  const fallback = '/settings';
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 512) return fallback;
  if (/[%][0-9a-f]{2}/i.test(trimmed)) {
    try {
      const decoded = decodeURIComponent(trimmed);
      if (/^https?:\/\//i.test(decoded) || decoded.startsWith('//')) return fallback;
    } catch {
      return fallback;
    }
  }
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(trimmed) || /^https?:\/\//i.test(trimmed)) return fallback;
  const url = new URL(trimmed, 'http://akc.local');
  const allowed = new Set(['/copilot', '/history', '/settings']);
  if (!allowed.has(url.pathname)) return fallback;
  if (url.pathname !== '/copilot' && (url.search || url.hash)) return url.pathname;
  return `${url.pathname}${url.search}${url.hash}`;
}

function authRateLimitKey(ip: string, forwarded: string | string[] | undefined): string {
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (firstForwarded?.split(',')[0]?.trim() || ip || 'unknown').slice(0, 128);
}

function authErrorReply(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }, error: unknown, fallback: string) {
  if (error instanceof AuthStoreError && error.code === 'duplicate_user') return reply.code(409).send({ error: error.message });
  if (error instanceof AuthStoreError && error.code === 'rate_limited') return reply.code(429).send({ error: error.message });
  if (error instanceof AuthStoreError && error.code === 'local_auth_disabled') return reply.code(403).send({ error: error.message });
  return reply.code(401).send({ error: fallback });
}
