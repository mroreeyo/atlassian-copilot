import type { AuthUser } from '@akc/shared';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { decryptSecret, encryptSecret, resolveStateDir, type EncryptedSecret } from '../settings/credentialStore.js';

const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const sessionIdleTtlMs = 60 * 60 * 1000;
const oauthTtlMs = 10 * 60 * 1000;

let cachedPath: string | null = null;
let cachedDb: DatabaseSync | null = null;

interface UserRow {
  id: string;
  primary_email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
}

interface LocalCredentialRow {
  user_id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  created_at: string;
}

interface SessionRow extends UserRow {
  id_hash: string;
  csrf_secret_hash: string;
  expires_at: string;
  idle_expires_at: string;
  revoked_at: string | null;
}

interface OAuthTransactionRow {
  state_hash: string;
  nonce_hash: string;
  pkce_verifier_ciphertext: string;
  pkce_verifier_hash: string;
  return_to: string;
  expires_at: string;
  consumed_at: string | null;
}

export interface DbSession {
  sessionId: string;
  csrfToken: string;
  user: AuthUser;
  expiresAt: number;
}

export interface ResolvedSession {
  idHash: string;
  csrfSecretHash: string;
  user: AuthUser;
  expiresAt: number;
}

export interface OAuthTransactionInput {
  state: string;
  nonce: string;
  pkceVerifier: string;
  returnTo: string;
}

export interface ConsumedOAuthTransaction {
  nonceHash: string;
  pkceVerifier: string;
  returnTo: string;
}

export interface GoogleProfileInput {
  sub: string;
  email: string;
  emailVerified: boolean;
  displayName?: string | undefined;
  avatarUrl?: string | undefined;
  hostedDomain?: string | undefined;
  rawClaimsHash?: string | undefined;
}

export function getAuthDb(env = process.env): DatabaseSync {
  const dbPath = resolveAuthDbPath(env);
  if (cachedDb && cachedPath === dbPath) return cachedDb;
  cachedDb?.close();
  ensurePrivateDir(dirname(dbPath));
  const db = new DatabaseSync(dbPath);
  cachedPath = dbPath;
  cachedDb = db;
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  try { chmodSync(dbPath, 0o600); } catch { /* Windows-mounted filesystems may ignore POSIX modes. */ }
  return db;
}

export function resolveAuthDbPath(env = process.env): string {
  const configured = env.AKC_AUTH_DB_PATH?.trim();
  if (configured) return isAbsolute(configured) ? configured : resolve(resolveStateDir(env), configured);
  return join(resolveStateDir(env), 'auth.sqlite');
}

export function insertLocalUser(email: string, passwordHash: string, passwordSalt: string, env = process.env): AuthUser {
  const db = getAuthDb(env);
  const now = new Date().toISOString();
  const id = `usr_${randomBytes(16).toString('base64url')}`;
  db.prepare('INSERT INTO users (id, primary_email, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, email, now, now);
  db.prepare('INSERT INTO local_credentials (user_id, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, email, passwordHash, passwordSalt, now);
  return { id, email, createdAt: now };
}

export function findLocalCredential(email: string, env = process.env): (LocalCredentialRow & { user: AuthUser }) | null {
  const row = getAuthDb(env).prepare(`
    SELECT lc.user_id, lc.email, lc.password_hash, lc.password_salt, lc.created_at,
           u.id, u.primary_email, u.display_name, u.avatar_url, u.created_at AS user_created_at, u.updated_at, u.disabled_at
    FROM local_credentials lc
    JOIN users u ON u.id = lc.user_id
    WHERE lc.email = ? AND u.disabled_at IS NULL
  `).get(email) as (LocalCredentialRow & UserRow & { user_created_at: string }) | undefined;
  if (!row) return null;
  return { ...row, user: publicUser({ ...row, created_at: row.user_created_at }) };
}

export function localUserExists(email: string, env = process.env): boolean {
  const row = getAuthDb(env).prepare('SELECT 1 AS ok FROM local_credentials WHERE email = ?').get(email) as { ok: number } | undefined;
  return Boolean(row);
}

export function createDbSession(user: AuthUser, env = process.env): DbSession {
  cleanupExpiredAuthRows(env);
  const sessionId = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const expiresAt = nowMs + readHours(env.AKC_AUTH_SESSION_TTL_HOURS, 168) * 60 * 60 * 1000;
  const idleExpiresAt = nowMs + readMinutes(env.AKC_AUTH_SESSION_IDLE_TTL_MINUTES, sessionIdleTtlMs / 60000) * 60 * 1000;
  getAuthDb(env).prepare(`
    INSERT INTO sessions (id_hash, user_id, csrf_secret_hash, created_at, last_seen_at, expires_at, idle_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(hashOpaque(sessionId), user.id, hashOpaque(csrfToken), now, now, new Date(expiresAt).toISOString(), new Date(idleExpiresAt).toISOString());
  return { sessionId, csrfToken, user, expiresAt };
}

export function resolveDbSession(sessionId: string | undefined, env = process.env): ResolvedSession | null {
  if (!sessionId) return null;
  const idHash = hashOpaque(sessionId);
  const row = getAuthDb(env).prepare(`
    SELECT s.id_hash, s.csrf_secret_hash, s.expires_at, s.idle_expires_at, s.revoked_at,
           u.id, u.primary_email, u.display_name, u.avatar_url, u.created_at, u.updated_at, u.disabled_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id_hash = ?
  `).get(idHash) as SessionRow | undefined;
  if (!row || row.revoked_at || row.disabled_at) return null;
  const now = Date.now();
  const expiresAt = Date.parse(row.expires_at);
  const idleExpiresAt = Date.parse(row.idle_expires_at);
  if (expiresAt <= now || idleExpiresAt <= now) {
    revokeDbSession(sessionId, env);
    return null;
  }
  const nextIdle = new Date(now + readMinutes(env.AKC_AUTH_SESSION_IDLE_TTL_MINUTES, sessionIdleTtlMs / 60000) * 60 * 1000).toISOString();
  getAuthDb(env).prepare('UPDATE sessions SET last_seen_at = ?, idle_expires_at = min_datetime(?, expires_at) WHERE id_hash = ?')
    .run(new Date(now).toISOString(), nextIdle, idHash);
  return { idHash, csrfSecretHash: row.csrf_secret_hash, user: publicUser(row), expiresAt };
}

export function revokeDbSession(sessionId: string | undefined, env = process.env): void {
  if (!sessionId) return;
  getAuthDb(env).prepare('UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id_hash = ?')
    .run(new Date().toISOString(), hashOpaque(sessionId));
}

export function revokeDbSessionByHash(idHash: string, env = process.env): void {
  getAuthDb(env).prepare('UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id_hash = ?')
    .run(new Date().toISOString(), idHash);
}

export function verifyCsrfToken(session: ResolvedSession | null, token: string | undefined): boolean {
  return Boolean(session && token && hashOpaque(token) === session.csrfSecretHash);
}

export function sessionMaxAgeSeconds(): number {
  return Math.floor(sessionTtlMs / 1000);
}

export function storeOAuthTransaction(input: OAuthTransactionInput, env = process.env): void {
  cleanupExpiredAuthRows(env);
  const nowMs = Date.now();
  const ttl = readMinutes(env.AKC_AUTH_OAUTH_TRANSACTION_TTL_MINUTES, oauthTtlMs / 60000) * 60 * 1000;
  getAuthDb(env).prepare(`
    INSERT INTO oauth_transactions (state_hash, nonce_hash, pkce_verifier_ciphertext, pkce_verifier_hash, return_to, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    hashOpaque(input.state),
    hashOpaque(input.nonce),
    JSON.stringify(encryptSecret(input.pkceVerifier, env)),
    hashOpaque(input.pkceVerifier),
    input.returnTo,
    new Date(nowMs).toISOString(),
    new Date(nowMs + ttl).toISOString()
  );
}

export function consumeOAuthTransaction(state: string | undefined, env = process.env): ConsumedOAuthTransaction | null {
  if (!state) return null;
  const stateHash = hashOpaque(state);
  const row = getAuthDb(env).prepare('SELECT * FROM oauth_transactions WHERE state_hash = ?').get(stateHash) as OAuthTransactionRow | undefined;
  if (!row || row.consumed_at || Date.parse(row.expires_at) <= Date.now()) return null;
  getAuthDb(env).prepare('UPDATE oauth_transactions SET consumed_at = ? WHERE state_hash = ? AND consumed_at IS NULL')
    .run(new Date().toISOString(), stateHash);
  const verifier = decryptSecret(JSON.parse(row.pkce_verifier_ciphertext) as EncryptedSecret, env);
  if (!verifier || hashOpaque(verifier) !== row.pkce_verifier_hash) return null;
  return { nonceHash: row.nonce_hash, pkceVerifier: verifier, returnTo: row.return_to };
}

export function upsertGoogleUser(profile: GoogleProfileInput, env = process.env): AuthUser {
  const db = getAuthDb(env);
  const now = new Date().toISOString();
  const identity = db.prepare(`
    SELECT u.*
    FROM user_identities i
    JOIN users u ON u.id = i.user_id
    WHERE i.provider = 'google' AND i.provider_subject = ?
  `).get(profile.sub) as UserRow | undefined;

  if (identity) {
    db.prepare('UPDATE users SET primary_email = ?, display_name = ?, avatar_url = ?, updated_at = ? WHERE id = ?')
      .run(profile.email, profile.displayName ?? null, profile.avatarUrl ?? null, now, identity.id);
    db.prepare(`
      UPDATE user_identities
      SET email_at_login = ?, email_verified = ?, hosted_domain = ?, raw_claims_hash = ?, updated_at = ?
      WHERE provider = 'google' AND provider_subject = ?
    `).run(profile.email, profile.emailVerified ? 1 : 0, profile.hostedDomain ?? null, profile.rawClaimsHash ?? null, now, profile.sub);
    return publicUser({ ...identity, primary_email: profile.email, display_name: profile.displayName ?? identity.display_name, avatar_url: profile.avatarUrl ?? identity.avatar_url, updated_at: now });
  }

  const userId = `usr_${randomBytes(16).toString('base64url')}`;
  db.prepare('INSERT INTO users (id, primary_email, display_name, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, profile.email, profile.displayName ?? null, profile.avatarUrl ?? null, now, now);
  db.prepare(`
    INSERT INTO user_identities (id, user_id, provider, provider_subject, email_at_login, email_verified, hosted_domain, raw_claims_hash, created_at, updated_at)
    VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?, ?)
  `).run(`gid_${randomBytes(16).toString('base64url')}`, userId, profile.sub, profile.email, profile.emailVerified ? 1 : 0, profile.hostedDomain ?? null, profile.rawClaimsHash ?? null, now, now);
  return { id: userId, email: profile.email, displayName: profile.displayName, avatarUrl: profile.avatarUrl, createdAt: now };
}

export function cleanupExpiredAuthRows(env = process.env): void {
  const now = new Date().toISOString();
  const db = getAuthDb(env);
  db.prepare('DELETE FROM oauth_transactions WHERE expires_at <= ? OR consumed_at IS NOT NULL').run(now);
  db.prepare('UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE expires_at <= ? OR idle_expires_at <= ?').run(now, now, now);
}

export function clearAuthDbForTests(env = process.env): void {
  const db = getAuthDb(env);
  db.exec('DELETE FROM oauth_transactions; DELETE FROM sessions; DELETE FROM user_identities; DELETE FROM local_credentials; DELETE FROM users;');
}

export function hashOpaque(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
    CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY,
      primary_email TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      disabled_at TEXT
    );
    CREATE TABLE IF NOT EXISTS local_credentials(
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_identities(
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_subject TEXT NOT NULL,
      email_at_login TEXT,
      email_verified INTEGER NOT NULL,
      hosted_domain TEXT,
      raw_claims_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(provider, provider_subject)
    );
    CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);
    CREATE TABLE IF NOT EXISTS sessions(
      id_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_secret_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      idle_expires_at TEXT NOT NULL,
      revoked_at TEXT,
      user_agent_hash TEXT,
      ip_prefix_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at, idle_expires_at);
    CREATE TABLE IF NOT EXISTS oauth_transactions(
      state_hash TEXT PRIMARY KEY,
      nonce_hash TEXT NOT NULL,
      pkce_verifier_ciphertext TEXT NOT NULL,
      pkce_verifier_hash TEXT NOT NULL,
      pkce_verifier_key_id TEXT,
      return_to TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_oauth_transactions_expiry ON oauth_transactions(expires_at);
  `);
  db.function('min_datetime', { deterministic: true }, (a, b) => String(a) < String(b) ? String(a) : String(b));
}

function publicUser(row: UserRow): AuthUser {
  const user: AuthUser = { id: row.id, email: row.primary_email, createdAt: row.created_at };
  if (row.display_name) user.displayName = row.display_name;
  if (row.avatar_url) user.avatarUrl = row.avatar_url;
  return user;
}

function ensurePrivateDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch { /* Windows-mounted filesystems may ignore POSIX modes. */ }
}

function readHours(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readMinutes(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
