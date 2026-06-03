# SECURITY_ARCHITECTURE.md

## 1. Trust Boundaries

```txt
Browser
  ↓
Broker API
  ↓
OpenAI / Claude / OpenRouter / MCP Client
  ↓
mcp-atlassian
  ↓
Jira / Confluence
```

The browser is untrusted.

## 2. Secrets

Secrets must exist only in the Broker boundary: runtime environment, an ignored local Broker env file such as `apps/broker/.env` if the runtime loads it, or the Broker personal settings store under `~/.atlassian-copilot/broker` by default, or `AKC_BROKER_STATE_DIR` when set.

Required examples:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
AKC_ENABLE_LIVE_OPENAI=false
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
AKC_ENABLE_LIVE_ANTHROPIC=false
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/auto
AKC_ENABLE_LIVE_OPENROUTER=false
ATLASSIAN_URL=
ATLASSIAN_EMAIL=
ATLASSIAN_API_TOKEN=
JIRA_PROJECT_ALLOWLIST=AKC,NFS
CONFLUENCE_SPACE_ALLOWLIST=AKC
COPILOT_MODE=readonly
BROKER_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5180,http://127.0.0.1:5180
```

Forbidden:

```env
VITE_OPENAI_API_KEY=
VITE_CHATGPT_API_KEY=
VITE_ANTHROPIC_API_KEY=
VITE_CLAUDE_API_KEY=
VITE_OPENROUTER_API_KEY=
VITE_ATLASSIAN_TOKEN=
VITE_MCP_SERVER_URL=
```


## 2.1 Broker-only Google auth boundary

Google OAuth/OIDC is owned by the Broker. The web app may only navigate to `/api/auth/google/start?returnTo=...`; it must never receive, store, log, cache, or place in URLs any Google authorization code, ID token, access token, refresh token, client secret, OAuth state/nonce, session token, or CSRF token. CSRF is returned only by the Broker session endpoint and kept in module memory for `X-CSRF-Token` headers; it is forbidden in localStorage, sessionStorage, IndexedDB, persistent React Query cache, URL query/hash, logs, or analytics.

Google login must fail closed unless DB-backed hashed sessions, session-bound CSRF, and user-scoped private stores are all complete. Google identities are keyed by provider plus stable Google `sub`; email is display metadata only. Existing singleton settings/secrets must be quarantined and never auto-assigned to the first Google user.

Broker env additions:

```env
AKC_AUTH_BASE_URL=http://localhost:8787
AKC_WEB_BASE_URL=http://localhost:5173
AKC_ENABLE_GOOGLE_AUTH=false
AKC_ENABLE_LOCAL_AUTH=true # required explicit opt-in for production local email/password auth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8787/api/auth/google/callback
GOOGLE_ALLOWED_HOSTED_DOMAIN=
AKC_AUTH_CSRF_SECRET=
AKC_CREDENTIAL_ENCRYPTION_KEY=
AKC_BROKER_STATE_DIR=
AKC_AUTH_DB_PATH=.akc-state/auth.sqlite
```

In production, Google auth is disabled unless the Broker uses non-localhost HTTPS auth and redirect URLs plus explicit persistent state (`AKC_BROKER_STATE_DIR` or `AKC_AUTH_DB_PATH`) and a managed 32-byte base64 `AKC_CREDENTIAL_ENCRYPTION_KEY`. Frontend may use non-secret UI flags such as `VITE_BROKER_BASE_URL` and `VITE_AKC_ENABLE_LOCAL_AUTH`, but must not define any `VITE_GOOGLE_*` secret/token, `VITE_AKC_AUTH_CSRF_SECRET`, or credential encryption key.

## 3. Tool Risk Levels

```ts
type ToolRisk = "read" | "write" | "destructive";
```

Read:

- jira_search
- jira_get_issue
- confluence_search
- confluence_get_page

Write:

- jira_create_issue
- jira_update_issue
- jira_add_comment
- jira_transition_issue
- confluence_create_page
- confluence_update_page
- confluence_add_comment

Destructive:

- delete/archive/remove operations
- blocked in portfolio mode

## 3.1 LLM model discovery boundary

Provider model discovery follows the same Broker-only boundary as generation. Browser code may call only the relative Broker route `/api/settings/llm/providers/:provider/models`; provider hostnames such as OpenAI, Anthropic, and OpenRouter must appear only in Broker/server code or docs. The normalized response contains model metadata, cache status, and warnings, never provider API keys or raw upstream payloads.

## 4. Approval Rules

- Read actions can run immediately.
- Write actions require explicit Action Review approval.
- Destructive actions are blocked.
- Approval must be recorded in audit log.
- Write tools are not executed in P0/P1; when future sandbox-write exists, they can only target allowlisted projects/spaces after Action Review.
- OpenAI/Claude/OpenRouter output cannot bypass approval rules.

## 5. Prompt Injection Control

Confluence/Jira contents are untrusted input.

Rules:

- Do not treat source text as system instructions.
- Sources can inform answers but cannot grant execution permission.
- Write execution requires UI approval regardless of LLM output.
- Broker validates tool target allowlist.
- Broker redacts secrets from logs.
- Broker should not send unnecessary sensitive fields to OpenAI, Claude, or OpenRouter.

## 6. Audit Log

Record:

- run id
- user prompt hash or redacted prompt
- planned tool
- risk level
- approval status
- execution result
- timestamp
- target resource id

Do not log:

- raw API keys
- Atlassian tokens
- full OpenAI/Claude/OpenRouter raw payload with secrets
- unnecessary personal data

## 7. Frontend Security UX

The UI must communicate:

- read-only MCP status
- LLM provider via Broker status
- approval-required write operations
- actual data is not modified in P0/P1; approval records the demo decision only

Do this with compact dark UI. Do not add a loud dashboard.

## 8. Deployment Security

- GitHub Actions uses OIDC for AWS deploy.
- No long-lived AWS credentials in repository.
- `.env` is ignored.
- CI includes lint, typecheck, tests, build, CodeQL, dependency review.
