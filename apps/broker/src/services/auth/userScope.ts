import { join } from 'node:path';
import { resolveStateDir } from '../settings/credentialStore.js';

export function userScopedEnv(userId: string, env = process.env): NodeJS.ProcessEnv {
  const scoped: NodeJS.ProcessEnv = { ...env, AKC_BROKER_STATE_DIR: join(resolveStateDir(env), 'users', safeUserPathSegment(userId)) };
  delete scoped.ATLASSIAN_URL;
  delete scoped.ATLASSIAN_EMAIL;
  delete scoped.ATLASSIAN_API_TOKEN;
  delete scoped.OPENAI_API_KEY;
  delete scoped.OPENROUTER_API_KEY;
  delete scoped.ANTHROPIC_API_KEY;
  delete scoped.CLAUDE_API_KEY;
  return scoped;
}

function safeUserPathSegment(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);
}
