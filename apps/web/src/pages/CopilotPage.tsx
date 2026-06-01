import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChatComposer } from '../features/copilot/components/ChatComposer';
import { ChatMessage } from '../features/copilot/components/ChatMessage';
import { ContextPanel } from '../features/copilot/components/ContextPanel';
import { MiniInsightBar } from '../features/copilot/components/MiniInsightBar';
import { SuggestedQuestions } from '../features/copilot/components/SuggestedQuestions';
import { useCopilotRun } from '../features/copilot/hooks/useCopilotRun';
import { EmptyState, ErrorState } from '../components/ui/StateViews';
import { getCopilotSuggestions, getSettingsStatus } from '../services/copilot/brokerCopilotClient';
import { useUiStore } from '../stores/uiStore';

const contextPanelId = 'copilot-context-panel';

export function CopilotPage() {
  const { messages, runViewsByMessageId, activeRunView, isStreaming, submitPrompt, resolveActionReview } = useCopilotRun();
  const { contextPanelOpen, toggleContextPanel, demoMode, setDemoMode, toggleDemoMode } = useUiStore();
  const suggestionsQuery = useQuery({ queryKey: ['copilot-suggestions'], queryFn: getCopilotSuggestions, staleTime: 5 * 60 * 1000 });
  const settingsQuery = useQuery({ queryKey: ['settings-status'], queryFn: getSettingsStatus, staleTime: 60 * 1000 });
  const suggestions = suggestionsQuery.data?.suggestions ?? [];
  const settings = settingsQuery.data;
  const demoRecommended = Boolean(settings && (!settings.atlassian.configured || !settings.llm.configured || settings.llm.provider === 'mock'));
  const demoPrompt = '나에게 할당된 JIRA 이슈를 조회해줘.';
  const demoRunCompleted = activeRunView.status === 'completed' && activeRunView.sources.some((source) => source.origin === 'demo');
  const showDemoGuidance = demoRecommended || demoMode || demoRunCompleted;
  const submitWithMode = (prompt: string) => void submitPrompt(prompt, demoMode ? 'mock' : undefined);
  const startDemoRun = () => {
    setDemoMode(true);
    void submitPrompt(demoPrompt, 'mock');
  };
  return (
    <div className="page">
      <div className={contextPanelOpen ? 'copilot-grid' : 'copilot-grid collapsed'}>
        <section className="chat-column" aria-label="Atlassian 코파일럿 채팅">
          <div className="message-header page-heading">
            <div><h1>Atlassian 코파일럿</h1><p className="muted">업무 이슈와 문서를 찾아 답변하고, 댓글이나 변경 요청은 실행 전에 먼저 확인합니다.</p></div>
            <button className="btn subtle" onClick={toggleContextPanel} aria-expanded={contextPanelOpen} aria-controls={contextPanelId}>{contextPanelOpen ? '상세 정보 숨기기' : '상세 정보 보기'}</button>
          </div>
          <MiniInsightBar />
          {showDemoGuidance ? (
            <section className={demoMode ? 'demo-mode-panel active' : 'demo-mode-panel'} aria-label="시연 모드">
              <div className="demo-mode-copy">
                <strong>{demoRunCompleted ? '시연 답변을 확인했습니다' : demoMode ? '시연 모드가 켜져 있습니다' : '설정 없이 먼저 시연해 볼 수 있습니다'}</strong>
                <p className="muted">실제 계정 연결 없이 가상의 Jira 이슈와 Confluence 문서로 답변 흐름을 보여줍니다. 브라우저에 개인 키를 저장하지 않고 실제 데이터와 분리됩니다.</p>
                {demoRunCompleted ? (
                  <p className="demo-setup-next">다음 단계로 설정에서 실제 Atlassian 연결과 답변 제공자를 저장한 뒤 같은 질문을 실제 업무 자료로 다시 실행해 보세요.</p>
                ) : null}
              </div>
              <div className="demo-mode-actions">
                <button className={demoMode ? 'btn primary' : 'btn subtle'} type="button" onClick={toggleDemoMode} aria-pressed={demoMode}>
                  {demoMode ? '시연 모드 끄기' : '시연 모드 켜기'}
                </button>
                <button className="btn subtle" type="button" disabled={isStreaming} onClick={startDemoRun}>
                  {demoRunCompleted ? '시연 다시 실행' : '1분 시연 시작'}
                </button>
                <Link className={demoRunCompleted ? 'btn primary' : 'btn subtle'} to="/settings">실제 연결 설정하기</Link>
              </div>
            </section>
          ) : null}
          <div className="chat-list">
            {messages.length === 0 ? <EmptyState /> : null}
            {messages.map((message) => {
              if (message.role !== 'assistant') return <ChatMessage key={message.id} message={message} />;
              const runView = runViewsByMessageId[message.id];
              return runView
                ? <ChatMessage key={message.id} message={message} runView={runView} onActionReviewResolved={resolveActionReview} />
                : <ChatMessage key={message.id} message={message} />;
            })}
            {activeRunView.error ? <ErrorState message={activeRunView.error} /> : null}
          </div>
          <div className="composer-stick-zone">
            <ChatComposer onSubmit={submitWithMode} disabled={isStreaming} />
          </div>
          <div className="composer-footer">
            <span className="muted composer-hint">Enter로 보내기 · Shift+Enter로 줄바꿈 · 개인 키는 브라우저에 저장되지 않습니다.{demoMode ? ' · 시연 모드는 가상 자료만 사용합니다.' : ''}</span>
            <SuggestedQuestions suggestions={suggestions} disabled={isStreaming} onSelect={submitWithMode} />
          </div>
        </section>
        {contextPanelOpen ? <ContextPanel id={contextPanelId} runView={activeRunView} /> : null}
      </div>
    </div>
  );
}
