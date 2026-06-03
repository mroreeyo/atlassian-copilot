import type { AuthLoginRequest, AuthSignupRequest, AuthUser } from '@akc/shared';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
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
const usersFileName = 'auth-users.json';
const googleIdentitiesFileName = 'auth-google-identities.json';
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const authFailureWindowMs = 15 * 60 * 1000;
const maxFailuresPerWindow = 5;

interface StoredAuthUsers {
  version: 1;
  users: StoredAuthUser[];
}

interface StoredAuthUser {
  id?: string;
  email: string;
  passwordHash?: string;
  passwordSalt?: string;
  createdAt: string;
  updatedAt?: string;
  displayName?: string;
  avatarUrl?: string;
}

interface GoogleIdentityStore {
  version: 1;
  identities: StoredGoogleIdentity[];
}

interface StoredGoogleIdentity {
  id: string;
  userId: string;
  provider: 'google';
  providerSubject: string;
  emailAtLogin: string;
  emailVerified: boolean;
  hostedDomain?: string;
  rawClaimsHash: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredSession {
  email: string;
  expiresAt: number;
  userId?: string;
}

interface FailureBucket {
  count: number;
  resetsAt: number;
}

export interface AuthSession extends DbSession {}

export interface GoogleIdentityInput {
  providerSubject: string;
  email: string;
  emailVerified: boolean;
  hostedDomain?: string;
  displayName?: string;
  avatarUrl?: string;
  rawClaimsHash?: string;
}

export interface GoogleIdentityUserResult {
  user: AuthUser;
  userId: string;
}

const sessions = new Map<string, StoredSession>();
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
  if (localUserExists(email, env)) {
    throw new AuthStoreError('duplicate_user', '이미 가입된 이메일입니다.');
  }

  const passwordSalt = randomBytes(16).toString('base64url');
  const passwordHash = await hashPassword(input.password, passwordSalt);
  const createdAt = new Date().toISOString();
  const user: StoredAuthUser = { id: randomUUID(), email, passwordHash, passwordSalt, createdAt, updatedAt: createdAt };
  writeAuthUsers({ version: 1, users: [...store.users, user] });
  return publicUser(user);
}

export async function loginLocalUser(input: AuthLoginRequest, rateLimitKey: string, env = process.env): Promise<AuthSession> {
  if (!isLocalAuthEnabled(env)) throw new AuthStoreError('local_auth_disabled', '로컬 이메일/비밀번호 로그인은 현재 비활성화되어 있습니다.');
  const email = normalizeAuthEmail(input.email);
  assertNotRateLimited(email, rateLimitKey);
  const users = readAuthUsers().users;
  const user = users.find((candidate) => candidate.email === email && candidate.passwordHash && candidate.passwordSalt);
  const ok = user ? await verifyPassword(input.password, user) : false;
  if (!ok || !user) {
    recordAuthFailure(email, rateLimitKey);
    throw new AuthStoreError('invalid_credentials', '이메일 또는 비밀번호가 올바르지 않습니다.');
  }

  clearAuthFailures(email, rateLimitKey);
  return createSession(publicUser(user), user.id);
}

export function upsertGoogleIdentityUser(input: GoogleIdentityInput): GoogleIdentityUserResult {
  if (!input.emailVerified) throw new AuthStoreError('invalid_google_identity', 'Google 이메일 검증이 필요합니다.');
  const email = normalizeAuthEmail(input.email);
  const now = new Date().toISOString();
  const usersStore = ensureUserIds(readAuthUsers());
  const identityStore = readGoogleIdentities();
  const providerSubject = input.providerSubject.trim();
  const rawClaimsHash = input.rawClaimsHash ?? createHash('sha256').update(JSON.stringify({ providerSubject, email, hostedDomain: input.hostedDomain ?? null })).digest('base64url');
  const existingIdentity = identityStore.identities.find((identity) => identity.provider === 'google' && identity.providerSubject === providerSubject);

  if (existingIdentity) {
    const user = usersStore.users.find((candidate) => candidate.id === existingIdentity.userId);
    if (!user) throw new AuthStoreError('invalid_google_identity', 'Google identity에 연결된 사용자를 찾을 수 없습니다.');
    user.email = email;
    user.updatedAt = now;
    user.displayName = input.displayName;
    user.avatarUrl = input.avatarUrl;
    existingIdentity.emailAtLogin = email;
    existingIdentity.emailVerified = input.emailVerified;
    existingIdentity.rawClaimsHash = rawClaimsHash;
    existingIdentity.updatedAt = now;
    if (input.hostedDomain) existingIdentity.hostedDomain = input.hostedDomain;
    else delete existingIdentity.hostedDomain;
    writeAuthUsers(usersStore);
    writeGoogleIdentities(identityStore);
    return { user: publicUser(user), userId: existingIdentity.userId };
  }

  const userId = randomUUID();
  const user: StoredAuthUser = {
    id: userId,
    email,
    createdAt: now,
    updatedAt: now,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl
  };
  const identity: StoredGoogleIdentity = {
    id: randomUUID(),
    userId,
    provider: 'google',
    providerSubject,
    emailAtLogin: email,
    emailVerified: input.emailVerified,
    rawClaimsHash,
    createdAt: now,
    updatedAt: now,
    ...(input.hostedDomain ? { hostedDomain: input.hostedDomain } : {})
  };
  writeAuthUsers({ version: 1, users: [...usersStore.users, user] });
  writeGoogleIdentities({ version: 1, identities: [...identityStore.identities, identity] });
  return { user: publicUser(user), userId };
}

export function createSession(user: AuthUser, userId?: string): AuthSession {
  purgeExpiredSessions();
  const sessionId = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + sessionTtlMs;
  sessions.set(sessionId, { email: user.email, expiresAt, ...(userId ? { userId } : {}) });
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
  const users = readAuthUsers().users;
  const user = session.userId ? users.find((candidate) => candidate.id === session.userId) : users.find((candidate) => candidate.email === session.email);
  return user ? publicUser(user) : null;
}

export function destroySession(sessionId: string | undefined, env = process.env): void {
  revokeDbSession(sessionId, env);
}

export function sessionMaxAgeSeconds(): number {
  return dbSessionMaxAgeSeconds();
}

export function clearAuthStateForTests(env = process.env): void {
  authFailures.clear();
  removeJsonProfile(usersFileName);
  removeJsonProfile(googleIdentitiesFileName);
}

function readAuthUsers(): StoredAuthUsers {
  return readJsonProfile<StoredAuthUsers>(usersFileName, 1) ?? { version: 1, users: [] };
}

function writeAuthUsers(store: StoredAuthUsers): void {
  writeJsonProfile(usersFileName, store);
}

function readGoogleIdentities(): GoogleIdentityStore {
  return readJsonProfile<GoogleIdentityStore>(googleIdentitiesFileName, 1) ?? { version: 1, identities: [] };
}

function writeGoogleIdentities(store: GoogleIdentityStore): void {
  writeJsonProfile(googleIdentitiesFileName, store);
}

function ensureUserIds(store: StoredAuthUsers): StoredAuthUsers {
  let changed = false;
  for (const user of store.users) {
    if (!user.id) {
      user.id = randomUUID();
      user.updatedAt = user.updatedAt ?? user.createdAt;
      changed = true;
    }
  }
  if (changed) writeAuthUsers(store);
  return store;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const derived = await scryptAsync(password, salt, 64);
  return Buffer.from(derived as Buffer).toString('base64');
}

async function verifyPassword(password: string, user: StoredAuthUser): Promise<boolean> {
  if (!user.passwordHash || !user.passwordSalt) return false;
  const candidate = Buffer.from(await hashPassword(password, user.passwordSalt), 'base64');
  const stored = Buffer.from(user.passwordHash, 'base64');
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

export class AuthStoreError extends Error {
  constructor(public readonly code: 'duplicate_user' | 'invalid_credentials' | 'rate_limited' | 'invalid_google_identity', message: string) {
    super(message);
  }
}
