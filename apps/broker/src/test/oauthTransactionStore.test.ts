// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { clearOAuthTransactionsForTests, consumeOAuthTransaction, createOAuthTransaction, derivePkceChallenge } from '../services/auth/oauthTransactionStore.js';

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
    const stored = readStoredTransactionsFile();

    expect(transaction.codeChallengeMethod).toBe('S256');
    expect(transaction.nonce).toHaveLength(43);
    expect(stored).not.toContain(transaction.nonce);
    expect(stored).toContain('encryptedNonce');
    expect(stored).toContain('encryptedCodeVerifier');
    expect(stored).toContain('codeVerifierHash');

    const consumed = consumeOAuthTransaction(transaction.state);
    expect(consumed).toMatchObject({
      id: transaction.id,
      nonce: transaction.nonce,
      codeChallenge: transaction.codeChallenge,
      returnTo: '/settings?tab=auth'
    });
    expect(consumed?.codeVerifier).toHaveLength(43);
    expect(transaction.codeChallenge).toBe(derivePkceChallenge(consumed?.codeVerifier ?? ''));
  });

  it('rejects replayed, missing, and expired OAuth transactions', () => {
    const now = Date.now();
    const transaction = createOAuthTransaction('/history', now);

    expect(consumeOAuthTransaction('missing-state', now + 1)).toBeNull();
    const consumed = consumeOAuthTransaction(transaction.state, now + 1);
    expect(consumed?.nonce).toBe(transaction.nonce);
    expect(consumed?.codeVerifier).toHaveLength(43);
    expect(consumeOAuthTransaction(transaction.state, now + 2)).toBeNull();

    const expired = createOAuthTransaction('/settings', now);
    expect(consumeOAuthTransaction(expired.state, now + 10 * 60 * 1000 + 1)).toBeNull();
  });

  it('does not accept legacy hash-only PKCE records because Google code exchange needs the original verifier', () => {
    writeFileSync(join(stateDir, 'oauth-transactions.json'), JSON.stringify({
      version: 1,
      transactions: [{
        id: 'hash-only',
        stateHash: 'hash-only-state',
        nonceHash: 'hash-only-nonce',
        codeVerifierHash: 'stored-hash-without-recoverable-verifier',
        codeChallenge: 'challenge',
        returnTo: '/',
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + 60_000
      }]
    }));

    expect(consumeOAuthTransaction('anything')).toBeNull();
  });
});

function readStoredTransactionsFile(): string {
  return readFileSync(join(stateDir, 'oauth-transactions.json'), 'utf8');
}

function restoreEnv(key: 'AKC_BROKER_STATE_DIR' | 'AKC_CREDENTIAL_ENCRYPTION_KEY' | 'NODE_ENV', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
