import type { CopilotRunView } from '@akc/shared';
import { toolStatusLabel } from '../labels';
import { toolStatusTone } from '../tone';

export function ProgressStrip({ runView }: { runView: CopilotRunView }) {
  const events = Object.values(runView.toolEvents);
  return (
    <section className="card" aria-label="조회 진행">
      <div className="message-header"><h3>조회 진행</h3><span className="badge ai">진행 중</span></div>
      <div className="progress-strip">
        {events.map((event) => {
          const width = event.status === 'completed' ? '100%' : event.status === 'failed' ? '100%' : '55%';
          const tone = toolStatusTone(event.status);
          return (
            <div className="progress-item" key={event.actionId}>
              <div className="message-header"><span>{event.tool}</span><span className={`badge ${tone}`}>{toolStatusLabel(event.status)}</span></div>
              <div className="progress-bar"><span className={tone} style={{ width }} /></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
