import type { ActionReviewRequest, ActionReviewStatus, AtlassianSource, Confidence, ToolActionPlan, ToolName } from './domain.js';

export type CopilotSseEvent =
  | { type: 'run.created'; runId: string; createdAt: string }
  | { type: 'tool_plan.created'; actions: ToolActionPlan[] }
  | { type: 'tool.started'; actionId: string; tool: ToolName }
  | { type: 'tool.completed'; actionId: string; tool: ToolName; resultSummary: string }
  | { type: 'tool.failed'; actionId: string; tool: ToolName; error: string }
  | { type: 'evidence.found'; sources: AtlassianSource[] }
  | { type: 'llm.started'; messageId: string }
  | { type: 'llm.delta'; messageId: string; text: string }
  | { type: 'llm.completed'; messageId: string; confidence: Confidence; citationSourceIds: string[]; reviewRequired: boolean }
  | { type: 'llm.failed'; messageId: string; error: string }
  | { type: 'action_review.required'; action: ActionReviewRequest }
  | { type: 'action_review.resolved'; actionId: string; status: Exclude<ActionReviewStatus, 'none' | 'pending'>; message: string }
  | { type: 'report_draft.started'; draftId: string; title: string }
  | { type: 'report_draft.delta'; draftId: string; text: string }
  | { type: 'report_draft.completed'; draftId: string }
  | { type: 'run.completed'; runId: string }
  | { type: 'run.failed'; runId: string; error: string };

export type CopilotSseEventType = CopilotSseEvent['type'];
