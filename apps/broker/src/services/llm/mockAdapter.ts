import type { CopilotSseEvent } from '@akc/shared';
import type { GroundedSummaryInput, LlmSummaryEvent, LlmTestResult } from './types.js';

export async function* streamMockSummary(input: GroundedSummaryInput = { question: '', sources: [] }): AsyncGenerator<LlmSummaryEvent> {
  const messageId = input.messageId ?? 'msg_001';
  const sourceIds = input.sources.map((source) => source.id);
  yield { type: 'llm.started', messageId };
  if (input.sources.length === 0) {
    yield { type: 'llm.delta', messageId, text: noDataSummary(input.question) };
    yield { type: 'llm.completed', messageId, confidence: 'low', citationSourceIds: [], reviewRequired: false };
    return;
  }
  yield { type: 'llm.delta', messageId, text: `Atlassian 항목 ${input.sources.length}개를 확인했습니다. ` };
  yield { type: 'llm.delta', messageId, text: input.sources.slice(0, 5).map((source) => `${source.id}: ${source.title}`).join(' · ') };
  yield { type: 'llm.completed', messageId, confidence: 'medium', citationSourceIds: sourceIds, reviewRequired: false };
}

export async function testMockConnection(): Promise<LlmTestResult> {
  return { ok: true, message: '외부 LLM 자격 증명 없이 로컬 요약 폴백을 사용할 수 있습니다.' };
}

export function isLlmEvent(event: CopilotSseEvent): event is LlmSummaryEvent {
  return event.type === 'llm.started' || event.type === 'llm.delta' || event.type === 'llm.completed' || event.type === 'llm.failed';
}

function noDataSummary(question: string): string {
  if (/(할당|assigned|assignee|이슈|issue)/i.test(question)) {
    return '조회된 Jira 이슈가 없습니다.';
  }
  return '조회된 데이터가 없습니다. Jira/Confluence 연결 상태 또는 검색 조건을 확인해 주세요.';
}
