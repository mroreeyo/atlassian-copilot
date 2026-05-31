# UI_ACCEPTANCE_CRITERIA.md

## 1. Dark-first Criteria

- App opens in dark mode by default.
- No light-mode-only page appears in P0.
- Main background uses slate/neutral dark colors.
- No saturated full-card backgrounds except subtle approval warning.
- Primary CTA is clear but not brightly colored.

## 2. Chat-first Criteria

- `/copilot` is the primary route.
- User can complete the main demo flow without leaving chat.
- Tool Plan, Evidence, Summary, Review, and Report appear as chat cards.
- Full dashboard is not required in P0.

## 3. Color Discipline Criteria

- One card generally has max two badges.
- Blue is used only for subtle AI/progress/link accent.
- Amber appears only for approval-required/write operations.
- Green appears only for completed/success states.
- Red appears only for failure/destructive states.

## 4. Enterprise UX Criteria

- Write action is never silently executed.
- Action Review shows target, tool, risk, input preview, and approve/cancel/edit controls.
- Source citations are visible for AI summaries.
- Feedback controls are visible on AI answer.
- Context panel is optional/secondary.

## 5. Security UX Criteria

- UI indicates OpenAI and MCP run through Broker.
- UI indicates read-only mode or sandbox-write mode.
- Browser secret exposure is not implied or implemented.
