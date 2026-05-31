import { CopilotSseEventSchema, type CopilotSseEvent, type RunCreateRequest, type RunCreateResponse } from '@akc/shared';

export async function createLocalMockCopilotRun(request: RunCreateRequest): Promise<RunCreateResponse> {
  if (!request.message.trim()) throw new Error('프롬프트를 입력해 주세요.');
  const runId = `run_${Date.now().toString(36)}`;
  return { runId, streamUrl: `/api/copilot/runs/${runId}/stream` };
}

export async function* streamLocalMockCopilotEvents(runId: string, delayMs = 0): AsyncGenerator<CopilotSseEvent> {
  const events: CopilotSseEvent[] = [
    { type: 'run.created', runId, createdAt: new Date().toISOString() },
    { type: 'llm.started', messageId: 'msg_local_001' },
    { type: 'llm.delta', messageId: 'msg_local_001', text: '조회된 데이터가 없습니다. 연결 상태 또는 검색 조건을 확인해 주세요.' },
    { type: 'llm.completed', messageId: 'msg_local_001', confidence: 'low', citationSourceIds: [], reviewRequired: false },
    { type: 'run.completed', runId }
  ];
  for (const event of events) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    yield CopilotSseEventSchema.parse(event);
  }
}

export async function approveLocalMockAction(actionId: string): Promise<{ actionId: string; status: 'mock_recorded'; executed: false; message: string }> {
  return {
    actionId,
    status: 'mock_recorded',
    executed: false,
    message: '읽기 전용 검토만 기록했습니다. Jira 또는 Confluence 쓰기는 실행되지 않았습니다.'
  };
}
