import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'apps/web';
const ignoredDirectories = new Set(['dist', 'node_modules', 'coverage']);
const ignoredFilePattern = /(?:^|[/\\])(?:__tests__|test)(?:[/\\])|(?:\.test|\.spec)\.[jt]sx?$/i;
const forbiddenStrings = [
  'VITE_OPENAI_API_KEY',
  'VITE_CHATGPT_API_KEY',
  'VITE_ANTHROPIC_API_KEY',
  'VITE_CLAUDE_API_KEY',
  'VITE_OPENROUTER_API_KEY',
  'VITE_ATLASSIAN_TOKEN',
  'VITE_MCP_SERVER_URL',
  'ATLASSIAN_API_TOKEN',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'CLAUDE_API_KEY',
  'OPENROUTER_API_KEY'
];
const forbiddenPatterns = [
  /from\s+['"]openai['"]/i,
  /from\s+['"][^'"]*anthropic[^'"]*['"]/i,
  /from\s+['"][^'"]*mcp[^'"]*['"]/i,
  /from\s+['"][^'"]*jira[^'"]*['"]/i,
  /from\s+['"][^'"]*confluence[^'"]*['"]/i,
  /from\s+['"][^'"]*atlassian[^'"]*['"]/i,
  /new\s+OpenAI\s*\(/,
  /https?:\/\/api\.openai\.com/i,
  /https?:\/\/api\.anthropic\.com/i,
  /https?:\/\/(?:api\.)?openrouter\.ai/i,
  /mcp-atlassian/i,
  /(?:localStorage|sessionStorage)\s*\.\s*setItem\s*\(\s*['"][^'"]*(?:auth|credential|api[_-]?key|password|secret|token|session|jwt|csrf|oauth)[^'"]*['"]/i,
  /(?:localStorage|sessionStorage)\s*\[\s*['"][^'"]*(?:auth|credential|api[_-]?key|password|secret|token|session|jwt|csrf|oauth)[^'"]*['"]\s*\]\s*=/i,
  /(?:localStorage|sessionStorage)\s*\.\s*(?:auth|credential|apiKey|password|secret|token|session|jwt|csrf|oauth)[\w$]*\s*=/i,
  /[?&][^"'`\\\s=]*(?:auth|credential|api[_-]?key|password|secret|token|session|jwt|csrf|oauth)[^"'`\\\s=]*=/i,
  /(?:URLSearchParams|searchParams)\s*\.\s*(?:append|set)\s*\(\s*['"][^'"]*(?:auth|credential|api[_-]?key|password|secret|token|session|jwt|csrf|oauth)[^'"]*['"]/i,
  /new\s+URLSearchParams\s*\(\s*\{[\s\S]*?['"]?[^'"}]*(?:auth|credential|api[_-]?key|password|secret|token|session|jwt|csrf|oauth)[^'"}]*['"]?\s*:/i,
  /new\s+URLSearchParams\s*\(\s*\[\s*\[\s*['"][^'"]*(?:auth|credential|api[_-]?key|password|secret|token|session|jwt|csrf|oauth)[^'"]*['"]/i
];

function files(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) return ignoredDirectories.has(entry) ? [] : files(full);
    if (ignoredFilePattern.test(full)) return [];
    return /\.(ts|tsx|js|jsx|css|html)$/.test(full) ? [full] : [];
  });
}

const failures = [];
for (const file of files(root)) {
  const text = readFileSync(file, 'utf8');
  for (const item of forbiddenStrings) {
    if (text.includes(item)) failures.push(`${file}: forbidden frontend secret string ${item}`);
  }
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) failures.push(`${file}: forbidden frontend direct integration pattern ${pattern}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.info('security scan passed: frontend has no forbidden secret strings or direct integration imports');
