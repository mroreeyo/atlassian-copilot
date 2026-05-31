export function EmptyState() {
  return <div className="empty" role="status">업무 질문을 입력하면 관련 이슈와 문서를 찾아 답변합니다.</div>;
}

export function LoadingState({ variant = 'inline' }: { variant?: 'inline' | 'chat' }) {
  if (variant === 'chat') {
    return (
      <div className="message assistant waiting-bubble" role="status" aria-live="polite" aria-label="응답 대기">
        <span className="spinner" aria-hidden="true" />
        <span>응답 생성 중</span>
      </div>
    );
  }

  return <span className="badge ai" role="status" aria-live="polite">응답 생성 중</span>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="card" role="alert"><span className="badge danger">실패</span><p>{message}</p></div>;
}
