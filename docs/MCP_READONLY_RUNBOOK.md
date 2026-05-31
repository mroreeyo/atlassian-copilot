# MCP_READONLY_RUNBOOK.md

## Scope

Real Atlassian access is Broker-only and read-only. The current adapter uses the saved Broker-side Atlassian profile for allowed Jira/Confluence read tools and returns an explicit skipped status only when credentials are absent. Browser code must never import or call MCP, Jira, Confluence, or Atlassian clients directly.

Allowed tools:

- `jira_search`
- `jira_get_issue`
- `confluence_search`
- `confluence_get_page`

Forbidden in P1:

- Jira/Confluence create/update/comment/transition write tools
- delete/archive/remove operations

## Personal Settings UI

Preferred local flow:

1. Open `/settings`.
2. Paste Atlassian site URL, email, API token, Jira project allowlist, and Confluence space allowlist.
3. Click **Save to Broker**.

The browser only submits the values to the Broker. It does not store tokens in frontend env, localStorage, Zustand, or TanStack Query. The Broker stores the personal profile in server-side local state under `~/.ax-knowledge-copilot/broker` by default, or `AKC_BROKER_STATE_DIR` when set and never returns the token in status responses.

A saved profile means **configured, 조회 준비**. The Broker performs the actual read-only request during a Copilot run or smoke command; the status response never returns the token.

## Environment fallback

Use server-only Broker environment variables. They may be exported/injected by the runtime or stored in a local ignored `apps/broker/.env` if your process loader supports it; never create frontend `VITE_*` secrets:

```env
ATLASSIAN_URL=https://your-sandbox.atlassian.net
ATLASSIAN_EMAIL=you@example.com
ATLASSIAN_API_TOKEN=...
JIRA_PROJECT_ALLOWLIST=AKC,NFS
CONFLUENCE_SPACE_ALLOWLIST=AKC
COPILOT_MODE=readonly
```

Use a personal sandbox or least-privilege demo data. Do not connect sensitive company data for the portfolio demo.

## Smoke commands

Build first:

```bash
npm run build -w @akc/shared
npm run build -w @akc/broker
```

Then run:

```bash
npm run smoke:mcp:jira-search
AKC_SMOKE_JIRA_ISSUE_KEY=SCRUM-1 npm run smoke:mcp:jira-get-issue
npm run smoke:mcp:confluence-search
AKC_SMOKE_CONFLUENCE_PAGE_ID=123456789 npm run smoke:mcp:confluence-get-page
```

The search smoke commands use safe defaults (`assignee = currentUser() ORDER BY updated DESC` for Jira and `type = page` for Confluence). The get-by-id smoke commands need an explicit issue key or page id:

```bash
npm run smoke:mcp:jira-get-issue
npm run smoke:mcp:confluence-get-page
```

Smoke scripts return `status: "skipped"` with explicit fallback evidence when credentials are absent. When credentials are configured, they attempt the matching Broker-side read-only Jira/Confluence request and return `status: "ok"` or a sanitized `status: "failed"` without leaking tokens.
