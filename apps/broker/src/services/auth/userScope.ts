import { join } from 'node:path';
import { resolveStateDir } from '../settings/credentialStore.js';

export interface UserContext {
  userId: string;
  stateDir: string;
  env: NodeJS.ProcessEnv;
  legacySettingsPolicy: 'quarantined';
}

/**
 * Creates the explicit per-user Broker context used for private settings, runs,
 * write-action execution, and provider credentials.
 *
 * Legacy singleton settings remain quarantined in the root state directory. They
 * are never auto-imported into the first Google user; any future migration must
 * be an explicit admin/user action that names the destination user.
 */
export function createUserContext(userId: string, env = process.env): UserContext {
  const stateDir = join(resolveStateDir(env), 'users', safeUserPathSegment(userId));
  const scopedEnv: NodeJS.ProcessEnv = { ...env, AKC_BROKER_STATE_DIR: stateDir };
  delete scopedEnv.ATLASSIAN_URL;
  delete scopedEnv.ATLASSIAN_EMAIL;
  delete scopedEnv.ATLASSIAN_API_TOKEN;
  delete scopedEnv.OPENAI_API_KEY;
  delete scopedEnv.OPENROUTER_API_KEY;
  delete scopedEnv.ANTHROPIC_API_KEY;
  delete scopedEnv.CLAUDE_API_KEY;
  return { userId, stateDir, env: scopedEnv, legacySettingsPolicy: 'quarantined' };
}

export function userScopedEnv(userId: string, env = process.env): NodeJS.ProcessEnv {
  return createUserContext(userId, env).env;
}

function safeUserPathSegment(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);
}
