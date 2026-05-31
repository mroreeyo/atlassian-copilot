# CHAT_FIRST_UI_SPEC.md — Dark-first User Interface

## 1. Core Direction

The product must feel like a calm dark enterprise Copilot, not a dashboard-heavy admin console.

The first screen users see is a chat interface.

## 2. Visual Personality

```txt
Dark-first
Calm
Enterprise
Trustworthy
Low-color
Readable
Action-safe
```

The UI should resemble a professional AI workbench, not a colorful analytics SaaS template.

## 3. Layout

```txt
┌───────────────────────┬─────────────────────────────────────┬─────────────────────┐
│ Sidebar               │ Chat                                │ Context Panel       │
│ - New Chat            │ - User message                      │ optional/collapsed  │
│ - Recent              │ - Assistant message                 │ - Evidence          │
│ - History             │ - Cards inside answer               │ - Execution log     │
│ - Settings            │ - Input composer                    │ - Security status   │
└───────────────────────┴─────────────────────────────────────┴─────────────────────┘
```

## 4. Default Dark Layout Rules

- Body background: `slate-950`.
- Sidebar background: `slate-950`.
- Chat container background: `slate-900`.
- Cards: `slate-950` with `slate-800` border.
- Input composer: `slate-950` with `slate-800` border.
- Primary CTA: `slate-100` background with `slate-950` text.
- Muted text: `slate-500`.
- Normal text: `slate-300`.
- Strong text: `slate-100`.

## 5. Main Chat Cards

### Compact Tool Plan Card

Purpose: show what the Copilot plans to do before doing it.

Default: compact and expandable.

Content:

- tool names
- read/write risk
- short description
- statement that write operations are not executed yet

Visual rule:

- Neutral dark card
- One success/read-only badge at most
- No colorful full-card background

### Progress Strip

Purpose: show agent progress without taking too much vertical space.

Steps:

- Request analysis
- Jira search
- Confluence search
- OpenAI summary
- Review waiting

Visual rule:

- Horizontal compact pills
- Green icon for completed
- Blue icon for running
- Muted icon for pending

### AI Summary Card

Purpose: the main answer.

Must include:

- concise summary
- recommended actions
- citations
- review required note
- feedback buttons

Visual rule:

- Neutral dark card
- Small blue spark icon only
- Review required badge uses amber
- Avoid violet background

### Evidence Card

Purpose: show sources.

Default: top 3 sources. Expandable.

Source types:

- Jira issue
- Confluence page

Visual rule:

- Use neutral source labels
- Avoid type-specific bright colors in P0
- Relevance score appears as text, not a colorful badge

### Action Review Card

Purpose: approve write operations before execution.

Must be visually clearer than other cards, but not overly colorful.

Must show:

- target
- tool
- risk = write
- input preview
- edit/cancel/approve buttons

Visual rule:

- Amber border and subtle amber header
- Warning icon
- Strong CTA hierarchy
- No red unless destructive/failed

### Report Draft Card

Purpose: show Markdown-style draft inside chat.

Default: only appears when user asks for report or clicks `보고서 초안 만들기`.

Visual rule:

- Use neutral dark editor-like surface
- No bright syntax colors unless necessary

## 6. What not to show by default

- Full dashboard
- Full audit log table
- Design system showcase
- Large KPI charts
- Too many badges
- Multiple saturated card backgrounds
- Persistent colorful status panels

## 7. Mini Insights

At the top of Copilot, show compact metrics only:

```txt
오늘 요청 12 · MCP 실행 38 · 평균 응답 8.4s · 예상 절감 2.5h
```

These must be small and secondary, never more important than the chat.

## 8. Feedback UX

Every AI summary should include:

- helpful
- not helpful
- insufficient evidence
- request revision

This maps to AI answer quality UX in the job posting.

## 9. Empty State

When there is no conversation:

```txt
무엇을 도와드릴까요?

예시:
- 이번 주 미완료 High 이슈 요약해줘
- 특정 이슈의 관련 Confluence 문서 찾아줘
- 조치 댓글 초안 만들어줘
- 결과보고서 초안 작성해줘
```

## 10. Responsive Rules

- Desktop: sidebar + chat + optional context panel.
- Tablet: sidebar collapses, context panel becomes drawer.
- Mobile: chat only, cards stack vertically, context appears as bottom sheet.

## 11. Accessibility Rules

- Dark mode contrast must be checked.
- Interactive elements need visible focus state.
- Status must not rely on color alone; include text/icon.
- Approval buttons must have clear labels.
- Streaming output should be readable and not visually noisy.
