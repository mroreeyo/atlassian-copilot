import type { ActionReviewStatus, Confidence, ReportDraft, ToolRisk, ToolStatus } from '@akc/shared';

export function confidenceLabel(confidence: Confidence): string {
  const labels: Record<Confidence, string> = {
    high: '신뢰도 높음',
    medium: '신뢰도 보통',
    low: '신뢰도 낮음'
  };
  return labels[confidence];
}

export function toolRiskLabel(risk: ToolRisk): string {
  const labels: Record<ToolRisk, string> = {
    read: '읽기',
    write: '쓰기',
    destructive: '삭제 위험'
  };
  return labels[risk];
}

export function toolStatusLabel(status: ToolStatus): string {
  const labels: Record<ToolStatus, string> = {
    planned: '계획됨',
    running: '실행 중',
    completed: '완료',
    failed: '실패'
  };
  return labels[status];
}

export function actionReviewStatusLabel(status: ActionReviewStatus): string {
  const labels: Record<ActionReviewStatus, string> = {
    none: '없음',
    pending: '승인 대기',
    mock_recorded: '승인 기록됨',
    executed: '실행됨',
    blocked: '차단됨',
    cancelled: '취소됨'
  };
  return labels[status];
}

export function reportDraftStatusLabel(status: ReportDraft['status']): string {
  const labels: Record<ReportDraft['status'], string> = {
    idle: '대기',
    streaming: '작성 중',
    completed: '완료'
  };
  return labels[status];
}
