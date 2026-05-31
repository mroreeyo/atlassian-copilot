import type { ReportDraft } from '@akc/shared';
import { reportDraftStatusLabel } from '../labels';

export function ReportDraftCard({ draft }: { draft: ReportDraft }) {
  return (
    <section className="card" aria-label="보고서">
      <div className="message-header"><h3>보고서</h3><span className="badge ai">{reportDraftStatusLabel(draft.status)}</span></div>
      <div className="report-content">{draft.content}</div>
    </section>
  );
}
