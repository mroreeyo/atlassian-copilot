import type { HistoryResponse } from '@akc/shared';
import { useQuery } from '@tanstack/react-query';
import { ErrorState, LoadingState } from '../components/ui/StateViews';
import { getHistory } from '../services/copilot/brokerCopilotClient';

function historyStatusTone(status: HistoryResponse['runs'][number]['status']): 'success' | 'danger' | 'ai' {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'danger';
  return 'ai';
}

function historyStatusLabel(status: HistoryResponse['runs'][number]['status']): string {
  const labels: Record<HistoryResponse['runs'][number]['status'], string> = {
    completed: '완료',
    failed: '실패',
    running: '실행 중'
  };
  return labels[status];
}

export function HistoryPage() {
  const historyQuery = useQuery({ queryKey: ['history'], queryFn: getHistory });
  return (
    <div className="page">
      <section className="support-panel">
        <h1>기록</h1>
        <p className="muted">이전에 나눈 질문과 답변, 참고한 항목, 확인한 작업을 다시 볼 수 있습니다.</p>
        {historyQuery.isLoading ? <LoadingState /> : null}
        {historyQuery.error ? <ErrorState message={historyQuery.error.message} /> : null}
        {historyQuery.data && historyQuery.data.runs.length === 0 ? <div className="empty" role="status">저장된 Atlassian 코파일럿 실행 기록이 없습니다.</div> : null}
        <div className="support-list">
          {historyQuery.data?.runs.map((run) => (
            <div className="tool-row" key={run.runId}>
              <div><strong>{run.title}</strong><p>{run.createdAt} · 도구 {run.toolCount}개 · 승인 대기 {run.pendingApprovalCount}건</p></div>
              <span className={`badge ${historyStatusTone(run.status)}`}>{historyStatusLabel(run.status)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
