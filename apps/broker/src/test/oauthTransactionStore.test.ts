// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { clearOAuthTransactionsForTests, consumeOAuthTransaction, createOAuthTransaction, derivePkceChallenge, nonceHashForTests } from '../services/auth/oauthTransactionStore.js';
import { getAuthDb } from '../services/auth/authDb.js';

let stateDir: string;
const originalStateDir = process.env.AKC_BROKER_STATE_DIR;
const originalEncryptionKey = process.env.AKC_CREDENTIAL_ENCRYPTION_KEY;
const originalNodeEnv = process.env.NODE_ENV;

beforeAll(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'akc-oauth-transaction-test-'));
  process.env.AKC_BROKER_STATE_DIR = stateDir;
  delete process.env.AKC_CREDENTIAL_ENCRYPTION_KEY;
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  clearOAuthTransactionsForTests();
});

afterAll(() => {
  restoreEnv('AKC_BROKER_STATE_DIR', originalStateDir);
  restoreEnv('AKC_CREDENTIAL_ENCRYPTION_KEY', originalEncryptionKey);
  restoreEnv('NODE_ENV', originalNodeEnv);
  rmSync(stateDir, { recursive: true, force: true });
});

describe('oauth transaction PKCE storage', () => {
  it('stores recoverable encrypted PKCE verifier material instead of a hash-only verifier', () => {
    const transaction = createOAuthTransaction('/settings?tab=auth');
    const stored = readStoredAuthDbFile();
    const row = getAuthDb().prepare('SELECT state_hash, nonce_hash, browser_binding_hash, pkce_verifier_ciphertext, pkce_verifier_hash FROM oauth_transactions').get() as { state_hash: string; nonce_hash: string; browser_binding_hash: string; pkce_verifier_ciphertext: string; pkce_verifier_hash: string };

    expect(transaction.codeChallengeMethod).toBe('S256');
    expect(transaction.nonce).toHaveLength(43);
    expect(stored.includes(Buffer.from(transaction.state))).toBe(false);
    expect(stored.includes(Buffer.from(transaction.nonce))).toBe(false);
    expect(stored.includes(Buffer.from(transaction.browserBinding))).toBe(false);
    expect(row.state_hash).not.toBe(transaction.state);
    expect(row.nonce_hash).toBe(nonceHashForTests(transaction.nonce));
    expect(row.browser_binding_hash).toHaveLength(43);
    expect(row.pkce_verifier_ciphertext).toContain('ciphertext');
    expect(row.pkce_verifier_hash).toHaveLength(43);

    expect(consumeOAuthTransaction(transaction.state, 'wrong-browser-binding')).toBeNull();
    const consumed = consumeOAuthTransaction(transaction.state, transaction.browserBinding);
    expect(consumed).toMatchObject({
      nonceHash: nonceHashForTests(transaction.nonce),
      codeChallenge: transaction.codeChallenge,
      returnTo: '/settings?tab=auth'
    });
    expect(consumed?.pkceVerifier).toHaveLength(64);
    expect(transaction.codeChallenge).toBe(derivePkceChallenge(consumed?.pkceVerifier ?? ''));
  });

  it('rejects replayed, missing, and expired OAuth transactions', () => {
    const now = Date.now();
    const transaction = createOAuthTransaction('/history', now);

    expect(consumeOAuthTransaction('missing-state', transaction.browserBinding, now + 1)).toBeNull();
    expect(consumeOAuthTransaction(transaction.state, 'wrong-browser-binding', now + 1)).toBeNull();
    const consumed = consumeOAuthTransaction(transaction.state, transaction.browserBinding, now + 1);
    expect(consumed?.nonceHash).toBe(nonceHashForTests(transaction.nonce));
    expect(consumed?.pkceVerifier).toHaveLength(64);
    expect(consumeOAuthTransaction(transaction.state, transaction.browserBinding, now + 2)).toBeNull();

    const expired = createOAuthTransaction('/settings', now);
    expect(consumeOAuthTransaction(expired.state, expired.browserBinding, now + 10 * 60 * 1000 + 1)).toBeNull();
  });
});

function readStoredAuthDbFile(): Buffer {
  return readFileSync(join(stateDir, 'auth.sqlite'));
}

function restoreEnv(key: 'AKC_BROKER_STATE_DIR' | 'AKC_CREDENTIAL_ENCRYPTION_KEY' | 'NODE_ENV', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
