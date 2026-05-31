# GIT_FLOW.md

Use lightweight GitHub Flow.

## Branches

```txt
main
feature/dark-chat-shell
feature/copilot-contracts
feature/dark-design-system
feature/action-review
feature/mcp-readonly
feature/openai-streaming
chore/ci-cd-security
```

## Commit Style

Use Conventional Commits.

```txt
feat(copilot): add dark chat shell
feat(contract): add copilot streaming contracts
feat(ui): add dark-first design tokens
feat(review): add action approval card
feat(mcp): connect read-only jira search through broker
feat(llm): stream OpenAI summary via broker
style(ui): reduce color usage in chat cards
chore(ci): add typecheck and build gates
docs(readme): explain dark-first enterprise copilot
```

## PR Checklist

- UI remains dark-first and chat-first.
- No colorful dashboard-heavy UI.
- No excessive badges.
- No secrets exposed.
- No direct frontend OpenAI/Jira/Confluence calls.
- Write actions require approval.
- Tests/build pass.
- Screenshot or demo included.
- Accessibility checked for dark contrast.
