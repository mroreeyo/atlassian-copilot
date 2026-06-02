export const readOnlyTools = ['jira_search', 'jira_get_issue', 'confluence_search', 'confluence_get_page'] as const;
export const writeTools = [
  'jira_create_issue',
  'jira_update_issue',
  'jira_add_comment',
  'jira_transition_issue',
  'confluence_create_page',
  'confluence_update_page',
  'confluence_add_comment'
] as const;
export const destructiveTools = ['jira_delete_issue', 'confluence_delete_page', 'archive_resource', 'remove_resource'] as const;

export type ReadOnlyTool = (typeof readOnlyTools)[number];
export type WriteTool = (typeof writeTools)[number];
export type DestructiveTool = (typeof destructiveTools)[number];
export type ToolName = ReadOnlyTool | WriteTool | DestructiveTool;
export type ToolRisk = 'read' | 'write' | 'destructive';
export type RunMode = 'readonly' | 'mock' | 'sandbox-write';
export type RunStatus = 'idle' | 'running' | 'completed' | 'failed';
export type ToolStatus = 'planned' | 'running' | 'completed' | 'failed';
export type SourceType = 'jira' | 'confluence';
export type SourceOrigin = 'real' | 'demo';
export type Confidence = 'low' | 'medium' | 'high';
export type ActionReviewStatus = 'none' | 'pending' | 'mock_recorded' | 'executed' | 'blocked' | 'cancelled';
export type AtlassianConnectionSource = 'none' | 'environment' | 'personal';
export type AtlassianConnectionState = 'not_configured' | 'configured' | 'connected' | 'failed';
export type LlmProvider = 'mock' | 'openai' | 'anthropic' | 'openrouter';
export type LlmConnectionSource = 'none' | 'environment' | 'personal';
export type LlmConnectionState = 'not_configured' | 'configured' | 'connected' | 'failed';
export type LlmModelCatalogProvider = Exclude<LlmProvider, 'mock'>;
export type LlmModelCatalogSource = 'personal' | 'environment' | 'public' | 'fallback' | 'none';
export type LlmModelCacheStatus = 'hit' | 'miss' | 'stale' | 'disabled';
export type McpConnectionState = 'not_configured' | 'configured' | 'transport_pending' | 'connected' | 'failed';

export interface CopilotRun {
  runId: string;
  title: string;
  status: RunStatus;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ToolActionPlan {
  id: string;
  tool: ToolName;
  risk: ToolRisk;
  description: string;
  requiresApproval: boolean;
  inputPreview?: Record<string, string> | undefined;
  scope?: ToolActionScope | undefined;
}

export interface ToolActionScope {
  label: string;
  query?: string | undefined;
  jiraProjects?: string[] | undefined;
  confluenceSpaces?: string[] | undefined;
}

export interface ToolExecutionEvent {
  actionId: string;
  tool: ToolName;
  status: ToolStatus;
  resultSummary?: string;
  error?: string;
}

export interface AtlassianSource {
  id: string;
  sourceType: SourceType;
  origin: SourceOrigin;
  title: string;
  summary: string;
  relevanceScore: number;
  url: string;
  actionId: string;
  retrievedAt: string;
  metadata: AtlassianSourceMetadata;
}

export interface AtlassianSourceMetadata {
  jira?: {
    key: string;
    status?: string | undefined;
    assignee?: string | undefined;
    priority?: string | undefined;
    issueType?: string | undefined;
    projectKey?: string | undefined;
    updated?: string | undefined;
  } | undefined;
  confluence?: {
    pageId: string;
    spaceKey?: string | undefined;
    spaceName?: string | undefined;
    contentType?: string | undefined;
    updated?: string | undefined;
  } | undefined;
}

export interface ActionReviewRequest {
  id: string;
  tool: ToolName;
  risk: ToolRisk;
  target: string;
  inputPreview: Record<string, string>;
  requiresApproval: boolean;
}

export interface ReportDraft {
  draftId: string;
  title: string;
  content: string;
  status: 'idle' | 'streaming' | 'completed';
}

export interface AuditLogEntry {
  id: string;
  runId: string;
  actionId: string;
  risk: ToolRisk;
  approvalStatus: 'not_required' | 'pending' | 'approved' | 'cancelled' | 'blocked';
  executionResult: 'not_executed' | 'mock_recorded' | 'executed' | 'failed' | 'blocked';
  targetResourceId: string;
  inputPreview?: Record<string, string> | undefined;
  timestamp: string;
}

export interface RunCreateRequest {
  message: string;
  mode: RunMode;
}

export interface RunCreateResponse {
  runId: string;
  streamUrl: string;
}

export interface ActionApprovalRequest {
  approved: boolean;
  inputPreview?: Record<string, string> | undefined;
}

export interface ActionApprovalResponse {
  actionId: string;
  status: 'mock_recorded' | 'executed' | 'blocked';
  executed: boolean;
  message: string;
}

export interface ActionCancelResponse {
  actionId: string;
  status: 'cancelled';
  reason: string;
  executed: false;
}

export interface ActionCancelRequest {
  reason: string;
}

export interface AtlassianConnectionStatus {
  source: AtlassianConnectionSource;
  connectionState: AtlassianConnectionState;
  configured: boolean;
  connected: boolean;
  siteUrl?: string | undefined;
  email?: string | undefined;
  tokenConfigured: boolean;
  allowedJiraProjects: string[];
  allowedConfluenceSpaces: string[];
  statusMessage: string;
  lastValidatedAt?: string | undefined;
  lastError?: string | undefined;
}

export interface LlmConnectionStatus {
  provider: LlmProvider;
  source: LlmConnectionSource;
  connectionState: LlmConnectionState;
  configured: boolean;
  connected: boolean;
  enabled: boolean;
  keyConfigured: boolean;
  model?: string | undefined;
  statusMessage: string;
  lastValidatedAt?: string | undefined;
  lastError?: string | undefined;
}

export interface SettingsStatus {
  mcpConnected: boolean;
  mcpConnectionState: McpConnectionState;
  mcpStatusMessage: string;
  openaiConnected: boolean;
  mode: RunMode;
  sandboxWriteEnabled: boolean;
  allowedJiraProjects: string[];
  allowedConfluenceSpaces: string[];
  atlassian: AtlassianConnectionStatus;
  llm: LlmConnectionStatus;
}

export interface AtlassianSettingsRequest {
  siteUrl: string;
  email: string;
  apiToken?: string | undefined;
  jiraProjectAllowlist: string[];
  confluenceSpaceAllowlist: string[];
}

export interface AtlassianSettingsResponse {
  status: SettingsStatus;
  message: string;
}

export interface AtlassianSettingsClearResponse {
  status: SettingsStatus;
  message: string;
}

export interface AtlassianSettingsTestResponse {
  status: SettingsStatus;
  ok: boolean;
  message: string;
}

export interface LlmSettingsRequest {
  provider: LlmProvider;
  apiKey?: string | undefined;
  model?: string | undefined;
  enabled: boolean;
}

export interface LlmSettingsResponse {
  status: SettingsStatus;
  message: string;
}

export interface LlmSettingsClearResponse {
  status: SettingsStatus;
  message: string;
}

export interface LlmSettingsTestResponse {
  status: SettingsStatus;
  provider: LlmProvider;
  ok: boolean;
  message: string;
}

export interface LlmModelOption {
  id: string;
  label: string;
  provider: LlmModelCatalogProvider;
  description?: string | undefined;
  owner?: string | undefined;
  createdAt?: string | undefined;
  contextWindow?: number | undefined;
  maxOutputTokens?: number | undefined;
  inputModalities?: string[] | undefined;
  outputModalities?: string[] | undefined;
  supportedParameters?: string[] | undefined;
  pricing?: Record<string, string> | undefined;
  recommended?: boolean | undefined;
}

export interface LlmModelCacheMetadata {
  status: LlmModelCacheStatus;
  ttlSeconds: number;
  fetchedAt?: string | undefined;
}

export interface LlmModelPageMetadata {
  hasMore: boolean;
  firstId?: string | undefined;
  lastId?: string | undefined;
}

export interface LlmProviderModelsResponse {
  provider: LlmProvider;
  source: LlmModelCatalogSource;
  defaultModel: string;
  selectedModel?: string | undefined;
  models: LlmModelOption[];
  manualEntryAllowed: true;
  cache: LlmModelCacheMetadata;
  page?: LlmModelPageMetadata | undefined;
  message?: string | undefined;
  warning?: string | undefined;
}

export type CopilotSuggestionCategory = 'jira' | 'confluence' | 'write' | 'general';

export interface CopilotSuggestion {
  id: string;
  label: string;
  prompt: string;
  category: CopilotSuggestionCategory;
  requiresConnection: boolean;
  requiresWrite: boolean;
}

export interface CopilotSuggestionsResponse {
  source: 'fallback' | 'llm';
  suggestions: CopilotSuggestion[];
  message?: string | undefined;
}

export interface HistoryResponse {
  runs: Array<{
    runId: string;
    title: string;
    createdAt: string;
    toolCount: number;
    pendingApprovalCount: number;
    status: 'completed' | 'failed' | 'running';
  }>;
}

export interface AuthUser {
  email: string;
  createdAt: string;
}

export interface AuthSignupRequest {
  email: string;
  password: string;
}

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface AuthSessionResponse {
  user: AuthUser;
}

export interface AuthLogoutResponse {
  ok: true;
}
