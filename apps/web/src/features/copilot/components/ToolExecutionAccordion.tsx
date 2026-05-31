import { useEffect, useId, useMemo, useState } from 'react';
import type { AtlassianSource, CopilotRunView, ToolActionPlan, ToolExecutionEvent, ToolName, ToolStatus } from '@akc/shared';
import { toolRiskLabel, toolStatusLabel } from '../labels';
import { toolRiskTone, toolStatusTone } from '../tone';
import { SourceLink } from './SourceLink';

type ToolExecutionRow = {
  id: string;
  action?: ToolActionPlan;
  event?: ToolExecutionEvent;
  sources: AtlassianSource[];
};

export function ToolExecutionAccordion({ runView }: { runView: CopilotRunView }) {
  const accordionId = useId();
  const rows = useMemo(() => buildToolExecutionRows(runView), [runView]);
  const statuses = rows.map(rowStatus);
  const hasAttentionState = statuses.some((status) => status === 'failed');
  const [expanded, setExpanded] = useState(hasAttentionState);

  useEffect(() => {
    setExpanded(hasAttentionState);
  }, [hasAttentionState]);

  if (rows.length === 0) return null;

  const completedCount = statuses.filter((status) => status === 'completed').length;
  const failedCount = statuses.filter((status) => status === 'failed').length;
  const runningCount = statuses.filter((status) => status === 'running').length;
  const plannedCount = rows.length - completedCount - failedCount - runningCount;
  const evidenceCount = rows.reduce((count, row) => count + row.sources.length, 0);
  const statusLabel = failedCount > 0 ? '확인 필요' : runningCount > 0 ? '실행 중' : plannedCount > 0 && runView.status === 'running' ? '대기 중' : `${completedCount}/${rows.length} 완료`;
  const statusTone = failedCount > 0 ? 'danger' : completedCount === rows.length ? 'success' : 'ai';
  const headline = runningCount > 0 ? '조회 실행 중' : failedCount > 0 ? '조회 확인 필요' : '조회 실행';
  const summary = compactSummary({ rows: rows.length, completedCount, runningCount, plannedCount, evidenceCount });
  const leadStatus = failedCount > 0 ? 'failed' : runningCount > 0 ? 'running' : completedCount === rows.length ? 'completed' : 'planned';

  return (
    <section className="tool-accordion" aria-label="도구 실행">
      <button
        className="tool-accordion-trigger"
        type="button"
        aria-expanded={expanded}
        aria-controls={accordionId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="tool-accordion-summary">
          <StatusGlyph status={leadStatus} decorative />
          <span>
            <span className="eyebrow">도구 실행</span>
            <strong>{headline}</strong>
            <small>{summary}</small>
          </span>
        </span>
        <span className="tool-accordion-meta">
          <span className={`badge ${statusTone}`}>{statusLabel}</span>
          <span className="chevron" aria-hidden="true">{expanded ? '⌃' : '⌄'}</span>
        </span>
      </button>
      {expanded ? (
        <div className="tool-call-list" id={accordionId}>
          {rows.map((row) => (
            <ToolExecutionRowView key={row.id} row={row} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ToolExecutionRowView({ row }: { row: ToolExecutionRow }) {
  const status = rowStatus(row);
  const tone = toolStatusTone(status);
  const inputPreview = formatActionInput(row.action);
  const result = row.event?.resultSummary ?? row.event?.error ?? (status === 'running' ? '아직 조회 중입니다.' : '도구 실행을 기다리고 있습니다.');
  const sourcePreview = row.sources.slice(0, 2);

  return (
    <article className="tool-call-row">
      <div className="tool-call-row-header">
        <div className="tool-call-title-group">
          <StatusGlyph status={status} />
          <div>
            <strong>{toolDisplayName(row.action?.tool ?? row.event?.tool)}</strong>
            <p>{row.action?.description ?? row.event?.tool ?? '도구 실행'}</p>
          </div>
        </div>
        <span className={`badge ${tone}`} role="status" aria-live="polite">{toolStatusLabel(status)}</span>
      </div>
      <div className="tool-call-panel">
        {row.action ? (
          <dl className="tool-call-details">
            <div>
              <dt>범위</dt>
              <dd>{row.action.scope?.label ?? toolDisplayName(row.action.tool)}</dd>
            </div>
            {inputPreview ? (
              <div>
                <dt>입력</dt>
                <dd><code className="query-preview">{inputPreview}</code></dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <div className="tool-call-result">
          <span>결과</span>
          <p className={status === 'failed' ? 'error-text' : undefined}>{result}</p>
        </div>
        {row.sources.length > 0 ? (
          <div className="tool-call-sources">
            <span>근거 {row.sources.length}개</span>
            <ul>
              {sourcePreview.map((source) => (
                <li key={source.id}>
                  <SourceTitle source={source} />
                  <small>{sourceOriginLabel(source.origin)} · {source.sourceType === 'jira' ? 'Jira' : 'Confluence'} · {formatRetrievedAt(source.retrievedAt)}</small>
                </li>
              ))}
            </ul>
            {row.sources.length > sourcePreview.length ? <small className="tool-call-more">+{row.sources.length - sourcePreview.length}개 근거 더 있음</small> : null}
          </div>
        ) : null}
        {row.action?.requiresApproval ? <span className={`badge ${toolRiskTone(row.action.risk)}`}>{toolRiskLabel(row.action.risk)}</span> : null}
      </div>
    </article>
  );
}

function StatusGlyph({ status, decorative = false }: { status: ToolStatus; decorative?: boolean }) {
  if (status === 'running') return <span className="spinner" aria-label={decorative ? undefined : '실행 중'} aria-hidden={decorative ? true : undefined} />;
  if (status === 'completed') return <span className="status-dot success" aria-hidden="true" />;
  if (status === 'failed') return <span className="status-dot danger" aria-hidden="true" />;
  return <span className="status-dot muted" aria-hidden="true" />;
}

function buildToolExecutionRows(runView: CopilotRunView): ToolExecutionRow[] {
  const sourcesByAction = new Map<string, AtlassianSource[]>();
  for (const source of runView.sources) {
    sourcesByAction.set(source.actionId, [...(sourcesByAction.get(source.actionId) ?? []), source]);
  }

  const rows = new Map<string, ToolExecutionRow>();
  for (const action of runView.toolPlan) {
    const sources = sourcesByAction.get(action.id) ?? [];
    const event = runView.toolEvents[action.id];
    if (action.requiresApproval && !event && sources.length === 0) continue;
    rows.set(action.id, event ? { id: action.id, action, event, sources } : { id: action.id, action, sources });
  }

  for (const event of Object.values(runView.toolEvents)) {
    const existing = rows.get(event.actionId);
    if (existing) {
      rows.set(event.actionId, { ...existing, event });
      continue;
    }
    rows.set(event.actionId, { id: event.actionId, event, sources: sourcesByAction.get(event.actionId) ?? [] });
  }

  for (const [actionId, sources] of sourcesByAction) {
    if (!rows.has(actionId)) rows.set(actionId, { id: actionId, sources });
  }

  return [...rows.values()];
}

function rowStatus(row: ToolExecutionRow): ToolStatus {
  if (row.event) return row.event.status;
  return 'planned';
}

function compactSummary({
  rows,
  completedCount,
  runningCount,
  plannedCount,
  evidenceCount
}: {
  rows: number;
  completedCount: number;
  runningCount: number;
  plannedCount: number;
  evidenceCount: number;
}): string {
  const parts = [`${rows}개 도구`];
  if (runningCount > 0) parts.push(`${runningCount}개 실행 중`);
  if (plannedCount > 0) parts.push(`${plannedCount}개 대기`);
  if (completedCount > 0) parts.push(`${completedCount}개 완료`);
  if (evidenceCount > 0) parts.push(`${evidenceCount}개 근거`);
  return parts.join(' · ');
}

function SourceTitle({ source }: { source: AtlassianSource }) {
  return <SourceLink source={source} className="source-title source-link">{source.title}</SourceLink>;
}


function formatActionInput(action: ToolActionPlan | undefined): string | null {
  if (!action) return null;
  if (action.scope?.query) return action.scope.query;
  if (!action.inputPreview) return null;
  return Object.entries(action.inputPreview).map(([key, value]) => `${key}: ${value}`).join(' · ');
}

function toolDisplayName(tool: ToolName | undefined): string {
  const labels: Record<ToolName, string> = {
    jira_search: 'Jira 이슈 조회',
    jira_get_issue: 'Jira 이슈 상세 조회',
    confluence_search: 'Confluence 문서 조회',
    confluence_get_page: 'Confluence 페이지 조회',
    jira_create_issue: 'Jira 이슈 생성',
    jira_update_issue: 'Jira 이슈 수정',
    jira_add_comment: 'Jira 댓글 작성',
    jira_transition_issue: 'Jira 상태 전환',
    confluence_create_page: 'Confluence 페이지 생성',
    confluence_update_page: 'Confluence 페이지 수정',
    confluence_add_comment: 'Confluence 댓글 작성',
    jira_delete_issue: 'Jira 이슈 삭제',
    confluence_delete_page: 'Confluence 페이지 삭제',
    archive_resource: '리소스 보관',
    remove_resource: '리소스 제거'
  };
  return tool ? labels[tool] : '도구 실행';
}

function sourceOriginLabel(origin: AtlassianSource['origin']): string {
  return origin === 'demo' ? '데모 자료' : '실제';
}

function formatRetrievedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
}
