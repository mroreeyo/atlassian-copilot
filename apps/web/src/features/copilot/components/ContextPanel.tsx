import type { CopilotRunView } from '@akc/shared';

export function ContextPanel({ id, runView }: { id: string; runView: CopilotRunView }) {
  return (
    <aside id={id} className="context-panel" aria-label="상세 정보 패널">
      <h2>상세 정보</h2>
      <p className="muted">현재 답변에서 참고한 항목과 확인이 필요한 작업을 보여줍니다.</p>
      <div className="support-list">
        <div><span className="badge ai">참고</span><p>참고한 항목 {runView.sources.length}개</p></div>
        <div><span className="badge warning">검토 필요</span><p>댓글이나 변경 요청은 내용을 확인한 뒤 진행합니다.</p></div>
      </div>
    </aside>
  );
}
