import { randomBytes } from 'node:crypto';
import { clearOAuthTransactionsForTests as clearDbOAuthTransactionsForTests, consumeOAuthTransaction as consumeDbOAuthTransaction, hashOpaque, storeOAuthTransaction } from './authDb.js';
import { pkceS256Challenge } from './oauthCrypto.js';

export interface OAuthTransactionStart {
  state: string;
  nonce: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  browserBinding: string;
  returnTo: string;
  expiresAt: number;
}

export interface ConsumedOAuthTransaction {
  nonceHash: string;
  pkceVerifier: string;
  codeChallenge: string;
  returnTo: string;
}

export function createOAuthTransaction(returnTo = '/settings', now = Date.now()): OAuthTransactionStart {
  const state = randomToken();
  const nonce = randomToken();
  const pkceVerifier = randomToken(48);
  const browserBinding = randomToken();
  const safeReturnTo = sanitizeReturnTo(returnTo);
  storeOAuthTransaction({ state, nonce, pkceVerifier, browserBinding, returnTo: safeReturnTo }, process.env, now);
  return {
    state,
    nonce,
    codeChallenge: pkceS256Challenge(pkceVerifier),
    codeChallengeMethod: 'S256',
    browserBinding,
    returnTo: safeReturnTo,
    expiresAt: now + readOauthTtlMs()
  };
}

export function consumeOAuthTransaction(state: string, browserBinding: string, now = Date.now()): ConsumedOAuthTransaction | null {
  const consumed = consumeDbOAuthTransaction(state, browserBinding, process.env, now);
  if (!consumed) return null;
  return {
    nonceHash: consumed.nonceHash,
    pkceVerifier: consumed.pkceVerifier,
    codeChallenge: pkceS256Challenge(consumed.pkceVerifier),
    returnTo: consumed.returnTo
  };
}

export function derivePkceChallenge(codeVerifier: string): string {
  return pkceS256Challenge(codeVerifier);
}

export function nonceHashForTests(nonce: string): string {
  return hashOpaque(nonce);
}

export function clearOAuthTransactionsForTests(): void {
  clearDbOAuthTransactionsForTests();
}

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function sanitizeReturnTo(returnTo: string): string {
  const trimmed = returnTo.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/settings';
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (!['/copilot', '/history', '/settings'].includes(parsed.pathname)) return '/settings';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/settings';
  }
}

function readOauthTtlMs(): number {
  const parsed = Number(process.env.AKC_AUTH_OAUTH_TRANSACTION_TTL_MINUTES);
  return (Number.isFinite(parsed) && parsed > 0 ? parsed : 10) * 60 * 1000;
}
