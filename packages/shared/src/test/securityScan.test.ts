// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../..');
const scriptPath = join(repoRoot, 'scripts/security-scan.mjs');
const tempRoots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'akc-security-scan-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe('frontend security scan', () => {
  it('passes relative Broker-only frontend code', () => {
    const root = fixtureRoot();
    writeFileSync(join(root, 'src/client.ts'), "fetch('/api/settings/llm/providers/openai/models');\nlocalStorage.setItem('theme', 'dark');\n");

    expect(() => execFileSync(process.execPath, [scriptPath, root], { cwd: repoRoot, stdio: 'pipe' })).not.toThrow();
  });

  it('fails on browser-exposed provider secrets, SDK imports, or provider hostnames', () => {
    const root = fixtureRoot();
    writeFileSync(
      join(root, 'src/client.ts'),
      [
        "const openAiSecret = 'VITE_OPENAI_API_KEY';",
        "const openRouterSecret = 'VITE_OPENROUTER_API_KEY';",
        "import OpenAI from 'openai';",
        "fetch('https://api.openai.com/v1/models');",
        "fetch('https://api.openrouter.ai/v1/models');",
        "fetch('https://openrouter.ai/api/v1/models');"
      ].join('\n')
    );

    expect(() => execFileSync(process.execPath, [scriptPath, root], { cwd: repoRoot, stdio: 'pipe' })).toThrow();
  });

  it('fails on auth/session/token browser storage or URL leakage patterns', () => {
    const root = fixtureRoot();
    writeFileSync(
      join(root, 'src/client.ts'),
      [
        "localStorage.setItem('auth_token', token);",
        "localStorage.setItem('apiKey', apiKey);",
        "sessionStorage.setItem('csrfToken', csrf);",
        "document.cookie = `csrfToken=${csrf}`;",
        "indexedDB.open('oauthState');",
        "caches.open('csrf-cache');",
        "cache.put('/callback?oauthState=' + state, response);",
        "queryClient.setQueryData(['csrfToken'], csrf);",
        "window.history.pushState(null, '', '?sessionToken=' + token);",
        "window.history.pushState(null, '', '?apiKey=' + apiKey);",
        "window.history.pushState(null, '', '?accessToken=' + token);",
        "const params = new URLSearchParams({ oauthToken: token });",
        "params.set('jwt', token);",
        "params.set('apiKey', apiKey);",
        "console.info('csrfToken', csrf);",
        "logger.warn('oauthToken', token);"
      ].join('\n')
    );

    expect(() => execFileSync(process.execPath, [scriptPath, root], { cwd: repoRoot, stdio: 'pipe' })).toThrow();
  });

  it.each([
    ['cookie persistence', "document.cookie = `csrfToken=${csrf}`;"],
    ['IndexedDB persistence', "indexedDB.open('oauthState');"],
    ['Cache API namespace', "caches.open('csrf-cache');"],
    ['Cache API entry', "cache.put('/callback?oauthState=' + state, response);"],
    ['query cache entry', "queryClient.setQueryData(['csrfToken'], csrf);"],
    ['console logging', "console.info('csrfToken', csrf);"],
    ['logger logging', "logger.warn('oauthToken', token);"]
  ])('fails on %s for CSRF/OAuth-like values', (_, source) => {
    const root = fixtureRoot();
    writeFileSync(join(root, 'src/client.ts'), source);

    expect(() => execFileSync(process.execPath, [scriptPath, root], { cwd: repoRoot, stdio: 'pipe' })).toThrow();
  });

  it('ignores test fixtures that intentionally contain blocked examples', () => {
    const root = fixtureRoot();
    mkdirSync(join(root, 'src/test'), { recursive: true });
    writeFileSync(
      join(root, 'src/test/client.test.ts'),
      [
        "localStorage.setItem('auth_token', token);",
        "window.history.pushState(null, '', '?sessionToken=' + token);"
      ].join('\n')
    );

    expect(() => execFileSync(process.execPath, [scriptPath, root], { cwd: repoRoot, stdio: 'pipe' })).not.toThrow();
  });

  it('keeps local sensitive artifact names covered by gitignore', () => {
    const ignored = execFileSync('git', [
      'check-ignore',
      '.akc-state/auth.sqlite',
      'local.sqlite',
      'local.sqlite-wal',
      'local.db',
      'local.db-shm'
    ], { cwd: repoRoot, encoding: 'utf8' }).trim().split(/\r?\n/);

    expect(ignored).toEqual(expect.arrayContaining([
      '.akc-state/auth.sqlite',
      'local.sqlite',
      'local.sqlite-wal',
      'local.db',
      'local.db-shm'
    ]));
  });

  it('fails when local sensitive artifacts are not protected by git ignores', () => {
    const root = fixtureRoot();
    mkdirSync(join(root, '.akc-state'), { recursive: true });
    writeFileSync(join(root, '.akc-state/auth.sqlite'), 'local sqlite placeholder');
    writeFileSync(join(root, 'cache.db'), 'local db placeholder');

    expect(() => execFileSync(process.execPath, [scriptPath, root], { cwd: root, stdio: 'pipe' })).toThrow();
  });

});
