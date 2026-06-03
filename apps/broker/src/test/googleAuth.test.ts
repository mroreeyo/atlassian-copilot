// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { setGoogleOidcClientForTests, type GoogleOidcClient, type GoogleTokenClaims } from '../services/auth/googleOidc.js';

let app: ReturnType<typeof buildApp>;
let stateDir: string;
let nextSubject = 'google-sub-1';
let lastStart: { state: string; nonce: string; codeChallenge: string } | null = null;
let nextHostedDomain: string | undefined;

const originalEnv = {
  AKC_BROKER_STATE_DIR: process.env.AKC_BROKER_STATE_DIR,
  AKC_ENABLE_GOOGLE_AUTH: process.env.AKC_ENABLE_GOOGLE_AUTH,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  GOOGLE_ALLOWED_HOSTED_DOMAIN: process.env.GOOGLE_ALLOWED_HOSTED_DOMAIN,
  AKC_AUTH_BASE_URL: process.env.AKC_AUTH_BASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  AKC_CREDENTIAL_ENCRYPTION_KEY: process.env.AKC_CREDENTIAL_ENCRYPTION_KEY
};

beforeAll(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'akc-google-auth-test-'));
  process.env.AKC_BROKER_STATE_DIR = stateDir;
  process.env.AKC_ENABLE_GOOGLE_AUTH = 'true';
  process.env.GOOGLE_CLIENT_ID = 'google-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
  process.env.AKC_AUTH_BASE_URL = 'http://localhost:8787';
  process.env.NODE_ENV = 'test';
  setGoogleOidcClientForTests(fakeGoogleClient());
  app = buildApp();
});

afterEach(() => {
  nextSubject = 'google-sub-1';
  lastStart = null;
  nextHostedDomain = undefined;
  delete process.env.GOOGLE_ALLOWED_HOSTED_DOMAIN;
  process.env.NODE_ENV = 'test';
  delete process.env.AKC_CREDENTIAL_ENCRYPTION_KEY;
  setGoogleOidcClientForTests(fakeGoogleClient());
});

afterAll(async () => {
  await app.close();
  setGoogleOidcClientForTests(null);
  restoreEnv('AKC_BROKER_STATE_DIR', originalEnv.AKC_BROKER_STATE_DIR);
  restoreEnv('AKC_ENABLE_GOOGLE_AUTH', originalEnv.AKC_ENABLE_GOOGLE_AUTH);
  restoreEnv('GOOGLE_CLIENT_ID', originalEnv.GOOGLE_CLIENT_ID);
  restoreEnv('GOOGLE_CLIENT_SECRET', originalEnv.GOOGLE_CLIENT_SECRET);
  restoreEnv('GOOGLE_REDIRECT_URI', originalEnv.GOOGLE_REDIRECT_URI);
  restoreEnv('GOOGLE_ALLOWED_HOSTED_DOMAIN', originalEnv.GOOGLE_ALLOWED_HOSTED_DOMAIN);
  restoreEnv('AKC_AUTH_BASE_URL', originalEnv.AKC_AUTH_BASE_URL);
  restoreEnv('NODE_ENV', originalEnv.NODE_ENV);
  restoreEnv('AKC_CREDENTIAL_ENCRYPTION_KEY', originalEnv.AKC_CREDENTIAL_ENCRYPTION_KEY);
  rmSync(stateDir, { recursive: true, force: true });
});

describe('Google OAuth/OIDC auth routes', () => {
  it('keeps Google auth disabled until the broker has explicit Google config', async () => {
    process.env.AKC_ENABLE_GOOGLE_AUTH = 'false';
    const response = await app.inject({ method: 'GET', url: '/api/auth/google/start?returnTo=/settings' });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toMatch(/state|nonce|code_verifier|google-client-secret/i);

    process.env.AKC_ENABLE_GOOGLE_AUTH = 'true';
  });

  it('does not advertise Google auth in production without secure PKCE encryption storage', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AKC_CREDENTIAL_ENCRYPTION_KEY;

    const config = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(config.statusCode).toBe(200);
    expect(config.json()).toMatchObject({ googleEnabled: false });

    const start = await app.inject({ method: 'GET', url: '/api/auth/google/start?returnTo=/settings' });
    expect(start.statusCode).toBe(503);
    expect(start.json()).toMatchObject({ reason: 'google_auth_secure_storage_required' });
    expect(start.body).not.toMatch(/AKC_CREDENTIAL_ENCRYPTION_KEY|google-client-secret|code_verifier/i);

    process.env.NODE_ENV = 'test';
  });

  it('creates first-login Google users by sub, not email, and keeps private settings per user', async () => {
    const first = await completeGoogleLogin('/settings');
    expect(first.session.json()).toMatchObject({
      user: { id: expect.any(String), email: 'same@example.com', displayName: 'Demo User' },
      csrfToken: expect.any(String)
    });

    const firstCookie = cookieFrom(first.callback);
    const firstCsrf = first.session.json<{ csrfToken: string }>().csrfToken;
    const save = await app.inject({
      method: 'POST',
      url: '/api/settings/atlassian',
      headers: { cookie: firstCookie, 'x-csrf-token': firstCsrf },
      payload: {
        siteUrl: 'https://example.atlassian.net',
        email: 'user@example.com',
        apiToken: 'token_first_user_only',
        jiraProjectAllowlist: ['AKC'],
        confluenceSpaceAllowlist: ['AKC']
      }
    });
    expect(save.statusCode).toBe(200);

    nextSubject = 'google-sub-2';
    const second = await completeGoogleLogin('/settings');
    const secondCookie = cookieFrom(second.callback);
    const secondSession = second.session.json<{ user: { id: string; email: string }; csrfToken: string }>();

    expect(secondSession.user.email).toBe('same@example.com');
    expect(secondSession.user.id).not.toBe(first.session.json<{ user: { id: string } }>().user.id);

    const secondStatus = await app.inject({ method: 'GET', url: '/api/settings/status', headers: { cookie: secondCookie } });
    expect(secondStatus.statusCode).toBe(200);
    expect(secondStatus.json().atlassian).toMatchObject({ source: 'none', configured: false, tokenConfigured: false });
  });


  it('uses a browser-valid secure transaction cookie in production Google OAuth', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AKC_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');

    const loginResult = await completeGoogleLogin('/settings');
    const startCookies = cookieValues(loginResult.start);
    expect(startCookies).toEqual(expect.arrayContaining([
      expect.stringContaining('__Host-akc_oauth_tx=')
    ]));
    const transactionCookie = startCookies.find((value) => value.startsWith('__Host-akc_oauth_tx=')) ?? '';
    expect(transactionCookie).toContain('Secure');
    expect(transactionCookie).toContain('HttpOnly');
    expect(transactionCookie).toContain('SameSite=Lax');
    expect(transactionCookie).toContain('Path=/');
    expect(transactionCookie).not.toContain('Path=/api/auth/google');

    process.env.NODE_ENV = 'test';
    delete process.env.AKC_CREDENTIAL_ENCRYPTION_KEY;
  });


  it('rejects production callbacks that provide only an unprefixed transaction cookie', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AKC_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');

    const start = await app.inject({ method: 'GET', url: '/api/auth/google/start?returnTo=/settings' });
    const hostCookie = cookieHeaderFromSetCookie(start, 'akc_oauth_tx');
    const plainCookie = hostCookie.replace(/^__Host-akc_oauth_tx=/, 'akc_oauth_tx=');
    expect(hostCookie).toMatch(/^__Host-akc_oauth_tx=/);
    expect(plainCookie).toMatch(/^akc_oauth_tx=/);

    const callback = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=fake-code&state=${encodeURIComponent(lastStart!.state)}`,
      headers: { cookie: plainCookie }
    });

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe('/login?authError=invalid_oauth_transaction');

    process.env.NODE_ENV = 'test';
    delete process.env.AKC_CREDENTIAL_ENCRYPTION_KEY;
  });

  it('rejects Google callbacks without the initiating browser transaction cookie', async () => {
    const start = await app.inject({ method: 'GET', url: '/api/auth/google/start?returnTo=/settings' });
    expect(start.statusCode).toBe(302);
    expect(lastStart?.state).toEqual(expect.any(String));

    const callback = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=fake-code&state=${encodeURIComponent(lastStart!.state)}`
    });
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe('/login?authError=invalid_oauth_transaction');
    expect(callback.headers['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining('akc_oauth_tx=;')]));
  });

  it('surfaces safe Google OIDC callback failure reasons', async () => {
    process.env.GOOGLE_ALLOWED_HOSTED_DOMAIN = 'example.com';
    nextHostedDomain = 'other.example';

    const start = await app.inject({ method: 'GET', url: '/api/auth/google/start?returnTo=/settings' });
    const callback = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=fake-code&state=${encodeURIComponent(lastStart!.state)}`,
      headers: { cookie: cookieHeaderFromSetCookie(start, 'akc_oauth_tx') }
    });

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe('/login?authError=hosted_domain_denied');
  });
});

async function completeGoogleLogin(returnTo: string) {
  const start = await app.inject({ method: 'GET', url: `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}` });
  expect(start.statusCode).toBe(302);
  expect(lastStart).toEqual(expect.objectContaining({ state: expect.any(String), nonce: expect.any(String), codeChallenge: expect.any(String) }));
  const callback = await app.inject({
    method: 'GET',
    url: `/api/auth/google/callback?code=fake-code&state=${encodeURIComponent(lastStart!.state)}`,
    headers: { cookie: cookieHeaderFromSetCookie(start, 'akc_oauth_tx') }
  });
  expect(callback.statusCode).toBe(302);
  expect(callback.headers.location).toBe(returnTo);
  const session = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: cookieHeaderFromSetCookie(callback, 'akc_session') } });
  expect(session.statusCode).toBe(200);
  return { start, callback, session };
}

function fakeGoogleClient(): GoogleOidcClient {
  return {
    authorizationUrl(input) {
      lastStart = input;
      return `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(input.state)}&code_challenge=${encodeURIComponent(input.codeChallenge)}`;
    },
    async exchangeAndVerify(input) {
      expect(input.code).toBe('fake-code');
      expect(input.pkceVerifier).toHaveLength(64);
      if (!lastStart) throw new Error('missing Google start transaction');
      return googleClaims(nextSubject, lastStart.nonce);
    }
  };
}

function googleClaims(sub: string, nonce: string): GoogleTokenClaims {
  return {
    iss: 'https://accounts.google.com',
    aud: 'google-client-id',
    exp: Math.floor(Date.now() / 1000) + 600,
    iat: Math.floor(Date.now() / 1000),
    nonce,
    sub,
    email: 'same@example.com',
    email_verified: true,
    name: 'Demo User',
    picture: 'https://example.com/avatar.png',
    ...(nextHostedDomain ? { hd: nextHostedDomain } : {})
  };
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  return cookieHeaderFromSetCookie(response, 'akc_session');
}

function cookieHeaderFromSetCookie(response: { headers: Record<string, unknown> }, name: string): string {
  const values = cookieValues(response);
  const match = values.find((value) => (value.startsWith(`${name}=`) || value.startsWith(`__Host-${name}=`)) && !value.includes('Max-Age=0'));
  return match ?? '';
}

function cookieValues(response: { headers: Record<string, unknown> }): string[] {
  const setCookie = response.headers['set-cookie'];
  return Array.isArray(setCookie) ? setCookie.map(String) : [String(setCookie ?? '')];
}

function restoreEnv(key: keyof typeof originalEnv, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
