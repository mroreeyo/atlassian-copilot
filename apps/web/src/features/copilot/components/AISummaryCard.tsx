import type { CopilotRunView } from '@akc/shared';
import { confidenceLabel } from '../labels';
import { confidenceTone } from '../tone';
import { MarkdownContent } from './MarkdownContent';
import { SourceLink } from './SourceLink';

export function AISummaryCard({ runView }: { runView: CopilotRunView }) {
  const citedSources = runView.citationSourceIds
    .map((id) => runView.sources.find((source) => source.id === id))
    .filter((source): source is NonNullable<typeof source> => Boolean(source))
    .slice(0, 3);
  const evidenceLabel = runView.sources.length > 0 && runView.sources.every((source) => source.origin === 'demo') ? '데모 자료' : '참고 확인';

  return (
    <section className="card" aria-label="답변">
      <div className="message-header">
        <h3>답변</h3>
        <div className="badges"><span className="badge ai">{evidenceLabel}</span>{runView.confidence ? <span className={`badge ${confidenceTone(runView.confidence)}`}>{confidenceLabel(runView.confidence)}</span> : null}</div>
      </div>
      <MarkdownContent content={runView.summaryText} sources={runView.sources} />
      {citedSources.length > 0 ? (
        <div className="answer-sources">
          <span className="muted">참고한 항목</span>
          <ul>
            {citedSources.map((source) => <li key={source.id}><SourceLink source={source}>{source.id} · {source.title}</SourceLink></li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
