import type { AuthUser } from '@akc/shared';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { profilePath } from '../settings/credentialStore.js';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const sessionIdleTtlMs = 60 * 60 * 1000;
const sessionTokenBytes = 32;
const csrfTokenBytes = 32;
const authDbFileName = 'auth.sqlite';

interface SessionRow {
  id_hash: string;
  user_id: string;
  email: string;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  idle_expires_at: number;
  revoked_at: number | null;
  csrf_token_hash: string;
}

export interface StoredAuthSession {
  sessionId: string;
  csrfToken: string;
  user: AuthUser;
  expiresAt: number;
  idleExpiresAt: number;
}

export interface ResolvedAuthSession {
  user: AuthUser;
  csrfToken?: string;
  expiresAt: number;
  idleExpiresAt: number;
}

let db: DatabaseSync | null = null;
let dbPath: string | null = null;

export function createDbSession(user: AuthUser, now = Date.now()): StoredAuthSession {
  const sessionId = randomToken(sessionTokenBytes);
  const csrfToken = randomToken(csrfTokenBytes);
  const expiresAt = now + sessionTtlMs;
  const idleExpiresAt = now + sessionIdleTtlMs;
  database().prepare(`
    insert into sessions (id_hash, user_id, email, created_at, last_seen_at, expires_at, idle_expires_at, revoked_at, csrf_token_hash)
    values (?, ?, ?, ?, ?, ?, ?, null, ?)
  `).run(hashSecret(sessionId), localUserId(user.email), user.email, now, now, expiresAt, idleExpiresAt, hashSecret(csrfToken));
  return { sessionId, csrfToken, user, expiresAt, idleExpiresAt };
}

export function resolveDbSession(sessionId: string | undefined, options: { rotateCsrf?: boolean; now?: number } = {}): ResolvedAuthSession | null {
  if (!sessionId) return null;
  const now = options.now ?? Date.now();
  const row = readActiveSession(sessionId, now);
  if (!row) return null;
  const csrfToken = options.rotateCsrf ? randomToken(csrfTokenBytes) : undefined;
  const idleExpiresAt = Math.min(now + sessionIdleTtlMs, row.expires_at);
  database().prepare(`
    update sessions
    set last_seen_at = ?, idle_expires_at = ?, csrf_token_hash = coalesce(?, csrf_token_hash)
    where id_hash = ? and revoked_at is null
  `).run(now, idleExpiresAt, csrfToken ? hashSecret(csrfToken) : null, row.id_hash);
  return {
    user: { email: row.email, createdAt: new Date(row.created_at).toISOString() },
    csrfToken,
    expiresAt: row.expires_at,
    idleExpiresAt
  };
}

export function verifyDbSessionCsrf(sessionId: string | undefined, csrfToken: string | undefined, now = Date.now()): boolean {
  if (!sessionId || !csrfToken) return false;
  const row = readActiveSession(sessionId, now);
  return Boolean(row && safeEqual(row.csrf_token_hash, hashSecret(csrfToken)));
}

export function revokeDbSession(sessionId: string | undefined, now = Date.now()): void {
  if (!sessionId) return;
  database().prepare('update sessions set revoked_at = ? where id_hash = ? and revoked_at is null').run(now, hashSecret(sessionId));
}

export function sessionMaxAgeSeconds(): number {
  return Math.floor(sessionTtlMs / 1000);
}

export function clearDbSessionsForTests(): void {
  database().exec('delete from sessions');
}

export function closeAuthDbForTests(): void {
  if (db) db.close();
  db = null;
  dbPath = null;
}

function readActiveSession(sessionId: string, now: number): SessionRow | null {
  purgeExpiredSessions(now);
  const row = database().prepare('select * from sessions where id_hash = ? and revoked_at is null').get(hashSecret(sessionId)) as SessionRow | undefined;
  if (!row) return null;
  if (row.expires_at <= now || row.idle_expires_at <= now) {
    revokeDbSession(sessionId, now);
    return null;
  }
  return row;
}

function purgeExpiredSessions(now: number): void {
  database().prepare('update sessions set revoked_at = ? where revoked_at is null and (expires_at <= ? or idle_expires_at <= ?)').run(now, now, now);
}

function database(): DatabaseSync {
  const nextPath = profilePath(authDbFileName);
  if (db && dbPath === nextPath) return db;
  if (db) db.close();
  ensurePrivateDir(dirname(nextPath));
  db = new DatabaseSync(nextPath);
  dbPath = nextPath;
  db.exec('pragma foreign_keys = ON');
  db.exec('pragma journal_mode = WAL');
  db.exec('pragma busy_timeout = 5000');
  db.exec(`
    create table if not exists schema_migrations (
      version integer primary key,
      applied_at text not null
    );
    create table if not exists sessions (
      id_hash text primary key,
      user_id text not null,
      email text not null,
      csrf_token_hash text not null,
      created_at integer not null,
      last_seen_at integer not null,
      expires_at integer not null,
      idle_expires_at integer not null,
      revoked_at integer
    );
    create index if not exists idx_sessions_expires_at on sessions(expires_at);
    create index if not exists idx_sessions_idle_expires_at on sessions(idle_expires_at);
    create index if not exists idx_sessions_user_id on sessions(user_id);
    insert or ignore into schema_migrations(version, applied_at) values (1, datetime('now'));
  `);
  try {
    chmodSync(nextPath, 0o600);
  } catch {
    // Windows-mounted filesystems may ignore POSIX modes; state dir remains outside source control.
  }
  return db;
}

function ensurePrivateDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    // Windows-mounted filesystems may ignore POSIX modes.
  }
}

function localUserId(email: string): string {
  return `local:${email}`;
}

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
