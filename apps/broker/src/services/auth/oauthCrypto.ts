import { createHash, randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, type EncryptedSecret } from '../settings/credentialStore.js';

export function randomOAuthToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

export function sha256Base64Url(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export function pkceS256Challenge(verifier: string): string {
  return sha256Base64Url(verifier);
}

export function encryptPkceVerifier(verifier: string): EncryptedSecret {
  return encryptSecret(verifier);
}

export function decryptPkceVerifier(secret: EncryptedSecret): string | undefined {
  return decryptSecret(secret);
}
