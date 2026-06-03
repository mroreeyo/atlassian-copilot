# CI_CD_PLAN.md

## 1. CI Goals

CI proves frontend engineering quality, not just visual output.

Run on pull request and main push:

- install
- format check, if a format script exists
- lint
- typecheck
- unit/component tests (`npm run test`, Vitest bounded workers to avoid local fork-worker flakes)
- security scan
- build
- env-gated MCP/OpenAI smoke scripts that skip safely without credentials
- optional Playwright smoke, once the dependency/script exists

## 2. Security Gates

- CodeQL
- dependency review
- secret scanning through GitHub
- `.env` ignored
- no direct frontend secret usage
- no `VITE_OPENAI_API_KEY`
- no `VITE_OPENROUTER_API_KEY`
- no `VITE_ATLASSIAN_TOKEN`
- no direct frontend provider hostnames such as `https://api.openai.com`, `https://api.anthropic.com`, or `https://openrouter.ai`
- no `VITE_GOOGLE_CLIENT_SECRET`, `VITE_GOOGLE_ACCESS_TOKEN`, `VITE_GOOGLE_ID_TOKEN`, `VITE_GOOGLE_REFRESH_TOKEN`, `VITE_GOOGLE_TOKEN`, `VITE_AKC_AUTH_CSRF_SECRET`, or `VITE_AKC_CREDENTIAL_ENCRYPTION_KEY`
- no browser persistence/logging/URL placement for Google OAuth material, session tokens, or CSRF tokens

## 3. CD

AWS deploy is optional.

Recommended:

- S3 + CloudFront
- GitHub Actions OIDC
- no long-lived AWS access keys

## 4. Required Environment Variables

Frontend:

- no OpenAI/Atlassian/Google secrets or auth tokens
- optionally `VITE_BROKER_BASE_URL`
- optionally `VITE_AKC_ENABLE_LOCAL_AUTH=false` to hide local email/password forms when the Broker local-auth policy disables them

Broker:

- `AKC_AUTH_BASE_URL` / `AKC_WEB_BASE_URL`
- `AKC_ENABLE_GOOGLE_AUTH=false` until DB sessions, CSRF, and user-scoped private stores pass gates
- `AKC_ENABLE_LOCAL_AUTH=true` only when production local email/password auth is deliberately intended
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` / optional `GOOGLE_ALLOWED_HOSTED_DOMAIN`
- `AKC_AUTH_CSRF_SECRET`, `AKC_CREDENTIAL_ENCRYPTION_KEY`, and explicit persistent state via `AKC_BROKER_STATE_DIR` or `AKC_AUTH_DB_PATH` for DB-backed auth state
- `OPENAI_API_KEY`
- optional `AKC_ENABLE_LIVE_OPENAI=true` for future non-P0 OpenAI smoke only; P0 stays mock-only when unset/false
- `ATLASSIAN_URL`
- `ATLASSIAN_EMAIL`
- `ATLASSIAN_API_TOKEN`
- `JIRA_PROJECT_ALLOWLIST`
- `CONFLUENCE_SPACE_ALLOWLIST`
- `COPILOT_MODE`
- optional `BROKER_ALLOWED_ORIGINS`

## 5. Build Artifacts

- web build output from `apps/web/dist`
- broker deployment is separate from static web deployment and must provide persistent auth DB storage, secret injection, no-cache auth/session/callback responses, and a same-origin `/api` reverse proxy where possible

## 6. Release Checklist

- Dark-first UI confirmed
- No full dashboard accidentally added to P0
- MCP read-only smoke test documented
- Broker mock stream works; optional OpenAI smoke skips safely without credentials or `AKC_ENABLE_LIVE_OPENAI=true`, and any real OpenAI streaming remains isolated from the P0 fictional Copilot route unless a future integration gate explicitly enables it
- Action Review blocks write execution until approval
- README demo flow updated
