import { z } from 'zod';
import { destructiveTools, readOnlyTools, writeTools } from '../contracts/domain.js';

export const ToolNameSchema = z.enum([...readOnlyTools, ...writeTools, ...destructiveTools]);
export const ToolRiskSchema = z.enum(['read', 'write', 'destructive']);
export const RunModeSchema = z.enum(['readonly', 'mock', 'sandbox-write']);
export const ConfidenceSchema = z.enum(['low', 'medium', 'high']);
export const SourceOriginSchema = z.enum(['real', 'demo']);
export const AtlassianConnectionSourceSchema = z.enum(['none', 'environment', 'personal']);
export const AtlassianConnectionStateSchema = z.enum(['not_configured', 'configured', 'connected', 'failed']);
export const LlmProviderSchema = z.enum(['mock', 'openai', 'anthropic', 'openrouter']);
export const LlmModelCatalogProviderSchema = z.enum(['openai', 'anthropic', 'openrouter']);
export const LlmModelCatalogSourceSchema = z.enum(['personal', 'environment', 'public', 'fallback', 'none']);
export const LlmModelCacheStatusSchema = z.enum(['hit', 'miss', 'stale', 'disabled']);
export const LlmConnectionSourceSchema = z.enum(['none', 'environment', 'personal']);
export const LlmConnectionStateSchema = z.enum(['not_configured', 'configured', 'connected', 'failed']);
export const McpConnectionStateSchema = z.enum(['not_configured', 'configured', 'transport_pending', 'connected', 'failed']);

export const RunCreateRequestSchema = z.object({
  message: z.string().trim().min(1),
  mode: RunModeSchema.default('readonly')
});

export const RunCreateResponseSchema = z.object({
  runId: z.string().min(1),
  streamUrl: z.string().regex(/^\/api\/copilot\/runs\/[^/?#/]+\/stream$/, 'streamUrl must be a relative copilot stream endpoint')
});

export const ToolActionScopeSchema = z.object({
  label: z.string().trim().min(1),
  query: z.string().trim().min(1).optional(),
  jiraProjects: z.array(z.string().trim().min(1)).optional(),
  confluenceSpaces: z.array(z.string().trim().min(1)).optional()
});

export const ToolActionPlanSchema = z.object({
  id: z.string().min(1),
  tool: ToolNameSchema,
  risk: ToolRiskSchema,
  description: z.string().min(1),
  requiresApproval: z.boolean(),
  inputPreview: z.record(z.string(), z.string()).optional(),
  scope: ToolActionScopeSchema.optional()
});

export const AtlassianSourceMetadataSchema = z.object({
  jira: z.object({
    key: z.string().trim().min(1),
    status: z.string().trim().min(1).optional(),
    assignee: z.string().trim().min(1).optional(),
    priority: z.string().trim().min(1).optional(),
    issueType: z.string().trim().min(1).optional(),
    projectKey: z.string().trim().min(1).optional(),
    updated: z.string().trim().min(1).optional()
  }).optional(),
  confluence: z.object({
    pageId: z.string().trim().min(1),
    spaceKey: z.string().trim().min(1).optional(),
    spaceName: z.string().trim().min(1).optional(),
    contentType: z.string().trim().min(1).optional(),
    updated: z.string().trim().min(1).optional()
  }).optional()
}).refine((value) => Boolean(value.jira || value.confluence), 'metadata must include Jira or Confluence details');

const HttpUrlSchema = z.string().url().refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}, 'url must use http(s)');

export const AtlassianSourceSchema = z.object({
  id: z.string().min(1),
  sourceType: z.enum(['jira', 'confluence']),
  origin: SourceOriginSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  relevanceScore: z.number().int().min(0).max(100),
  url: HttpUrlSchema,
  actionId: z.string().trim().min(1),
  retrievedAt: z.string().trim().min(1),
  metadata: AtlassianSourceMetadataSchema
});

export const ActionReviewRequestSchema = z.object({
  id: z.string().min(1),
  tool: ToolNameSchema,
  risk: ToolRiskSchema,
  target: z.string().min(1),
  inputPreview: z.record(z.string(), z.string()),
  requiresApproval: z.literal(true)
});

export const CopilotSseEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('run.created'), runId: z.string(), createdAt: z.string() }),
  z.object({ type: z.literal('tool_plan.created'), actions: z.array(ToolActionPlanSchema).min(1) }),
  z.object({ type: z.literal('tool.started'), actionId: z.string(), tool: ToolNameSchema }),
  z.object({ type: z.literal('tool.completed'), actionId: z.string(), tool: ToolNameSchema, resultSummary: z.string() }),
  z.object({ type: z.literal('tool.failed'), actionId: z.string(), tool: ToolNameSchema, error: z.string() }),
  z.object({ type: z.literal('evidence.found'), sources: z.array(AtlassianSourceSchema) }),
  z.object({ type: z.literal('llm.started'), messageId: z.string() }),
  z.object({ type: z.literal('llm.delta'), messageId: z.string(), text: z.string() }),
  z.object({ type: z.literal('llm.completed'), messageId: z.string(), confidence: ConfidenceSchema, citationSourceIds: z.array(z.string()), reviewRequired: z.boolean() }),
  z.object({ type: z.literal('llm.failed'), messageId: z.string(), error: z.string() }),
  z.object({ type: z.literal('action_review.required'), action: ActionReviewRequestSchema }),
  z.object({ type: z.literal('action_review.resolved'), actionId: z.string(), status: z.enum(['mock_recorded', 'executed', 'blocked', 'cancelled']), message: z.string() }),
  z.object({ type: z.literal('report_draft.started'), draftId: z.string(), title: z.string() }),
  z.object({ type: z.literal('report_draft.delta'), draftId: z.string(), text: z.string() }),
  z.object({ type: z.literal('report_draft.completed'), draftId: z.string() }),
  z.object({ type: z.literal('run.completed'), runId: z.string() }),
  z.object({ type: z.literal('run.failed'), runId: z.string(), error: z.string() })
]);

export const ActionApprovalRequestSchema = z.object({
  approved: z.boolean(),
  inputPreview: z.record(z.string(), z.string()).optional()
});

export const ActionApprovalResponseSchema = z.object({
  actionId: z.string(),
  status: z.enum(['mock_recorded', 'executed', 'blocked']),
  executed: z.boolean(),
  message: z.string()
});

export const ActionCancelRequestSchema = z.object({
  reason: z.string().min(1)
});

export const ActionCancelResponseSchema = z.object({
  actionId: z.string(),
  status: z.literal('cancelled'),
  reason: z.string(),
  executed: z.literal(false)
});

const JiraProjectKeySchema = z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,9}$/);
const ConfluenceSpaceKeySchema = z.string().trim().regex(/^[A-Z0-9][A-Z0-9_~-]{0,30}$/);

export const AtlassianConnectionStatusSchema = z.object({
  source: AtlassianConnectionSourceSchema,
  connectionState: AtlassianConnectionStateSchema,
  configured: z.boolean(),
  connected: z.boolean(),
  siteUrl: z.string().url().optional(),
  email: z.string().email().optional(),
  tokenConfigured: z.boolean(),
  allowedJiraProjects: z.array(JiraProjectKeySchema),
  allowedConfluenceSpaces: z.array(ConfluenceSpaceKeySchema),
  statusMessage: z.string(),
  lastValidatedAt: z.string().optional(),
  lastError: z.string().optional()
});

export const LlmConnectionStatusSchema = z.object({
  provider: LlmProviderSchema,
  source: LlmConnectionSourceSchema,
  connectionState: LlmConnectionStateSchema,
  configured: z.boolean(),
  connected: z.boolean(),
  enabled: z.boolean(),
  keyConfigured: z.boolean(),
  model: z.string().min(1).max(128).optional(),
  statusMessage: z.string(),
  lastValidatedAt: z.string().optional(),
  lastError: z.string().optional()
});

export const SettingsStatusSchema = z.object({
  mcpConnected: z.boolean(),
  mcpConnectionState: McpConnectionStateSchema,
  mcpStatusMessage: z.string(),
  openaiConnected: z.boolean(),
  mode: RunModeSchema,
  sandboxWriteEnabled: z.boolean(),
  allowedJiraProjects: z.array(z.string()),
  allowedConfluenceSpaces: z.array(z.string()),
  atlassian: AtlassianConnectionStatusSchema,
  llm: LlmConnectionStatusSchema
});

export const AtlassianSettingsRequestSchema = z.object({
  siteUrl: z.string().trim().url().refine((value) => new URL(value).protocol === 'https:', 'Site URL must use https.'),
  email: z.string().trim().email(),
  apiToken: z.string().trim().min(8).max(4096).optional(),
  jiraProjectAllowlist: z.array(JiraProjectKeySchema).min(1).max(20),
  confluenceSpaceAllowlist: z.array(ConfluenceSpaceKeySchema).min(1).max(20)
});

export const AtlassianSettingsResponseSchema = z.object({
  status: SettingsStatusSchema,
  message: z.string()
});

export const AtlassianSettingsClearResponseSchema = z.object({
  status: SettingsStatusSchema,
  message: z.string()
});

export const AtlassianSettingsTestResponseSchema = z.object({
  status: SettingsStatusSchema,
  ok: z.boolean(),
  message: z.string()
});

const OptionalTrimmedTextSchema = z.string().trim().min(1).max(4096).optional();

export const LlmSettingsRequestSchema = z.object({
  provider: LlmProviderSchema,
  apiKey: OptionalTrimmedTextSchema,
  model: z.string().trim().min(1).max(128).optional(),
  enabled: z.boolean()
});

export const LlmSettingsResponseSchema = z.object({
  status: SettingsStatusSchema,
  message: z.string()
});

export const LlmSettingsClearResponseSchema = z.object({
  status: SettingsStatusSchema,
  message: z.string()
});

export const LlmSettingsTestResponseSchema = z.object({
  status: SettingsStatusSchema,
  provider: LlmProviderSchema,
  ok: z.boolean(),
  message: z.string()
});

export const LlmModelOptionSchema = z.object({
  id: z.string().trim().min(1).max(256),
  label: z.string().trim().min(1).max(256),
  provider: LlmModelCatalogProviderSchema,
  description: z.string().trim().min(1).max(2048).optional(),
  owner: z.string().trim().min(1).max(256).optional(),
  createdAt: z.string().trim().min(1).optional(),
  contextWindow: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  inputModalities: z.array(z.string().trim().min(1).max(64)).optional(),
  outputModalities: z.array(z.string().trim().min(1).max(64)).optional(),
  supportedParameters: z.array(z.string().trim().min(1).max(128)).optional(),
  pricing: z.record(z.string(), z.string()).optional(),
  recommended: z.boolean().optional()
});

export const LlmModelCacheMetadataSchema = z.object({
  status: LlmModelCacheStatusSchema,
  ttlSeconds: z.number().int().nonnegative(),
  fetchedAt: z.string().trim().min(1).optional()
});

export const LlmModelPageMetadataSchema = z.object({
  hasMore: z.boolean(),
  firstId: z.string().trim().min(1).optional(),
  lastId: z.string().trim().min(1).optional()
});

export const LlmProviderModelsResponseSchema = z.object({
  provider: LlmProviderSchema,
  source: LlmModelCatalogSourceSchema,
  defaultModel: z.string().trim().min(1).max(256),
  selectedModel: z.string().trim().min(1).max(256).optional(),
  models: z.array(LlmModelOptionSchema),
  manualEntryAllowed: z.literal(true),
  cache: LlmModelCacheMetadataSchema,
  page: LlmModelPageMetadataSchema.optional(),
  message: z.string().trim().min(1).max(512).optional(),
  warning: z.string().trim().min(1).max(512).optional()
});

export const CopilotSuggestionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1).max(500),
  category: z.enum(['jira', 'confluence', 'write', 'general']),
  requiresConnection: z.boolean(),
  requiresWrite: z.boolean()
});

export const CopilotSuggestionsResponseSchema = z.object({
  source: z.enum(['fallback', 'llm']),
  suggestions: z.array(CopilotSuggestionSchema).min(1).max(8),
  message: z.string().trim().min(1).max(512).optional()
});

export const HistoryResponseSchema = z.object({
  runs: z.array(z.object({
    runId: z.string(),
    title: z.string(),
    createdAt: z.string(),
    toolCount: z.number().int().nonnegative(),
    pendingApprovalCount: z.number().int().nonnegative(),
    status: z.enum(['completed', 'failed', 'running'])
  }))
});
