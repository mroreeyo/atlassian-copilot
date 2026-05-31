import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const keyFileName = '.credential-key';

export interface EncryptedSecret {
  algorithm: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
}

export function resolveStateDir(env = process.env): string {
  if (env.AKC_BROKER_STATE_DIR) return resolve(env.AKC_BROKER_STATE_DIR);
  return join(homedir(), '.ax-knowledge-copilot', 'broker');
}

export function profilePath(fileName: string, env = process.env): string {
  return join(resolveStateDir(env), fileName);
}

export function readJsonProfile<T extends { version: number }>(fileName: string, version: T['version'], env = process.env): T | null {
  const file = profilePath(fileName, env);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as T;
    return parsed.version === version ? parsed : null;
  } catch {
    return null;
  }
}

export function writeJsonProfile(fileName: string, contents: unknown, env = process.env): void {
  writePrivateFile(profilePath(fileName, env), JSON.stringify(contents, null, 2));
}

export function removeJsonProfile(fileName: string, env = process.env): void {
  const file = profilePath(fileName, env);
  if (existsSync(file)) rmSync(file, { force: true });
}

export function encryptSecret(value: string, env = process.env): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', readOrCreateKey(env), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

export function decryptSecret(secret: EncryptedSecret, env = process.env): string | undefined {
  try {
    const decipher = createDecipheriv('aes-256-gcm', readOrCreateKey(env), Buffer.from(secret.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return undefined;
  }
}

function keyPath(env = process.env): string {
  return join(resolveStateDir(env), keyFileName);
}

function readOrCreateKey(env = process.env): Buffer {
  const file = keyPath(env);
  ensurePrivateDir(dirname(file));
  if (existsSync(file)) {
    const key = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
    if (key.length === 32) return key;
  }
  const key = randomBytes(32);
  writePrivateFile(file, key.toString('base64'));
  return key;
}

function ensurePrivateDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    // Windows-mounted filesystems may ignore POSIX modes; keep the directory server-side and gitignored.
  }
}

function writePrivateFile(file: string, contents: string): void {
  ensurePrivateDir(dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, contents, { mode: 0o600 });
  renameSync(tmp, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    // See ensurePrivateDir note.
  }
}
