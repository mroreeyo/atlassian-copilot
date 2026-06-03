import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { googleAuthConfig, sanitizeGoogleReturnTo, type GoogleAuthConfig } from '../../config/googleAuth.js';
import { consumeOAuthTransaction, createDbSession, hashOpaque, storeOAuthTransaction, upsertGoogleUser, type DbSession } from './authDb.js';
import { pkceS256Challenge } from './oauthCrypto.js';

export interface GoogleTokenClaims {
  iss?: unknown;
  aud?: unknown;
  azp?: unknown;
  exp?: unknown;
  iat?: unknown;
  nonce?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
  hd?: unknown;
}

export interface GoogleOidcClient {
  authorizationUrl(input: { state: string; nonce: string; codeChallenge: string }): string;
  exchangeAndVerify(input: { code: string; pkceVerifier: string }): Promise<GoogleTokenClaims>;
}

export interface GoogleStartResult {
  url: string;
  transactionCookie: { value: string; maxAgeSeconds: number };
}

export interface GoogleCallbackResult {
  session: DbSession;
  returnTo: string;
}

let testClient: GoogleOidcClient | null = null;

export function googleOidcClient(config: GoogleAuthConfig): GoogleOidcClient {
  return testClient ?? new GoogleAuthLibraryOidcClient(config);
}

export function setGoogleOidcClientForTests(client: GoogleOidcClient | null): void {
  testClient = client;
}

export function googleAuthEnabledFlag(env = process.env): boolean {
  return env.AKC_ENABLE_GOOGLE_AUTH === 'true';
}

export function googleAuthConfigured(env = process.env): boolean {
  return googleAuthConfig(env).enabled;
}

export function startGoogleOidc(returnTo = '/settings', env = process.env): GoogleStartResult {
  const config = requireGoogleConfig(env);
  const state = randomOAuthValue();
  const nonce = randomOAuthValue();
  const pkceVerifier = randomOAuthValue(48);
  const browserBinding = randomOAuthValue();
  const safeReturnTo = sanitizeGoogleReturnTo(returnTo);
  storeOAuthTransaction({ state, nonce, pkceVerifier, browserBinding, returnTo: safeReturnTo }, env);
  const url = googleOidcClient(config).authorizationUrl({ state, nonce, codeChallenge: pkceS256Challenge(pkceVerifier) });
  return { url, transactionCookie: { value: browserBinding, maxAgeSeconds: Math.floor(config.transactionTtlMs / 1000) } };
}

export async function completeGoogleOidcCallback(input: { code?: string; state?: string; browserBinding?: string }, env = process.env): Promise<GoogleCallbackResult> {
  const config = requireGoogleConfig(env);
  if (!input.code || !input.state || !input.browserBinding) throw new GoogleOidcError('invalid_oauth_transaction');
  const transaction = consumeOAuthTransaction(input.state, input.browserBinding, env);
  if (!transaction) throw new GoogleOidcError('invalid_oauth_transaction');
  const claims = await googleOidcClient(config).exchangeAndVerify({ code: input.code, pkceVerifier: transaction.pkceVerifier });
  const profile = validateGoogleClaims(claims, { clientId: config.clientId, nonceHash: transaction.nonceHash, hostedDomain: config.hostedDomain });
  const user = upsertGoogleUser({
    sub: profile.sub,
    email: profile.email,
    emailVerified: true,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    hostedDomain: profile.hostedDomain,
    rawClaimsHash: hashClaims(claims)
  }, env);
  return { session: createDbSession(user, env), returnTo: sanitizeGoogleReturnTo(transaction.returnTo) };
}

export function validateGoogleClaims(claims: GoogleTokenClaims, expected: { clientId: string; nonceHash: string; hostedDomain?: string | undefined }): {
  sub: string;
  email: string;
  displayName?: string | undefined;
  avatarUrl?: string | undefined;
  hostedDomain?: string | undefined;
} {
  const issuer = stringClaim(claims.iss);
  if (issuer !== 'https://accounts.google.com' && issuer !== 'accounts.google.com') throw new GoogleOidcError('invalid_issuer');
  const audiences = Array.isArray(claims.aud) ? claims.aud.map((value) => String(value)) : [String(claims.aud ?? '')];
  if (!audiences.includes(expected.clientId)) throw new GoogleOidcError('invalid_audience');
  const azp = stringClaim(claims.azp);
  if (azp && azp !== expected.clientId) throw new GoogleOidcError('invalid_authorized_party');
  const exp = numberClaim(claims.exp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!exp || exp <= nowSeconds - 300) throw new GoogleOidcError('token_expired');
  const iat = numberClaim(claims.iat);
  if (iat && iat > nowSeconds + 300) throw new GoogleOidcError('token_issued_in_future');
  const nonce = stringClaim(claims.nonce);
  if (!nonce || !safeEqual(hashOpaque(nonce), expected.nonceHash)) throw new GoogleOidcError('invalid_nonce');
  const sub = stringClaim(claims.sub);
  if (!sub || sub.length > 255) throw new GoogleOidcError('invalid_subject');
  const email = stringClaim(claims.email)?.trim().toLowerCase();
  if (!email || !email.includes('@')) throw new GoogleOidcError('invalid_email');
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new GoogleOidcError('email_not_verified');
  const hostedDomain = stringClaim(claims.hd);
  if (expected.hostedDomain && hostedDomain !== expected.hostedDomain) throw new GoogleOidcError('hosted_domain_denied');
  return {
    sub,
    email,
    displayName: stringClaim(claims.name),
    avatarUrl: stringClaim(claims.picture),
    hostedDomain
  };
}

class GoogleAuthLibraryOidcClient implements GoogleOidcClient {
  private readonly oauth2: OAuth2Client;

  constructor(private readonly config: GoogleAuthConfig) {
    this.oauth2 = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  }

  authorizationUrl(input: { state: string; nonce: string; codeChallenge: string }): string {
    return this.oauth2.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      response_type: 'code',
      prompt: 'select_account',
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      redirect_uri: this.config.redirectUri,
      ...(this.config.hostedDomain ? { hd: this.config.hostedDomain } : {})
    });
  }

  async exchangeAndVerify(input: { code: string; pkceVerifier: string }): Promise<GoogleTokenClaims> {
    const { tokens } = await this.oauth2.getToken({ code: input.code, codeVerifier: input.pkceVerifier, redirect_uri: this.config.redirectUri });
    if (!tokens.id_token) throw new GoogleOidcError('missing_id_token');
    const ticket = await this.oauth2.verifyIdToken({ idToken: tokens.id_token, audience: this.config.clientId });
    const payload = ticket.getPayload();
    if (!payload) throw new GoogleOidcError('missing_id_token_payload');
    return payload as GoogleTokenClaims;
  }
}

function requireGoogleConfig(env: NodeJS.ProcessEnv): GoogleAuthConfig {
  const config = googleAuthConfig(env);
  if (!config.enabled) throw new GoogleAuthConfigError(config.disabledReason ?? 'google_auth_disabled');
  return config;
}

function randomOAuthValue(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function hashClaims(claims: GoogleTokenClaims): string {
  return createHash('sha256')
    .update(JSON.stringify({ iss: claims.iss, aud: claims.aud, azp: claims.azp, sub: claims.sub, email_verified: claims.email_verified, hd: claims.hd }))
    .digest('base64url');
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberClaim(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export class GoogleAuthConfigError extends Error {
  constructor(public readonly code: string) {
    super(code === 'google_auth_disabled' ? 'Google 로그인은 현재 비활성화되어 있습니다.' : 'Google 로그인 설정이 완료되지 않았습니다.');
  }
}

export class GoogleOidcError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
