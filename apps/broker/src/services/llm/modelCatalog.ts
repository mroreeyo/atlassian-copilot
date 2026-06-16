import type {
  LlmModelCatalogProvider,
  LlmModelCatalogSource,
  LlmModelOption,
  LlmProvider,
  LlmProviderModelsResponse
} from '@akc/shared';
import { LlmProviderModelsResponseSchema } from '@akc/shared';
import { createHash } from 'node:crypto';
import { resolveLlmProviderCredential } from '../settings/llmSettingsStore.js';
import { fetchWithProviderTimeout } from './providerTimeout.js';

interface CatalogCacheEntry {
  response: LlmProviderModelsResponse;
  expiresAt: number;
}

interface ProviderCatalogResult {
  models: LlmModelOption[];
  page?: LlmProviderModelsResponse['page'];
}

const cache = new Map<string, CatalogCacheEntry>();
const oneHourSeconds = 60 * 60;
const sixHoursSeconds = 6 * oneHourSeconds;

export function clearLlmModelCatalogCache(): void {
  cache.clear();
}

export async function getLlmProviderModels(provider: LlmProvider, refresh = false, env = process.env): Promise<LlmProviderModelsResponse> {
  if (provider === 'mock') return validateResponse(mockProviderResponse());

  const credential = resolveLlmProviderCredential(provider, env);
  const source = catalogSourceForCredential(credential.source);
  const ttlSeconds = provider === 'openrouter' ? sixHoursSeconds : oneHourSeconds;
  const cacheKey = buildCacheKey(provider, source, credential.apiKey);
  const cached = cache.get(cacheKey);
  const now = Date.now();

  if (!refresh && cached && cached.expiresAt > now) {
    return validateResponse({ ...cached.response, cache: { ...cached.response.cache, status: 'hit' } });
  }

  if (!credential.apiKey && provider !== 'openrouter') {
    return validateResponse(fallbackProviderResponse(provider, credential.defaultModel, credential.selectedModel, '저장된 API 키가 없어 기본 추천 모델만 표시합니다.'));
  }

  try {
    const result = await fetchProviderCatalog(provider, credential.apiKey);
    const models = withSelectedModel(provider, result.models, credential.defaultModel, credential.selectedModel);
    const response = validateResponse({
      provider,
      source,
      defaultModel: credential.defaultModel,
      selectedModel: credential.selectedModel,
      models,
      manualEntryAllowed: true,
      cache: {
        status: 'miss',
        ttlSeconds,
        fetchedAt: new Date(now).toISOString()
      },
      page: result.page
    });
    cache.set(cacheKey, { response, expiresAt: now + ttlSeconds * 1000 });
    return response;
  } catch {
    if (cached) {
      return validateResponse({
        ...cached.response,
        warning: '모델 목록을 새로 불러오지 못했습니다. 최근 캐시된 목록을 표시합니다.',
        cache: { ...cached.response.cache, status: 'stale' }
      });
    }
    return validateResponse(fallbackProviderResponse(provider, credential.defaultModel, credential.selectedModel, '모델 목록을 불러오지 못했습니다. 직접 입력할 수 있습니다.'));
  }
}

async function fetchProviderCatalog(provider: LlmModelCatalogProvider, apiKey: string | undefined): Promise<ProviderCatalogResult> {
  if (provider === 'openai') return fetchOpenAiModels(apiKey);
  if (provider === 'anthropic') return fetchAnthropicModels(apiKey);
  return fetchOpenRouterModels(apiKey);
}

async function fetchOpenAiModels(apiKey: string | undefined): Promise<ProviderCatalogResult> {
  if (!apiKey) throw new Error('OpenAI model catalog requires an API key.');
  const response = await fetchWithProviderTimeout('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!response.ok) throw new Error(`OpenAI models request failed with status ${response.status}.`);
  const payload = await response.json() as { data?: Array<{ id?: unknown; owned_by?: unknown; created?: unknown }> };
  return {
    models: (payload.data ?? [])
      .flatMap((model) => normalizeOpenAiModel(model))
      .filter((model) => isLikelyTextOpenAiModel(model.id))
      .sort(compareRecommendedThenLabel)
  };
}

async function fetchAnthropicModels(apiKey: string | undefined): Promise<ProviderCatalogResult> {
  if (!apiKey) throw new Error('Claude model catalog requires an API key.');
  const response = await fetchWithProviderTimeout('https://api.anthropic.com/v1/models?limit=1000', {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }
  });
  if (!response.ok) throw new Error(`Claude models request failed with status ${response.status}.`);
  const payload = await response.json() as {
    data?: Array<{ id?: unknown; display_name?: unknown; created_at?: unknown }>;
    has_more?: unknown;
    first_id?: unknown;
    last_id?: unknown;
  };
  return {
    models: (payload.data ?? []).flatMap((model) => normalizeAnthropicModel(model)).sort(compareRecommendedThenLabel),
    page: {
      hasMore: payload.has_more === true,
      firstId: typeof payload.first_id === 'string' ? payload.first_id : undefined,
      lastId: typeof payload.last_id === 'string' ? payload.last_id : undefined
    }
  };
}

async function fetchOpenRouterModels(apiKey: string | undefined): Promise<ProviderCatalogResult> {
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetchWithProviderTimeout('https://openrouter.ai/api/v1/models?output_modalities=text', {
    method: 'GET',
    headers
  });
  if (!response.ok) throw new Error(`OpenRouter models request failed with status ${response.status}.`);
  const payload = await response.json() as {
    data?: Array<{
      id?: unknown;
      name?: unknown;
      description?: unknown;
      context_length?: unknown;
      architecture?: { input_modalities?: unknown; output_modalities?: unknown };
      top_provider?: { max_completion_tokens?: unknown };
      supported_parameters?: unknown;
      pricing?: unknown;
    }>;
  };
  return {
    models: (payload.data ?? [])
      .flatMap((model) => normalizeOpenRouterModel(model))
      .filter((model) => model.outputModalities?.includes('text') ?? true)
      .sort(compareRecommendedThenLabel)
  };
}

function normalizeOpenAiModel(model: { id?: unknown; owned_by?: unknown; created?: unknown }): LlmModelOption[] {
  if (typeof model.id !== 'string' || !model.id.trim()) return [];
  return [{
    id: model.id,
    label: model.id,
    provider: 'openai',
    owner: typeof model.owned_by === 'string' ? model.owned_by : undefined,
    createdAt: typeof model.created === 'number' ? new Date(model.created * 1000).toISOString() : undefined,
    recommended: isRecommendedModel(model.id)
  }];
}

function normalizeAnthropicModel(model: { id?: unknown; display_name?: unknown; created_at?: unknown }): LlmModelOption[] {
  if (typeof model.id !== 'string' || !model.id.trim()) return [];
  return [{
    id: model.id,
    label: typeof model.display_name === 'string' && model.display_name.trim() ? model.display_name : model.id,
    provider: 'anthropic',
    createdAt: typeof model.created_at === 'string' ? model.created_at : undefined,
    recommended: isRecommendedModel(model.id)
  }];
}

function normalizeOpenRouterModel(model: {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  context_length?: unknown;
  architecture?: { input_modalities?: unknown; output_modalities?: unknown };
  top_provider?: { max_completion_tokens?: unknown };
  supported_parameters?: unknown;
  pricing?: unknown;
}): LlmModelOption[] {
  if (typeof model.id !== 'string' || !model.id.trim()) return [];
  return [{
    id: model.id,
    label: typeof model.name === 'string' && model.name.trim() ? model.name : model.id,
    provider: 'openrouter',
    description: typeof model.description === 'string' && model.description.trim() ? model.description : undefined,
    contextWindow: typeof model.context_length === 'number' && model.context_length > 0 ? model.context_length : undefined,
    maxOutputTokens: typeof model.top_provider?.max_completion_tokens === 'number' && model.top_provider.max_completion_tokens > 0 ? model.top_provider.max_completion_tokens : undefined,
    inputModalities: stringArray(model.architecture?.input_modalities),
    outputModalities: stringArray(model.architecture?.output_modalities),
    supportedParameters: stringArray(model.supported_parameters),
    pricing: stringRecord(model.pricing),
    recommended: isRecommendedModel(model.id)
  }];
}

function fallbackProviderResponse(provider: LlmModelCatalogProvider, defaultModel: string, selectedModel: string | undefined, warning: string): LlmProviderModelsResponse {
  return {
    provider,
    source: 'fallback',
    defaultModel,
    selectedModel,
    models: withSelectedModel(provider, [fallbackModel(provider, defaultModel, true)], defaultModel, selectedModel),
    manualEntryAllowed: true,
    cache: {
      status: 'disabled',
      ttlSeconds: 0
    },
    warning
  };
}

function mockProviderResponse(): LlmProviderModelsResponse {
  return {
    provider: 'mock',
    source: 'none',
    defaultModel: 'mock',
    models: [],
    manualEntryAllowed: true,
    cache: {
      status: 'disabled',
      ttlSeconds: 0
    },
    message: '모의 제공자는 모델 선택이 필요하지 않습니다.'
  };
}

function fallbackModel(provider: LlmModelCatalogProvider, model: string, recommended: boolean): LlmModelOption {
  return {
    id: model,
    label: model,
    provider,
    recommended
  };
}

function withSelectedModel(provider: LlmModelCatalogProvider, models: LlmModelOption[], defaultModel: string, selectedModel: string | undefined): LlmModelOption[] {
  const required = [defaultModel, selectedModel].filter((model): model is string => Boolean(model?.trim()));
  const existing = new Set(models.map((model) => model.id));
  const additions = required
    .filter((model) => !existing.has(model))
    .map((model) => ({
      ...fallbackModel(provider, model, model === defaultModel),
      label: model === selectedModel ? `현재 설정된 모델 · ${model}` : model
    }));
  return [...additions, ...models].sort(compareRecommendedThenLabel);
}

function isLikelyTextOpenAiModel(id: string): boolean {
  const blocked = ['embedding', 'moderation', 'whisper', 'tts', 'dall-e', 'image', 'audio', 'transcribe', 'realtime'];
  if (blocked.some((part) => id.includes(part))) return false;
  return /^(gpt-|o[134]-|chatgpt-)/.test(id);
}

function isRecommendedModel(id: string): boolean {
  return [
    'gpt-4.1-mini',
    'claude-3-5-sonnet-latest',
    'openrouter/auto'
  ].includes(id);
}

function compareRecommendedThenLabel(left: LlmModelOption, right: LlmModelOption): number {
  if (left.recommended !== right.recommended) return left.recommended ? -1 : 1;
  return left.label.localeCompare(right.label, 'ko');
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
  return strings.length ? strings : undefined;
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1].trim()));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function catalogSourceForCredential(source: 'personal' | 'environment' | 'public' | 'none'): LlmModelCatalogSource {
  if (source === 'personal' || source === 'environment' || source === 'public') return source;
  return 'fallback';
}

function buildCacheKey(provider: LlmModelCatalogProvider, source: LlmModelCatalogSource, apiKey: string | undefined): string {
  return [provider, source, apiKey ? createHash('sha256').update(apiKey).digest('hex').slice(0, 16) : 'no-key'].join(':');
}

function validateResponse(response: LlmProviderModelsResponse): LlmProviderModelsResponse {
  return LlmProviderModelsResponseSchema.parse(response);
}
