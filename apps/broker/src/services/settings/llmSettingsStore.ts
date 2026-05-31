import type { LlmConnectionSource, LlmConnectionStatus, LlmModelCatalogProvider, LlmProvider, LlmSettingsRequest } from '@akc/shared';
import { decryptSecret, encryptSecret, readJsonProfile, removeJsonProfile, writeJsonProfile, type EncryptedSecret } from './credentialStore.js';

const profileFileName = 'llm-profile.json';

interface StoredLlmProfile {
  version: 1;
  provider: LlmProvider;
  apiKey?: EncryptedSecret | undefined;
  model?: string | undefined;
  enabled: boolean;
  lastValidatedAt?: string | undefined;
  lastError?: string | undefined;
  updatedAt: string;
}

export interface ResolvedLlmSettings extends LlmConnectionStatus {
  apiKey?: string | undefined;
}

export interface LlmRuntimeConfig {
  provider: Exclude<LlmProvider, 'mock'>;
  apiKey: string;
  model: string;
  source: 'environment' | 'personal';
}

export interface LlmValidationResult {
  ok: boolean;
  message: string;
  validatedAt?: string | undefined;
  error?: string | undefined;
}

export interface LlmModelCatalogConfig {
  provider: LlmModelCatalogProvider;
  apiKey?: string | undefined;
  model: string;
  source: 'personal' | 'environment' | 'none';
}

export function getLlmModelCatalogConfig(provider: LlmModelCatalogProvider, env = process.env): LlmModelCatalogConfig {
  const personal = readPersonalLlmProfile(env);
  if (personal?.provider === provider && personal.apiKey) {
    return {
      provider,
      apiKey: decryptSecret(personal.apiKey, env),
      model: personal.model ?? defaultModel(provider, env),
      source: 'personal'
    };
  }

  const environment = readEnvironmentCatalogConfig(provider, env);
  if (environment) return environment;

  return { provider, model: defaultModel(provider, env), source: 'none' };
}

export interface ResolvedLlmProviderCredential {
  provider: LlmModelCatalogProvider;
  source: Exclude<LlmConnectionSource, 'none'> | 'public' | 'none';
  apiKey?: string | undefined;
  selectedModel?: string | undefined;
  defaultModel: string;
}

export function readResolvedLlmSettings(env = process.env): ResolvedLlmSettings {
  const personal = readPersonalLlmProfile(env);
  if (personal) return resolvePersonalProfile(personal, env);
  return resolveEnvironmentProfile(env);
}

export function getLlmRuntimeConfig(env = process.env): LlmRuntimeConfig | null {
  const resolved = readResolvedLlmSettings(env);
  if (resolved.provider === 'mock' || !resolved.enabled || !resolved.apiKey) return null;
  return {
    provider: resolved.provider,
    apiKey: resolved.apiKey,
    model: resolved.model ?? defaultModel(resolved.provider, env),
    source: resolved.source === 'personal' ? 'personal' : 'environment'
  };
}

export function resolveLlmProviderCredential(provider: LlmModelCatalogProvider, env = process.env): ResolvedLlmProviderCredential {
  const personal = readPersonalLlmProfile(env);
  const selected = personal?.provider === provider
    ? personal.model
    : readResolvedLlmSettings(env).provider === provider
      ? readResolvedLlmSettings(env).model
      : undefined;

  if (personal?.provider === provider && personal.apiKey) {
    return {
      provider,
      source: 'personal',
      apiKey: decryptSecret(personal.apiKey, env),
      selectedModel: selected,
      defaultModel: defaultModel(provider, env)
    };
  }

  const environmentKey = providerEnvironmentKey(provider, env);
  if (environmentKey) {
    return {
      provider,
      source: 'environment',
      apiKey: environmentKey,
      selectedModel: selected,
      defaultModel: defaultModel(provider, env)
    };
  }

  return {
    provider,
    source: provider === 'openrouter' ? 'public' : 'none',
    selectedModel: selected,
    defaultModel: defaultModel(provider, env)
  };
}

export function savePersonalLlmSettings(input: LlmSettingsRequest, env = process.env): void {
  const existing = readPersonalLlmProfile(env);
  const provider = input.provider;
  const model = normalizeModel(input.model, provider, env);
  const existingKey = existing?.provider === provider && existing.apiKey ? decryptSecret(existing.apiKey, env) : undefined;
  const apiKey = input.apiKey?.trim() || existingKey;

  if (provider !== 'mock' && !apiKey) {
    throw new Error('API key is required before saving a personal LLM provider.');
  }

  const profile: StoredLlmProfile = {
    version: 1,
    provider,
    enabled: provider === 'mock' ? false : input.enabled,
    updatedAt: new Date().toISOString()
  };
  if (provider !== 'mock' && apiKey) profile.apiKey = encryptSecret(apiKey, env);
  if (model) profile.model = model;
  if (existing?.provider === provider && existing.lastValidatedAt && !input.apiKey?.trim()) profile.lastValidatedAt = existing.lastValidatedAt;
  if (existing?.provider === provider && existing.lastError && !input.apiKey?.trim()) profile.lastError = existing.lastError;

  writeJsonProfile(profileFileName, profile, env);
}

export function clearPersonalLlmSettings(env = process.env): void {
  removeJsonProfile(profileFileName, env);
}

export function recordPersonalLlmValidation(result: LlmValidationResult, env = process.env): void {
  const existing = readPersonalLlmProfile(env);
  if (!existing) return;
  const updated: StoredLlmProfile = {
    ...existing,
    lastValidatedAt: result.ok ? (result.validatedAt ?? new Date().toISOString()) : existing.lastValidatedAt,
    lastError: result.ok ? undefined : (result.error ?? result.message),
    updatedAt: new Date().toISOString()
  };
  writeJsonProfile(profileFileName, updated, env);
}

function readPersonalLlmProfile(env = process.env): StoredLlmProfile | null {
  return readJsonProfile<StoredLlmProfile>(profileFileName, 1, env);
}

function resolvePersonalProfile(profile: StoredLlmProfile, env = process.env): ResolvedLlmSettings {
  if (profile.provider === 'mock') {
    return {
      provider: 'mock',
      source: 'personal',
      connectionState: 'not_configured',
      configured: false,
      connected: false,
      enabled: false,
      keyConfigured: false,
      statusMessage: '개인 설정에서 모의 요약 스트림을 선택했습니다.'
    };
  }

  const apiKey = profile.apiKey ? decryptSecret(profile.apiKey, env) : undefined;
  const keyConfigured = Boolean(apiKey);
  const connected = keyConfigured && profile.enabled && Boolean(profile.lastValidatedAt) && !profile.lastError;
  return {
    provider: profile.provider,
    source: 'personal',
    connectionState: profile.lastError ? 'failed' : connected ? 'connected' : keyConfigured ? 'configured' : 'failed',
    configured: keyConfigured,
    connected,
    enabled: profile.enabled,
    keyConfigured,
    model: profile.model ?? defaultModel(profile.provider, env),
    statusMessage: personalStatusMessage(profile.provider, keyConfigured, profile.enabled, connected, profile.lastError),
    lastValidatedAt: profile.lastValidatedAt,
    lastError: profile.lastError,
    apiKey
  };
}

function resolveEnvironmentProfile(env = process.env): ResolvedLlmSettings {
  const openAiKey = providerEnvironmentKey('openai', env);
  if (openAiKey) {
    const enabled = env.AKC_ENABLE_LIVE_OPENAI === 'true';
    return {
      provider: 'openai',
      source: 'environment',
      connectionState: enabled ? 'connected' : 'configured',
      configured: true,
      connected: enabled,
      enabled,
      keyConfigured: true,
      model: env.OPENAI_MODEL?.trim() || defaultModel('openai', env),
      statusMessage: enabled
        ? '서버 환경 변수로 OpenAI가 활성화되었습니다.'
        : '서버에 OPENAI_API_KEY가 있지만 AKC_ENABLE_LIVE_OPENAI가 true가 아니므로 외부 LLM 요약은 비활성입니다.',
      apiKey: openAiKey
    };
  }

  const anthropicKey = providerEnvironmentKey('anthropic', env);
  if (anthropicKey) {
    const enabled = env.AKC_ENABLE_LIVE_ANTHROPIC === 'true';
    return {
      provider: 'anthropic',
      source: 'environment',
      connectionState: enabled ? 'connected' : 'configured',
      configured: true,
      connected: enabled,
      enabled,
      keyConfigured: true,
      model: env.ANTHROPIC_MODEL?.trim() || defaultModel('anthropic', env),
      statusMessage: enabled
        ? '서버 환경 변수로 Claude가 활성화되었습니다.'
        : '서버에 Anthropic API 키가 있지만 AKC_ENABLE_LIVE_ANTHROPIC이 true가 아니므로 외부 LLM 요약은 비활성입니다.',
      apiKey: anthropicKey
    };
  }

  const openRouterKey = providerEnvironmentKey('openrouter', env);
  if (openRouterKey) {
    const enabled = env.AKC_ENABLE_LIVE_OPENROUTER === 'true';
    return {
      provider: 'openrouter',
      source: 'environment',
      connectionState: enabled ? 'connected' : 'configured',
      configured: true,
      connected: enabled,
      enabled,
      keyConfigured: true,
      model: env.OPENROUTER_MODEL?.trim() || defaultModel('openrouter', env),
      statusMessage: enabled
        ? '서버 환경 변수로 OpenRouter가 활성화되었습니다.'
        : '서버에 OpenRouter API 키가 있지만 AKC_ENABLE_LIVE_OPENROUTER가 true가 아니므로 외부 LLM 요약은 비활성입니다.',
      apiKey: openRouterKey
    };
  }

  return {
    provider: 'mock',
    source: 'none',
    connectionState: 'not_configured',
    configured: false,
    connected: false,
    enabled: false,
    keyConfigured: false,
    statusMessage: '개인 LLM 제공자가 설정되지 않았습니다. 실제 근거가 없으면 데이터 없음 안내만 표시합니다.'
  };
}

function providerEnvironmentKey(provider: LlmModelCatalogProvider, env = process.env): string | undefined {
  if (provider === 'openai') return env.OPENAI_API_KEY?.trim() || undefined;
  if (provider === 'anthropic') return env.ANTHROPIC_API_KEY?.trim() || env.CLAUDE_API_KEY?.trim() || undefined;
  return env.OPENROUTER_API_KEY?.trim() || undefined;
}

function normalizeModel(value: string | undefined, provider: LlmProvider, env = process.env): string | undefined {
  if (provider === 'mock') return undefined;
  return value?.trim() || defaultModel(provider, env);
}

export function defaultModel(provider: Exclude<LlmProvider, 'mock'>, env = process.env): string {
  if (provider === 'openai') return env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini';
  if (provider === 'anthropic') return env.ANTHROPIC_MODEL?.trim() || 'claude-3-5-sonnet-latest';
  return env.OPENROUTER_MODEL?.trim() || 'openrouter/auto';
}

function personalStatusMessage(provider: Exclude<LlmProvider, 'mock'>, keyConfigured: boolean, enabled: boolean, connected: boolean, lastError?: string): string {
  const name = providerDisplayName(provider);
  if (!keyConfigured) return `${name}가 선택되었지만 서버가 저장된 API 키를 복호화할 수 없습니다.`;
  if (lastError) return `${name} 설정은 저장되었지만 마지막 연결 테스트가 실패했습니다.`;
  if (!enabled) return `${name} 설정은 저장되었지만 비활성 상태입니다. 외부 LLM 요약은 사용하지 않습니다.`;
  if (connected) return `${name} 설정이 저장되었고 마지막 연결 테스트가 통과했습니다.`;
  return `${name} 설정이 저장되었습니다. 연결 테스트로 키를 검증하세요.`;
}


function readEnvironmentCatalogConfig(provider: LlmModelCatalogProvider, env = process.env): LlmModelCatalogConfig | null {
  if (provider === 'openai') {
    const apiKey = env.OPENAI_API_KEY?.trim();
    return apiKey ? { provider, apiKey, model: defaultModel(provider, env), source: 'environment' } : null;
  }
  if (provider === 'anthropic') {
    const apiKey = env.ANTHROPIC_API_KEY?.trim() || env.CLAUDE_API_KEY?.trim();
    return apiKey ? { provider, apiKey, model: defaultModel(provider, env), source: 'environment' } : null;
  }
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  return apiKey ? { provider, apiKey, model: defaultModel(provider, env), source: 'environment' } : null;
}

function providerDisplayName(provider: Exclude<LlmProvider, 'mock'>): string {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'anthropic') return 'Claude';
  return 'OpenRouter';
}
