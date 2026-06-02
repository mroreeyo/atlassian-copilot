import type { FastifyInstance } from 'fastify';
import { AuthLoginRequestSchema, AuthSessionResponseSchema, AuthSignupRequestSchema } from '@akc/shared';
import { AuthStoreError, loginLocalUser, signupLocalUser } from '../services/auth/authStore.js';
import { clearSessionCookie, currentAuthUser, invalidateRequestSession, setSessionCookie } from '../services/auth/sessionCookie.js';

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post('/api/auth/signup', async (request, reply) => {
    const parsed = AuthSignupRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '가입 정보가 올바르지 않습니다.' });
    try {
      const user = await signupLocalUser(parsed.data);
      const session = await loginLocalUser({ email: parsed.data.email, password: parsed.data.password }, authRateLimitKey(request.ip, request.headers['x-forwarded-for']));
      setSessionCookie(reply, request, session.sessionId);
      return reply.code(201).send(AuthSessionResponseSchema.parse({ user }));
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
      return reply.send(AuthSessionResponseSchema.parse({ user: session.user }));
    } catch (error) {
      return authErrorReply(reply, error, '이메일 또는 비밀번호가 올바르지 않습니다.');
    }
  });

  app.get('/api/auth/session', async (request, reply) => {
    const user = currentAuthUser(request);
    if (!user) return reply.code(401).send({ error: '로그인이 필요합니다.' });
    return reply.send(AuthSessionResponseSchema.parse({ user }));
  });

  app.post('/api/auth/logout', async (request, reply) => {
    invalidateRequestSession(request);
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });
}

function authRateLimitKey(ip: string, forwarded: string | string[] | undefined): string {
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (firstForwarded?.split(',')[0]?.trim() || ip || 'unknown').slice(0, 128);
}

function authErrorReply(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }, error: unknown, fallback: string) {
  if (error instanceof AuthStoreError && error.code === 'duplicate_user') return reply.code(409).send({ error: error.message });
  if (error instanceof AuthStoreError && error.code === 'rate_limited') return reply.code(429).send({ error: error.message });
  return reply.code(401).send({ error: fallback });
}
