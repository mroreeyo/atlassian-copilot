# IMPLEMENTATION_ANALYSIS.md — Drift-resistant Full Replan

Date: 2026-05-29
Source: `.omx/specs/deep-interview-plan-improvement-review.md`

## 1. Implementation thesis

Atlassian Copilot must be implemented as a **dark-first, chat-first Copilot** rather than a dashboard. The main failure mode identified by deep interview is **overbuild / dashboard drift**. The implementation therefore optimizes for one complete Copilot mock flow before expanding real integrations or support surfaces.

## 2. Route freeze

P0 routes are frozen to:

- `/copilot`
- `/history`
- `/settings`

P0 explicitly rejects standalone Dashboard, Search, Report, Review, and Audit pages. History and Settings are quiet support pages, not analytics dashboards.

## 3. Fixed P0 component inventory

P0 visual surfaces are capped to this inventory:

- `AppShell`
- `Sidebar`
- `ContextPanel`
- `MiniInsightBar`
- `ChatMessage`
- `ChatComposer`
- `CompactToolPlanCard`
- `ProgressStrip`
- `AISummaryCard`
- `EvidenceCard`
- `ActionReviewCard`
- `ReportDraftCard`
- `FeedbackControls`
- `EmptyState`
- `LoadingState`
- `ErrorState`

Any new visual surface requires explicit confirmation or a later phase.

## 4. Canonical SSE contract

The canonical event union is the superset from `docs/FRONTEND_ARCHITECTURE.md`, with `llm.failed` added to the contract for symmetry:

```txt
run.created
tool_plan.created
tool.started
tool.completed
tool.failed
evidence.found
llm.started
llm.delta
llm.completed
llm.failed
action_review.required
report_draft.started
report_draft.delta
report_draft.completed
run.completed
run.failed
```

Shared Zod schemas in `packages/shared` are the source of truth for Broker and frontend once implementation begins. Mock and real modes must use the same schemas.

## 5. Write boundary semantics

- P0/P1 approvals are **draft/mock approval records only**.
- P0/P1 must not execute real Jira/Confluence writes.
- P2 sandbox writes, if enabled later, require explicit Action Review approval and allowlisted sandbox targets.
- Destructive actions remain blocked in portfolio mode.
- OpenAI output cannot grant execution permission.

## 6. Stack defaults

- Package manager/workspaces: npm workspaces
- Web: Vite + React + TypeScript + React Router
- Server state: TanStack Query
- UI state: Zustand only
- Styling: CSS variables + Tailwind-compatible token concepts implemented in CSS
- Tests: Vitest + Testing Library + jsdom
- Broker: Fastify + TypeScript
- Contracts: Zod in `packages/shared`
- P0 mock: local mock stream adapter plus Broker mock stream endpoint

## 7. Drift-resistant phase order

1. Product guardrails and canonical contracts
2. Executable monorepo scaffold
3. Shared contracts, mock Broker, and safety gates
4. Dark-first chat UI and P0 demo flow
5. Broker MCP/OpenAI adapters and runbooks
6. Portfolio hardening and final evidence
7. Final cleanup and independent review

## 8. Per-phase UI drift gate

Every UI-affecting phase must pass this checklist:

- No new P0 routes beyond `/copilot`, `/history`, `/settings`
- Cards remain inside the chat response
- Context panel remains optional and secondary
- Dark slate/neutral surfaces are dominant
- Blue is only subtle AI/progress/link accent
- Amber is only approval/write state
- Green is only success/completed state
- Red is only failed/destructive state
- Violet is not used as a full-card background
- Each card generally uses no more than two badges

## 9. Security gate

Automated checks must fail if frontend source includes:

- `VITE_OPENAI_API_KEY`
- `VITE_CHATGPT_API_KEY`
- `VITE_ATLASSIAN_TOKEN`
- `VITE_MCP_SERVER_URL`
- `ATLASSIAN_API_TOKEN`
- direct imports/usages of OpenAI SDKs, MCP clients, Jira clients, Confluence clients, or Atlassian clients

Broker-only access is non-negotiable.

## 10. P0 success metric

P0 is complete when one route-limited mock Copilot flow works:

1. User submits a prompt on `/copilot`.
2. Assistant shows Compact Tool Plan inside chat.
3. Progress Strip updates from tool events.
4. Evidence Card appears with fictional Jira/Confluence sources.
5. AI Summary streams into an in-chat card.
6. Report Draft streams/appears inside chat.
7. Action Review Card appears for a write draft, but approval is mock-only.
8. `/history` and `/settings` exist as quiet support pages.

## 11. Real integration gates

Real MCP and OpenAI work may begin only after the mock UI passes the chat-first/dark-first acceptance review. Real MCP must use personal Atlassian sandbox data that is fictional/demo-only.
