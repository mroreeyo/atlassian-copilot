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

## 3. CD

AWS deploy is optional.

Recommended:

- S3 + CloudFront
- GitHub Actions OIDC
- no long-lived AWS access keys

## 4. Required Environment Variables

Frontend:

- no OpenAI/Atlassian secrets
- optionally `VITE_BROKER_BASE_URL`

Broker:

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
- broker deployment is separate from static web deployment

## 6. Release Checklist

- Dark-first UI confirmed
- No full dashboard accidentally added to P0
- MCP read-only smoke test documented
- Broker mock stream works; optional OpenAI smoke skips safely without credentials or `AKC_ENABLE_LIVE_OPENAI=true`, and any real OpenAI streaming remains isolated from the P0 fictional Copilot route unless a future integration gate explicitly enables it
- Action Review blocks write execution until approval
- README demo flow updated
