# LLM Provider Integration Plan

This legacy filename is retained for continuity, but the implementation is now provider-neutral: OpenAI/GPT and Claude/Anthropic are configured through `/settings` and called only by the Broker.

## Current implementation

- Browser settings calls:
  - `POST /api/settings/llm`
  - `POST /api/settings/llm/test`
  - `DELETE /api/settings/llm`
- Runtime adapters:
  - `apps/broker/src/services/llm/openaiAdapter.ts`
  - `apps/broker/src/services/llm/anthropicAdapter.ts`
  - `apps/broker/src/services/llm/llmProviderFactory.ts`
- Settings storage:
  - `apps/broker/src/services/settings/llmSettingsStore.ts`
- Smoke path:
  - `npm run smoke:llm`

The old OpenAI-only provider skeleton under `apps/broker/src/services/openai/openaiProvider.ts` is retained for parser/source-bundle compatibility tests, but it is not the canonical runtime path for personal LLM settings.

## Behavior

- Save does not call a provider or spend credits.
- Test connection is explicit and may spend provider credits.
- Disabled or missing providers return safe `409` responses and do not fall back to a misleading mock success.
- Generic demo prompts may use fictional Jira/Confluence evidence, while assigned-issue prompts can use Broker-side read-only Jira evidence and the summary segment can use an enabled Broker-side OpenAI or Claude adapter.
- Browser code must never call provider endpoints, import provider SDKs, or expose provider secrets.

## Smoke command

```bash
npm run build -w @akc/shared
npm run build -w @akc/broker
npm run smoke:llm
```

If no enabled personal or Broker environment provider is available, the smoke command skips with sanitized status metadata.
