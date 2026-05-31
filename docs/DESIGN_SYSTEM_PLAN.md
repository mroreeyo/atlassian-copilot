# DESIGN_SYSTEM_PLAN.md — Dark-first Design System

## 1. Design Goal

Create a minimal dark-first design system for a secure enterprise AI Copilot.

The system should support:

- chat-first interaction
- MCP tool-use visibility
- Jira/Confluence evidence display
- Broker-streamed AI response
- write action approval
- audit/history readability

## 2. Principles

1. Neutral-first, status-color-last.
2. Information hierarchy through typography, spacing, border, and layout.
3. Color only where it communicates state or risk.
4. Action Review is the strongest state in the UI.
5. AI output should feel reviewable, not magical.
6. No colorful analytics dashboard aesthetics in P0.

## 3. Dark Color Tokens

```css
:root {
  --background: #020617;          /* slate-950 */
  --surface: #0f172a;             /* slate-900 */
  --surface-raised: #020617;      /* slate-950 */
  --surface-muted: #1e293b;       /* slate-800 */

  --border: #1e293b;              /* slate-800 */
  --border-strong: #334155;       /* slate-700 */

  --text-primary: #f1f5f9;        /* slate-100 */
  --text-secondary: #cbd5e1;      /* slate-300 */
  --text-muted: #64748b;          /* slate-500 */

  --primary: #f8fafc;             /* slate-50 */
  --primary-foreground: #020617;  /* slate-950 */

  --accent-ai: #93c5fd;           /* blue-300 */
  --success: #6ee7b7;             /* emerald-300 */
  --warning: #fcd34d;             /* amber-300 */
  --danger: #fca5a5;              /* red-300 */
}
```

## 4. Color Usage Ratios

```txt
Neutral surfaces/text/borders: 85%
Primary CTA: 8%
Blue AI/progress accent: 3%
Amber/green/red state colors: 4%
```

## 5. Status Colors

| State | Color | Usage |
|---|---|---|
| running | blue accent | current streaming/progress only |
| completed | emerald | completed icon or small text |
| approval required | amber | Action Review, write risk |
| failed | red | failed tool execution only |
| destructive | red | blocked destructive actions only |

## 6. Badge Rules

- One card should generally use max two badges.
- Do not decorate every source with multiple colored labels.
- Source type can be neutral.
- Risk state can be colored only if it matters.
- `write` uses amber.
- `read` can use neutral or muted success.

## 7. Component Inventory

### AppShell

- Dark sidebar
- Main chat area
- Optional context panel
- Header with connection badges

### ChatMessage

- User message: light bubble on dark surface
- Assistant message: dark neutral bubble or transparent content area
- Messages must support cards inside assistant response

### CompactToolPlanCard

- Summarizes planned MCP tools
- Shows read/write risk
- Expandable details

### ProgressStrip

- Compact horizontal step visualization
- Event-driven from SSE stream

### AISummaryCard

- Main Broker-streamed AI/mock output
- Citations
- Feedback controls
- Review required copy

### EvidenceCard

- Top sources
- Expandable
- Jira/Confluence source metadata

### ActionReviewCard

- Shows write action preview
- Edit/cancel/approve buttons
- Strong amber boundary

### ReportDraftCard

- Markdown preview
- Copy button
- Send to Action Review button for Confluence create/update

### ContextPanel

- Selected evidence
- Execution log
- Security status
- Default collapsed or visually secondary

### HistoryList

- Previous runs
- Tool execution status
- Approval logs

### SettingsPanel

- MCP connection status
- OpenAI connection status
- Mode: read-only / sandbox-write
- Allowlist display

## 8. Typography

- Page title: 16px–18px, bold
- Chat text: 14px–15px, relaxed line-height
- Card title: 14px, semibold
- Caption/meta: 12px, muted
- Code/markdown: mono 12px–13px

## 9. Spacing

- App shell padding: 16px–20px
- Chat vertical gap: 20px–24px
- Card padding: 16px–20px
- Compact card padding: 12px–16px
- Badge padding: 8px horizontal / 4px vertical

## 10. Interaction States

- Hover: subtle `slate-900`/`slate-800` shift.
- Focus: visible outline/ring, never removed.
- Disabled: reduced opacity + clear copy.
- Loading: skeleton or streaming cursor, not spinner-heavy.
- Error: red only when actual failure occurs.

## 11. Design System Preview

Do not expose Design System as a main user menu in P0.

Optional implementation:

- `/dev/design-system`
- hidden from main navigation
- useful for portfolio screenshots and component QA
