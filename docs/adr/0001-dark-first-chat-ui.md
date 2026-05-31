# ADR 0001 — Use Dark-first Chat UI

## Status

Accepted

## Context

Earlier UI concepts were too colorful and dashboard-heavy. For an enterprise AI Copilot that can interact with Jira/Confluence, the interface should communicate trust, control, and calmness.

## Decision

Use dark-first chat UI as the default product experience.

- Default theme: dark
- Main screen: Copilot chat
- Cards appear inside assistant messages
- Color usage is strictly limited
- No full dashboard in P0

## Consequences

Positive:

- Feels closer to ChatGPT Enterprise / Claude / developer workbench
- Reduces visual noise
- Makes Action Review state more meaningful
- Supports focused workflow

Negative:

- Requires careful contrast testing
- Light mode is deferred
- Design discipline must be enforced in OMX prompts
