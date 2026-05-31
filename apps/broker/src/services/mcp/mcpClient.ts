import type { ActionReviewRequest, AtlassianSource, ReadOnlyTool, WriteTool } from '@akc/shared';
import { assertAllowedMcpTool } from './allowlist.js';
import { readResolvedAtlassianCredentials } from '../settings/atlassianSettingsStore.js';

export interface McpEnvironment {
  atlassianUrl?: string | undefined;
  atlassianEmail?: string | undefined;
  atlassianToken?: string | undefined;
  source?: 'none' | 'environment' | 'personal';
  allowedJiraProjects?: string[] | undefined;
  allowedConfluenceSpaces?: string[] | undefined;
}

export interface McpSmokeResult {
  tool: ReadOnlyTool;
  status: 'skipped' | 'ok' | 'failed';
  reason?: string;
  query?: string;
  sources: AtlassianSource[];
}

export interface McpWriteResult {
  tool: WriteTool;
  status: 'skipped' | 'ok' | 'failed';
  reason: string;
  target?: string | undefined;
}

interface JiraIssueSearchResponse {
  issues?: JiraIssue[];
  total?: number;
  isLast?: boolean;
  nextPageToken?: string;
  errorMessages?: string[];
  errors?: Record<string, string>;
}

interface JiraIssue {
  key?: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    assignee?: { displayName?: string; emailAddress?: string };
    priority?: { name?: string };
    issuetype?: { name?: string };
    updated?: string;
    project?: { key?: string; name?: string };
    description?: unknown;
  };
}

interface ConfluenceSearchResponse {
  results?: ConfluenceSearchResult[];
  size?: number;
  message?: string;
}

interface ConfluenceSearchResult {
  id?: string;
  title?: string;
  type?: string;
  space?: { key?: string; name?: string };
  version?: { when?: string };
  body?: { storage?: { value?: string }; view?: { value?: string } };
  _links?: { webui?: string; base?: string };
  excerpt?: string;
}

export function readMcpEnvironment(env = process.env): McpEnvironment {
  const atlassian = readResolvedAtlassianCredentials(env);
  return {
    source: atlassian.source,
    atlassianUrl: atlassian.siteUrl,
    atlassianEmail: atlassian.email,
    atlassianToken: atlassian.apiToken,
    allowedJiraProjects: atlassian.allowedJiraProjects,
    allowedConfluenceSpaces: atlassian.allowedConfluenceSpaces
  };
}

export function hasMcpCredentials(env: McpEnvironment): boolean {
  return Boolean(env.atlassianUrl && env.atlassianEmail && env.atlassianToken);
}

export async function runReadOnlyMcpTool(tool: ReadOnlyTool, query: string, env = readMcpEnvironment()): Promise<McpSmokeResult> {
  assertAllowedMcpTool(tool);
  if (!hasMcpCredentials(env)) {
    return {
      tool,
      status: 'skipped',
      reason: 'Atlassian 연결 정보가 없어 조회를 실행하지 않았습니다.',
      sources: []
    };
  }

  try {
    if (tool === 'jira_search') return await runJiraSearch(query, env);
    if (tool === 'jira_get_issue') return await runJiraGetIssue(query, env);
    if (tool === 'confluence_search') return await runConfluenceSearch(query, env);
    return await runConfluenceGetPage(query, env);
  } catch (error) {
    return {
      tool,
      status: 'failed',
      reason: sanitizeAtlassianError(error),
      query: safeQueryForLog(query),
      sources: []
    };
  }
}

export async function runWriteMcpTool(tool: WriteTool, action: ActionReviewRequest, env = readMcpEnvironment()): Promise<McpWriteResult> {
  if (!hasMcpCredentials(env)) {
    return {
      tool,
      status: 'skipped',
      reason: 'Atlassian 연결 정보가 없어 요청한 변경을 실행하지 않았습니다.'
    };
  }

  try {
    if (tool === 'jira_add_comment') return await runJiraAddComment(action, env);
    return {
      tool,
      status: 'failed',
      reason: '현재는 Jira 댓글 작성만 지원합니다. 이슈나 페이지의 생성·수정·상태 변경은 안전한 입력 확인 절차가 더 필요해 실행하지 않았습니다.',
      target: action.target
    };
  } catch (error) {
    return {
      tool,
      status: 'failed',
      reason: sanitizeAtlassianError(error).replace(/read-only\s*/gi, ''),
      target: action.target
    };
  }
}

async function runJiraSearch(query: string, env: McpEnvironment): Promise<McpSmokeResult> {
  const jql = applyJiraProjectAllowlist(buildJiraSearchJql(query), env.allowedJiraProjects);
  const body = {
    jql,
    maxResults: 25,
    fields: ['summary', 'status', 'assignee', 'updated', 'priority', 'issuetype', 'project'],
    fieldsByKeys: false
  };
  const response = await atlassianFetch(env, '/rest/api/3/search/jql', {
    method: 'POST',
    headers: jsonHeaders(env),
    body: JSON.stringify(body)
  });
  const payload = await parseJson<JiraIssueSearchResponse>(response, 'Jira issue search');
  const issues = payload.issues ?? [];
  return {
    tool: 'jira_search',
    status: 'ok',
    query: jql,
    sources: issues.map((issue, index) => {
      assertJiraIssueInAllowlist(issue, env.allowedJiraProjects);
      return mapJiraIssueToSource(issue, env, index, 'jira_search');
    })
  };
}

async function runJiraGetIssue(query: string, env: McpEnvironment): Promise<McpSmokeResult> {
  const issueKey = query.trim();
  if (!/^[A-Z][A-Z0-9_]+-\d+$/i.test(issueKey)) throw new Error('Jira 이슈 키 형식이 올바르지 않습니다.');
  const response = await atlassianFetch(env, `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,status,assignee,updated,priority,issuetype,project`, {
    method: 'GET',
    headers: jsonHeaders(env)
  });
  const issue = await parseJson<JiraIssue>(response, 'Jira issue read');
  assertJiraIssueInAllowlist(issue, env.allowedJiraProjects);
  return { tool: 'jira_get_issue', status: 'ok', query: issueKey, sources: [mapJiraIssueToSource(issue, env, 0, 'jira_get_issue')] };
}

async function runJiraAddComment(action: ActionReviewRequest, env: McpEnvironment): Promise<McpWriteResult> {
  const issueKey = extractJiraIssueKey(action);
  assertJiraProjectKeyAllowed(issueKey, env.allowedJiraProjects);
  const comment = normalizeWriteText(action.inputPreview.comment);
  if (!comment || comment === '작성할 댓글 내용을 입력하세요.') {
    throw new Error('Jira에 작성할 댓글 본문이 비어 있습니다. 작업 검토에서 댓글 내용을 입력한 뒤 다시 승인하세요.');
  }

  const response = await atlassianFetch(env, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
    method: 'POST',
    headers: jsonHeaders(env),
    body: JSON.stringify({ body: textToAdfDocument(comment) })
  });
  const payload = await parseJson<{ id?: string }>(response, 'Jira comment write');
  return {
    tool: 'jira_add_comment',
    status: 'ok',
    target: issueKey,
    reason: payload.id ? `${issueKey}에 Jira 댓글을 작성했습니다. 댓글 ID: ${payload.id}` : `${issueKey}에 Jira 댓글을 작성했습니다.`
  };
}

async function runConfluenceSearch(query: string, env: McpEnvironment): Promise<McpSmokeResult> {
  const cql = applyConfluenceSpaceAllowlist(buildConfluenceSearchCql(query), env.allowedConfluenceSpaces);
  const params = new URLSearchParams({ cql, limit: '10', expand: 'space,version,body.view' });
  const response = await atlassianFetch(env, `/wiki/rest/api/content/search?${params.toString()}`, {
    method: 'GET',
    headers: jsonHeaders(env)
  });
  const payload = await parseJson<ConfluenceSearchResponse>(response, 'Confluence search');
  const pages = payload.results ?? [];
  return {
    tool: 'confluence_search',
    status: 'ok',
    query: cql,
    sources: pages.map((page, index) => {
      assertConfluencePageInAllowlist(page, env.allowedConfluenceSpaces);
      return mapConfluenceResultToSource(page, env, index, 'confluence_search');
    })
  };
}

async function runConfluenceGetPage(query: string, env: McpEnvironment): Promise<McpSmokeResult> {
  const pageId = query.trim();
  if (!/^\d+$/.test(pageId)) throw new Error('Confluence 페이지 ID 형식이 올바르지 않습니다.');
  const response = await atlassianFetch(env, `/wiki/rest/api/content/${encodeURIComponent(pageId)}?expand=space,version,body.view`, {
    method: 'GET',
    headers: jsonHeaders(env)
  });
  const page = await parseJson<ConfluenceSearchResult>(response, 'Confluence page read');
  assertConfluencePageInAllowlist(page, env.allowedConfluenceSpaces);
  return { tool: 'confluence_get_page', status: 'ok', query: pageId, sources: [mapConfluenceResultToSource(page, env, 0, 'confluence_get_page')] };
}

async function atlassianFetch(env: McpEnvironment, path: string, init: RequestInit): Promise<Response> {
  const base = normalizeSiteUrl(env.atlassianUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${base}${path}`, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(await buildHttpErrorMessage(response));
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function jsonHeaders(env: McpEnvironment): HeadersInit {
  const email = env.atlassianEmail?.trim();
  const token = env.atlassianToken?.trim();
  if (!email || !token) throw new Error('Atlassian credentials are incomplete.');
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
  };
}

async function parseJson<T>(response: Response, label: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new Error(`${label} returned non-JSON response.`, { cause: error });
  }
}

async function buildHttpErrorMessage(response: Response): Promise<string> {
  let detail = '';
  try {
    const body = (await response.json()) as { errorMessages?: string[]; errors?: Record<string, string>; message?: string };
    const messages = [...(body.errorMessages ?? []), ...Object.values(body.errors ?? {}), body.message].filter(Boolean);
    detail = messages.length > 0 ? ` ${messages.join(' ')}` : '';
  } catch {
    // Ignore non-JSON error bodies to avoid leaking unexpected upstream payloads.
  }
  return `Atlassian read-only request failed with status ${response.status}.${detail}`;
}

function normalizeSiteUrl(raw: string | undefined): string {
  const siteUrl = raw?.trim();
  if (!siteUrl) throw new Error('Atlassian site URL is missing.');
  const parsed = new URL(siteUrl);
  if (parsed.protocol !== 'https:') throw new Error('Atlassian site URL must use https.');
  return parsed.origin;
}

function buildJiraSearchJql(query: string): string {
  const trimmed = query.trim();
  if (!trimmed || !looksLikeJql(trimmed)) return `text ~ "${escapeJqlText(trimmed || 'issue')}" ORDER BY updated DESC`;
  return trimmed;
}

function looksLikeJql(value: string): boolean {
  return /(?:^|\s)(?:project|assignee|status|statusCategory|resolution|key|summary|text|issuetype|updated|created|priority)\s*(?:=|!=|~|in\b|not in\b|is\b|was\b)/i.test(value);
}

function applyJiraProjectAllowlist(jql: string, projects: string[] | undefined): string {
  const allowed = (projects ?? []).map((project) => project.trim().toUpperCase()).filter(Boolean);
  if (allowed.length === 0) return jql;
  const { body, orderBy } = splitJqlOrderBy(jql);
  const projectClause = `project in (${allowed.join(', ')})`;
  return `${projectClause} AND (${body})${orderBy ? ` ORDER BY ${orderBy}` : ''}`;
}

function splitJqlOrderBy(jql: string): { body: string; orderBy: string | null } {
  const match = /^(.*?)(?:\s+ORDER\s+BY\s+(.+))$/i.exec(jql.trim());
  if (!match) return { body: jql.trim(), orderBy: null };
  return { body: match[1]?.trim() ?? jql.trim(), orderBy: match[2]?.trim() ?? null };
}

function buildConfluenceSearchCql(query: string): string {
  const trimmed = query.trim();
  if (!trimmed || !looksLikeCql(trimmed)) return `type = page AND text ~ "${escapeCqlText(trimmed || 'runbook')}"`;
  return trimmed;
}

function looksLikeCql(value: string): boolean {
  return /(?:^|\s)(?:type|space|title|text|label)\s*(?:=|~|in\b)/i.test(value);
}

function applyConfluenceSpaceAllowlist(cql: string, spaces: string[] | undefined): string {
  const allowed = (spaces ?? []).map((space) => space.trim().toUpperCase()).filter(Boolean);
  if (allowed.length === 0) return cql;
  return `space in (${allowed.map((space) => `"${space}"`).join(', ')}) AND (${cql})`;
}

function mapJiraIssueToSource(issue: JiraIssue, env: McpEnvironment, index: number, actionId: ReadOnlyTool): AtlassianSource {
  const key = issue.key ?? `JIRA-${index + 1}`;
  const fields = issue.fields ?? {};
  const status = fields.status?.name ? `상태: ${fields.status.name}` : null;
  const assignee = fields.assignee?.displayName ? `담당자: ${fields.assignee.displayName}` : null;
  const priority = fields.priority?.name ? `우선순위: ${fields.priority.name}` : null;
  const issueType = fields.issuetype?.name ? `유형: ${fields.issuetype.name}` : null;
  const updated = fields.updated ? `업데이트: ${fields.updated}` : null;
  return {
    id: key,
    sourceType: 'jira',
    origin: 'real',
    title: fields.summary ?? key,
    summary: [status, assignee, priority, issueType, updated].filter(Boolean).join(' · ') || 'Jira에서 조회된 읽기 전용 이슈입니다.',
    relevanceScore: Math.max(60, 96 - index * 4),
    url: `${normalizeSiteUrl(env.atlassianUrl)}/browse/${encodeURIComponent(key)}`,
    actionId,
    retrievedAt: new Date().toISOString(),
    metadata: {
      jira: {
        key,
        ...(fields.status?.name ? { status: fields.status.name } : {}),
        ...(fields.assignee?.displayName ? { assignee: fields.assignee.displayName } : {}),
        ...(fields.priority?.name ? { priority: fields.priority.name } : {}),
        ...(fields.issuetype?.name ? { issueType: fields.issuetype.name } : {}),
        ...(fields.project?.key ? { projectKey: fields.project.key } : {}),
        ...(fields.updated ? { updated: fields.updated } : {})
      }
    }
  };
}

function mapConfluenceResultToSource(page: ConfluenceSearchResult, env: McpEnvironment, index: number, actionId: ReadOnlyTool): AtlassianSource {
  const id = page.id ?? `CONF-${index + 1}`;
  const html = page.excerpt || page.body?.view?.value || page.body?.storage?.value || '';
  const summary = stripHtml(html).slice(0, 280) || `${page.space?.key ? `${page.space.key} 스페이스의 ` : ''}Confluence 페이지입니다.`;
  const path = page._links?.webui ?? `/wiki/spaces/${page.space?.key ?? ''}/pages/${id}`;
  return {
    id,
    sourceType: 'confluence',
    origin: 'real',
    title: page.title ?? id,
    summary,
    relevanceScore: Math.max(60, 94 - index * 4),
    url: `${normalizeSiteUrl(env.atlassianUrl)}${path.startsWith('/') ? path : `/${path}`}`,
    actionId,
    retrievedAt: new Date().toISOString(),
    metadata: {
      confluence: {
        pageId: id,
        ...(page.space?.key ? { spaceKey: page.space.key } : {}),
        ...(page.space?.name ? { spaceName: page.space.name } : {}),
        ...(page.type ? { contentType: page.type } : {}),
        ...(page.version?.when ? { updated: page.version.when } : {})
      }
    }
  };
}

function assertJiraIssueInAllowlist(issue: JiraIssue, projects: string[] | undefined): void {
  const allowed = (projects ?? []).map((project) => project.toUpperCase());
  const key = issue.fields?.project?.key?.toUpperCase();
  if (allowed.length > 0 && !key) throw new Error('조회된 Jira 이슈의 프로젝트를 확인할 수 없어 허용 범위를 검증하지 못했습니다.');
  if (allowed.length > 0 && key && !allowed.includes(key)) throw new Error('조회된 Jira 이슈가 허용된 프로젝트 범위를 벗어났습니다.');
}

function assertJiraProjectKeyAllowed(issueKey: string, projects: string[] | undefined): void {
  const allowed = (projects ?? []).map((project) => project.toUpperCase());
  const projectKey = issueKey.split('-')[0]?.toUpperCase();
  if (!projectKey) throw new Error('Jira 이슈 키에서 프로젝트를 확인할 수 없습니다.');
  if (allowed.length > 0 && !allowed.includes(projectKey)) {
    throw new Error('쓰기 대상 Jira 이슈가 허용된 프로젝트 범위를 벗어났습니다.');
  }
}

function assertConfluencePageInAllowlist(page: ConfluenceSearchResult, spaces: string[] | undefined): void {
  const allowed = (spaces ?? []).map((space) => space.toUpperCase());
  const key = page.space?.key?.toUpperCase();
  if (allowed.length > 0 && !key) throw new Error('조회된 Confluence 페이지의 스페이스를 확인할 수 없어 허용 범위를 검증하지 못했습니다.');
  if (allowed.length > 0 && key && !allowed.includes(key)) throw new Error('조회된 Confluence 페이지가 허용된 스페이스 범위를 벗어났습니다.');
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractJiraIssueKey(action: ActionReviewRequest): string {
  const source = `${action.target} ${Object.values(action.inputPreview).join(' ')}`;
  const issueKey = source.match(/\b[A-Z][A-Z0-9]+-\d+\b/i)?.[0]?.toUpperCase();
  if (!issueKey) throw new Error('Jira 쓰기 대상 이슈 키를 찾지 못했습니다. 예: KAN-123 형식의 이슈 키가 필요합니다.');
  return issueKey;
}

function normalizeWriteText(value: string | undefined): string {
  return (value ?? '').replace(/\r\n/g, '\n').trim().slice(0, 32_000);
}

function textToAdfDocument(text: string) {
  return {
    type: 'doc',
    version: 1,
    content: text.split(/\n{2,}/).map((paragraph) => ({
      type: 'paragraph',
      content: paragraph.split('\n').flatMap((line, index) => {
        const nodes: Array<{ type: 'text'; text: string } | { type: 'hardBreak' }> = [];
        if (index > 0) nodes.push({ type: 'hardBreak' });
        if (line) nodes.push({ type: 'text', text: line });
        return nodes;
      })
    }))
  };
}

function escapeJqlText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeCqlText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function sanitizeAtlassianError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown Atlassian read-only error.';
  return message
    .replace(/Basic\s+[A-Za-z0-9+/=]+/g, 'Basic [redacted]')
    .replace(/(api[_-]?token|token|authorization)[=:]\s*[^,\s]+/gi, '$1=[redacted]');
}

function safeQueryForLog(query: string): string {
  return query.length > 500 ? `${query.slice(0, 500)}…` : query;
}
