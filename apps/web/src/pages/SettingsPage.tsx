import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AtlassianSettingsRequestSchema,
  LlmSettingsRequestSchema,
  type AtlassianSettingsRequest,
  type LlmConnectionStatus,
  type LlmModelCatalogProvider,
  type LlmModelOption,
  type LlmProvider,
  type LlmProviderModelsResponse,
  type LlmSettingsRequest
} from '@akc/shared';
import { ErrorState, LoadingState } from '../components/ui/StateViews';
import { StatusGrid } from '../features/settings/StatusGrid';
import {
  clearAtlassianSettings,
  clearLlmSettings,
  getLlmProviderModels,
  getSettingsStatus,
  saveAtlassianSettings,
  saveLlmSettings,
  testAtlassianSettings,
  testLlmSettings
} from '../services/copilot/brokerCopilotClient';

interface AtlassianFormState {
  siteUrl: string;
  email: string;
  apiToken: string;
  jiraProjects: string;
  confluenceSpaces: string;
}

interface LlmFormState {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  enabled: boolean;
}

const emptyAtlassianForm: AtlassianFormState = {
  siteUrl: '',
  email: '',
  apiToken: '',
  jiraProjects: 'AKC,NFS',
  confluenceSpaces: 'AKC'
};

const emptyLlmForm: LlmFormState = {
  provider: 'openai',
  apiKey: '',
  model: '',
  enabled: true
};

type Notice = { tone: 'ai' | 'success' | 'danger'; text: string };

export function SettingsPage() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({ queryKey: ['settings-status'], queryFn: getSettingsStatus });
  const status = statusQuery.data;
  const [atlassianForm, setAtlassianForm] = useState<AtlassianFormState>(emptyAtlassianForm);
  const [llmForm, setLlmForm] = useState<LlmFormState>(emptyLlmForm);
  const [atlassianNotice, setAtlassianNotice] = useState<Notice | null>(null);
  const [llmNotice, setLlmNotice] = useState<Notice | null>(null);
  const [manualModelEntry, setManualModelEntry] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const modelCatalogProvider = llmForm.provider === 'mock' ? null : llmForm.provider;
  const modelCatalogQuery = useQuery({
    queryKey: ['llm-provider-models', modelCatalogProvider],
    queryFn: () => getLlmProviderModels(modelCatalogProvider as LlmModelCatalogProvider),
    enabled: Boolean(modelCatalogProvider),
    staleTime: 5 * 60 * 1000,
    retry: 1
  });

  useEffect(() => {
    if (!status) return;
    setAtlassianForm((current) => ({
      ...current,
      siteUrl: status.atlassian.siteUrl ?? '',
      email: status.atlassian.email ?? '',
      jiraProjects: status.atlassian.allowedJiraProjects.join(','),
      confluenceSpaces: status.atlassian.allowedConfluenceSpaces.join(',')
    }));
    setLlmForm((current) => ({
      ...current,
      provider: status.llm.provider === 'mock' && status.llm.source === 'none' ? current.provider : status.llm.provider,
      model: status.llm.model ?? '',
      enabled: status.llm.provider !== 'mock' ? status.llm.enabled : current.enabled
    }));
  }, [status]);

  const saveAtlassianMutation = useMutation({
    mutationFn: saveAtlassianSettings,
    onSuccess: (response) => {
      queryClient.setQueryData(['settings-status'], response.status);
      setAtlassianForm((current) => ({ ...current, apiToken: '' }));
      setAtlassianNotice({ tone: 'success', text: response.message });
    },
    onError: (error) => {
      setAtlassianNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'Atlassian 설정 저장에 실패했습니다.' });
    }
  });

  const clearAtlassianMutation = useMutation({
    mutationFn: clearAtlassianSettings,
    onSuccess: (response) => {
      queryClient.setQueryData(['settings-status'], response.status);
      setAtlassianForm(emptyAtlassianForm);
      setAtlassianNotice({ tone: 'success', text: response.message });
    },
    onError: (error) => {
      setAtlassianNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'Atlassian 설정 삭제에 실패했습니다.' });
    }
  });

  const testAtlassianMutation = useMutation({
    mutationFn: testAtlassianSettings,
    onSuccess: (response) => {
      queryClient.setQueryData(['settings-status'], response.status);
      setAtlassianNotice({ tone: response.ok ? 'success' : 'danger', text: response.message });
    },
    onError: (error) => {
      setAtlassianNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'Atlassian 연결 테스트에 실패했습니다.' });
    }
  });

  const saveLlmMutation = useMutation({
    mutationFn: saveLlmSettings,
    onSuccess: (response) => {
      queryClient.setQueryData(['settings-status'], response.status);
      void queryClient.invalidateQueries({ queryKey: ['llm-provider-models'] });
      setLlmForm((current) => ({ ...current, apiKey: '' }));
      setLlmNotice({ tone: 'success', text: response.message });
    },
    onError: (error) => {
      setLlmNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'LLM 설정 저장에 실패했습니다.' });
    }
  });

  const clearLlmMutation = useMutation({
    mutationFn: clearLlmSettings,
    onSuccess: (response) => {
      queryClient.setQueryData(['settings-status'], response.status);
      void queryClient.invalidateQueries({ queryKey: ['llm-provider-models'] });
      setLlmForm(emptyLlmForm);
      setManualModelEntry(false);
      setModelSearch('');
      setLlmNotice({ tone: 'success', text: response.message });
    },
    onError: (error) => {
      setLlmNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'LLM 설정 삭제에 실패했습니다.' });
    }
  });

  const testLlmMutation = useMutation({
    mutationFn: testLlmSettings,
    onSuccess: (response) => {
      queryClient.setQueryData(['settings-status'], response.status);
      setLlmNotice({ tone: response.ok ? 'success' : 'danger', text: response.message });
    },
    onError: (error) => {
      setLlmNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'LLM 설정 테스트에 실패했습니다.' });
    }
  });

  return (
    <div className="page">
      <section className="support-panel">
        <h1>설정</h1>
        <p className="muted">개인 연결 설정입니다. 비밀 값은 안전하게 서버로만 전달되며 이 기기에는 저장하지 않습니다.</p>
        {statusQuery.isLoading ? <LoadingState /> : null}
        {statusQuery.error ? <ErrorState message={statusQuery.error.message} /> : null}
        {status ? (
          <>
            <StatusGrid status={status} />
            <div className="settings-stack">
              <form
                className="settings-form"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  const parsed = buildAtlassianSettingsPayload(atlassianForm, status.atlassian.tokenConfigured);
                  if (!parsed.ok) {
                    setAtlassianNotice({ tone: 'danger', text: parsed.message });
                    return;
                  }
                  setAtlassianNotice({ tone: 'ai', text: 'Atlassian 연결을 저장하는 중…' });
                  saveAtlassianMutation.mutate(parsed.payload);
                }}
              >
                <div className="message-header">
                  <h2>개인 Atlassian 연결</h2>
                  <span className={`badge ${status.atlassian.configured ? 'warning' : 'ai'}`}>
                    {status.atlassian.configured ? '저장됨' : '미설정'}
                  </span>
                </div>
                <div className="form-grid">
                  <label>
                    <span>사이트 URL</span>
                    <input
                      value={atlassianForm.siteUrl}
                      onChange={(event) => updateForm(setAtlassianForm, setAtlassianNotice, { siteUrl: event.target.value })}
                      placeholder="https://your-site.atlassian.net"
                      autoComplete="url"
                    />
                  </label>
                  <label>
                    <span>이메일</span>
                    <input
                      value={atlassianForm.email}
                      onChange={(event) => updateForm(setAtlassianForm, setAtlassianNotice, { email: event.target.value })}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </label>
                  <label>
                    <span>API 토큰</span>
                    <input
                      value={atlassianForm.apiToken}
                      onChange={(event) => updateForm(setAtlassianForm, setAtlassianNotice, { apiToken: event.target.value })}
                      placeholder={status.atlassian.tokenConfigured ? '저장됨 — 교체하려면 새 토큰을 붙여넣으세요' : 'API 토큰 붙여넣기'}
                      type="password"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    <span>Jira 프로젝트 허용 목록</span>
                    <input
                      value={atlassianForm.jiraProjects}
                      onChange={(event) => updateForm(setAtlassianForm, setAtlassianNotice, { jiraProjects: event.target.value })}
                      placeholder="AKC,NFS"
                    />
                  </label>
                  <label>
                    <span>Confluence 스페이스 허용 목록</span>
                    <input
                      value={atlassianForm.confluenceSpaces}
                      onChange={(event) => updateForm(setAtlassianForm, setAtlassianNotice, { confluenceSpaces: event.target.value })}
                      placeholder="AKC"
                    />
                  </label>
                </div>
                <p className="muted">저장 후 연결 테스트로 계정 접근을 확인하세요. 질문과 변경 요청은 저장된 연결 정보로 처리되며, 댓글이나 변경은 확인 단계 이후에만 진행됩니다.</p>
                <p className="muted">{status.atlassian.statusMessage}</p>
                <SettingsNotice notice={atlassianNotice} />
                <div className="actions">
                  <button className="btn primary" type="submit" disabled={saveAtlassianMutation.isPending}>
                    {saveAtlassianMutation.isPending ? '저장 중…' : 'Atlassian 연결 저장'}
                  </button>
                  <button
                    className="btn subtle"
                    type="button"
                    onClick={() => {
                      setAtlassianNotice({ tone: 'ai', text: '저장된 Atlassian 연결을 테스트하는 중…' });
                      testAtlassianMutation.mutate();
                    }}
                    disabled={testAtlassianMutation.isPending || !status.atlassian.configured}
                  >
                    {testAtlassianMutation.isPending ? '테스트 중…' : 'Atlassian 연결 테스트'}
                  </button>
                  <button
                    className="btn subtle"
                    type="button"
                    onClick={() => {
                      setAtlassianNotice({ tone: 'ai', text: '개인 Atlassian 연결을 지우는 중…' });
                      clearAtlassianMutation.mutate();
                    }}
                    disabled={clearAtlassianMutation.isPending || !status.atlassian.configured}
                  >
                    {clearAtlassianMutation.isPending ? '지우는 중…' : '개인 설정 지우기'}
                  </button>
                </div>
              </form>

              <form
                className="settings-form"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  const parsed = buildLlmSettingsPayload(llmForm, status.llm);
                  if (!parsed.ok) {
                    setLlmNotice({ tone: 'danger', text: parsed.message });
                    return;
                  }
                  setLlmNotice({ tone: 'ai', text: 'LLM 설정을 저장하는 중…' });
                  saveLlmMutation.mutate(parsed.payload);
                }}
              >
                <div className="message-header">
                  <h2>개인 LLM 제공자</h2>
                  <span className={`badge ${status.llm.connected ? 'success' : status.llm.configured ? 'warning' : 'ai'}`}>
                    {status.llm.connected ? '검증됨' : status.llm.configured ? '저장됨' : '미설정'}
                  </span>
                </div>
                <div className="form-grid">
                  <label>
                    <span>LLM 제공자</span>
                    <select
                      value={llmForm.provider}
                      onChange={(event) => {
                        setManualModelEntry(false);
                        setModelSearch('');
                        updateForm(setLlmForm, setLlmNotice, { provider: event.target.value as LlmProvider, model: '' });
                      }}
                    >
                      <option value="mock">LLM 미사용</option>
                      <option value="openai">OpenAI / GPT</option>
                      <option value="anthropic">Claude / Anthropic</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </label>
                  <label>
                    <span>LLM API 키</span>
                    <input
                      value={llmForm.apiKey}
                      onChange={(event) => updateForm(setLlmForm, setLlmNotice, { apiKey: event.target.value })}
                      placeholder={llmSavedForProvider(status.llm, llmForm.provider) ? '저장됨 — 교체하려면 새 키를 붙여넣으세요' : '제공자 API 키 붙여넣기'}
                      type="password"
                      autoComplete="off"
                      disabled={llmForm.provider === 'mock'}
                    />
                  </label>
                  <ModelCatalogField
                    provider={llmForm.provider}
                    model={llmForm.model}
                    catalog={modelCatalogQuery.data}
                    isLoading={modelCatalogQuery.isLoading}
                    isError={modelCatalogQuery.isError}
                    manualEntry={manualModelEntry}
                    search={modelSearch}
                    onManualEntryChange={setManualModelEntry}
                    onSearchChange={setModelSearch}
                    onRefresh={() => void modelCatalogQuery.refetch()}
                    onModelChange={(model) => updateForm(setLlmForm, setLlmNotice, { model })}
                  />
                  <label>
                    <span>Atlassian 코파일럿 요약에 사용</span>
                    <select
                      value={llmForm.enabled ? 'enabled' : 'disabled'}
                      onChange={(event) => updateForm(setLlmForm, setLlmNotice, { enabled: event.target.value === 'enabled' })}
                      disabled={llmForm.provider === 'mock'}
                    >
                      <option value="enabled">활성</option>
                      <option value="disabled">저장만 하고 비활성</option>
                    </select>
                  </label>
                </div>
                <p className="muted">OpenAI는 ChatGPT Plus 구독이 아니라 OpenAI 플랫폼 API 키가 필요합니다. Claude는 Claude Pro/Max 로그인이 아니라 Anthropic Console API 키가 필요합니다. OpenRouter는 OpenRouter 대시보드에서 발급한 API 키가 필요합니다. 저장만으로는 크레딧을 사용하지 않으며, 연결 테스트만 실제 검증을 수행합니다.</p>
                <p className="muted">{status.llm.statusMessage}</p>
                <SettingsNotice notice={llmNotice} />
                <div className="actions">
                  <button className="btn primary" type="submit" disabled={saveLlmMutation.isPending}>
                    {saveLlmMutation.isPending ? '저장 중…' : 'LLM 설정 저장'}
                  </button>
                  <button
                    className="btn subtle"
                    type="button"
                    onClick={() => {
                      setLlmNotice({ tone: 'ai', text: '저장된 LLM 설정을 테스트하는 중…' });
                      testLlmMutation.mutate();
                    }}
                    disabled={testLlmMutation.isPending || !status.llm.configured || !status.llm.enabled || status.llm.provider === 'mock'}
                  >
                    {testLlmMutation.isPending ? '테스트 중…' : 'LLM 연결 테스트'}
                  </button>
                  <button
                    className="btn subtle"
                    type="button"
                    onClick={() => {
                      setLlmNotice({ tone: 'ai', text: '개인 LLM 설정을 지우는 중…' });
                      clearLlmMutation.mutate();
                    }}
                    disabled={clearLlmMutation.isPending || status.llm.source !== 'personal'}
                  >
                    {clearLlmMutation.isPending ? '지우는 중…' : 'LLM 설정 지우기'}
                  </button>
                </div>
              </form>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function SettingsNotice({ notice }: { notice: Notice | null }) {
  return notice ? (
    <p className={`settings-notice ${notice.tone}`} role={notice.tone === 'danger' ? 'alert' : 'status'} aria-live="polite">
      {notice.text}
    </p>
  ) : null;
}

function ModelCatalogField({
  provider,
  model,
  catalog,
  isLoading,
  isError,
  manualEntry,
  search,
  onManualEntryChange,
  onSearchChange,
  onRefresh,
  onModelChange
}: {
  provider: LlmProvider;
  model: string;
  catalog?: LlmProviderModelsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  manualEntry: boolean;
  search: string;
  onManualEntryChange: (enabled: boolean) => void;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onModelChange: (model: string) => void;
}) {
  if (provider === 'mock') {
    return (
      <label>
        <span>모델</span>
        <input value="" placeholder="LLM 미사용은 모델 선택이 필요 없습니다." disabled readOnly />
      </label>
    );
  }

  const selectedModel = model || catalog?.selectedModel || catalog?.defaultModel || llmModelPlaceholder(provider);
  const allOptions = ensureVisibleModelOptions(provider, catalog?.models ?? [], selectedModel);
  const filteredOptions = filterModelOptions(allOptions, search);
  const useManualInput = manualEntry || isError || (!isLoading && allOptions.length === 0);
  const sourceLabel = catalog ? modelCatalogSourceLabel(catalog) : '서버에서 모델 목록을 준비 중입니다.';

  return (
    <div className="model-field">
      <label>
        <span>모델</span>
        {useManualInput ? (
          <input
            value={model}
            onChange={(event) => onModelChange(event.target.value)}
            placeholder={llmModelPlaceholder(provider)}
          />
        ) : (
          <select value={selectedModel} onChange={(event) => onModelChange(event.target.value)} disabled={isLoading && !catalog}>
            {filteredOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.recommended ? '추천 · ' : ''}{option.label}
              </option>
            ))}
          </select>
        )}
      </label>
      {!useManualInput ? (
        <label>
          <span>모델 검색</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="모델 이름 검색"
            disabled={isLoading && !catalog}
          />
        </label>
      ) : null}
      <div className="model-field-actions">
        <button className="btn subtle" type="button" onClick={() => onManualEntryChange(!useManualInput)}>
          {useManualInput ? '목록에서 선택' : '직접 입력'}
        </button>
        <button className="btn subtle" type="button" onClick={onRefresh} disabled={isLoading}>
          {isLoading ? '불러오는 중…' : '목록 새로고침'}
        </button>
      </div>
      <p className="muted">
        {isError ? '모델 목록을 불러오지 못했습니다. 직접 입력할 수 있습니다.' : sourceLabel}
      </p>
      {catalog?.warning ? <p className="muted">{catalog.warning}</p> : null}
    </div>
  );
}

function parseCsvAllowlist(value: string): string[] {
  return value.split(/[,\s]+/).map((item) => item.trim().toUpperCase()).filter(Boolean);
}

function updateForm<T extends object>(
  setForm: Dispatch<SetStateAction<T>>,
  setNotice: Dispatch<SetStateAction<Notice | null>>,
  patch: Partial<T>
) {
  setNotice(null);
  setForm((current) => ({ ...current, ...patch }));
}

function buildAtlassianSettingsPayload(form: AtlassianFormState, tokenAlreadyConfigured: boolean): { ok: true; payload: AtlassianSettingsRequest } | { ok: false; message: string } {
  const siteUrl = normalizeSiteUrl(form.siteUrl);
  const apiToken = form.apiToken.trim();
  if (!apiToken && !tokenAlreadyConfigured) {
    return { ok: false, message: '개인 Atlassian 설정을 저장하려면 API 토큰이 필요합니다.' };
  }

  const parsed = AtlassianSettingsRequestSchema.safeParse({
    siteUrl,
    email: form.email.trim(),
    apiToken: apiToken || undefined,
    jiraProjectAllowlist: parseCsvAllowlist(form.jiraProjects),
    confluenceSpaceAllowlist: parseCsvAllowlist(form.confluenceSpaces)
  });

  if (!parsed.success) {
    return { ok: false, message: readableAtlassianSettingsError(parsed.error.issues.map((issue) => issue.path.join('.') || 'settings')) };
  }
  return { ok: true, payload: parsed.data };
}

function buildLlmSettingsPayload(form: LlmFormState, status: LlmConnectionStatus): { ok: true; payload: LlmSettingsRequest } | { ok: false; message: string } {
  const apiKey = form.apiKey.trim();
  const hasSavedKeyForProvider = llmSavedForProvider(status, form.provider);
  if (form.provider !== 'mock' && !apiKey && !hasSavedKeyForProvider) {
    return { ok: false, message: '개인 OpenAI, Claude 또는 OpenRouter 제공자를 저장하려면 API 키가 필요합니다.' };
  }
  if (form.provider !== 'mock' && apiKey && apiKey.length < 8) {
    return { ok: false, message: 'LLM API 키가 너무 짧아 보입니다. 제공자 콘솔에서 발급한 API 키를 붙여넣으세요.' };
  }

  const payload: LlmSettingsRequest = {
    provider: form.provider,
    enabled: form.provider !== 'mock' && form.enabled
  };
  if (apiKey) payload.apiKey = apiKey;
  if (form.provider !== 'mock' && form.model.trim()) payload.model = form.model.trim();

  const parsed = LlmSettingsRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: 'LLM 제공자, API 키, 모델 설정을 확인해 주세요.' };
  }
  return { ok: true, payload: parsed.data };
}

function normalizeSiteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function readableAtlassianSettingsError(paths: string[]): string {
  const fields = new Set(paths);
  if (fields.has('siteUrl')) return '사이트 URL은 https://your-site.atlassian.net 같은 유효한 https Atlassian URL이어야 합니다.';
  if (fields.has('email')) return '이메일은 유효한 Atlassian 계정 이메일이어야 합니다.';
  if (fields.has('apiToken')) return 'API 토큰이 너무 짧아 보입니다. Atlassian 계정 보안 페이지에서 발급한 API 토큰을 붙여넣으세요.';
  if ([...fields].some((field) => field.startsWith('jiraProjectAllowlist'))) return 'Jira 프로젝트 허용 목록에는 AKC,NFS 같은 프로젝트 키를 입력해야 합니다.';
  if ([...fields].some((field) => field.startsWith('confluenceSpaceAllowlist'))) return 'Confluence 스페이스 허용 목록에는 AKC 같은 스페이스 키를 입력해야 합니다.';
  return 'Atlassian 설정을 확인한 뒤 다시 시도해 주세요.';
}

function llmSavedForProvider(status: LlmConnectionStatus, provider: LlmProvider): boolean {
  return status.provider === provider && status.keyConfigured && provider !== 'mock';
}

function llmModelPlaceholder(provider: LlmProvider): string {
  if (provider === 'anthropic') return 'claude-3-5-sonnet-latest';
  if (provider === 'openrouter') return 'openrouter/auto';
  return 'gpt-4.1-mini';
}

function ensureVisibleModelOptions(provider: Exclude<LlmProvider, 'mock'>, models: LlmModelOption[], selectedModel: string): LlmModelOption[] {
  const byId = new Map(models.map((option) => [option.id, option]));
  if (selectedModel && !byId.has(selectedModel)) byId.set(selectedModel, { id: selectedModel, label: selectedModel, provider, recommended: true });
  return Array.from(byId.values());
}

function filterModelOptions(models: LlmModelOption[], search: string): LlmModelOption[] {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return models;
  const filtered = models.filter((option) => `${option.label} ${option.id} ${option.description ?? ''}`.toLowerCase().includes(normalizedSearch));
  return filtered.length > 0 ? filtered : models;
}

function modelCatalogSourceLabel(catalog: LlmProviderModelsResponse): string {
  const count = catalog.models.length.toLocaleString('ko-KR');
  if (catalog.source === 'personal') return `저장된 개인 키로 ${count}개 모델을 불러왔습니다.`;
  if (catalog.source === 'environment') return `관리자가 설정한 연결로 ${count}개 모델을 불러왔습니다.`;
  if (catalog.source === 'public') return `OpenRouter 공개 목록에서 ${count}개 모델을 불러왔습니다.`;
  return `기본 추천 모델 ${count}개를 표시합니다.`;
}
