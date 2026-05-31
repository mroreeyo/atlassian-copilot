# PROJECT_PLAN.md — Dark-first Chat-first v5

## 1. Goal

Build **AX Knowledge Copilot**, a dark-first, chat-first enterprise Copilot that uses Jira/Confluence through `mcp-atlassian` and OpenAI through a secure Broker API.

The project must demonstrate frontend and AI UX capabilities aligned with an AX frontend / AI UX role:

- LLM chat UI
- SSE streaming
- Jira/Confluence knowledge search
- MCP tool-use UX
- Agent execution state visualization
- Source citation
- Action review before write operations
- Dark-first design system
- Secure frontend/backend boundary
- CI/CD and Git flow

## 2. Why this project exists

Jira and Confluence already store and search work data. The project does not exist to replace them.

The project exists because users spend time:

- deciding what to search
- writing or remembering JQL/CQL
- reading multiple issues, comments, and pages
- connecting Jira issues with Confluence documents
- summarizing work context
- preparing comments, reports, and follow-up actions
- checking whether an AI-generated change is safe to execute

AX Knowledge Copilot moves the user from scattered work records to a reviewable next action.

## 3. Product Positioning

> Jira/Confluence 업무 데이터를 자연어로 검색·요약하고, 조치 댓글·보고서 초안·상태 전환 같은 후속 작업을 실행 전 검토 가능한 카드로 제공하는 Dark-first Chat-first AX Copilot.

## 4. User-facing Experience

The UI must be simple.

```txt
Sidebar
  - New Chat
  - Recent Chats
  - History
  - Settings

Main Chat
  - User request
  - Assistant response
  - Compact Tool Plan Card
  - Progress Strip
  - AI Summary Card
  - Evidence Card
  - Action Review Card
  - Report Draft Card

Optional Context Panel
  - Selected evidence
  - Execution log
  - Security state
```

## 5. MVP Scope

### P0 — Mock Broker + Dark-first Chat UI

- Dark-first app shell
- Copilot chat UI
- Compact Tool Plan Card
- Progress Strip
- AI Summary Card
- Evidence Card
- Action Review Card
- Report Draft Card
- Mini Insights
- History placeholder
- Settings placeholder
- Dark-first design system
- Mock Broker event stream

### P1 — Real MCP read-only

- Broker runs MCP client
- Broker connects to `mcp-atlassian`
- Actual read-only tools:
  - `jira_search`
  - `jira_get_issue`
  - `confluence_search`
  - `confluence_get_page`
- Frontend renders real Jira/Confluence sources through the same contract used in P0

### P1.5 — OpenAI streaming

- Broker calls OpenAI Responses API
- Frontend receives SSE events from Broker
- AI summary and report draft stream into chat
- Citations reference Jira/Confluence sources

### P2 — Sandbox write

- Jira comment
- Jira transition
- Confluence page create/update
- Only allowed in sandbox project/space
- Always gated by Action Review

## 6. Non-goals

- PDF/HWP/CAD viewer
- Document overlay UI
- Full RAG/vector DB
- Direct frontend calls to OpenAI/Jira/Confluence
- Production-grade auth
- Real company data
- Destructive actions
- Colorful dashboard-heavy UI
- Full analytics dashboard in P0

## 7. User Demo Flow

1. User opens Copilot.
2. User enters: `NFS 프로젝트에서 이번 주 완료되지 않은 High 이슈를 찾아서 요약해줘.`
3. Assistant shows Compact Tool Plan.
4. Broker streams tool status events.
5. Jira/Confluence evidence appears.
6. OpenAI summary streams.
7. Assistant proposes comment/report draft.
8. Write action appears as Action Review Card.
9. User can approve, edit, or cancel.
10. History records run and tool events.

## 8. Portfolio Message

This project demonstrates:

- LLM chat UI
- SSE streaming
- MCP tool-use UX
- Jira/Confluence work data integration
- AI source citation
- Action approval UX
- Enterprise security boundaries
- Dark-first design system
- Frontend architecture
- CI/CD and Git flow
