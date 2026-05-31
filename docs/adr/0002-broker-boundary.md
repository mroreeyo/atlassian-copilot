# ADR 0002 — Frontend Never Calls OpenAI/MCP Directly

## Status

Accepted

## Context

The project uses OpenAI and `mcp-atlassian`. Both require credentials that must never be exposed to browser code.

## Decision

The browser calls only the Broker API. The Broker owns OpenAI and MCP integration.

## Consequences

Positive:

- Secrets are not exposed in browser bundles
- Write actions can be centrally guarded
- Audit logging is possible
- MCP failures can be normalized

Negative:

- Requires an additional broker app
- Local development is slightly more complex
