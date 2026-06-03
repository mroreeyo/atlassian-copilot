import { createHash, randomBytes } from 'node:crypto';
import { URLSearchParams } from 'node:url';
import { createSession } from './authStore.js';
import { consumeOAuthTransaction, hashOpaque, storeOAuthTransaction, upsertGoogleUser } from './authDb.js';

export interface GoogleStartResult {
  url: string;
  state: string;
  nonce: string;
}

export interface GoogleCallbackResult {
  session: ReturnType<typeof createSession>;
  returnTo: string;
}

interface GoogleTokenResponse {
  id_token?: unknown;
  access_token?: unknown;
  error?: unknown;
}

interface GoogleClaims {
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

const googleAuthEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
const googleTokenEndpoint = 'https://oauth2.googleapis.com/token';

export function googleAuthConfigured(env = process.env): boolean {
  return env.AKC_ENABLE_GOOGLE_AUTH === 'true'
    && Boolean(env.GOOGLE_CLIENT_ID?.trim())
    && Boolean(env.GOOGLE_CLIENT_SECRET?.trim())
    && Boolean(googleRedirectUri(env));
}

export function googleAuthEnabledFlag(env = process.env): boolean {
  return env.AKC_ENABLE_GOOGLE_AUTH === 'true';
}

export function startGoogleOidc(returnTo: string, env = process.env): GoogleStartResult {
  assertGoogleConfigured(env);
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const pkceVerifier = randomBytes(32).toString('base64url');
  storeOAuthTransaction({ state, nonce, pkceVerifier, returnTo }, env);
  const url = new URL(googleAuthEndpoint);
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID!.trim());
  url.searchParams.set('redirect_uri', googleRedirectUri(env));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', base64url(createHash('sha256').update(pkceVerifier).digest()));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');
  const hd = env.GOOGLE_ALLOWED_HOSTED_DOMAIN?.trim();
  if (hd) url.searchParams.set('hd', hd);
  return { url: url.toString(), state, nonce };
}

export async function completeGoogleOidcCallback(input: { code?: string | undefined; state?: string | undefined }, env = process.env): Promise<GoogleCallbackResult | null> {
  assertGoogleConfigured(env);
  if (!input.code || !input.state) return null;
  const transaction = consumeOAuthTransaction(input.state, env);
  if (!transaction) return null;
  const token = await exchangeCode(input.code, transaction.pkceVerifier, env);
  const idToken = typeof token.id_token === 'string' ? token.id_token : undefined;
  if (!idToken) return null;
  const claims = parseAndValidateIdToken(idToken, transaction.nonceHash, env);
  if (!claims) return null;
  const user = upsertGoogleUser({
    sub: claims.sub,
    email: claims.email,
    emailVerified: claims.emailVerified,
    displayName: claims.name,
    avatarUrl: claims.picture,
    hostedDomain: claims.hd,
    rawClaimsHash: hashOpaque(JSON.stringify(claims.raw))
  }, env);
  return { session: createSession(user, env), returnTo: transaction.returnTo };
}

async function exchangeCode(code: string, pkceVerifier: string, env = process.env): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID!.trim(),
    client_secret: env.GOOGLE_CLIENT_SECRET!.trim(),
    redirect_uri: googleRedirectUri(env),
    grant_type: 'authorization_code',
    code_verifier: pkceVerifier
  });
  const response = await fetch(googleTokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body
  });
  if (!response.ok) return {};
  return await response.json() as GoogleTokenResponse;
}

function parseAndValidateIdToken(idToken: string, nonceHash: string, env = process.env): { sub: string; email: string; emailVerified: boolean; name?: string; picture?: string; hd?: string; raw: GoogleClaims } | null {
  const parts = idToken.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  let claims: GoogleClaims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as GoogleClaims;
  } catch {
    return null;
  }
  const issuer = String(claims.iss ?? '');
  const audience = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud ?? '')];
  const exp = Number(claims.exp);
  const sub = typeof claims.sub === 'string' ? claims.sub : '';
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  const nonce = typeof claims.nonce === 'string' ? claims.nonce : '';
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  const allowedHd = env.GOOGLE_ALLOWED_HOSTED_DOMAIN?.trim();
  const hd = typeof claims.hd === 'string' ? claims.hd : undefined;
  if (issuer !== 'https://accounts.google.com' && issuer !== 'accounts.google.com') return null;
  if (!audience.includes(env.GOOGLE_CLIENT_ID!.trim())) return null;
  if (typeof claims.azp === 'string' && claims.azp && claims.azp !== env.GOOGLE_CLIENT_ID!.trim()) return null;
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now() - 300_000) return null;
  if (!sub || !email || !emailVerified) return null;
  if (hashOpaque(nonce) !== nonceHash) return null;
  if (allowedHd && hd !== allowedHd) return null;
  const name = typeof claims.name === 'string' ? claims.name : undefined;
  const picture = typeof claims.picture === 'string' ? claims.picture : undefined;
  return { sub, email, emailVerified, name, picture, hd, raw: claims };
}

function assertGoogleConfigured(env = process.env): void {
  if (!googleAuthEnabledFlag(env)) throw new GoogleAuthConfigError('Google 로그인은 아직 활성화되어 있지 않습니다.');
  if (!googleAuthConfigured(env)) throw new GoogleAuthConfigError('Google 로그인 설정이 완전하지 않습니다.');
}

function googleRedirectUri(env = process.env): string {
  const explicit = env.GOOGLE_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const base = env.AKC_AUTH_BASE_URL?.trim() || 'http://localhost:8787';
  return `${base.replace(/\/+$/, '')}/api/auth/google/callback`;
}

function base64url(value: Buffer): string {
  return value.toString('base64url');
}

export class GoogleAuthConfigError extends Error {}
