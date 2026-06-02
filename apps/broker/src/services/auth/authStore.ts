import type { AuthLoginRequest, AuthSignupRequest, AuthUser } from '@akc/shared';
import { scrypt, timingSafeEqual, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { readJsonProfile, removeJsonProfile, writeJsonProfile } from '../settings/credentialStore.js';

const scryptAsync = promisify(scrypt);
const usersFileName = 'auth-users.json';
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const authFailureWindowMs = 15 * 60 * 1000;
const maxFailuresPerWindow = 5;

interface StoredAuthUsers {
  version: 1;
  users: StoredAuthUser[];
}

interface StoredAuthUser {
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
}

interface StoredSession {
  email: string;
  expiresAt: number;
}

interface FailureBucket {
  count: number;
  resetsAt: number;
}

export interface AuthSession {
  sessionId: string;
  user: AuthUser;
  expiresAt: number;
}

const sessions = new Map<string, StoredSession>();
const authFailures = new Map<string, FailureBucket>();

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function signupLocalUser(input: AuthSignupRequest): Promise<AuthUser> {
  const email = normalizeAuthEmail(input.email);
  const store = readAuthUsers();
  if (store.users.some((user) => user.email === email)) {
    throw new AuthStoreError('duplicate_user', '이미 가입된 이메일입니다.');
  }

  const passwordSalt = randomBytes(16).toString('base64url');
  const passwordHash = await hashPassword(input.password, passwordSalt);
  const createdAt = new Date().toISOString();
  const user: StoredAuthUser = { email, passwordHash, passwordSalt, createdAt };
  writeAuthUsers({ version: 1, users: [...store.users, user] });
  return publicUser(user);
}

export async function loginLocalUser(input: AuthLoginRequest, rateLimitKey: string): Promise<AuthSession> {
  const email = normalizeAuthEmail(input.email);
  assertNotRateLimited(email, rateLimitKey);
  const user = readAuthUsers().users.find((candidate) => candidate.email === email);
  const ok = user ? await verifyPassword(input.password, user) : false;
  if (!ok || !user) {
    recordAuthFailure(email, rateLimitKey);
    throw new AuthStoreError('invalid_credentials', '이메일 또는 비밀번호가 올바르지 않습니다.');
  }

  clearAuthFailures(email, rateLimitKey);
  return createSession(publicUser(user));
}

export function createSession(user: AuthUser): AuthSession {
  purgeExpiredSessions();
  const sessionId = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + sessionTtlMs;
  sessions.set(sessionId, { email: user.email, expiresAt });
  return { sessionId, user, expiresAt };
}

export function resolveSession(sessionId: string | undefined): AuthUser | null {
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  const user = readAuthUsers().users.find((candidate) => candidate.email === session.email);
  return user ? publicUser(user) : null;
}

export function destroySession(sessionId: string | undefined): void {
  if (sessionId) sessions.delete(sessionId);
}

export function sessionMaxAgeSeconds(): number {
  return Math.floor(sessionTtlMs / 1000);
}

export function clearAuthStateForTests(): void {
  sessions.clear();
  authFailures.clear();
  removeJsonProfile(usersFileName);
}

function readAuthUsers(): StoredAuthUsers {
  return readJsonProfile<StoredAuthUsers>(usersFileName, 1) ?? { version: 1, users: [] };
}

function writeAuthUsers(store: StoredAuthUsers): void {
  writeJsonProfile(usersFileName, store);
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const derived = await scryptAsync(password, salt, 64);
  return Buffer.from(derived as Buffer).toString('base64');
}

async function verifyPassword(password: string, user: StoredAuthUser): Promise<boolean> {
  const candidate = Buffer.from(await hashPassword(password, user.passwordSalt), 'base64');
  const stored = Buffer.from(user.passwordHash, 'base64');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function publicUser(user: StoredAuthUser): AuthUser {
  return { email: user.email, createdAt: user.createdAt };
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
    if (bucket.count >= maxFailuresPerWindow) {
      throw new AuthStoreError('rate_limited', '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.');
    }
  }
}

function recordAuthFailure(email: string, requestKey: string): void {
  const now = Date.now();
  for (const key of rateLimitKeys(email, requestKey)) {
    const current = authFailures.get(key);
    if (!current || current.resetsAt <= now) {
      authFailures.set(key, { count: 1, resetsAt: now + authFailureWindowMs });
    } else {
      authFailures.set(key, { count: current.count + 1, resetsAt: current.resetsAt });
    }
  }
}

function clearAuthFailures(email: string, requestKey: string): void {
  for (const key of rateLimitKeys(email, requestKey)) authFailures.delete(key);
}

function purgeExpiredSessions(): void {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt <= now) sessions.delete(sessionId);
  }
}

export class AuthStoreError extends Error {
  constructor(public readonly code: 'duplicate_user' | 'invalid_credentials' | 'rate_limited', message: string) {
    super(message);
  }
}
