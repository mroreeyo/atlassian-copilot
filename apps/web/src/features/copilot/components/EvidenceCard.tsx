import type { AtlassianSource } from '@akc/shared';
import { SourceLink } from './SourceLink';

export function EvidenceCard({ sources }: { sources: AtlassianSource[] }) {
  const originLabel = evidenceOriginLabel(sources);
  return (
    <section className="card" aria-label="참고한 항목">
      <div className="message-header"><h3>참고한 항목</h3><span className="badge ai">{originLabel}</span></div>
      <div className="evidence-list">
        {sources.map((source) => (
          <div className="evidence-item" key={source.id}>
            <div>
              <strong><SourceLink source={source}>{source.id} · {source.title}</SourceLink></strong>
              <p>{source.summary}</p>
              <p className="source-meta">{sourceOriginLabel(source.origin)} · {sourceLabel(source)} · {source.actionId} · {formatRetrievedAt(source.retrievedAt)}</p>
            </div>
            <span className="badge">관련도 {source.relevanceScore}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function evidenceOriginLabel(sources: AtlassianSource[]): string {
  if (sources.length === 0) return '근거 없음';
  return sources.every((source) => source.origin === 'demo') ? '데모 자료' : '실제 Atlassian';
}

function sourceOriginLabel(origin: AtlassianSource['origin']): string {
  return origin === 'demo' ? '데모 자료' : '실제';
}

function sourceLabel(source: AtlassianSource): string {
  if (source.metadata?.jira) {
    const jira = source.metadata.jira;
    return ['Jira', jira.projectKey, jira.status, jira.assignee ? `담당 ${jira.assignee}` : null].filter(Boolean).join(' · ');
  }
  if (source.metadata?.confluence) {
    const confluence = source.metadata.confluence;
    return ['Confluence', confluence.spaceKey, confluence.contentType].filter(Boolean).join(' · ');
  }
  return 'Atlassian 항목';
}

function formatRetrievedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
}
