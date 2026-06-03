import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { decryptSecret, encryptSecret, type EncryptedSecret, readJsonProfile, removeJsonProfile, writeJsonProfile } from '../settings/credentialStore.js';

const oauthTransactionsFileName = 'oauth-transactions.json';
const oauthTransactionTtlMs = 10 * 60 * 1000;
const pkceVerifierBytes = 32;

interface StoredOAuthTransactions {
  version: 1;
  transactions: StoredOAuthTransaction[];
}

interface StoredOAuthTransaction {
  id: string;
  stateHash: string;
  nonceHash: string;
  encryptedNonce: EncryptedSecret;
  codeVerifierHash: string;
  encryptedCodeVerifier: EncryptedSecret;
  codeChallenge: string;
  returnTo: string;
  createdAt: string;
  expiresAt: number;
  consumedAt?: string;
}

export interface OAuthTransactionStart {
  id: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  returnTo: string;
  expiresAt: number;
}

export interface ConsumedOAuthTransaction {
  id: string;
  nonce: string;
  codeChallenge: string;
  returnTo: string;
}

export function createOAuthTransaction(returnTo = '/', now = Date.now()): OAuthTransactionStart {
  const state = randomToken(32);
  const nonce = randomToken(32);
  const codeVerifier = createPkceVerifier();
  const codeChallenge = derivePkceChallenge(codeVerifier);
  const createdAt = new Date(now).toISOString();
  const expiresAt = now + oauthTransactionTtlMs;
  const transaction: StoredOAuthTransaction = {
    id: randomToken(16),
    stateHash: hashSecret(state),
    nonceHash: hashSecret(nonce),
    encryptedNonce: encryptSecret(nonce),
    codeVerifierHash: hashSecret(codeVerifier),
    encryptedCodeVerifier: encryptSecret(codeVerifier),
    codeChallenge,
    returnTo: sanitizeReturnTo(returnTo),
    createdAt,
    expiresAt
  };

  const store = readOAuthTransactions();
  writeOAuthTransactions({
    version: 1,
    transactions: [...store.transactions.filter((candidate) => !isExpired(candidate, now)), transaction]
  });

  return { id: transaction.id, state, nonce, codeChallenge, codeChallengeMethod: 'S256', returnTo: transaction.returnTo, expiresAt };
}

export function consumeOAuthTransaction(state: string, now = Date.now()): ConsumedOAuthTransaction | null {
  const store = readOAuthTransactions();
  const transaction = store.transactions.find((candidate) => isActiveStateMatch(candidate, state, now));
  if (!transaction) {
    writeOAuthTransactions({ version: 1, transactions: store.transactions.filter((candidate) => !isExpired(candidate, now)) });
    return null;
  }

  const nonce = decryptStoredNonce(transaction);
  const codeVerifier = decryptStoredCodeVerifier(transaction);
  const consumedAt = new Date(now).toISOString();
  writeOAuthTransactions({
    version: 1,
    transactions: store.transactions
      .filter((candidate) => !isExpired(candidate, now))
      .map((candidate) => candidate.id === transaction.id ? { ...candidate, consumedAt } : candidate)
  });

  if (!nonce || !codeVerifier) return null;
  return {
    id: transaction.id,
    nonce,
    codeVerifier,
    codeChallenge: transaction.codeChallenge,
    returnTo: transaction.returnTo
  };
}

export function derivePkceChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

export function clearOAuthTransactionsForTests(): void {
  removeJsonProfile(oauthTransactionsFileName);
}

function readOAuthTransactions(): StoredOAuthTransactions {
  const parsed = readJsonProfile<StoredOAuthTransactions>(oauthTransactionsFileName, 1) ?? { version: 1, transactions: [] };
  return { version: 1, transactions: parsed.transactions.filter(isStoredOAuthTransaction) };
}

function writeOAuthTransactions(store: StoredOAuthTransactions): void {
  writeJsonProfile(oauthTransactionsFileName, store);
}

function decryptStoredNonce(transaction: StoredOAuthTransaction): string | null {
  const decrypted = decryptSecret(transaction.encryptedNonce);
  if (!decrypted) return null;
  if (!safeEqual(hashSecret(decrypted), transaction.nonceHash)) return null;
  return decrypted;
}

function decryptStoredCodeVerifier(transaction: StoredOAuthTransaction): string | null {
  const decrypted = decryptSecret(transaction.encryptedCodeVerifier);
  if (!decrypted) return null;
  if (!safeEqual(hashSecret(decrypted), transaction.codeVerifierHash)) return null;
  if (derivePkceChallenge(decrypted) !== transaction.codeChallenge) return null;
  return decrypted;
}

function isActiveStateMatch(transaction: StoredOAuthTransaction, state: string, now: number): boolean {
  return !transaction.consumedAt && !isExpired(transaction, now) && safeEqual(transaction.stateHash, hashSecret(state));
}

function isExpired(transaction: StoredOAuthTransaction, now: number): boolean {
  return transaction.expiresAt <= now;
}

function createPkceVerifier(): string {
  return randomBytes(pkceVerifierBytes).toString('base64url');
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

function sanitizeReturnTo(returnTo: string): string {
  const trimmed = returnTo.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

function isStoredOAuthTransaction(value: unknown): value is StoredOAuthTransaction {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredOAuthTransaction>;
  return typeof candidate.id === 'string'
    && typeof candidate.stateHash === 'string'
    && typeof candidate.nonceHash === 'string'
    && isEncryptedSecret(candidate.encryptedNonce)
    && typeof candidate.codeVerifierHash === 'string'
    && typeof candidate.codeChallenge === 'string'
    && typeof candidate.returnTo === 'string'
    && typeof candidate.createdAt === 'string'
    && typeof candidate.expiresAt === 'number'
    && isEncryptedSecret(candidate.encryptedCodeVerifier)
    && (candidate.consumedAt === undefined || typeof candidate.consumedAt === 'string');
}

function isEncryptedSecret(value: unknown): value is EncryptedSecret {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<EncryptedSecret>;
  return candidate.algorithm === 'aes-256-gcm'
    && typeof candidate.iv === 'string'
    && typeof candidate.tag === 'string'
    && typeof candidate.ciphertext === 'string';
}
