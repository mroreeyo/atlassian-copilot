import type { FastifyReply, FastifyRequest } from 'fastify';
import { sessionMaxAgeSeconds, resolveSession, destroySession } from './authStore.js';

export const authCookieName = 'akc_session';

export function readSessionCookie(request: FastifyRequest): string | undefined {
  const cookies = parseCookieHeader(request.headers.cookie);
  return cookies.get(authCookieName);
}

export function currentAuthUser(request: FastifyRequest) {
  return resolveSession(readSessionCookie(request));
}

export function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = currentAuthUser(request);
  if (user) return user;
  reply.code(401).send({ error: '로그인이 필요합니다.' });
  return null;
}

export function setSessionCookie(reply: FastifyReply, request: FastifyRequest, sessionId: string): void {
  reply.header('Set-Cookie', serializeSessionCookie(sessionId, request));
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.header('Set-Cookie', `${authCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export function invalidateRequestSession(request: FastifyRequest): void {
  destroySession(readSessionCookie(request));
}

function serializeSessionCookie(sessionId: string, request: FastifyRequest): string {
  const parts = [
    `${authCookieName}=${encodeURIComponent(sessionId)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${sessionMaxAgeSeconds()}`
  ];
  if (shouldUseSecureCookie(request)) parts.push('Secure');
  return parts.join('; ');
}

function shouldUseSecureCookie(request: FastifyRequest): boolean {
  const forwardedProto = request.headers['x-forwarded-proto'];
  const forwarded = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return process.env.NODE_ENV === 'production' || forwarded === 'https' || request.protocol === 'https';
}

function parseCookieHeader(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header?.split(';') ?? []) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies.set(key, decodeURIComponent(value));
  }
  return cookies;
}
