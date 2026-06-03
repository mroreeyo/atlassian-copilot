import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AuthClient from '../services/auth/authClient';

let buildGoogleLoginStartUrl: typeof AuthClient.buildGoogleLoginStartUrl;
let currentCsrfTokenForTest: typeof AuthClient.currentCsrfTokenForTest;
let getAuthSession: typeof AuthClient.getAuthSession;
let login: typeof AuthClient.login;
let logout: typeof AuthClient.logout;
let signup: typeof AuthClient.signup;

const fetchMock = vi.fn<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>();

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  ({ buildGoogleLoginStartUrl, currentCsrfTokenForTest, getAuthSession, login, logout, signup } = await import('../services/auth/authClient'));
});

describe('auth client', () => {
  it('checks the session with cookie credentials and treats 401 as signed out', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }));

    await expect(getAuthSession()).resolves.toEqual({ user: null });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({ credentials: 'include' }));
  });

  it('logs in with normalized email and never writes browser auth storage', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ user: { email: 'demo@example.com' } }), { status: 200 }));

    await expect(login({ email: '  DEMO@example.com ', password: 'DemoPass123!' })).resolves.toEqual({ user: { email: 'demo@example.com' } });

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email: 'demo@example.com', password: 'DemoPass123!' })
    }));
    expect(window.localStorage.getItem('auth_token')).toBeNull();
    expect(window.sessionStorage.getItem('auth_token')).toBeNull();
  });

  it('keeps CSRF memory-only and sends it only as a mutation header', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { email: 'demo@example.com' }, csrfToken: 'csrf-memory-only' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: null }), { status: 200 }));

    await expect(getAuthSession()).resolves.toEqual({ user: { email: 'demo@example.com' }, csrfToken: 'csrf-memory-only' });
    expect(currentCsrfTokenForTest()).toBe('csrf-memory-only');
    await expect(logout()).resolves.toEqual({ user: null });

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/logout', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-memory-only' })
    }));
    expect(currentCsrfTokenForTest()).toBeNull();
    expect(window.localStorage.getItem('csrfToken')).toBeNull();
    expect(window.sessionStorage.getItem('csrfToken')).toBeNull();
  });

  it('builds a Broker-only Google login start URL with allowlisted returnTo paths', () => {
    expect(buildGoogleLoginStartUrl('/history?filter=mine#run')).toBe('/api/auth/google/start?returnTo=%2Fhistory%3Ffilter%3Dmine%23run');
    expect(buildGoogleLoginStartUrl('https://evil.example/settings')).toBe('/api/auth/google/start?returnTo=%2Fsettings');
    expect(buildGoogleLoginStartUrl('/admin')).toBe('/api/auth/google/start?returnTo=%2Fsettings');
    expect(buildGoogleLoginStartUrl('//evil.example/settings')).toBe('/api/auth/google/start?returnTo=%2Fsettings');
  });

  it('signs up and logs out through cookie-backed Broker routes', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { email: 'new@example.com' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: null }), { status: 200 }));

    await expect(signup({ email: 'new@example.com', password: 'DemoPass123!' })).resolves.toEqual({ user: { email: 'new@example.com' } });
    await expect(logout()).resolves.toEqual({ user: null });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/auth/signup', expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/logout', expect.objectContaining({ method: 'POST', credentials: 'include' }));
  });
});
