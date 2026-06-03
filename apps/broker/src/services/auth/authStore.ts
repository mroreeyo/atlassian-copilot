import type { AuthLoginRequest, AuthSignupRequest, AuthUser } from '@akc/shared';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
  clearAuthDbForTests,
  createDbSession,
  findLocalCredential,
  insertLocalUser,
  localUserExists,
  resolveDbSession,
  revokeDbSession,
  sessionMaxAgeSeconds as dbSessionMaxAgeSeconds,
  type DbSession
} from './authDb.js';

const scryptAsync = promisify(scrypt);
const authFailureWindowMs = 15 * 60 * 1000;
const maxFailuresPerWindow = 5;

interface FailureBucket {
  count: number;
  resetsAt: number;
}

export type AuthSession = DbSession;

const authFailures = new Map<string, FailureBucket>();

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isLocalAuthEnabled(env = process.env): boolean {
  return env.AKC_ENABLE_LOCAL_AUTH !== 'false';
}

export async function signupLocalUser(input: AuthSignupRequest, env = process.env): Promise<AuthUser> {
  if (!isLocalAuthEnabled(env)) throw new AuthStoreError('local_auth_disabled', '로컬 이메일/비밀번호 가입은 현재 비활성화되어 있습니다.');
  const email = normalizeAuthEmail(input.email);
  if (localUserExists(email, env)) throw new AuthStoreError('duplicate_user', '이미 가입된 이메일입니다.');
  const passwordSalt = randomBytes(16).toString('base64url');
  const passwordHash = await hashPassword(input.password, passwordSalt);
  return insertLocalUser(email, passwordHash, passwordSalt, env);
}

export async function loginLocalUser(input: AuthLoginRequest, rateLimitKey: string, env = process.env): Promise<AuthSession> {
  if (!isLocalAuthEnabled(env)) throw new AuthStoreError('local_auth_disabled', '로컬 이메일/비밀번호 로그인은 현재 비활성화되어 있습니다.');
  const email = normalizeAuthEmail(input.email);
  assertNotRateLimited(email, rateLimitKey);
  const credential = findLocalCredential(email, env);
  const ok = credential ? await verifyPassword(input.password, credential.password_hash, credential.password_salt) : false;
  if (!ok || !credential) {
    recordAuthFailure(email, rateLimitKey);
    throw new AuthStoreError('invalid_credentials', '이메일 또는 비밀번호가 올바르지 않습니다.');
  }
  clearAuthFailures(email, rateLimitKey);
  return createSession(credential.user, env);
}

export function createSession(user: AuthUser, env = process.env): AuthSession {
  return createDbSession(user, env);
}

export function resolveSession(sessionId: string | undefined, env = process.env): AuthUser | null {
  return resolveDbSession(sessionId, env)?.user ?? null;
}

export function destroySession(sessionId: string | undefined, env = process.env): void {
  revokeDbSession(sessionId, env);
}

export function sessionMaxAgeSeconds(env = process.env): number {
  return dbSessionMaxAgeSeconds(env);
}

export function clearAuthStateForTests(env = process.env): void {
  authFailures.clear();
  clearAuthDbForTests(env);
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const derived = await scryptAsync(password, salt, 64);
  return Buffer.from(derived as Buffer).toString('base64');
}

async function verifyPassword(password: string, passwordHash: string, passwordSalt: string): Promise<boolean> {
  const candidate = Buffer.from(await hashPassword(password, passwordSalt), 'base64');
  const stored = Buffer.from(passwordHash, 'base64');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function rateLimitKeys(email: string, requestKey: string): string[] {
  return [`email:${email}`, `ip:${requestKey}`];
}

function assertNotRateLimited(email: string, requestKey: string): void {
  const now = Date.now();
  for (const key of rateLimitKeys(email, requestKey)) {
    const bucket = authFailures.get(key);
    if (!bucket) continue;
    if (bucket.resetsAt <= now) {
      authFailures.delete(key);
      continue;
    }
    if (bucket.count >= maxFailuresPerWindow) throw new AuthStoreError('rate_limited', '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.');
  }
}

function recordAuthFailure(email: string, requestKey: string): void {
  const now = Date.now();
  for (const key of rateLimitKeys(email, requestKey)) {
    const current = authFailures.get(key);
    authFailures.set(key, !current || current.resetsAt <= now
      ? { count: 1, resetsAt: now + authFailureWindowMs }
      : { count: current.count + 1, resetsAt: current.resetsAt });
  }
}

function clearAuthFailures(email: string, requestKey: string): void {
  for (const key of rateLimitKeys(email, requestKey)) authFailures.delete(key);
}

export class AuthStoreError extends Error {
  constructor(public readonly code: 'duplicate_user' | 'invalid_credentials' | 'rate_limited' | 'local_auth_disabled', message: string) {
    super(message);
  }
}
