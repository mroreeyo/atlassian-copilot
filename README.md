# AX Knowledge Copilot

Dark-first, chat-first enterprise Copilot for Jira and Confluence work. The browser talks only to the Broker contract; read-only Jira/Confluence lookups run through the Broker, and write actions stop at Action Review.

## What is implemented

- Route freeze: `/copilot`, `/history`, `/settings` only.
- Dark-first chat shell with optional right context panel and content-width user bubbles so short prompts do not read like dashboard cards.
- First-visit product tour and broker-owned suggested prompts for a safe interviewer demo without requiring real credentials.
- In-chat cards: Tool Plan, Progress, Evidence, AI Summary, Report Draft, Action Review, Feedback.
- Shared TypeScript/Zod contracts for Broker routes and canonical SSE events.
- Broker endpoints for runs, streams, history, settings, approve, and cancel.
- `/settings` personal Atlassian connection form that submits credentials to the Broker only; the token is not kept in browser storage or frontend env.
- `/settings` personal LLM provider form for OpenAI/GPT or Claude API keys, encrypted Broker-side and never returned to the browser.
- Broker-only read adapters for Jira/Confluence plus OpenAI/Claude/OpenRouter summary adapters; the assigned-issues flow can use saved Atlassian settings without exposing credentials to the browser.
- Frontend security scan that blocks forbidden secret strings and direct OpenAI/Claude/Jira/Confluence/MCP imports.

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` starts the Broker and Web dev server together, chooses a browser-reachable Web port, and avoids the WSL/Windows `localhost` trap where a Windows process owns the same port and returns a misleading `404`.

If you start services manually:

```bash
npm run dev:broker
VITE_BROKER_PROXY_TARGET=http://localhost:8787 npm run dev:web -- --host 0.0.0.0 --port 5173 --strictPort
```

If `5173` is occupied, choose a port that is free in both WSL and Windows, for example `5180`, then open `/copilot`:

```bash
VITE_DEV_PORT=5180 VITE_BROKER_PROXY_TARGET=http://localhost:8787 npm run dev:web -- --host 0.0.0.0 --port 5180 --strictPort
```

The web app calls only the Broker API/SSE contract. Generic demo prompts still use the fictional portfolio flow, while assigned-issue prompts such as “나에게 할당된 이슈들을 조회해줘” run a Broker-side read-only Jira search when Atlassian settings are configured. The first-visit tour and suggested prompts are safe for an interviewer walkthrough: they explain the flow, keep changes behind Action Review, and do not require real Atlassian or LLM credentials. MCP smoke scripts skip safely when credentials are absent.

## Personal Atlassian settings

Open `http://localhost:<web-port>/settings` and paste:

- Atlassian site URL
- Atlassian email
- API token
- Jira project allowlist
- Confluence space allowlist

The browser sends those values to `POST /api/settings/atlassian`. The Broker persists them under server-side local state (`~/.ax-knowledge-copilot/broker`, or `AKC_BROKER_STATE_DIR` if set) and never returns the token to the frontend. `DELETE /api/settings/atlassian` clears the saved personal profile. A saved profile shows as configured and is used by Broker-side read-only Jira/Confluence lookups.

## Personal LLM settings

Open `/settings` and choose `OpenAI / GPT`, `Claude / Anthropic`, or mock fallback. Paste an OpenAI platform API key or Anthropic Console API key; ChatGPT Plus and Claude Pro/Max subscriptions are not API keys. `Save LLM to Broker` encrypts the key on the Broker and clears the browser field. `Test connection` is explicit because it performs a small provider call and may incur provider cost.

The Browser never calls OpenAI or Anthropic directly. LLM settings use:

```txt
POST   /api/settings/llm
POST   /api/settings/llm/test
DELETE /api/settings/llm
```

See `docs/LLM_PROVIDER_RUNBOOK.md` for storage, fallback, and cost notes.

## Quality gates

```bash
npm run lint
npm run typecheck
npm run test
npm run security:scan
npm run build
```

Smoke checks after build:

```bash
npm run smoke:mcp:jira-search
npm run smoke:mcp:jira-get-issue
npm run smoke:mcp:confluence-search
npm run smoke:mcp:confluence-get-page
npm run smoke:llm
```

## Security boundaries

- Browser must never call OpenAI, Anthropic/Claude, OpenRouter, Jira, Confluence, or MCP directly.
- Do not create frontend secret env names such as `VITE_OPENAI_API_KEY`, `VITE_CHATGPT_API_KEY`, `VITE_ANTHROPIC_API_KEY`, `VITE_CLAUDE_API_KEY`, `VITE_OPENROUTER_API_KEY`, or `VITE_ATLASSIAN_TOKEN`.
- Broker credentials are server-only. They can be submitted through `/settings`, injected/exported for the Broker process, or stored in a local ignored Broker env file loaded by your runtime; frontend `VITE_*` secrets are forbidden.
- P1 MCP tools are read-only: `jira_search`, `jira_get_issue`, `confluence_search`, `confluence_get_page`.
- P0/P1 approval is mock-only; no real Jira/Confluence write executes.
- Destructive actions are blocked in portfolio mode.

## Demo prompt

```txt
NFS 프로젝트에서 이번 주 완료되지 않은 High 이슈를 찾아서 요약해줘. 관련 Confluence 문서도 같이 보고, 조치 댓글 초안까지 만들어줘.
```

Expected result: one chat flow calls `POST /api/copilot/runs`, consumes the Broker SSE stream, labels demo evidence as demo data when mock mode is used, emits run-scoped action IDs, and renders the compact tool/evidence accordion, AI Summary, and Action Review without leaving `/copilot`.
