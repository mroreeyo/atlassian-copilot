import type { FastifyReply, FastifyRequest } from 'fastify';
import { sessionMaxAgeSeconds, resolveSession, destroySession } from './authStore.js';
import { resolveDbSession, revokeDbSessionByHash, verifyCsrfToken, type ResolvedSession } from './authDb.js';

export const authCookieName = 'akc_session';

export function readCookie(request: FastifyRequest, name: string): string | undefined {
  return parseCookieHeader(request.headers.cookie).get(name);
}

export function readCookieAlias(request: FastifyRequest, name: string): string | undefined {
  return readCookie(request, name) ?? readCookie(request, `__Host-${name}`);
}

export function readSessionCookie(request: FastifyRequest): string | undefined {
  if (shouldUseSecureCookie(request)) return readCookie(request, `__Host-${authCookieName}`);
  return readCookieAlias(request, authCookieName);
}

export function currentAuthUser(request: FastifyRequest) {
  return resolveSession(readSessionCookie(request));
}

export function currentAuthSession(request: FastifyRequest): ResolvedSession | null {
  return resolveDbSession(readSessionCookie(request));
}

export function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = currentAuthUser(request);
  if (user) return user;
  reply.code(401).send({ error: '로그인이 필요합니다.' });
  return null;
}

export function requireAuthSession(request: FastifyRequest, reply: FastifyReply): ResolvedSession | null {
  const session = currentAuthSession(request);
  if (session) return session;
  reply.code(401).send({ error: '로그인이 필요합니다.' });
  return null;
}

export function requireCsrf(request: FastifyRequest, reply: FastifyReply, session = currentAuthSession(request)): boolean {
  const token = request.headers['x-csrf-token'];
  const value = Array.isArray(token) ? token[0] : token;
  if (verifyCsrfToken(session, value)) return true;
  reply.code(403).send({ error: 'CSRF 토큰이 없거나 올바르지 않습니다.' });
  return false;
}

export function setSessionCookie(reply: FastifyReply, request: FastifyRequest, sessionId: string): void {
  appendSetCookie(reply, serializeSessionCookie(sessionId, request));
}

export function clearSessionCookie(reply: FastifyReply): void {
  appendSetCookie(reply, [
    `${authCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    `__Host-${authCookieName}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  ]);
}

export function appendSetCookie(reply: FastifyReply, cookies: string | string[]): void {
  const existing = reply.getHeader('Set-Cookie');
  const next = [
    ...headerToCookieArray(existing),
    ...(Array.isArray(cookies) ? cookies : [cookies])
  ];
  reply.header('Set-Cookie', next);
}

export function invalidateRequestSession(request: FastifyRequest): void {
  destroySession(readSessionCookie(request));
}

export function rotateRequestSession(request: FastifyRequest): void {
  const session = currentAuthSession(request);
  if (session) revokeDbSessionByHash(session.idHash);
}

function serializeSessionCookie(sessionId: string, request: FastifyRequest): string {
  const secure = shouldUseSecureCookie(request);
  const name = secure ? `__Host-${authCookieName}` : authCookieName;
  const parts = [
    `${name}=${encodeURIComponent(sessionId)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${sessionMaxAgeSeconds()}`
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function shouldUseSecureCookie(request: FastifyRequest): boolean {
  const forwardedProto = request.headers['x-forwarded-proto'];
  const forwarded = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return process.env.NODE_ENV === 'production' || forwarded === 'https' || request.protocol === 'https';
}

function headerToCookieArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function parseCookieHeader(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header?.split(';') ?? []) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies.set(key, decodeURIComponent(value));
    } catch {
      // Ignore malformed percent-encoded cookies instead of failing the request.
    }
  }
  return cookies;
}
