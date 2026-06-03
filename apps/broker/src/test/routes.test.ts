// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../app.js';
import { setGoogleOidcClientForTests } from '../services/auth/googleOidc.js';
import { clearAuditEntriesForTests, listAuditEntries } from '../services/audit/auditLog.js';
import { clearStoredRunsForTests } from '../services/runs/runStore.js';
import { clearPersonalAtlassianSettings } from '../services/settings/atlassianSettingsStore.js';
import { clearPersonalLlmSettings } from '../services/settings/llmSettingsStore.js';
import { clearLlmModelCatalogCache } from '../services/llm/modelCatalog.js';
import { userScopedEnv } from '../services/auth/userScope.js';

let app: ReturnType<typeof buildApp>;
let stateDir: string;
let authCookie: string;
let authCsrfToken: string;
let authUserId: string;
let authTestCounter = 0;
const routeHookTimeoutMs = 60_000;
const originalEnv = {
  AKC_BROKER_STATE_DIR: process.env.AKC_BROKER_STATE_DIR,
  ATLASSIAN_URL: process.env.ATLASSIAN_URL,
  ATLASSIAN_EMAIL: process.env.ATLASSIAN_EMAIL,
  ATLASSIAN_API_TOKEN: process.env.ATLASSIAN_API_TOKEN,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  AKC_ENABLE_LIVE_OPENAI: process.env.AKC_ENABLE_LIVE_OPENAI,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  AKC_ENABLE_LIVE_OPENROUTER: process.env.AKC_ENABLE_LIVE_OPENROUTER,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  AKC_ENABLE_LIVE_ANTHROPIC: process.env.AKC_ENABLE_LIVE_ANTHROPIC,
  AKC_CREDENTIAL_ENCRYPTION_KEY: process.env.AKC_CREDENTIAL_ENCRYPTION_KEY,
  ATLASSIAN_SITE_HOST_ALLOWLIST: process.env.ATLASSIAN_SITE_HOST_ALLOWLIST,
  AKC_ATLASSIAN_SITE_HOST_ALLOWLIST: process.env.AKC_ATLASSIAN_SITE_HOST_ALLOWLIST,
  AKC_ALLOW_SOURCELESS_MUTATIONS: process.env.AKC_ALLOW_SOURCELESS_MUTATIONS,
  AKC_AUTH_DB_PATH: process.env.AKC_AUTH_DB_PATH,
  NODE_ENV: process.env.NODE_ENV,
  AKC_ENABLE_GOOGLE_AUTH: process.env.AKC_ENABLE_GOOGLE_AUTH,
  AKC_ENABLE_LOCAL_AUTH: process.env.AKC_ENABLE_LOCAL_AUTH,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  GOOGLE_ALLOWED_HOSTED_DOMAIN: process.env.GOOGLE_ALLOWED_HOSTED_DOMAIN,
  AKC_AUTH_BASE_URL: process.env.AKC_AUTH_BASE_URL,
  AKC_AUTH_CSRF_SECRET: process.env.AKC_AUTH_CSRF_SECRET
};

beforeAll(async () => {
  stateDir = mkdtempSync(join(tmpdir(), 'akc-broker-test-'));
  process.env.AKC_BROKER_STATE_DIR = stateDir;
  delete process.env.ATLASSIAN_URL;
  delete process.env.ATLASSIAN_EMAIL;
  delete process.env.ATLASSIAN_API_TOKEN;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.AKC_ENABLE_LIVE_OPENAI;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
  delete process.env.AKC_ENABLE_LIVE_OPENROUTER;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
  delete process.env.AKC_ENABLE_LIVE_ANTHROPIC;
  delete process.env.AKC_CREDENTIAL_ENCRYPTION_KEY;
  delete process.env.ATLASSIAN_SITE_HOST_ALLOWLIST;
  delete process.env.AKC_ATLASSIAN_SITE_HOST_ALLOWLIST;
  delete process.env.AKC_ENABLE_LOCAL_AUTH;
  process.env.AKC_ALLOW_SOURCELESS_MUTATIONS = 'true';
  app = buildApp();
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: { email: 'route-tests@example.com', password: 'RouteTests123' }
  });
  const setCookie = signup.headers['set-cookie'];
  authCookie = Array.isArray(setCookie) ? (setCookie[0] ?? '') : (setCookie ?? '');
  authCsrfToken = signup.json<{ csrfToken: string }>().csrfToken;
  authUserId = signup.json<{ user: { id: string } }>().user.id;
}, routeHookTimeoutMs);

afterEach(() => {
  clearStoredRunsForTests();
  clearAuditEntriesForTests();
  clearPersonalAtlassianSettings(userScopedEnv(authUserId));
  clearPersonalLlmSettings(userScopedEnv(authUserId));
  clearPersonalAtlassianSettings();
  clearPersonalLlmSettings();
  clearLlmModelCatalogCache();
  delete process.env.ATLASSIAN_URL;
  delete process.env.ATLASSIAN_EMAIL;
  delete process.env.ATLASSIAN_API_TOKEN;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.AKC_ENABLE_LIVE_OPENAI;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
  delete process.env.AKC_ENABLE_LIVE_OPENROUTER;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
  delete process.env.AKC_ENABLE_LIVE_ANTHROPIC;
  delete process.env.AKC_CREDENTIAL_ENCRYPTION_KEY;
  delete process.env.ATLASSIAN_SITE_HOST_ALLOWLIST;
  delete process.env.AKC_ATLASSIAN_SITE_HOST_ALLOWLIST;
  restoreEnv('AKC_AUTH_DB_PATH', originalEnv.AKC_AUTH_DB_PATH);
  process.env.AKC_ALLOW_SOURCELESS_MUTATIONS = 'true';
  restoreEnv('NODE_ENV', originalEnv.NODE_ENV);
  restoreEnv('AKC_ENABLE_GOOGLE_AUTH', originalEnv.AKC_ENABLE_GOOGLE_AUTH);
  delete process.env.AKC_ENABLE_LOCAL_AUTH;
  restoreEnv('GOOGLE_CLIENT_ID', originalEnv.GOOGLE_CLIENT_ID);
  restoreEnv('GOOGLE_CLIENT_SECRET', originalEnv.GOOGLE_CLIENT_SECRET);
  restoreEnv('GOOGLE_REDIRECT_URI', originalEnv.GOOGLE_REDIRECT_URI);
  restoreEnv('GOOGLE_ALLOWED_HOSTED_DOMAIN', originalEnv.GOOGLE_ALLOWED_HOSTED_DOMAIN);
  restoreEnv('AKC_AUTH_BASE_URL', originalEnv.AKC_AUTH_BASE_URL);
  restoreEnv('AKC_AUTH_CSRF_SECRET', originalEnv.AKC_AUTH_CSRF_SECRET);
  setGoogleOidcClientForTests(null);
  vi.restoreAllMocks();
});

afterAll(async () => {
  await app.close();
  restoreEnv('AKC_BROKER_STATE_DIR', originalEnv.AKC_BROKER_STATE_DIR);
  restoreEnv('ATLASSIAN_URL', originalEnv.ATLASSIAN_URL);
  restoreEnv('ATLASSIAN_EMAIL', originalEnv.ATLASSIAN_EMAIL);
  restoreEnv('ATLASSIAN_API_TOKEN', originalEnv.ATLASSIAN_API_TOKEN);
  restoreEnv('OPENAI_API_KEY', originalEnv.OPENAI_API_KEY);
  restoreEnv('OPENAI_MODEL', originalEnv.OPENAI_MODEL);
  restoreEnv('AKC_ENABLE_LIVE_OPENAI', originalEnv.AKC_ENABLE_LIVE_OPENAI);
  restoreEnv('OPENROUTER_API_KEY', originalEnv.OPENROUTER_API_KEY);
  restoreEnv('OPENROUTER_MODEL', originalEnv.OPENROUTER_MODEL);
  restoreEnv('AKC_ENABLE_LIVE_OPENROUTER', originalEnv.AKC_ENABLE_LIVE_OPENROUTER);
  restoreEnv('ANTHROPIC_API_KEY', originalEnv.ANTHROPIC_API_KEY);
  restoreEnv('CLAUDE_API_KEY', originalEnv.CLAUDE_API_KEY);
  restoreEnv('ANTHROPIC_MODEL', originalEnv.ANTHROPIC_MODEL);
  restoreEnv('AKC_ENABLE_LIVE_ANTHROPIC', originalEnv.AKC_ENABLE_LIVE_ANTHROPIC);
  restoreEnv('AKC_CREDENTIAL_ENCRYPTION_KEY', originalEnv.AKC_CREDENTIAL_ENCRYPTION_KEY);
  restoreEnv('ATLASSIAN_SITE_HOST_ALLOWLIST', originalEnv.ATLASSIAN_SITE_HOST_ALLOWLIST);
  restoreEnv('AKC_ATLASSIAN_SITE_HOST_ALLOWLIST', originalEnv.AKC_ATLASSIAN_SITE_HOST_ALLOWLIST);
  restoreEnv('AKC_ALLOW_SOURCELESS_MUTATIONS', originalEnv.AKC_ALLOW_SOURCELESS_MUTATIONS);
  restoreEnv('AKC_AUTH_DB_PATH', originalEnv.AKC_AUTH_DB_PATH);
  restoreEnv('NODE_ENV', originalEnv.NODE_ENV);
  restoreEnv('AKC_ENABLE_GOOGLE_AUTH', originalEnv.AKC_ENABLE_GOOGLE_AUTH);
  restoreEnv('AKC_ENABLE_LOCAL_AUTH', originalEnv.AKC_ENABLE_LOCAL_AUTH);
  restoreEnv('GOOGLE_CLIENT_ID', originalEnv.GOOGLE_CLIENT_ID);
  restoreEnv('GOOGLE_CLIENT_SECRET', originalEnv.GOOGLE_CLIENT_SECRET);
  restoreEnv('GOOGLE_REDIRECT_URI', originalEnv.GOOGLE_REDIRECT_URI);
  restoreEnv('GOOGLE_ALLOWED_HOSTED_DOMAIN', originalEnv.GOOGLE_ALLOWED_HOSTED_DOMAIN);
  restoreEnv('AKC_AUTH_BASE_URL', originalEnv.AKC_AUTH_BASE_URL);
  restoreEnv('AKC_AUTH_CSRF_SECRET', originalEnv.AKC_AUTH_CSRF_SECRET);
  rmSync(stateDir, { recursive: true, force: true });
}, routeHookTimeoutMs);

async function authInject(options: InjectOptions): Promise<LightMyRequestResponse> {
  const provided = (options.headers ?? {}) as Record<string, string>;
  const headers: Record<string, string> = { cookie: authCookie, ...provided };
  const method = String(options.method ?? 'GET').toUpperCase();
  const hasCsrf = Object.keys(headers).some((key) => key.toLowerCase() === 'x-csrf-token');
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !hasCsrf) headers['x-csrf-token'] = authCsrfToken;
  return await app.inject({ ...options, headers });
}

async function createRun(app: ReturnType<typeof buildApp>, message = 'hello') {
  const created = await authInject({ method: 'POST', url: '/api/copilot/runs', payload: { message, mode: 'readonly' } });
  const runId = created.json<{ runId: string }>().runId;
  return { runId, actionId: `${runId}_act_003`, streamUrl: created.json<{ streamUrl: string }>().streamUrl };
}

async function saveAtlassianSettingsForAssignedIssues() {
  await authInject({
    method: 'POST',
    url: '/api/settings/atlassian',
    payload: {
      siteUrl: 'https://example.atlassian.net',
      email: 'user@example.com',
      apiToken: 'token_1234567890',
      jiraProjectAllowlist: ['SCRUM'],
      confluenceSpaceAllowlist: ['AKC']
    }
  });
}

function uniqueAuthEmail(prefix = 'auth-test'): string {
  authTestCounter += 1;
  return `${prefix}-${authTestCounter}@example.com`;
}

function assignedIssueSearchResponse(): Response {
  return new Response(JSON.stringify({
    issues: [
      {
        key: 'SCRUM-7',
        fields: {
          summary: '나에게 할당된 작업',
          status: { name: 'To Do' },
          assignee: { displayName: 'Demo User' },
          priority: { name: 'High' },
          issuetype: { name: 'Task' },
          updated: '2026-05-30T01:00:00.000+0000',
          project: { key: 'SCRUM' }
        }
      }
    ]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function streamFromText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    }
  });
}

function parseSseDataFrames(body: string): unknown[] {
  return body
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter(Boolean)
    .map((frame) => frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n'))
    .filter(Boolean)
    .map((data) => JSON.parse(data) as unknown);
}

describe('broker routes', () => {
  it('signs up with a strong local password and sets a bounded HttpOnly session cookie without leaking credential fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: `  ${uniqueAuthEmail('signup').toUpperCase()}  `, password: 'StrongPass123' }
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({ user: { email: expect.stringMatching(/^signup-\d+@example\.com$/), createdAt: expect.any(String) } });
    const setCookie = Array.isArray(response.headers['set-cookie']) ? response.headers['set-cookie'][0] : response.headers['set-cookie'];
    expect(setCookie).toContain('akc_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Max-Age=604800');
    expect(setCookie).not.toContain('Secure');
    expect(response.body).not.toMatch(/password(Hash|Salt)?|akc_session|sessionId/i);
  }, 30_000);

  it('accepts the documented eight-character password minimum when basic complexity is satisfied', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: uniqueAuthEmail('eight-char'), password: 'Pass1234' }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ user: { email: expect.stringMatching(/^eight-char-\d+@example\.com$/) } });
    expect(response.body).not.toMatch(/password(Hash|Salt)?|Pass1234|sessionId/i);
  }, 30_000);

  it('rejects weak or duplicate signup requests without exposing stored password material', async () => {
    const email = uniqueAuthEmail('duplicate');
    const weak = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email, password: 'weak' } });
    expect(weak.statusCode).toBe(400);

    const first = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email, password: 'StrongPass123' } });
    const second = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email, password: 'StrongPass123' } });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.body).not.toMatch(/password(Hash|Salt)?|StrongPass123|akc_session|sessionId/i);
  }, 30_000);

  it('logs in, resolves the cookie-backed session, and invalidates it on logout', async () => {
    const email = uniqueAuthEmail('login');
    await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email, password: 'StrongPass123' } });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: email.toUpperCase(), password: 'StrongPass123' } });
    const loginCookie = Array.isArray(login.headers['set-cookie']) ? (login.headers['set-cookie'][0] ?? '') : (login.headers['set-cookie'] ?? '');

    expect(login.statusCode).toBe(200);
    expect(login.headers['cache-control']).toBe('no-store');
    expect(login.json()).toMatchObject({ user: { email, createdAt: expect.any(String) } });
    expect(login.body).not.toMatch(/password(Hash|Salt)?|StrongPass123|sessionId/i);

    const session = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: loginCookie } });
    expect(session.statusCode).toBe(200);
    expect(session.headers['cache-control']).toBe('no-store');
    expect(session.json()).toMatchObject({ user: { email }, csrfToken: expect.any(String) });

    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: loginCookie, 'x-csrf-token': session.json<{ csrfToken: string }>().csrfToken } });
    const clearedCookie = Array.isArray(logout.headers['set-cookie']) ? (logout.headers['set-cookie'][0] ?? '') : (logout.headers['set-cookie'] ?? '');
    expect(logout.statusCode).toBe(200);
    expect(logout.headers['cache-control']).toBe('no-store');
    expect(clearedCookie).toContain('akc_session=;');
    expect(clearedCookie).toContain('Max-Age=0');

    const afterLogout = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: loginCookie } });
    expect(afterLogout.statusCode).toBe(401);
  }, 30_000);

  it('keeps an existing session active when a local login attempt fails', async () => {
    const session = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: authCookie } });
    expect(session.statusCode).toBe(200);

    const failedLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { cookie: authCookie },
      payload: { email: uniqueAuthEmail('missing-login'), password: 'WrongPass123' }
    });
    expect(failedLogin.statusCode).toBe(401);

    const afterFailure = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: authCookie } });
    expect(afterFailure.statusCode).toBe(200);
    expect(afterFailure.json()).toMatchObject({ user: { id: authUserId } });
  }, 30_000);

  it('disables local email/password auth by default in production unless explicitly enabled', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AKC_ENABLE_LOCAL_AUTH;

    const disabledSignup = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      headers: { origin: 'http://localhost:5173' },
      payload: { email: uniqueAuthEmail('prod-local-off'), password: 'StrongPass123' }
    });
    expect(disabledSignup.statusCode).toBe(403);

    process.env.AKC_ENABLE_LOCAL_AUTH = 'true';
    const persistentStateDir = process.env.AKC_BROKER_STATE_DIR;
    delete process.env.AKC_BROKER_STATE_DIR;
    delete process.env.AKC_AUTH_DB_PATH;
    const noStorageSignup = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      headers: { origin: 'http://localhost:5173' },
      payload: { email: uniqueAuthEmail('prod-local-no-storage'), password: 'StrongPass123' }
    });
    expect(noStorageSignup.statusCode).toBe(403);

    if (persistentStateDir) process.env.AKC_BROKER_STATE_DIR = persistentStateDir;
    process.env.AKC_AUTH_CSRF_SECRET = Buffer.alloc(32, 8).toString('base64');
    const enabledSignup = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      headers: { origin: 'http://localhost:5173' },
      payload: { email: uniqueAuthEmail('prod-local-on'), password: 'StrongPass123' }
    });
    expect(enabledSignup.statusCode).toBe(201);
    const setCookie = Array.isArray(enabledSignup.headers['set-cookie']) ? enabledSignup.headers['set-cookie'][0] : enabledSignup.headers['set-cookie'];
    expect(setCookie).toContain('__Host-akc_session=');
    expect(setCookie).toContain('Secure');
  }, 30_000);

  it('uses only the __Host session cookie in production and ignores malformed cookie values', async () => {
    const email = uniqueAuthEmail('host-cookie');
    await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email, password: 'StrongPass123' } });

    process.env.NODE_ENV = 'production';
    process.env.AKC_ENABLE_LOCAL_AUTH = 'true';
    process.env.AKC_AUTH_CSRF_SECRET = Buffer.alloc(32, 8).toString('base64');
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'http://localhost:5173' },
      payload: { email, password: 'StrongPass123' }
    });
    const hostCookie = cookieHeaderFromSetCookie(login, 'akc_session');
    expect(hostCookie).toMatch(/^__Host-akc_session=/);

    const shadowed = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: `akc_session=shadowed; ${hostCookie}` }
    });
    expect(shadowed.statusCode).toBe(200);
    expect(shadowed.json()).toMatchObject({ user: { email } });

    const plainOnly = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: hostCookie.replace(/^__Host-akc_session=/, 'akc_session=') }
    });
    expect(plainOnly.statusCode).toBe(401);

    process.env.NODE_ENV = 'test';
    delete process.env.AKC_ENABLE_LOCAL_AUTH;
    const malformed = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: 'akc_session=%E0%A4%A' }
    });
    expect(malformed.statusCode).toBe(401);
  }, 30_000);

  it('rate-limits repeated login failures by request IP without trusting raw forwarded headers', async () => {
    const attempts = [];
    for (let index = 0; index < 6; index += 1) {
      const email = uniqueAuthEmail('rate-limit');
      await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email, password: 'StrongPass123' } });
      attempts.push(await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: '198.51.100.10',
        headers: { 'x-forwarded-for': `203.0.113.${index + 1}` },
        payload: { email, password: 'WrongPass123' }
      }));
    }

    expect(attempts.slice(0, 5).map((attempt) => attempt.statusCode)).toEqual([401, 401, 401, 401, 401]);
    expect(attempts[5]?.statusCode).toBe(429);
    expect(attempts[5]?.body).not.toMatch(/password(Hash|Salt)?|WrongPass123|sessionId/i);
  }, 30_000);

  it('requires auth for sensitive Broker endpoints while keeping unauthenticated Copilot demo safe', async () => {
    const history = await app.inject({ method: 'GET', url: '/api/history' });
    const settings = await app.inject({ method: 'GET', url: '/api/settings/status' });
    const settingsMutation = await app.inject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'mock', enabled: true } });
    const actionMutation = await app.inject({ method: 'POST', url: '/api/copilot/actions/missing/approve', payload: { approved: true } });

    expect(history.statusCode).toBe(401);
    expect(settings.statusCode).toBe(401);
    expect(settingsMutation.statusCode).toBe(401);
    expect(actionMutation.statusCode).toBe(401);

    const created = await app.inject({ method: 'POST', url: '/api/copilot/runs', payload: { message: 'SCRUM-7에 댓글 남겨줘', mode: 'sandbox-write' } });
    const stream = await app.inject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });
    expect(created.statusCode).toBe(200);
    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('데모 모드입니다');
    expect(stream.body).not.toContain('event: action_review.required');
    expect(stream.body).not.toMatch(/OPENAI_API_KEY|ATLASSIAN_API_TOKEN|password(Hash|Salt)?|sessionId/i);
  }, 30_000);

  it('creates a copilot run and exposes a stream URL', async () => {
    const response = await authInject({ method: 'POST', url: '/api/copilot/runs', payload: { message: 'hello', mode: 'readonly' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ streamUrl: expect.stringContaining('/api/copilot/runs/') });
  }, 30_000);

  it('requires CSRF for authenticated Copilot run creation while preserving unauthenticated demo runs', async () => {
    const missingCsrf = await app.inject({
      method: 'POST',
      url: '/api/copilot/runs',
      headers: { cookie: authCookie, origin: 'http://localhost:5173' },
      payload: { message: 'hello', mode: 'readonly' }
    });
    const publicDemo = await app.inject({
      method: 'POST',
      url: '/api/copilot/runs',
      headers: { origin: 'http://localhost:5173' },
      payload: { message: 'hello', mode: 'sandbox-write' }
    });

    expect(missingCsrf.statusCode).toBe(403);
    expect(publicDemo.statusCode).toBe(200);
    expect(publicDemo.json()).toMatchObject({ streamUrl: expect.stringContaining('/api/copilot/runs/') });
  }, 30_000);

  it('streams canonical SSE events from the server endpoint', async () => {
    const created = await authInject({ method: 'POST', url: '/api/copilot/runs', payload: { message: 'hello', mode: 'readonly' } });
    const stream = await authInject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });
    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('event: run.created');
    expect(stream.body).toContain('조회된 데이터가 없습니다');
    expect(stream.body).not.toContain('data: {"type":"tool_plan.created"');
    expect(stream.body).not.toContain('action_review.required');
  }, 30_000);

  it('returns empty history instead of seeded sample runs', async () => {
    const response = await authInject({ method: 'GET', url: '/api/history' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ runs: [] });
  }, 30_000);

  it('returns broker-owned recommended copilot questions without credentials', async () => {
    const response = await authInject({ method: 'GET', url: '/api/copilot/suggestions' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      source: 'fallback',
      suggestions: expect.arrayContaining([
        expect.objectContaining({ id: 'assigned-issues', prompt: '나에게 할당된 JIRA 이슈를 조회해줘.', requiresWrite: false }),
        expect.objectContaining({ id: 'due-today', requiresWrite: false }),
        expect.objectContaining({ id: 'recent-updates', requiresWrite: false })
      ])
    });
    expect(response.body).not.toContain('blocked-work');
    expect(response.body).not.toContain('write-comment');
    expect(response.body).not.toContain('막힌 업무 찾기');
    expect(response.body).not.toContain('댓글 작성');
    expect(response.body).not.toContain('token_');
  }, 30_000);

  it('streams real read-only Jira evidence for assigned-issues prompts through the server path', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(assignedIssueSearchResponse());
    await saveAtlassianSettingsForAssignedIssues();
    const created = await authInject({ method: 'POST', url: '/api/copilot/runs', payload: { message: '나에게 할당된 이슈들을 조회해줘', mode: 'readonly' } });
    const stream = await authInject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });
    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('SCRUM-7');
    expect(stream.body).toContain('"origin":"real"');
    expect(stream.body).toContain('"url":"https://example.atlassian.net/browse/SCRUM-7"');
    expect(stream.body).toContain('assignee = currentUser() ORDER BY updated DESC');
    expect(stream.body).toContain('Jira에서 이슈 1개 발견');
    expect(stream.body).not.toContain('action_review.required');
    expect(stream.body).not.toContain('token_1234567890');

    const evidence = parseSseDataFrames(stream.body).find((event): event is { type: 'evidence.found'; sources: Array<{ url: string }> } =>
      typeof event === 'object' && event !== null && 'type' in event && event.type === 'evidence.found'
    );
    expect(evidence?.sources[0]?.url).toBe('https://example.atlassian.net/browse/SCRUM-7');
  }, 30_000);

  it('completes assigned-issues prompts with a no-data answer when Jira returns no issues', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ issues: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await saveAtlassianSettingsForAssignedIssues();
    const created = await authInject({ method: 'POST', url: '/api/copilot/runs', payload: { message: '나에게 할당된 이슈들을 조회해줘', mode: 'readonly' } });
    const stream = await authInject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });

    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('Jira에서 이슈 0개 발견');
    expect(stream.body).toContain('조회된 Jira 이슈가 없습니다');
    expect(stream.body).toContain('event: run.completed');
    expect(stream.body).not.toContain('event: evidence.found');
    expect(stream.body).not.toContain('event: report_draft.started');
  }, 30_000);

  it('streams demo Jira and Confluence evidence without credentials or external Atlassian calls', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const created = await authInject({ method: 'POST', url: '/api/copilot/runs', payload: { message: '나에게 할당된 JIRA 이슈를 조회해줘.', mode: 'mock' } });
    const stream = await authInject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });

    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('event: tool_plan.created');
    expect(stream.body).toContain('나에게 할당된 Jira 이슈 조회');
    expect(stream.body).toContain('AKC-136');
    expect(stream.body).toContain('NFS-42');
    expect(stream.body).toContain('AX-KB-014');
    expect(stream.body).toContain('AKC-124');
    expect(stream.body).toContain('AX-KB-001');
    expect(stream.body).toContain('실제 Jira나 Confluence에 연결하지 않고');
    expect(stream.body).toContain('"origin":"demo"');
    expect(stream.body).toContain('데모 모드입니다');
    expect(stream.body).toContain('event: run.completed');
    expect(stream.body).not.toContain('Atlassian 연결 정보가 없어');
    expect(stream.body).not.toContain('event: action_review.required');
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);

  it('streams a safe mock demo without calling real Atlassian or LLM providers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const created = await authInject({
      method: 'POST',
      url: '/api/copilot/runs',
      payload: { message: '인터뷰 시연을 시작해줘', mode: 'mock' }
    });
    const stream = await authInject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });

    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('데모 모드입니다');
    expect(stream.body).toContain('"origin":"demo"');
    expect(stream.body).toContain('event: tool_plan.created');
    expect(stream.body).toContain('event: evidence.found');
    expect(stream.body).not.toContain('event: action_review.required');
    expect(stream.body).not.toContain('jira_add_comment');
    expect(stream.body).toContain('event: run.completed');
    expect(stream.body).not.toContain('OPENAI_API_KEY');
    expect(stream.body).not.toContain('ATLASSIAN_API_TOKEN');
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);

  it('keeps mock mode isolated from write prompts and external providers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const created = await authInject({
      method: 'POST',
      url: '/api/copilot/runs',
      payload: { message: 'SCRUM-7에 댓글로 "검토 완료" 남겨줘', mode: 'mock' }
    });
    const stream = await authInject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });

    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('데모 모드입니다');
    expect(stream.body).toContain('"origin":"demo"');
    expect(stream.body).not.toContain('event: action_review.required');
    expect(stream.body).not.toContain('jira_add_comment');
    expect(stream.body).toContain('event: run.completed');
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);

  it('returns 404 for unknown stream run ids', async () => {
    const response = await authInject({ method: 'GET', url: '/api/copilot/runs/run_missing/stream' });
    expect(response.statusCode).toBe(404);
  }, 30_000);

  it('does not create seeded Action Review records for normal runs', async () => {
    const { actionId } = await createRun(app);
    const approve = await authInject({ method: 'POST', url: `/api/copilot/actions/${actionId}/approve`, payload: { approved: true } });
    const cancel = await authInject({ method: 'POST', url: `/api/copilot/actions/${actionId}/cancel`, payload: { reason: 'No longer needed' } });

    expect(approve.statusCode).toBe(404);
    expect(cancel.statusCode).toBe(404);
    expect(listAuditEntries()).toHaveLength(0);
  }, 30_000);

  it('creates a safe write Action Review without executing Jira writes in readonly mode', async () => {
    const created = await authInject({ method: 'POST', url: '/api/copilot/runs', payload: { message: 'SCRUM-7에 댓글로 "검토 완료" 남겨줘', mode: 'readonly' } });
    const runId = created.json<{ runId: string }>().runId;
    const actionId = `${runId}_act_jira_comment`;
    const stream = await authInject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });

    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('event: action_review.required');
    expect(stream.body).toContain('jira_add_comment');
    expect(stream.body).toContain('SCRUM-7');
    expect(stream.body).toContain('현재는 읽기 전용 상태라 승인해도 실제 변경은 하지 않고 기록만 남깁니다.');
    expect(stream.body).not.toContain('Broker');
    expect(stream.body).not.toContain('event: tool.started');

    const approve = await authInject({
      method: 'POST',
      url: `/api/copilot/actions/${actionId}/approve`,
      payload: { approved: true, inputPreview: { comment: '검토 완료' } }
    });

    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({ status: 'mock_recorded', executed: false });
    expect(listAuditEntries()).toMatchObject([
      expect.objectContaining({
        actionId,
                risk: 'write',
                approvalStatus: 'approved',
                executionResult: 'mock_recorded',
                inputPreview: { comment: '검토 완료' }
      })
    ]);
  }, 30_000);

  it.each([
    ['Jira 이슈 생성', 'Jira 이슈를 생성해줘', 'act_jira_create_issue', 'jira_create_issue'],
    ['Jira 이슈 수정', 'AKC-12 이슈 제목을 수정해줘', 'act_jira_update_issue', 'jira_update_issue'],
    ['Jira 상태 전환', 'AKC-12 상태를 Done으로 전환해줘', 'act_jira_transition', 'jira_transition_issue'],
    ['Confluence 페이지 생성', 'Confluence 페이지를 생성해줘', 'act_confluence_create_page', 'confluence_create_page'],
    ['Confluence 페이지 수정', 'Confluence 문서 내용을 수정해줘', 'act_confluence_update_page', 'confluence_update_page'],
    ['Confluence 댓글', 'Confluence 페이지에 댓글을 남겨줘', 'act_confluence_comment', 'confluence_add_comment']
  ])('creates a safe write Action Review for %s without executing writes in readonly mode', async (_label, message, actionSuffix, tool) => {
    const created = await authInject({ method: 'POST', url: '/api/copilot/runs', payload: { message, mode: 'readonly' } });
    const runId = created.json<{ runId: string }>().runId;
    const actionId = `${runId}_${actionSuffix}`;
    const stream = await authInject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });

    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('event: action_review.required');
    expect(stream.body).toContain(`"tool":"${tool}"`);
    expect(stream.body).toContain('현재는 읽기 전용 상태라 승인해도 실제 변경은 하지 않고 기록만 남깁니다.');
    expect(stream.body).not.toContain('Broker');
    expect(stream.body).not.toContain('event: tool.started');

    const approve = await authInject({
      method: 'POST',
      url: `/api/copilot/actions/${actionId}/approve`,
      payload: { approved: true }
    });

    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({ status: 'mock_recorded', executed: false });
    expect(listAuditEntries()).toContainEqual(expect.objectContaining({
      actionId,
      risk: 'write',
      approvalStatus: 'approved',
      executionResult: 'mock_recorded'
    }));
  }, 30_000);

  it('executes an approved Jira comment through the server path in sandbox-write mode', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: '10001' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    }));
    await saveAtlassianSettingsForAssignedIssues();
    const created = await authInject({ method: 'POST', url: '/api/copilot/runs', payload: { message: 'SCRUM-7에 댓글로 "검토 완료" 남겨줘', mode: 'sandbox-write' } });
    const runId = created.json<{ runId: string }>().runId;
    const actionId = `${runId}_act_jira_comment`;

    const stream = await authInject({ method: 'GET', url: created.json<{ streamUrl: string }>().streamUrl });
    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('내용을 확인한 뒤 승인하면 요청한 변경만 진행합니다.');
    expect(stream.body).not.toContain('Broker');

    const approve = await authInject({
      method: 'POST',
      url: `/api/copilot/actions/${actionId}/approve`,
      payload: { approved: true }
    });

    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({ status: 'executed', executed: true, message: expect.stringContaining('SCRUM-7에 Jira 댓글을 작성했습니다') });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.atlassian.net/rest/api/3/issue/SCRUM-7/comment',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: expect.stringMatching(/^Basic /)
        }),
        body: expect.stringContaining('검토 완료')
      })
    );
    expect(approve.body).not.toContain('token_1234567890');
    expect(listAuditEntries()).toContainEqual(expect.objectContaining({
      actionId,
      risk: 'write',
      approvalStatus: 'approved',
      executionResult: 'executed'
    }));
  }, 30_000);

  it('does not execute a sandbox-write action when approval is declined', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await saveAtlassianSettingsForAssignedIssues();
    const created = await authInject({ method: 'POST', url: '/api/copilot/runs', payload: { message: 'SCRUM-7에 댓글로 "검토 완료" 남겨줘', mode: 'sandbox-write' } });
    const runId = created.json<{ runId: string }>().runId;
    const actionId = `${runId}_act_jira_comment`;

    const approve = await authInject({
      method: 'POST',
      url: `/api/copilot/actions/${actionId}/approve`,
      payload: { approved: false, inputPreview: { comment: '검토 완료' } }
    });

    expect(approve.statusCode).toBe(400);
    expect(approve.json()).toMatchObject({ status: 'blocked', executed: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listAuditEntries()).toContainEqual(expect.objectContaining({
      actionId,
      risk: 'write',
      approvalStatus: 'blocked',
      executionResult: 'blocked'
    }));
  }, 30_000);

  it('blocks unsupported approved write tools instead of executing ambiguous writes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await saveAtlassianSettingsForAssignedIssues();
    const created = await authInject({ method: 'POST', url: '/api/copilot/runs', payload: { message: 'SCRUM-7 상태를 Done으로 전환해줘', mode: 'sandbox-write' } });
    const runId = created.json<{ runId: string }>().runId;
    const actionId = `${runId}_act_jira_transition`;

    const approve = await authInject({
      method: 'POST',
      url: `/api/copilot/actions/${actionId}/approve`,
      payload: { approved: true }
    });

    expect(approve.statusCode).toBe(400);
    expect(approve.json()).toMatchObject({ status: 'blocked', executed: false, message: expect.stringContaining('현재는 Jira 댓글 작성만 지원합니다') });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listAuditEntries()).toContainEqual(expect.objectContaining({
      actionId,
      risk: 'write',
      approvalStatus: 'blocked',
      executionResult: 'blocked'
    }));
  }, 30_000);

  it('returns 404 for unknown approval action ids', async () => {
    const response = await authInject({ method: 'POST', url: '/api/copilot/actions/missing/approve', payload: { approved: true } });
    expect(response.statusCode).toBe(404);
  }, 30_000);

  it('does not allow arbitrary browser origins through CORS', async () => {
    const allowed = await authInject({ method: 'OPTIONS', url: '/api/history', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' } });
    const fallbackAllowed = await authInject({ method: 'OPTIONS', url: '/api/history', headers: { origin: 'http://localhost:5180', 'access-control-request-method': 'GET' } });
    const denied = await authInject({ method: 'OPTIONS', url: '/api/history', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(fallbackAllowed.headers['access-control-allow-origin']).toBe('http://localhost:5180');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  }, 30_000);

  it('sets browser security headers on broker responses', async () => {
    const response = await authInject({ method: 'GET', url: '/api/history' });

    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  }, 30_000);

  it('rejects unsafe browser mutations from untrusted origins before touching settings', async () => {
    const secret = 'sk-evil-origin-secret';
    const response = await authInject({
      method: 'POST',
      url: '/api/settings/llm',
      headers: { origin: 'https://evil.example' },
      payload: { provider: 'openai', apiKey: secret, model: 'gpt-4.1-mini', enabled: true }
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain(secret);
    const status = await authInject({ method: 'GET', url: '/api/settings/status' });
    expect(status.json().llm).toMatchObject({ provider: 'mock', configured: false, keyConfigured: false });
  }, 30_000);

  it('allows unsafe browser mutations from configured trusted origins', async () => {
    const secret = 'sk-trusted-origin-secret';
    const response = await authInject({
      method: 'POST',
      url: '/api/settings/llm',
      headers: { origin: 'http://localhost:5173' },
      payload: { provider: 'openai', apiKey: secret, model: 'gpt-4.1-mini', enabled: true }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(secret);
    expect(response.json().status.llm).toMatchObject({ source: 'personal', configured: true, keyConfigured: true });
  }, 30_000);

  it('rejects sourceless unsafe mutations unless a non-production escape hatch is explicit', async () => {
    delete process.env.AKC_ALLOW_SOURCELESS_MUTATIONS;
    const blockedSecret = 'sk-sourceless-blocked-secret';
    const blocked = await authInject({
      method: 'POST',
      url: '/api/settings/llm',
      payload: { provider: 'openai', apiKey: blockedSecret, model: 'gpt-4.1-mini', enabled: true }
    });

    process.env.AKC_ALLOW_SOURCELESS_MUTATIONS = 'true';
    const allowedSecret = 'sk-sourceless-local-secret';
    const allowed = await authInject({
      method: 'POST',
      url: '/api/settings/llm',
      payload: { provider: 'openai', apiKey: allowedSecret, model: 'gpt-4.1-mini', enabled: true }
    });

    expect(blocked.statusCode).toBe(403);
    expect(blocked.body).not.toContain(blockedSecret);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body).not.toContain(allowedSecret);
  }, 30_000);

  it('allows trusted Referer fallback but rejects untrusted Referer-only mutations', async () => {
    const blockedSecret = 'sk-bad-referer-secret';
    const blocked = await authInject({
      method: 'POST',
      url: '/api/settings/llm',
      headers: { referer: 'https://evil.example/settings' },
      payload: { provider: 'openai', apiKey: blockedSecret, model: 'gpt-4.1-mini', enabled: true }
    });
    const allowedSecret = 'sk-good-referer-secret';
    const allowed = await authInject({
      method: 'POST',
      url: '/api/settings/llm',
      headers: { referer: 'http://localhost:5173/settings' },
      payload: { provider: 'openai', apiKey: allowedSecret, model: 'gpt-4.1-mini', enabled: true }
    });

    expect(blocked.statusCode).toBe(403);
    expect(blocked.body).not.toContain(blockedSecret);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body).not.toContain(allowedSecret);
    expect(allowed.json().status.llm).toMatchObject({ source: 'personal', configured: true, keyConfigured: true });
  }, 30_000);

  it('saves personal Atlassian settings server-side without returning the token', async () => {
    const payload = {
      siteUrl: 'https://example.atlassian.net',
      email: 'user@example.com',
      apiToken: 'token_1234567890',
      jiraProjectAllowlist: ['AKC', 'NFS'],
      confluenceSpaceAllowlist: ['AKC']
    };

    const save = await authInject({ method: 'POST', url: '/api/settings/atlassian', payload });
    expect(save.statusCode).toBe(200);
    expect(save.body).not.toContain(payload.apiToken);
    expect(save.json()).toMatchObject({
      status: {
        mcpConnected: false,
        mcpConnectionState: 'configured',
        atlassian: {
          source: 'personal',
          configured: true,
          siteUrl: payload.siteUrl,
          email: payload.email,
          tokenConfigured: true,
          allowedJiraProjects: ['AKC', 'NFS'],
          allowedConfluenceSpaces: ['AKC']
        }
      }
    });

    const status = await authInject({ method: 'GET', url: '/api/settings/status' });
    expect(status.statusCode).toBe(200);
    expect(status.body).not.toContain(payload.apiToken);
    expect(status.json().atlassian).toMatchObject({ source: 'personal', configured: true, tokenConfigured: true });
  }, 30_000);

  it('does not silently persist an environment Atlassian token as a personal token', async () => {
    process.env.ATLASSIAN_URL = 'https://env.atlassian.net';
    process.env.ATLASSIAN_EMAIL = 'env@example.com';
    process.env.ATLASSIAN_API_TOKEN = 'env_token_1234567890';

    const save = await authInject({
      method: 'POST',
      url: '/api/settings/atlassian',
      payload: {
        siteUrl: 'https://example.atlassian.net',
        email: 'user@example.com',
        jiraProjectAllowlist: ['AKC'],
        confluenceSpaceAllowlist: ['AKC']
      }
    });

    expect(save.statusCode).toBe(400);
    expect(save.body).not.toContain('env_token_1234567890');
    const status = await authInject({ method: 'GET', url: '/api/settings/status' });
    expect(status.json().atlassian).toMatchObject({ source: 'none', configured: false, tokenConfigured: false });
  }, 30_000);

  it('rejects Atlassian site URLs that could exfiltrate credentials through SSRF', async () => {
    const token = 'token_ssrf_private';
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const privateHost = await authInject({
      method: 'POST',
      url: '/api/settings/atlassian',
      payload: {
        siteUrl: 'https://127.0.0.1',
        email: 'user@example.com',
        apiToken: token,
        jiraProjectAllowlist: ['AKC'],
        confluenceSpaceAllowlist: ['AKC']
      }
    });
    const nonAtlassian = await authInject({
      method: 'POST',
      url: '/api/settings/atlassian',
      payload: {
        siteUrl: 'https://evil.example',
        email: 'user@example.com',
        apiToken: token,
        jiraProjectAllowlist: ['AKC'],
        confluenceSpaceAllowlist: ['AKC']
      }
    });
    const embeddedCredentials = await authInject({
      method: 'POST',
      url: '/api/settings/atlassian',
      payload: {
        siteUrl: 'https://attacker:password@example.atlassian.net',
        email: 'user@example.com',
        apiToken: token,
        jiraProjectAllowlist: ['AKC'],
        confluenceSpaceAllowlist: ['AKC']
      }
    });

    expect(privateHost.statusCode).toBe(400);
    expect(nonAtlassian.statusCode).toBe(400);
    expect(embeddedCredentials.statusCode).toBe(400);
    expect(privateHost.body).not.toContain(token);
    expect(nonAtlassian.body).not.toContain(token);
    expect(embeddedCredentials.body).not.toContain(token);
    expect(fetchMock).not.toHaveBeenCalled();
    const status = await authInject({ method: 'GET', url: '/api/settings/status' });
    expect(status.json().atlassian).toMatchObject({ source: 'none', configured: false, tokenConfigured: false });
  }, 30_000);

  it('allows explicitly allowlisted self-managed Atlassian hosts without weakening private-host rejection', async () => {
    process.env.ATLASSIAN_SITE_HOST_ALLOWLIST = 'jira.example.com';

    const save = await authInject({
      method: 'POST',
      url: '/api/settings/atlassian',
      payload: {
        siteUrl: 'https://jira.example.com/wiki',
        email: 'user@example.com',
        apiToken: 'token_1234567890',
        jiraProjectAllowlist: ['AKC'],
        confluenceSpaceAllowlist: ['AKC']
      }
    });

    expect(save.statusCode).toBe(200);
    expect(save.json().status.atlassian).toMatchObject({ source: 'personal', siteUrl: 'https://jira.example.com', tokenConfigured: true });
  }, 30_000);

  it('tests saved Atlassian settings and stores validation state without returning the token', async () => {
    const token = 'token_1234567890';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ accountId: 'abc123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    await authInject({
      method: 'POST',
      url: '/api/settings/atlassian',
      payload: {
        siteUrl: 'https://example.atlassian.net',
        email: 'user@example.com',
        apiToken: token,
        jiraProjectAllowlist: ['AKC'],
        confluenceSpaceAllowlist: ['AKC']
      }
    });

    const test = await authInject({ method: 'POST', url: '/api/settings/atlassian/test' });

    expect(test.statusCode).toBe(200);
    expect(test.body).not.toContain(token);
    expect(test.json()).toMatchObject({
      ok: true,
      status: {
        mcpConnected: true,
        mcpConnectionState: 'connected',
        atlassian: {
          source: 'personal',
          connectionState: 'connected',
          connected: true,
          lastValidatedAt: expect.any(String)
        }
      }
    });
  }, 30_000);

  it('keeps Atlassian connection test provider details and tokens out of failed responses', async () => {
    const token = 'token_1234567890';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: `bad token ${token}` }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    }));
    await authInject({
      method: 'POST',
      url: '/api/settings/atlassian',
      payload: {
        siteUrl: 'https://example.atlassian.net',
        email: 'user@example.com',
        apiToken: token,
        jiraProjectAllowlist: ['AKC'],
        confluenceSpaceAllowlist: ['AKC']
      }
    });

    const test = await authInject({ method: 'POST', url: '/api/settings/atlassian/test' });

    expect(test.statusCode).toBe(200);
    expect(test.body).not.toContain(token);
    expect(test.body).not.toContain('bad token');
    expect(test.json()).toMatchObject({
      ok: false,
      message: 'Atlassian 연결 테스트가 실패했습니다. 상태 401.',
      status: {
        mcpConnected: false,
        mcpConnectionState: 'failed',
        atlassian: {
          source: 'personal',
          connectionState: 'failed',
          lastError: 'Atlassian 연결 테스트가 실패했습니다. 상태 401.'
        }
      }
    });
  }, 30_000);

  it('clears personal Atlassian settings from the server', async () => {
    await authInject({
      method: 'POST',
      url: '/api/settings/atlassian',
      payload: {
        siteUrl: 'https://example.atlassian.net',
        email: 'user@example.com',
        apiToken: 'token_1234567890',
        jiraProjectAllowlist: ['AKC'],
        confluenceSpaceAllowlist: ['AKC']
      }
    });

    const clear = await authInject({ method: 'DELETE', url: '/api/settings/atlassian' });
    expect(clear.statusCode).toBe(200);
    expect(clear.json()).toMatchObject({
      status: {
        mcpConnectionState: 'not_configured',
        atlassian: { source: 'none', configured: false, tokenConfigured: false }
      }
    });
  }, 30_000);

  it('fails closed on production secret encryption without a managed key', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AKC_ENABLE_LOCAL_AUTH = 'true';
    process.env.AKC_AUTH_CSRF_SECRET = Buffer.alloc(32, 7).toString('base64');
    delete process.env.AKC_CREDENTIAL_ENCRYPTION_KEY;
    const secret = 'sk-production-must-use-managed-key';
    const signup = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      headers: { origin: 'http://localhost:5173' },
      payload: { email: uniqueAuthEmail('prod-secret'), password: 'StrongPass123' }
    });
    const cookie = cookieHeaderFromSetCookie(signup, 'akc_session');
    const csrf = (await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } })).json<{ csrfToken: string }>().csrfToken;

    const response = await authInject({
      method: 'POST',
      url: '/api/settings/llm',
      headers: { cookie, 'x-csrf-token': csrf, origin: 'http://localhost:5173' },
      payload: { provider: 'openai', apiKey: secret, model: 'gpt-4.1-mini', enabled: true }
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(secret);
    expect(response.json().error).toContain('AKC_CREDENTIAL_ENCRYPTION_KEY');
  }, 30_000);

  it('saves personal OpenAI, Claude, and OpenRouter LLM settings without returning API keys', async () => {
    const openAiKey = 'sk-openai-personal-secret';
    const openAi = await authInject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: openAiKey, model: 'gpt-4.1-mini', enabled: true } });
    expect(openAi.statusCode).toBe(200);
    expect(openAi.body).not.toContain(openAiKey);
    expect(openAi.json()).toMatchObject({ status: { llm: { provider: 'openai', source: 'personal', configured: true, keyConfigured: true, model: 'gpt-4.1-mini' } } });

    const anthropicKey = 'sk-ant-personal-secret';
    const anthropic = await authInject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'anthropic', apiKey: anthropicKey, model: 'claude-3-5-sonnet-latest', enabled: true } });
    expect(anthropic.statusCode).toBe(200);
    expect(anthropic.body).not.toContain(anthropicKey);
    expect(anthropic.json()).toMatchObject({ status: { llm: { provider: 'anthropic', source: 'personal', configured: true, keyConfigured: true, model: 'claude-3-5-sonnet-latest' } } });

    const openRouterKey = 'sk-or-personal-secret';
    const openRouter = await authInject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openrouter', apiKey: openRouterKey, model: 'openrouter/auto', enabled: true } });
    expect(openRouter.statusCode).toBe(200);
    expect(openRouter.body).not.toContain(openRouterKey);
    expect(openRouter.json()).toMatchObject({ status: { llm: { provider: 'openrouter', source: 'personal', configured: true, keyConfigured: true, model: 'openrouter/auto' } } });
  }, 30_000);

  it('clears LLM settings without clearing saved Atlassian settings', async () => {
    await authInject({
      method: 'POST',
      url: '/api/settings/atlassian',
      payload: {
        siteUrl: 'https://example.atlassian.net',
        email: 'user@example.com',
        apiToken: 'token_1234567890',
        jiraProjectAllowlist: ['AKC'],
        confluenceSpaceAllowlist: ['AKC']
      }
    });
    await authInject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: 'sk-openai-personal-secret', enabled: true } });

    const clear = await authInject({ method: 'DELETE', url: '/api/settings/llm' });
    expect(clear.statusCode).toBe(200);
    expect(clear.json()).toMatchObject({
      status: {
        atlassian: { source: 'personal', configured: true, tokenConfigured: true },
        llm: { provider: 'mock', source: 'none', configured: false, keyConfigured: false }
      }
    });
    expect(clear.body).not.toContain('token_1234567890');
    expect(clear.body).not.toContain('sk-openai-personal-secret');
  }, 30_000);

  it('tests saved LLM settings through the server and stores sanitized validation state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'resp_test' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await authInject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: 'sk-openai-personal-secret', enabled: true } });

    const test = await authInject({ method: 'POST', url: '/api/settings/llm/test' });
    expect(test.statusCode).toBe(200);
    expect(test.body).not.toContain('sk-openai-personal-secret');
    expect(test.json()).toMatchObject({ ok: true, provider: 'openai', status: { llm: { connected: true, connectionState: 'connected' } } });
  }, 30_000);

  it('tests saved OpenRouter settings through the Broker with chat completion headers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'router_test' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await authInject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openrouter', apiKey: 'sk-or-personal-secret', enabled: true } });

    const test = await authInject({ method: 'POST', url: '/api/settings/llm/test' });

    expect(test.statusCode).toBe(200);
    expect(test.body).not.toContain('sk-or-personal-secret');
    expect(test.json()).toMatchObject({ ok: true, provider: 'openrouter', status: { llm: { connected: true, connectionState: 'connected', model: 'openrouter/auto' } } });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-or-personal-secret',
          'HTTP-Referer': expect.any(String),
          'X-OpenRouter-Title': 'Atlassian Copilot'
        })
      })
    );
  }, 30_000);

  it('keeps provider error details out of failed LLM connection tests', async () => {
    const secret = 'sk-or-personal-secret';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: `quota failed for ${secret}` } }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    }));
    await authInject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openrouter', apiKey: secret, enabled: true } });

    const test = await authInject({ method: 'POST', url: '/api/settings/llm/test' });

    expect(test.statusCode).toBe(200);
    expect(test.body).not.toContain(secret);
    expect(test.body).not.toContain('quota failed');
    expect(test.json()).toMatchObject({ ok: false, provider: 'openrouter', message: 'OpenRouter 연결 테스트가 실패했습니다. 상태 429.' });
    expect(test.json().status.llm.lastError).toBe('OpenRouter 연결 테스트가 실패했습니다. 상태 429.');
  }, 30_000);

  it('does not expose OpenRouter environment fallback inside authenticated user-scoped settings', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-env-secret';
    process.env.OPENROUTER_MODEL = 'openai/gpt-4.1-mini';
    process.env.AKC_ENABLE_LIVE_OPENROUTER = 'true';

    const configured = await authInject({ method: 'GET', url: '/api/settings/status' });
    expect(configured.json()).toMatchObject({ llm: { provider: 'mock', source: 'none', configured: false, enabled: false, connected: false } });

    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.AKC_ENABLE_LIVE_OPENROUTER;
  }, 30_000);

  it('rejects LLM connection tests when no enabled provider is configured', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const test = await authInject({ method: 'POST', url: '/api/settings/llm/test' });

    expect(test.statusCode).toBe(409);
    expect(test.json()).toMatchObject({
      ok: false,
      provider: 'mock',
      error: expect.stringContaining('테스트할 수 있는 개인 OpenAI, Claude 또는 OpenRouter 제공자가 없습니다'),
      status: { llm: { provider: 'mock', configured: false, enabled: false, connected: false } }
    });
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);

  it('returns fallback model options without calling providers when OpenAI credentials are absent', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const response = await authInject({ method: 'GET', url: '/api/settings/llm/providers/openai/models' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: 'openai',
      source: 'fallback',
      defaultModel: 'gpt-4.1-mini',
      manualEntryAllowed: true,
      cache: { status: 'disabled', ttlSeconds: 0 },
      warning: expect.stringContaining('저장된 API 키가 없어')
    });
    expect(response.body).not.toContain('OPENAI_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);

  it('fetches and caches normalized OpenAI model catalogs through the server only', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      object: 'list',
      data: [
        { id: 'gpt-4.1-mini', object: 'model', created: 1_716_000_000, owned_by: 'openai' },
        { id: 'text-embedding-3-small', object: 'model', created: 1_716_000_000, owned_by: 'openai' }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await authInject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: 'sk-openai-personal-secret', model: 'gpt-4.1-mini', enabled: true } });

    const first = await authInject({ method: 'GET', url: '/api/settings/llm/providers/openai/models' });
    const second = await authInject({ method: 'GET', url: '/api/settings/llm/providers/openai/models' });
    const refreshed = await authInject({ method: 'GET', url: '/api/settings/llm/providers/openai/models?refresh=true' });

    expect(first.statusCode).toBe(200);
    expect(first.body).not.toContain('sk-openai-personal-secret');
    expect(first.json()).toMatchObject({
      provider: 'openai',
      source: 'personal',
      selectedModel: 'gpt-4.1-mini',
      models: [expect.objectContaining({ id: 'gpt-4.1-mini', provider: 'openai', recommended: true })],
      cache: { status: 'miss', ttlSeconds: 3600 }
    });
    expect(first.body).not.toContain('text-embedding-3-small');
    expect(second.json()).toMatchObject({ cache: { status: 'hit' } });
    expect(refreshed.json()).toMatchObject({ cache: { status: 'miss' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-openai-personal-secret' })
      })
    );
  }, 30_000);

  it('returns sanitized fallback warnings when provider catalog fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'sk-openai-personal-secret leaked provider detail' } }), { status: 500 }));
    await authInject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: 'sk-openai-personal-secret', model: 'gpt-4.1-mini', enabled: true } });

    const response = await authInject({ method: 'GET', url: '/api/settings/llm/providers/openai/models' });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('sk-openai-personal-secret');
    expect(response.json()).toMatchObject({
      provider: 'openai',
      source: 'fallback',
      manualEntryAllowed: true,
      warning: '모델 목록을 불러오지 못했습니다. 직접 입력할 수 있습니다.'
    });
  }, 30_000);

  it('uses the public OpenRouter catalog path without browser-visible credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [
        {
          id: 'openrouter/auto',
          name: 'OpenRouter Auto',
          description: 'Auto router',
          context_length: 128000,
          architecture: { input_modalities: ['text'], output_modalities: ['text'] },
          top_provider: { max_completion_tokens: 8192 },
          supported_parameters: ['tools'],
          pricing: { prompt: '0', completion: '0' }
        }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const response = await authInject({ method: 'GET', url: '/api/settings/llm/providers/openrouter/models' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: 'openrouter',
      source: 'public',
      models: [expect.objectContaining({ id: 'openrouter/auto', contextWindow: 128000, supportedParameters: ['tools'] })],
      cache: { status: 'miss', ttlSeconds: 21600 }
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models?output_modalities=text',
      expect.objectContaining({ method: 'GET', headers: {} })
    );
  }, 30_000);

  it('does not test or record validation for disabled saved LLM settings', async () => {
    const secret = 'sk-disabled-openai-secret';
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await authInject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: secret, model: 'gpt-4.1-mini', enabled: false } });

    const test = await authInject({ method: 'POST', url: '/api/settings/llm/test' });

    expect(test.statusCode).toBe(409);
    expect(test.body).not.toContain(secret);
    expect(test.json()).toMatchObject({
      ok: false,
      provider: 'openai',
      error: expect.stringContaining('비활성 상태'),
      status: {
        llm: {
          provider: 'openai',
          source: 'personal',
          configured: true,
          enabled: false,
          connected: false,
          connectionState: 'configured'
        }
      }
    });
    expect(test.json().status.llm.lastValidatedAt).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);

  it('streams configured OpenAI deltas through the Copilot SSE endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/rest/api/3/search/jql')) return assignedIssueSearchResponse();
      if (url === 'https://api.openai.com/v1/responses') return new Response(streamFromText('data: {"type":"response.output_text.delta","delta":"OpenAI provider summary"}\n\ndata: {"type":"response.completed"}\n\n'), { status: 200 });
      return new Response('not found', { status: 404 });
    });
    await authInject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: 'sk-openai-personal-secret', model: 'gpt-4.1-mini', enabled: true } });
    await saveAtlassianSettingsForAssignedIssues();
    const { streamUrl } = await createRun(app, '나에게 할당된 이슈들을 조회해줘');

    const stream = await authInject({ method: 'GET', url: streamUrl });
    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('OpenAI provider summary');
    expect(stream.body).toContain('event: run.completed');
  }, 30_000);

  it('terminates Copilot runs as failed when a configured LLM stream fails without leaking provider details', async () => {
    const secret = 'sk-openai-personal-secret';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/rest/api/3/search/jql')) return assignedIssueSearchResponse();
      if (url === 'https://api.openai.com/v1/responses') return new Response(streamFromText(`data: {"type":"response.failed","error":{"message":"quota failed for ${secret}"}}\n\n`), { status: 200 });
      return new Response('not found', { status: 404 });
    });
    await authInject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openai', apiKey: secret, model: 'gpt-4.1-mini', enabled: true } });
    await saveAtlassianSettingsForAssignedIssues();
    const { streamUrl } = await createRun(app, '나에게 할당된 이슈들을 조회해줘');

    const stream = await authInject({ method: 'GET', url: streamUrl });

    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('event: llm.failed');
    expect(stream.body).toContain('event: run.failed');
    expect(stream.body).not.toContain('event: run.completed');
    expect(stream.body).not.toContain('report_draft.started');
    expect(stream.body).not.toContain(secret);
    expect(stream.body).not.toContain('quota failed');
  }, 30_000);

  it('streams configured Claude deltas through the Copilot SSE endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/rest/api/3/search/jql')) return assignedIssueSearchResponse();
      if (url === 'https://api.anthropic.com/v1/messages') return new Response(streamFromText('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude provider summary"}}\n\ndata: {"type":"message_stop"}\n\n'), { status: 200 });
      return new Response('not found', { status: 404 });
    });
    await authInject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'anthropic', apiKey: 'sk-ant-personal-secret', model: 'claude-3-5-sonnet-latest', enabled: true } });
    await saveAtlassianSettingsForAssignedIssues();
    const { streamUrl } = await createRun(app, '나에게 할당된 이슈들을 조회해줘');

    const stream = await authInject({ method: 'GET', url: streamUrl });
    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('Claude provider summary');
    expect(stream.body).toContain('event: run.completed');
  }, 30_000);

  it('streams configured OpenRouter deltas through the Copilot SSE endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/rest/api/3/search/jql')) return assignedIssueSearchResponse();
      if (url === 'https://openrouter.ai/api/v1/chat/completions') return new Response(streamFromText('data: {"choices":[{"delta":{"content":"OpenRouter provider summary"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'), { status: 200 });
      return new Response('not found', { status: 404 });
    });
    await authInject({ method: 'POST', url: '/api/settings/llm', payload: { provider: 'openrouter', apiKey: 'sk-or-personal-secret', model: 'openrouter/auto', enabled: true } });
    await saveAtlassianSettingsForAssignedIssues();
    const { streamUrl } = await createRun(app, '나에게 할당된 이슈들을 조회해줘');

    const stream = await authInject({ method: 'GET', url: streamUrl });
    expect(stream.statusCode).toBe(200);
    expect(stream.body).toContain('OpenRouter provider summary');
    expect(stream.body).toContain('event: run.completed');
  }, 30_000);
});

function cookieHeaderFromSetCookie(response: { headers: Record<string, unknown> }, name: string): string {
  const values = cookieValues(response);
  return values.find((value) => (value.startsWith(`${name}=`) || value.startsWith(`__Host-${name}=`)) && !value.includes('Max-Age=0')) ?? '';
}

function cookieValues(response: { headers: Record<string, unknown> }): string[] {
  const setCookie = response.headers['set-cookie'];
  return Array.isArray(setCookie) ? setCookie.map(String) : [String(setCookie ?? '')];
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
