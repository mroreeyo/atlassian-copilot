# MCP_REAL_INTEGRATION_PLAN.md

## 1. Goal

Connect the Broker to `mcp-atlassian` for real read-only Jira/Confluence access after the P0 dark-first UI and mock contract are complete.

## 2. Required Read-only Tools

- `jira_search`
- `jira_get_issue`
- `confluence_search`
- `confluence_get_page`

## 3. Forbidden in P1

- `jira_create_issue`
- `jira_update_issue`
- `jira_transition_issue`
- `jira_add_comment`
- `confluence_create_page`
- `confluence_update_page`
- `confluence_add_comment`

Those can appear as Action Review drafts, but must not execute in P1.

## 4. Environment

Use a personal Atlassian sandbox only. Configure these only through the `/settings` Broker-backed personal settings form, the Broker process environment, or a local ignored Broker env file; never expose them to frontend env or direct browser integration code.

```env
ATLASSIAN_URL=https://your-site.atlassian.net
ATLASSIAN_EMAIL=you@example.com
ATLASSIAN_API_TOKEN=...
JIRA_PROJECT_ALLOWLIST=AKC,NFS
CONFLUENCE_SPACE_ALLOWLIST=AKC
COPILOT_MODE=readonly
```

## 5. Broker Responsibilities

- Start/connect to MCP client.
- Validate requested tool against allowed read-only tools.
- Validate project/space allowlist.
- Normalize Jira/Confluence results to `AtlassianSource`.
- Emit SSE events to frontend through a run-orchestration boundary, not directly from the in-memory run store.
- Capture safe audit log.
- Do not expose MCP credentials to frontend.

## 6. Smoke Tests

Create scripts or tests for:

```bash
npm run smoke:mcp:jira-search
npm run smoke:mcp:jira-get-issue
npm run smoke:mcp:confluence-search
npm run smoke:mcp:confluence-get-page
```

## 7. Fallback

If MCP is unavailable:

- frontend must show a calm error state
- mock mode can be enabled for demo
- no UI layout should break

## 8. Demo Requirement

P0 portfolio demo remains fictional-data-only and must not require real Atlassian credentials. A later P1 integration demo may show one real read-only MCP search after the Broker transport, allowlists, audit behavior, and smoke semantics are implemented and reviewed.
