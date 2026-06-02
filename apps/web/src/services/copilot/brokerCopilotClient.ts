import {
  ActionApprovalResponseSchema,
  ActionCancelResponseSchema,
  AtlassianSettingsClearResponseSchema,
  AtlassianSettingsRequestSchema,
  AtlassianSettingsResponseSchema,
  AtlassianSettingsTestResponseSchema,
  AuthLoginRequestSchema,
  AuthLogoutResponseSchema,
  AuthSessionResponseSchema,
  AuthSignupRequestSchema,
  CopilotSuggestionsResponseSchema,
  CopilotSseEventSchema,
  LlmSettingsClearResponseSchema,
  LlmProviderModelsResponseSchema,
  LlmSettingsRequestSchema,
  LlmSettingsResponseSchema,
  LlmSettingsTestResponseSchema,
  HistoryResponseSchema,
  RunCreateResponseSchema,
  SettingsStatusSchema,
  type ActionApprovalResponse,
  type ActionCancelResponse,
  type ActionApprovalRequest,
  type AtlassianSettingsClearResponse,
  type AtlassianSettingsRequest,
  type AtlassianSettingsResponse,
  type AtlassianSettingsTestResponse,
  type AuthLoginRequest,
  type AuthLogoutResponse,
  type AuthSessionResponse,
  type AuthSignupRequest,
  type CopilotSseEvent,
  type CopilotSuggestionsResponse,
  type HistoryResponse,
  type LlmModelCatalogProvider,
  type LlmProviderModelsResponse,
  type LlmSettingsClearResponse,
  type LlmSettingsRequest,
  type LlmSettingsResponse,
  type LlmSettingsTestResponse,
  type RunCreateRequest,
  type RunCreateResponse,
  type SettingsStatus
} from '@akc/shared';
import { brokerUrl } from './brokerUrl';

function streamBrokerUrl(path: string): string {
  if (!/^\/api\/copilot\/runs\/[^/?#/]+\/stream$/.test(path)) {
    throw new Error(`잘못된 응답 스트림 경로: ${path}`);
  }
  return brokerUrl(path);
}

export async function createCopilotRun(request: RunCreateRequest): Promise<RunCreateResponse> {
  const response = await fetch(brokerUrl('/api/copilot/runs'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(request)
  });
  if (!response.ok) throw new Error(`서버 실행 생성이 실패했습니다. 상태 ${response.status}`);
  return RunCreateResponseSchema.parse(await response.json());
}

export async function approveAction(actionId: string, inputPreview?: ActionApprovalRequest['inputPreview']): Promise<ActionApprovalResponse> {
  const response = await fetch(brokerUrl(`/api/copilot/actions/${encodeURIComponent(actionId)}/approve`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ approved: true, ...(inputPreview ? { inputPreview } : {}) })
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '서버 승인 요청 실패'));
  return ActionApprovalResponseSchema.parse(await response.json());
}

export async function cancelAction(actionId: string, reason = '사용자가 작업 검토에서 취소했습니다.'): Promise<ActionCancelResponse> {
  const response = await fetch(brokerUrl(`/api/copilot/actions/${encodeURIComponent(actionId)}/cancel`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ reason })
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '서버 취소 요청 실패'));
  return ActionCancelResponseSchema.parse(await response.json());
}

export async function getHistory(): Promise<HistoryResponse> {
  const response = await fetch(brokerUrl('/api/history'), { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`서버 기록 조회가 실패했습니다. 상태 ${response.status}`);
  return HistoryResponseSchema.parse(await response.json());
}

export async function getCopilotSuggestions(): Promise<CopilotSuggestionsResponse> {
  const response = await fetch(brokerUrl('/api/copilot/suggestions'), { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`서버 추천 질문 조회가 실패했습니다. 상태 ${response.status}`);
  return CopilotSuggestionsResponseSchema.parse(await response.json());
}

export async function getSettingsStatus(): Promise<SettingsStatus> {
  const response = await fetch(brokerUrl('/api/settings/status'), { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`서버 설정 조회가 실패했습니다. 상태 ${response.status}`);
  return SettingsStatusSchema.parse(await response.json());
}

export async function saveAtlassianSettings(request: AtlassianSettingsRequest): Promise<AtlassianSettingsResponse> {
  const payload = AtlassianSettingsRequestSchema.parse(request);
  const response = await fetch(brokerUrl('/api/settings/atlassian'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '서버 설정 저장 실패'));
  return AtlassianSettingsResponseSchema.parse(await response.json());
}

export async function clearAtlassianSettings(): Promise<AtlassianSettingsClearResponse> {
  const response = await fetch(brokerUrl('/api/settings/atlassian'), {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '서버 설정 삭제 실패'));
  return AtlassianSettingsClearResponseSchema.parse(await response.json());
}

export async function testAtlassianSettings(): Promise<AtlassianSettingsTestResponse> {
  const response = await fetch(brokerUrl('/api/settings/atlassian/test'), {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '서버 Atlassian 테스트 실패'));
  return AtlassianSettingsTestResponseSchema.parse(await response.json());
}

export async function saveLlmSettings(request: LlmSettingsRequest): Promise<LlmSettingsResponse> {
  const payload = LlmSettingsRequestSchema.parse(request);
  const response = await fetch(brokerUrl('/api/settings/llm'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '서버 LLM 설정 저장 실패'));
  return LlmSettingsResponseSchema.parse(await response.json());
}

export async function clearLlmSettings(): Promise<LlmSettingsClearResponse> {
  const response = await fetch(brokerUrl('/api/settings/llm'), {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '서버 LLM 설정 삭제 실패'));
  return LlmSettingsClearResponseSchema.parse(await response.json());
}

export async function getLlmProviderModels(provider: LlmModelCatalogProvider, refresh = false): Promise<LlmProviderModelsResponse> {
  const suffix = refresh ? '?refresh=true' : '';
  const response = await fetch(brokerUrl(`/api/settings/llm/providers/${encodeURIComponent(provider)}/models${suffix}`), {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '서버 LLM 모델 목록 조회 실패'));
  return LlmProviderModelsResponseSchema.parse(await response.json());
}

export async function testLlmSettings(): Promise<LlmSettingsTestResponse> {
  const response = await fetch(brokerUrl('/api/settings/llm/test'), {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '서버 LLM 테스트 실패'));
  return LlmSettingsTestResponseSchema.parse(await response.json());
}

export async function* streamCopilotEvents(streamUrl: string): AsyncGenerator<CopilotSseEvent> {
  const response = await fetch(streamBrokerUrl(streamUrl), { credentials: 'include', headers: { Accept: 'text/event-stream' } });
  if (!response.ok || !response.body) throw new Error(`서버 응답 스트림이 실패했습니다. 상태 ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = drainSseBuffer(buffer);
    buffer = parsed.remainder;
    for (const event of parsed.events) yield event;
  }

  buffer += decoder.decode();
  for (const event of decodeSseFrames(buffer)) yield event;
}

export async function signup(request: AuthSignupRequest): Promise<AuthSessionResponse> {
  const payload = AuthSignupRequestSchema.parse(request);
  const response = await fetch(brokerUrl('/api/auth/signup'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '가입 실패'));
  return AuthSessionResponseSchema.parse(await response.json());
}

export async function login(request: AuthLoginRequest): Promise<AuthSessionResponse> {
  const payload = AuthLoginRequestSchema.parse(request);
  const response = await fetch(brokerUrl('/api/auth/login'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '로그인 실패'));
  return AuthSessionResponseSchema.parse(await response.json());
}

export async function getAuthSession(): Promise<AuthSessionResponse | null> {
  const response = await fetch(brokerUrl('/api/auth/session'), {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '세션 조회 실패'));
  return AuthSessionResponseSchema.parse(await response.json());
}

export async function logout(): Promise<AuthLogoutResponse> {
  const response = await fetch(brokerUrl('/api/auth/logout'), {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(await brokerErrorMessage(response, '로그아웃 실패'));
  return AuthLogoutResponseSchema.parse(await response.json());
}

export function decodeSseFrames(text: string): CopilotSseEvent[] {
  return text
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter(Boolean)
    .map((frame) => {
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) throw new Error(`SSE frame missing data: ${frame}`);
      return CopilotSseEventSchema.parse(JSON.parse(data));
    });
}

function drainSseBuffer(buffer: string): { events: CopilotSseEvent[]; remainder: string } {
  const frames = buffer.split('\n\n');
  const remainder = frames.pop() ?? '';
  return { events: decodeSseFrames(frames.join('\n\n')), remainder };
}

async function brokerErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.clone().json() as { error?: unknown; message?: unknown };
    if (typeof payload.error === 'string' && payload.error) return payload.error;
    if (typeof payload.message === 'string' && payload.message) return payload.message;
  } catch {
    // Non-JSON error body; use the status-bearing fallback.
  }
  return `${fallback} with status ${response.status}`;
}
