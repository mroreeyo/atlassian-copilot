import type { ActionReviewRequest, ActionReviewStatus, AtlassianSource, Confidence, ReportDraft, ToolActionPlan, ToolExecutionEvent } from '../contracts/domain.js';
import type { CopilotSseEvent } from '../contracts/events.js';

export interface CopilotRunView {
  runId: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed';
  toolPlan: ToolActionPlan[];
  toolEvents: Record<string, ToolExecutionEvent>;
  sources: AtlassianSource[];
  summaryText: string;
  confidence: Confidence | null;
  citationSourceIds: string[];
  actionReview: ActionReviewRequest | null;
  actionReviewStatus: ActionReviewStatus;
  actionReviewMessage: string | null;
  reportDraft: ReportDraft | null;
  error: string | null;
}

export const initialCopilotRunView: CopilotRunView = {
  runId: null,
  status: 'idle',
  toolPlan: [],
  toolEvents: {},
  sources: [],
  summaryText: '',
  confidence: null,
  citationSourceIds: [],
  actionReview: null,
  actionReviewStatus: 'none',
  actionReviewMessage: null,
  reportDraft: null,
  error: null
};

export function reduceCopilotEvent(state: CopilotRunView, event: CopilotSseEvent): CopilotRunView {
  switch (event.type) {
    case 'run.created':
      return { ...state, runId: event.runId, status: 'running', error: null };
    case 'tool_plan.created':
      return { ...state, toolPlan: event.actions };
    case 'tool.started':
      return {
        ...state,
        toolEvents: {
          ...state.toolEvents,
          [event.actionId]: { actionId: event.actionId, tool: event.tool, status: 'running' }
        }
      };
    case 'tool.completed':
      return {
        ...state,
        toolEvents: {
          ...state.toolEvents,
          [event.actionId]: { actionId: event.actionId, tool: event.tool, status: 'completed', resultSummary: event.resultSummary }
        }
      };
    case 'tool.failed':
      return {
        ...state,
        toolEvents: {
          ...state.toolEvents,
          [event.actionId]: { actionId: event.actionId, tool: event.tool, status: 'failed', error: event.error }
        }
      };
    case 'evidence.found':
      return { ...state, sources: mergeSources(state.sources, event.sources) };
    case 'llm.started':
      return { ...state, summaryText: '' };
    case 'llm.delta':
      return { ...state, summaryText: `${state.summaryText}${event.text}` };
    case 'llm.completed':
      return { ...state, confidence: event.confidence, citationSourceIds: event.citationSourceIds };
    case 'llm.failed':
      return { ...state, error: event.error };
    case 'action_review.required':
      return { ...state, actionReview: event.action, actionReviewStatus: 'pending', actionReviewMessage: '아직 실행하지 않았습니다. 내용을 확인한 뒤 승인하면 요청한 작업만 진행합니다.' };
    case 'action_review.resolved':
      return state.actionReview?.id === event.actionId ? { ...state, actionReviewStatus: event.status, actionReviewMessage: event.message } : state;
    case 'report_draft.started':
      return { ...state, reportDraft: { draftId: event.draftId, title: event.title, content: '', status: 'streaming' } };
    case 'report_draft.delta':
      return {
        ...state,
        reportDraft: state.reportDraft
          ? { ...state.reportDraft, content: `${state.reportDraft.content}${event.text}` }
          : { draftId: event.draftId, title: '보고서', content: event.text, status: 'streaming' }
      };
    case 'report_draft.completed':
      return state.reportDraft ? { ...state, reportDraft: { ...state.reportDraft, status: 'completed' } } : state;
    case 'run.completed':
      return state.error ? { ...state, runId: event.runId, status: 'failed' } : { ...state, runId: event.runId, status: 'completed' };
    case 'run.failed':
      return { ...state, runId: event.runId, status: 'failed', error: event.error };
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

function mergeSources(existing: AtlassianSource[], incoming: AtlassianSource[]): AtlassianSource[] {
  const byId = new Map(existing.map((source) => [source.id, source]));
  for (const source of incoming) byId.set(source.id, source);
  return [...byId.values()];
}
