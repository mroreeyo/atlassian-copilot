import { type RunMode, type SettingsStatus } from '@akc/shared';
import { readResolvedAtlassianCredentials } from './atlassianSettingsStore.js';
import { readResolvedLlmSettings } from './llmSettingsStore.js';

export function buildSettingsStatus(env = process.env): SettingsStatus {
  const atlassian = readResolvedAtlassianCredentials(env);
  const { apiKey: _llmApiKey, ...llm } = readResolvedLlmSettings(env);
  const mode = readRunMode(env.COPILOT_MODE);
  const sandboxWriteEnabled = env.SANDBOX_WRITE_ENABLED === 'true';

  return {
    mcpConnected: atlassian.connected,
    mcpConnectionState: atlassian.connectionState,
    mcpStatusMessage: atlassian.statusMessage,
    openaiConnected: llm.provider === 'openai' && llm.connected,
    mode,
    sandboxWriteEnabled,
    allowedJiraProjects: atlassian.allowedJiraProjects,
    allowedConfluenceSpaces: atlassian.allowedConfluenceSpaces,
    atlassian: {
      source: atlassian.source,
      connectionState: atlassian.connectionState,
      configured: atlassian.configured,
      connected: atlassian.connected,
      siteUrl: atlassian.siteUrl,
      email: atlassian.email,
      tokenConfigured: Boolean(atlassian.apiToken),
      allowedJiraProjects: atlassian.allowedJiraProjects,
      allowedConfluenceSpaces: atlassian.allowedConfluenceSpaces,
      statusMessage: atlassian.statusMessage,
      lastValidatedAt: atlassian.lastValidatedAt,
      lastError: atlassian.lastError
    },
    llm
  };
}

function readRunMode(value: string | undefined): RunMode {
  if (value === 'mock' || value === 'sandbox-write' || value === 'readonly') return value;
  return 'readonly';
}
