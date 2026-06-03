import { decryptPkceVerifier, encryptPkceVerifier, sha256Base64Url } from './oauthCrypto.js';
import { readJsonProfile, removeJsonProfile, writeJsonProfile, type EncryptedSecret } from '../settings/credentialStore.js';

const oauthTransactionsFileName = 'oauth-transactions.json';

interface OAuthTransactionStoreFile {
  version: 1;
  transactions: StoredOAuthTransaction[];
}

interface StoredOAuthTransaction {
  stateHash: string;
  nonceHash: string;
  pkceVerifierCiphertext: EncryptedSecret;
  pkceVerifierHash: string;
  returnTo: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
}

export interface CreatedOAuthTransaction {
  stateHash: string;
  nonceHash: string;
}

export interface OAuthTransactionInput {
  state: string;
  nonce: string;
  pkceVerifier: string;
  returnTo: string;
  ttlMs: number;
}

export interface ConsumedOAuthTransaction {
  nonceHash: string;
  pkceVerifier: string;
  returnTo: string;
}

export function createOAuthTransaction(input: OAuthTransactionInput): CreatedOAuthTransaction {
  const now = new Date();
  const stateHash = sha256Base64Url(input.state);
  const nonceHash = sha256Base64Url(input.nonce);
  const store = readOAuthTransactions();
  const transaction: StoredOAuthTransaction = {
    stateHash,
    nonceHash,
    pkceVerifierCiphertext: encryptPkceVerifier(input.pkceVerifier),
    pkceVerifierHash: sha256Base64Url(input.pkceVerifier),
    returnTo: input.returnTo,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttlMs).toISOString()
  };
  writeOAuthTransactions({ version: 1, transactions: [...store.transactions.filter((candidate) => !isExpired(candidate, now)), transaction] });
  return { stateHash, nonceHash };
}

export function consumeOAuthTransaction(state: string): ConsumedOAuthTransaction | null {
  const now = new Date();
  const stateHash = sha256Base64Url(state);
  const store = readOAuthTransactions();
  const transaction = store.transactions.find((candidate) => candidate.stateHash === stateHash);
  const transactions = store.transactions.filter((candidate) => candidate.stateHash !== stateHash && !isExpired(candidate, now));
  writeOAuthTransactions({ version: 1, transactions });
  if (!transaction || transaction.consumedAt || isExpired(transaction, now)) return null;

  const pkceVerifier = decryptPkceVerifier(transaction.pkceVerifierCiphertext);
  if (!pkceVerifier || sha256Base64Url(pkceVerifier) !== transaction.pkceVerifierHash) return null;
  return { nonceHash: transaction.nonceHash, pkceVerifier, returnTo: transaction.returnTo };
}

export function clearOAuthTransactionsForTests(): void {
  removeJsonProfile(oauthTransactionsFileName);
}

function readOAuthTransactions(): OAuthTransactionStoreFile {
  return readJsonProfile<OAuthTransactionStoreFile>(oauthTransactionsFileName, 1) ?? { version: 1, transactions: [] };
}

function writeOAuthTransactions(store: OAuthTransactionStoreFile): void {
  writeJsonProfile(oauthTransactionsFileName, store);
}

function isExpired(transaction: StoredOAuthTransaction, now: Date): boolean {
  return Date.parse(transaction.expiresAt) <= now.getTime();
}
