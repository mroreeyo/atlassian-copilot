# FRONTEND_ARCHITECTURE.md

## 1. Architecture Goal

Build a secure, dark-first, chat-first frontend that demonstrates AI UX and enterprise workflow design.

The frontend must be independent from real MCP/OpenAI availability during P0, but the contracts must support real integrations in P1/P1.5.

## 2. Monorepo Structure

```txt
apps/
├─ web/
│  ├─ src/
│  │  ├─ app/
│  │  ├─ pages/
│  │  │  ├─ CopilotPage.tsx
│  │  │  ├─ HistoryPage.tsx
│  │  │  └─ SettingsPage.tsx
│  │  ├─ features/
│  │  │  ├─ copilot/
│  │  │  ├─ evidence/
│  │  │  ├─ action-review/
│  │  │  ├─ reports/
│  │  │  └─ history/
│  │  ├─ components/
│  │  │  ├─ layout/
│  │  │  ├─ ui/
│  │  │  └─ design-system/
│  │  ├─ services/
│  │  │  └─ copilot/
│  │  ├─ stores/
│  │  ├─ types/
│  │  └─ test/
│  └─ package.json
│
└─ broker/
   ├─ src/
   │  ├─ routes/
   │  ├─ services/
   │  │  ├─ mcp/
   │  │  ├─ llm/
   │  │  ├─ openai/
   │  │  ├─ settings/
   │  │  └─ audit/
   │  ├─ security/
   │  └─ schemas/
   └─ package.json
```

## 3. Stack

Frontend:

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- Zustand
- Zod
- Tailwind CSS
- hand-rolled or shadcn-style primitives
- Broker HTTP/SSE client for runtime data
- local mock adapters in tests; MSW is optional/future and not currently installed
- Vitest + Testing Library
- Playwright smoke tests are optional/future and not currently installed

Broker:

- Node.js
- Fastify
- Zod
- native `fetch` for optional Broker-side OpenAI Responses streaming; OpenAI SDK is not currently installed
- native `fetch` for optional Broker-side Anthropic Messages calls; Anthropic SDK is not currently installed
- Broker read-only Atlassian adapter is server-only; generic demo prompts may still use fictional evidence
- SSE endpoints

## 4. State Strategy

### TanStack Query

Use for server state:

- copilot run creation
- run history
- settings status
- action approval/cancel
- audit log fetch

### Zustand

Use for UI state:

- context panel open/closed
- selected evidence
- current report draft
- composer content
- active run UI state
- action review drawer state

## 5. Streaming Event Model

Broker emits SSE events:

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
action_review.resolved
report_draft.started
report_draft.delta
report_draft.completed
run.completed
run.failed
```

Frontend renders those events into a single assistant message. Action approval/cancel HTTP responses are converted into the same canonical `action_review.resolved` event shape before updating run state, so Action Review lifecycle state remains run-scoped rather than local to a card.

## 6. API Boundary

Frontend only calls Broker:

- `POST /api/copilot/runs`
- `GET /api/copilot/runs/:id/stream`
- `POST /api/copilot/actions/:id/approve`
- `POST /api/copilot/actions/:id/cancel`
- `GET /api/history`
- `GET /api/settings/status`
- `POST /api/settings/atlassian`
- `DELETE /api/settings/atlassian`
- `POST /api/settings/llm`
- `POST /api/settings/llm/test`
- `DELETE /api/settings/llm`

Frontend never calls:

- OpenAI directly
- Anthropic/Claude directly
- Jira directly
- Confluence directly
- MCP server directly

## 7. P0 Mock Mode

Use Broker-provided fictional data through a run-orchestration seam and local test adapters for:

- streaming events
- Jira source results
- Confluence source results
- action review requests
- report drafts
- settings status

Mock mode must still use the same contract as real mode.

## 8. P1 Real MCP Read-only

Broker exposes only read endpoints for Atlassian evidence. Credentials stay server-side, and browser code only consumes canonical Broker HTTP/SSE contracts.

Required actual tools:

- `jira_search`
- `jira_get_issue`
- `confluence_search`
- `confluence_get_page`

## 9. P1 LLM Provider Streaming

Broker may call OpenAI, Claude, or OpenRouter via server-side `fetch` when a personal `/settings` provider is saved and enabled, or when explicitly enabled Broker environment fallback is present. The assigned-issues flow can provide real Broker-side Jira evidence; generic demo prompts may still use fictional portfolio evidence.

Frontend should know only the provider-neutral settings/status contract. It must not import provider SDKs, call provider endpoints, or expose provider secret env names.

## 10. P2 Sandbox Write

Write operations are allowed only in sandbox project/space and only after Action Review.

## 11. Dark UI Acceptance

Architecture should support `defaultTheme = dark` from the start.

Do not implement light-first CSS and then patch dark mode later.
