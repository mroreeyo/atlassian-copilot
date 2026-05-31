import { useEffect, useState } from 'react';
import type { ActionReviewRequest, ActionReviewStatus, CopilotSseEvent } from '@akc/shared';
import { approveAction, cancelAction } from '../../../services/copilot/brokerCopilotClient';
import { actionReviewStatusLabel } from '../labels';

type ActionReviewResolvedEvent = Extract<CopilotSseEvent, { type: 'action_review.resolved' }>;

export function ActionReviewCard({
  action,
  status,
  message,
  onResolved
}: {
  action: ActionReviewRequest;
  status: ActionReviewStatus;
  message: string | null;
  onResolved: (event: ActionReviewResolvedEvent) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const [draftPreview, setDraftPreview] = useState<Record<string, string>>(() => ({ ...action.inputPreview }));
  const [error, setError] = useState<string | null>(null);
  const canonicalStatus = status === 'none' ? 'pending' : status;
  const displayMessage = error ? '작업 승인을 처리하지 못했습니다. 아무 작업도 실행되지 않았으며 다시 시도하거나 취소할 수 있습니다.' : message ?? '아직 실행하지 않았습니다. 내용을 확인한 뒤 승인하면 요청한 작업만 진행합니다.';

  useEffect(() => {
    setDraftPreview({ ...action.inputPreview });
    setIsEditingPreview(false);
    setError(null);
  }, [action.id, action.inputPreview]);

  async function approve() {
    await submit(async () => {
      const response = await approveAction(action.id, draftPreview);
      onResolved({ type: 'action_review.resolved', actionId: response.actionId, status: response.status, message: response.message });
    });
  }

  async function cancel() {
    await submit(async () => {
      const response = await cancelAction(action.id, '사용자가 작업 검토에서 취소했습니다.');
      onResolved({ type: 'action_review.resolved', actionId: response.actionId, status: response.status, message: response.reason });
    });
  }

  async function submit(operation: () => Promise<void>) {
    setIsSubmitting(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '작업 검토 요청에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const statusTone = canonicalStatus === 'executed' || canonicalStatus === 'mock_recorded' ? 'success' : canonicalStatus === 'cancelled' || canonicalStatus === 'blocked' || error ? 'danger' : 'warning';
  const disabled = canonicalStatus !== 'pending' || isSubmitting;
  return (
    <section className="card action-review" aria-label="작업 검토">
      <div className="message-header"><h3>작업 검토</h3><div className="badges"><span className="badge warning">승인 필요</span></div></div>
      <p className="muted">{displayMessage}</p>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      {isEditingPreview ? (
        <div className="edit-preview-list">
          {Object.entries(draftPreview).map(([key, value]) => (
            <label key={key} className="edit-preview">
              <span>수정 가능한 승인 내용 · {previewFieldLabel(key)}</span>
              <textarea
                value={value}
                onChange={(event) => setDraftPreview((current) => ({ ...current, [key]: event.target.value }))}
                disabled={disabled}
              />
            </label>
          ))}
        </div>
      ) : (
        <div className="action-preview">
          {Object.entries(draftPreview).map(([key, value]) => (
            <div key={key}>
              <strong>{previewFieldLabel(key)}</strong>
              <p>{value}</p>
            </div>
          ))}
        </div>
      )}
      <div className="actions">
        <button className="btn subtle" onClick={() => setIsEditingPreview((current) => !current)} disabled={canonicalStatus !== 'pending' || isSubmitting}>{isEditingPreview ? '수정 완료' : '내용 수정'}</button>
        <button className="btn warning" onClick={() => void approve()} disabled={disabled}>{isSubmitting ? '실행 중…' : '승인하고 실행'}</button>
        <button className="btn subtle" onClick={() => void cancel()} disabled={disabled}>취소</button>
        <span className={`badge ${statusTone}`}>{isSubmitting ? '기록 중' : actionReviewStatusLabel(canonicalStatus)}</span>
      </div>
    </section>
  );
}

function previewFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    comment: '댓글',
    title: '제목',
    body: '본문',
    request: '원 요청',
    status: '상태',
    transition: '전환'
  };
  return labels[key] ?? key;
}
