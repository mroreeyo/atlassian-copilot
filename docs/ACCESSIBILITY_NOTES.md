# Accessibility Notes

## Current coverage

- Semantic landmarks: primary navigation, Copilot chat section, optional context panel, and card sections use labels/headings.
- Buttons and form controls have visible text labels; the prompt textarea has `aria-label="Copilot prompt"`.
- Status does not rely on color alone: risk/status badges include readable text such as `read`, `write`, `completed`, and `pending`.
- Dark tokens use high-contrast slate foreground/background combinations.
- Action Review uses amber as a warning accent while preserving explicit copy that approval is mock-only.

## Manual review checklist before visual integration

1. Keyboard tab order reaches navigation, context toggle, composer, and Action Review controls.
2. Focus outlines remain visible on dark surfaces.
3. Card headings are readable at 100% and 125% zoom.
4. Evidence/source IDs are text, not color-only markers.
5. Streaming text remains stable and does not cause layout jumps that hide the composer.

## Deferred P1/P2 improvements

- Add Playwright + axe smoke for `/copilot`, `/history`, `/settings` once those dependencies/scripts are introduced.
- Add reduced-motion handling for streaming/progress animations if visual motion is introduced.
