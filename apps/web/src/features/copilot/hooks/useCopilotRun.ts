import { useMutation } from '@tanstack/react-query';
import { initialCopilotRunView, reduceCopilotEvent, type ChatMessage, type CopilotSseEvent, type RunMode } from '@akc/shared';
import { createCopilotRun, streamCopilotEvents } from '../../../services/copilot/brokerCopilotClient';
import { useCopilotSessionStore } from '../stores/copilotSessionStore';

type ActionReviewResolvedEvent = Extract<CopilotSseEvent, { type: 'action_review.resolved' }>;

export function useCopilotRun() {
  const messages = useCopilotSessionStore((state) => state.messages);
  const setMessages = useCopilotSessionStore((state) => state.setMessages);
  const runViewsByMessageId = useCopilotSessionStore((state) => state.runViewsByMessageId);
  const setRunViewsByMessageId = useCopilotSessionStore((state) => state.setRunViewsByMessageId);
  const activeAssistantMessageId = useCopilotSessionStore((state) => state.activeAssistantMessageId);
  const setActiveAssistantMessageId = useCopilotSessionStore((state) => state.setActiveAssistantMessageId);
  const isStreaming = useCopilotSessionStore((state) => state.isStreaming);
  const setIsStreaming = useCopilotSessionStore((state) => state.setIsStreaming);
  const createRun = useMutation({ mutationFn: createCopilotRun });

  function applyEventToMessage(messageId: string, event: CopilotSseEvent) {
    setRunViewsByMessageId((current) => ({
      ...current,
      [messageId]: reduceCopilotEvent(current[messageId] ?? initialCopilotRunView, event)
    }));
  }

  async function submitPrompt(prompt: string, modeOverride?: RunMode) {
    const content = prompt.trim();
    if (!content) return;
    const now = new Date().toISOString();
    const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const userMessage: ChatMessage = { id: `user_${nonce}`, role: 'user', content, createdAt: now };
    const assistantMessage: ChatMessage = { id: `assistant_${nonce}`, role: 'assistant', content: '응답 생성 중', createdAt: now };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setRunViewsByMessageId((current) => ({ ...current, [assistantMessage.id]: initialCopilotRunView }));
    setActiveAssistantMessageId(assistantMessage.id);
    setIsStreaming(true);
    try {
      const run = await createRun.mutateAsync({ message: content, mode: modeOverride ?? inferRunMode(content) });
      for await (const event of streamCopilotEvents(run.streamUrl)) applyEventToMessage(assistantMessage.id, event);
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 응답 스트림 오류';
      setRunViewsByMessageId((current) => ({
        ...current,
        [assistantMessage.id]: { ...(current[assistantMessage.id] ?? initialCopilotRunView), status: 'failed', error: message }
      }));
    } finally {
      setIsStreaming(false);
    }
  }

  function resolveActionReview(messageId: string, event: ActionReviewResolvedEvent) {
    applyEventToMessage(messageId, event);
  }

  const activeRunView = activeAssistantMessageId ? runViewsByMessageId[activeAssistantMessageId] ?? initialCopilotRunView : initialCopilotRunView;
  return { messages, runViewsByMessageId, activeRunView, isStreaming, submitPrompt, resolveActionReview };
}

function inferRunMode(prompt: string): RunMode {
  return /(댓글|comment|코멘트|작성|생성|수정|업데이트|변경|추가|남겨|달아|전환|이동|처리|create|update|edit|change|add|post|transition|move|set)/i.test(prompt)
    ? 'sandbox-write'
    : 'readonly';
}
