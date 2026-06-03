import { OAuth2Client } from 'google-auth-library';
import type { GoogleAuthConfig } from '../../config/googleAuth.js';

export interface GoogleTokenClaims {
  iss: string;
  aud: string | string[];
  azp?: string;
  exp: number;
  iat?: number;
  nonce: string;
  sub: string;
  email: string;
  email_verified: boolean | 'true' | 'false';
  name?: string;
  picture?: string;
  hd?: string;
}

export interface GoogleOidcClient {
  authorizationUrl(input: { state: string; nonce: string; codeChallenge: string; returnTo: string }): string;
  exchangeAndVerify(input: { code: string; pkceVerifier: string; nonce: string }): Promise<GoogleTokenClaims>;
}

let testClient: GoogleOidcClient | null = null;

export function googleOidcClient(config: GoogleAuthConfig): GoogleOidcClient {
  if (testClient) return testClient;
  return new GoogleAuthLibraryOidcClient(config);
}

export function setGoogleOidcClientForTests(client: GoogleOidcClient | null): void {
  testClient = client;
}

class GoogleAuthLibraryOidcClient implements GoogleOidcClient {
  private readonly oauth2: OAuth2Client;

  constructor(private readonly config: GoogleAuthConfig) {
    this.oauth2 = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  }

  authorizationUrl(input: { state: string; nonce: string; codeChallenge: string }): string {
    return this.oauth2.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      response_type: 'code',
      prompt: 'select_account',
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
      ...(this.config.hostedDomain ? { hd: this.config.hostedDomain } : {})
    });
  }

  async exchangeAndVerify(input: { code: string; pkceVerifier: string; nonce: string }): Promise<GoogleTokenClaims> {
    const { tokens } = await this.oauth2.getToken({ code: input.code, codeVerifier: input.pkceVerifier, redirect_uri: this.config.redirectUri });
    if (!tokens.id_token) throw new GoogleOidcError('missing_id_token');
    const ticket = await this.oauth2.verifyIdToken({ idToken: tokens.id_token, audience: this.config.clientId });
    const payload = ticket.getPayload();
    if (!payload) throw new GoogleOidcError('missing_id_token_payload');
    const claims = payload as GoogleTokenClaims;
    validateGoogleClaims(claims, { clientId: this.config.clientId, hostedDomain: this.config.hostedDomain });
    return claims;
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
  const result: { sub: string; email: string; emailVerified: boolean; name?: string; picture?: string; hd?: string; raw: GoogleClaims } = { sub, email, emailVerified, raw: claims };
  if (typeof claims.name === 'string') result.name = claims.name;
  if (typeof claims.picture === 'string') result.picture = claims.picture;
  if (hd) result.hd = hd;
  return result;
}

export function validateGoogleClaims(claims: GoogleTokenClaims, expected: { clientId: string; nonce?: string; hostedDomain?: string }): void {
  if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') throw new GoogleOidcError('invalid_issuer');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(expected.clientId)) throw new GoogleOidcError('invalid_audience');
  if (claims.azp && claims.azp !== expected.clientId) throw new GoogleOidcError('invalid_authorized_party');
  if (!claims.sub || claims.sub.length > 255) throw new GoogleOidcError('invalid_subject');
  if (expected.nonce && claims.nonce !== expected.nonce) throw new GoogleOidcError('invalid_nonce');
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new GoogleOidcError('email_not_verified');
  if (!claims.email || !claims.email.includes('@')) throw new GoogleOidcError('invalid_email');
  if (expected.hostedDomain && claims.hd !== expected.hostedDomain) throw new GoogleOidcError('hosted_domain_denied');
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (claims.exp <= nowSeconds - 300) throw new GoogleOidcError('token_expired');
}

export class GoogleOidcError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
