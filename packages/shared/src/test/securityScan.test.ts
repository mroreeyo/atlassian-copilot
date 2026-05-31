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
    writeFileSync(join(root, 'src/client.ts'), "fetch('/api/settings/llm/providers/openai/models');\n");

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
});
