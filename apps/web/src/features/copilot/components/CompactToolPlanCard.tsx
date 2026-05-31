import type { ToolActionPlan } from '@akc/shared';
import { toolRiskLabel } from '../labels';
import { toolRiskTone } from '../tone';

export function CompactToolPlanCard({ actions }: { actions: ToolActionPlan[] }) {
  return (
    <section className="card" aria-label="조회 계획">
      <div className="message-header"><h3>조회 계획</h3><div className="badges"><span className="badge ai">읽기 전용 계획</span></div></div>
      <div className="tool-list">
        {actions.map((action) => (
          <div className="tool-row" key={action.id}>
            <div>
              <strong>{action.description}</strong>
              <p>{action.scope?.label ?? action.tool}</p>
              {action.scope?.query ? <code className="query-preview">{action.scope.query}</code> : null}
              {action.inputPreview && !action.scope?.query ? <code className="query-preview">{formatInputPreview(action.inputPreview)}</code> : null}
            </div>
            <span className={`badge ${toolRiskTone(action.risk)}`}>{toolRiskLabel(action.risk)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatInputPreview(inputPreview: Record<string, string>): string {
  return Object.entries(inputPreview).map(([key, value]) => `${key}: ${value}`).join(' · ');
}
