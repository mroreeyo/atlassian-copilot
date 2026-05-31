import type { LlmRuntimeConfig } from '../settings/llmSettingsStore.js';

type ProviderName = LlmRuntimeConfig['provider'];

const providerLabel: Record<ProviderName, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude',
  openrouter: 'OpenRouter'
};

export function providerStreamFailureMessage(provider: ProviderName): string {
  return `${providerLabel[provider]} 응답 스트림이 실패했습니다. 설정과 사용량 한도를 확인한 뒤 다시 테스트하세요.`;
}

export function providerHttpFailureMessage(provider: ProviderName, status: number, operation = '연결 테스트'): string {
  return `${providerLabel[provider]} ${operation}가 실패했습니다. 상태 ${status}.`;
}

export function providerNetworkFailureMessage(provider: ProviderName, operation = '연결 테스트'): string {
  return `제공자 응답을 받기 전에 ${providerLabel[provider]} ${operation}가 실패했습니다.`;
}

export function genericLlmStreamFailureMessage(): string {
  return 'LLM 요약 생성에 실패했습니다. 설정과 사용량 한도를 확인한 뒤 다시 시도하세요.';
}
