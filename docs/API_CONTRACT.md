# API_CONTRACT.md

This is the canonical Broker contract for AX Knowledge Copilot. Browser code may call only these Broker endpoints and must validate payloads with shared Zod schemas from `packages/shared`.

## 1. Routes

```txt
POST /api/copilot/runs
GET  /api/copilot/runs/:id/stream
POST /api/copilot/actions/:id/approve
POST /api/copilot/actions/:id/cancel
GET  /api/history
GET  /api/settings/status
POST /api/settings/atlassian
DELETE /api/settings/atlassian
POST /api/settings/llm
GET  /api/settings/llm/providers/:provider/models
POST /api/settings/llm/test
DELETE /api/settings/llm
```

## 2. Copilot Run

### Request

```json
{
  "message": "NFS 프로젝트에서 이번 주 완료되지 않은 High 이슈를 찾아서 요약해줘.",
  "mode": "readonly"
}
```

### Response

```json
{
  "runId": "run_001",
  "streamUrl": "/api/copilot/runs/run_001/stream"
}
```

## 3. Canonical SSE Events

The canonical event union is:

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

### run.created

```json
{ "type": "run.created", "runId": "run_001", "createdAt": "2026-05-29T02:00:00Z" }
```

### tool_plan.created

```json
{
  "type": "tool_plan.created",
  "actions": [
    { "id": "act_001", "tool": "jira_search", "risk": "read", "description": "High 미완료 이슈 검색", "requiresApproval": false },
    { "id": "act_002", "tool": "confluence_search", "risk": "read", "description": "관련 운영 문서 검색", "requiresApproval": false },
    { "id": "act_003", "tool": "jira_add_comment", "risk": "write", "description": "조치 댓글 초안 생성", "requiresApproval": true }
  ]
}
```

### tool.started

```json
{ "type": "tool.started", "actionId": "act_001", "tool": "jira_search" }
```

### tool.completed

```json
{ "type": "tool.completed", "actionId": "act_001", "tool": "jira_search", "resultSummary": "2 issues found" }
```

### tool.failed

```json
{ "type": "tool.failed", "actionId": "act_001", "tool": "jira_search", "error": "Sandbox MCP unavailable" }
```

### evidence.found

```json
{
  "type": "evidence.found",
  "sources": [
    { "id": "AKC-124", "sourceType": "jira", "title": "SSO 로그인 실패 후 메인 화면 이동 불가", "summary": "인증 토큰 검증 지연 가능성이 언급됨", "relevanceScore": 94, "url": "https://example.atlassian.net/browse/AKC-124" }
  ]
}
```

### llm.started

```json
{ "type": "llm.started", "messageId": "msg_001" }
```

### llm.delta

```json
{ "type": "llm.delta", "messageId": "msg_001", "text": "검색된 Jira 이슈와 Confluence 문서를 기준으로 보면..." }
```

### llm.completed

```json
{ "type": "llm.completed", "messageId": "msg_001", "confidence": "high", "citationSourceIds": ["AKC-124", "AX-KB-001"], "reviewRequired": true }
```

### llm.failed

```json
{ "type": "llm.failed", "messageId": "msg_001", "error": "OpenAI key unavailable; mock summary used" }
```

### action_review.required

P0/P1 approval is a draft/mock approval record only; it must not execute real writes.

```json
{
  "type": "action_review.required",
  "action": {
    "id": "act_003",
    "tool": "jira_add_comment",
    "risk": "write",
    "target": "AKC-124",
    "inputPreview": { "comment": "인증 서버 응답 시간과 세션 정책을 우선 점검..." },
    "requiresApproval": true
  }
}
```

### action_review.resolved

Action approval/cancel responses are also reduced through this canonical event shape in the frontend so the run view has one source of truth for Action Review lifecycle state.

```json
{
  "type": "action_review.resolved",
  "actionId": "act_003",
  "status": "mock_recorded",
  "message": "Approval recorded for demo only. No Jira/Confluence write was executed."
}
```

### report_draft.started

```json
{ "type": "report_draft.started", "draftId": "draft_001", "title": "NFS High 이슈 요약" }
```

### report_draft.delta

```json
{ "type": "report_draft.delta", "draftId": "draft_001", "text": "## 요약\n- SSO 로그인 이슈가 가장 큰 위험입니다." }
```

### report_draft.completed

```json
{ "type": "report_draft.completed", "draftId": "draft_001" }
```

### run.completed

```json
{ "type": "run.completed", "runId": "run_001" }
```

### run.failed

```json
{ "type": "run.failed", "runId": "run_001", "error": "Unexpected stream failure" }
```

## 4. Action Approval

`POST /api/copilot/actions/:id/approve`

P0 accepts only the approval decision. Edited action input is deferred until it is implemented end-to-end in the UI, shared schema, Broker validation, audit log, and execution adapter.

```json
{
  "approved": true
}
```

### Response in P0/P1

```json
{
  "actionId": "act_003",
  "status": "mock_recorded",
  "executed": false,
  "message": "Approval recorded for demo only. No Jira/Confluence write was executed."
}
```

Repeated approve calls for an already approved or blocked action return the stored response idempotently. Approving a cancelled action returns `409`. Declined approvals return `status: "blocked"`, `executed: false`, and are recorded once in the audit log.

## 5. Action Cancel

`POST /api/copilot/actions/:id/cancel`

```json
{ "reason": "사용자 취소" }
```

Cancellation is idempotent only while the action is already cancelled. Cancelling an approved or blocked action returns `409` so the audit trail cannot be rewritten.

## 6. Settings Status

`GET /api/settings/status`

```json
{
  "mcpConnected": false,
  "mcpConnectionState": "configured",
  "mcpStatusMessage": "Personal Atlassian settings are saved on the Broker. Copilot runs can attempt Broker-side read-only Jira/Confluence lookups.",
  "openaiConnected": false,
  "mode": "readonly",
  "sandboxWriteEnabled": false,
  "allowedJiraProjects": ["AKC", "NFS"],
  "allowedConfluenceSpaces": ["AKC"],
  "atlassian": { "source": "personal", "configured": true, "tokenConfigured": true, "allowedJiraProjects": ["AKC"], "allowedConfluenceSpaces": ["AKC"] },
  "llm": {
    "provider": "anthropic",
    "source": "personal",
    "connectionState": "configured",
    "configured": true,
    "connected": false,
    "enabled": true,
    "keyConfigured": true,
    "model": "claude-3-5-sonnet-latest",
    "statusMessage": "Claude settings are saved on the Broker. Use Test connection to validate the key."
  }
}
```

### Personal Atlassian settings

`POST /api/settings/atlassian` accepts a personal Atlassian site, email, API token, and Jira/Confluence allowlists. The response returns sanitized status only; it never returns the API token.

`DELETE /api/settings/atlassian` clears only the Atlassian profile.

### Personal LLM settings

`POST /api/settings/llm`

```json
{ "provider": "openai", "apiKey": "sk-...", "model": "gpt-4.1-mini", "enabled": true }
```

Response returns only sanitized provider metadata and never returns `apiKey`.


### LLM provider model catalog

`GET /api/settings/llm/providers/:provider/models?refresh=false`

The browser may request model choices only from the Broker. `provider` is `openai`, `anthropic`, or `openrouter`; `mock` returns a safe fallback/no-provider response when implemented by the Broker route. The Broker resolves saved personal credentials or explicitly enabled environment credentials server-side, may use a memory cache, and must never return provider API keys or raw provider payloads.

```json
{
  "provider": "openrouter",
  "source": "public",
  "defaultModel": "openrouter/auto",
  "selectedModel": "openrouter/auto",
  "models": [
    {
      "id": "openrouter/auto",
      "label": "OpenRouter Auto",
      "provider": "openrouter",
      "inputModalities": ["text"],
      "outputModalities": ["text"],
      "recommended": true
    }
  ],
  "manualEntryAllowed": true,
  "cache": { "status": "miss", "ttlSeconds": 21600, "fetchedAt": "2026-05-30T06:00:00.000Z" },
  "page": { "hasMore": false }
}
```

`manualEntryAllowed` is always `true` so users can save a model ID that is absent from the provider catalog. Missing credentials or provider failures should return static defaults with a calm `warning`, not leak upstream error bodies.

`POST /api/settings/llm/test` tests the saved Broker-side key on explicit user action. If no provider is saved, the provider is mock, or the saved provider is disabled, the Broker returns `409` with `ok: false` and does not call OpenAI/Claude/OpenRouter or record validation state. Provider HTTP failures return `ok: false` with sanitized messages and never expose the API key.

`DELETE /api/settings/llm` clears only the LLM profile.

## 7. History

`GET /api/history`

```json
{
  "runs": [
    { "runId": "run_001", "title": "NFS High 이슈 요약", "createdAt": "2026-05-29T10:00:00+09:00", "toolCount": 3, "pendingApprovalCount": 1, "status": "completed" }
  ]
}
```


## 8. Frontend Client Binding

The web runtime uses the Broker contract, not a browser-side Jira/Confluence/OpenAI client:

- `POST /api/copilot/runs` creates the run.
- The returned `streamUrl` is consumed as `text/event-stream`.
- Each SSE `data:` payload is validated with `CopilotSseEventSchema` before it reaches the reducer.
- Local mock generation is reserved for tests/demo-only adapters behind the Broker run orchestration seam; the default runtime path is Broker HTTP/SSE. Action IDs emitted by the Broker are run-scoped so Action Review approval/cancel requests can be attributed to the correct run audit context. Approval/cancel responses are reduced as `action_review.resolved` in the same run-scoped view so terminal review state is not component-local only.
