# TESTING_STRATEGY.md

## 1. Unit Tests

Test pure functions:

- risk classification
- action approval guard
- source normalization
- SSE event reducer
- Broker SSE frame decoder and frontend HTTP/SSE client
- citation mapping
- prompt source bundle builder

## 2. Component Tests

Test:

- CompactToolPlanCard
- ProgressStrip
- AISummaryCard
- EvidenceCard
- ActionReviewCard
- ReportDraftCard
- ChatComposer

## 3. Integration Tests

Test P0 mock flow:

1. submit user prompt
2. tool plan appears
3. progress updates
4. evidence appears
5. summary streams
6. action review appears
7. Broker route emits SSE framing consumed by the frontend client tests

## 3.1 LLM model catalog tests

Test provider model discovery at three layers:

- shared Zod contracts parse OpenAI, Anthropic, OpenRouter, fallback, cache, and `manualEntryAllowed` responses;
- Broker route tests mock provider fetches, assert sanitized output, verify cache hit/refresh behavior, and cover missing credentials;
- web client/UI tests prove the Settings selector uses a relative Broker route, saves selected models, and preserves manual model entry.

## 4. Security Tests

Automated checks should fail if these strings appear in frontend source:

- `VITE_OPENAI_API_KEY`
- `VITE_CHATGPT_API_KEY`
- `VITE_ATLASSIAN_TOKEN`
- `VITE_OPENROUTER_API_KEY`
- `ATLASSIAN_API_TOKEN` in `apps/web`
- provider API hostnames such as `https://api.openai.com`, `https://api.anthropic.com`, or `https://openrouter.ai` in `apps/web`

## 5. Accessibility Tests

- dark mode contrast
- keyboard focus state
- buttons have labels
- streaming output remains readable
- color is not the only status indicator

## 6. E2E Smoke

When Playwright is added, use it to verify:

- app loads
- prompt can be submitted
- summary card appears
- action review approve/cancel controls appear
- settings page shows read-only status
