import type { ChatMessage as ChatMessageModel, CopilotRunView, CopilotSseEvent } from '@akc/shared';
import { ToolExecutionAccordion } from './ToolExecutionAccordion';
import { AISummaryCard } from './AISummaryCard';
import { ActionReviewCard } from './ActionReviewCard';
import { MarkdownContent } from './MarkdownContent';

type ActionReviewResolvedEvent = Extract<CopilotSseEvent, { type: 'action_review.resolved' }>;

export function ChatMessage({
  message,
  runView,
  onActionReviewResolved
}: {
  message: ChatMessageModel;
  runView?: CopilotRunView;
  onActionReviewResolved?: (messageId: string, event: ActionReviewResolvedEvent) => void;
}) {
  const isAssistant = message.role === 'assistant';
  const showMessageContent = !isAssistant || !runView?.summaryText;
  const isWaitingForResponse = isAssistant && !runView?.summaryText && !runView?.error && message.content === '응답 생성 중';
  const hasRunCards = Boolean(runView && (runView.error || runView.summaryText || runView.actionReview || runView.toolPlan.length > 0 || runView.reportDraft));
  return (
    <article className={`message ${message.role}${hasRunCards ? ' with-run' : ''}`}>
      <div className="message-header">
        <span>{isAssistant ? 'Atlassian 코파일럿' : '사용자'}</span>
        <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString('ko-KR')}</time>
      </div>
      {showMessageContent ? (
        <div
          className={isWaitingForResponse ? 'message-content waiting-content' : 'message-content'}
          role={isWaitingForResponse ? 'status' : undefined}
          aria-live={isWaitingForResponse ? 'polite' : undefined}
          aria-label={isWaitingForResponse ? '응답 대기' : undefined}
        >
          {isWaitingForResponse ? (
            <>
              <span className="spinner" aria-hidden="true" />
              <span>{message.content}</span>
            </>
          ) : isAssistant ? <MarkdownContent content={message.content} /> : message.content}
        </div>
      ) : null}
      {isAssistant && runView ? (
        <div className="card-stack">
          {runView.error ? <RunErrorCard error={runView.error} /> : null}
          {runView.summaryText ? <AISummaryCard runView={runView} /> : null}
          {runView.actionReview ? <ActionReviewCard action={runView.actionReview} status={runView.actionReviewStatus} message={runView.actionReviewMessage} onResolved={(event) => onActionReviewResolved?.(message.id, event)} /> : null}
          <ToolExecutionAccordion runView={runView} />
        </div>
      ) : null}
    </article>
  );
}

function RunErrorCard({ error }: { error: string }) {
  return (
    <div className="card run-error-card" role="alert" aria-label="실행 실패">
      <div className="message-header">
        <h3>실행 실패</h3>
        <span className="badge danger">실패</span>
      </div>
      <p className="error-text">{error}</p>
    </div>
  );
}
