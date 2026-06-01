/* @vitest-environment node */
/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readWebStylesheet() {
  return readFileSync(join(process.cwd(), 'apps/web/src/styles/index.css'), 'utf8');
}

function readWebSourceFile(relativePath: string) {
  return readFileSync(join(process.cwd(), 'apps/web/src', relativePath), 'utf8');
}

function cssRule(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const openBrace = css.indexOf('{', start);
  expect(openBrace).toBeGreaterThan(start);

  let depth = 0;
  for (let index = openBrace; index < css.length; index += 1) {
    const character = css[index];
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth === 0) return css.slice(start, index + 1);
  }

  throw new Error(`Could not find closing brace for ${selector}`);
}

function blockContentsAt(css: string, start: number, blockStart: string) {
  expect(start).toBeGreaterThanOrEqual(0);
  const openBrace = css.indexOf('{', start);
  expect(openBrace).toBeGreaterThan(start);

  let depth = 0;
  for (let index = openBrace; index < css.length; index += 1) {
    const character = css[index];
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth === 0) return css.slice(openBrace + 1, index);
  }

  throw new Error(`Could not find closing brace for ${blockStart}`);
}

function allBlockContents(css: string, blockStart: string) {
  const blocks: string[] = [];
  let start = css.indexOf(blockStart);
  while (start >= 0) {
    blocks.push(blockContentsAt(css, start, blockStart));
    start = css.indexOf(blockStart, start + blockStart.length);
  }
  expect(blocks.length).toBeGreaterThan(0);
  return blocks;
}

function cssRuleInBlock(css: string, blockStart: string, selector: string) {
  for (const block of allBlockContents(css, blockStart)) {
    if (block.includes(`${selector} {`)) return cssRule(block, selector);
  }

  expect(`${selector} in ${blockStart}`).toBe('');
  throw new Error(`Could not find ${selector} in ${blockStart}`);
}

function numericDeclaration(rule: string, property: string) {
  const match = rule.match(new RegExp(`${property}:\\s*(-?\\d+(?:\\.\\d+)?)`));
  expect(match?.[1]).toBeDefined();
  return Number(match![1]);
}

function optionalNumericDeclaration(rule: string, property: string) {
  const match = rule.match(new RegExp(`${property}:\\s*(-?\\d+(?:\\.\\d+)?)`));
  return match?.[1] ? Number(match[1]) : null;
}

function combinedRuleForSelector(css: string, selector: string) {
  const rules = css
    .split('}')
    .map((rule) => `${rule}}`)
    .filter((rule) => {
      const openBrace = rule.indexOf('{');
      if (openBrace < 0) return false;
      return rule
        .slice(0, openBrace)
        .split(',')
        .map((part) => part.trim())
        .some((part) => part === selector || part.endsWith(` ${selector}`));
    });

  expect(rules.length, `${selector} should have a CSS rule`).toBeGreaterThan(0);
  return rules.join('\n');
}

function expectComfortableTouchTarget(rule: string, selector: string) {
  const height = optionalNumericDeclaration(rule, 'min-height') ?? optionalNumericDeclaration(rule, 'height');
  expect(height, `${selector} should have at least a 40px tall hit area`).toBeGreaterThanOrEqual(40);

  if (/send-button|tour-close/.test(selector)) {
    const width = optionalNumericDeclaration(rule, 'min-width') ?? optionalNumericDeclaration(rule, 'width');
    expect(width, `${selector} should have at least a 40px wide hit area`).toBeGreaterThanOrEqual(40);
  }
}

describe('Copilot responsive CSS', () => {
  it('keeps the sticky composer surfaces opaque in the dark theme', () => {
    const css = readWebStylesheet();
    const composerStickZone = cssRule(css, '.composer-stick-zone');
    const composerFooter = cssRule(css, '.composer-footer');
    const composerBox = cssRule(css, '.composer-box');

    expect(composerStickZone).toContain('position: sticky');
    expect(composerStickZone).toContain('background: rgb(var(--background));');
    expect(composerStickZone).not.toMatch(/background:\s*(?:rgba|linear-gradient)/);
    expect(composerFooter).not.toContain('position: sticky');
    expect(composerBox).toContain('background: rgb(var(--surface));');
    expect(composerBox).not.toMatch(/background:\s*rgba/);
  });

  it('keeps user message bubbles neutral instead of success-colored', () => {
    const css = readWebStylesheet();
    const userMessage = cssRule(css, '.message.user');
    const userHeader = cssRule(css, '.message.user .message-header');
    const userContent = cssRule(css, '.message.user .message-content');

    expect(userMessage).toContain('width: fit-content;');
    expect(userMessage).toContain('max-width: min(760px, 88%);');
    expect(userMessage).toContain('background: rgba(30, 41, 59');
    expect(userMessage).not.toMatch(/16,\s*185,\s*129|52,\s*211,\s*153|110,\s*231,\s*183|emerald|green/i);
    expect(userHeader).toContain('rgb(var(--text-muted))');
    expect(userContent).toContain('rgb(var(--text-primary))');
  });

  it('keeps light-mode user message bubbles neutral and content-width', () => {
    const css = readWebStylesheet();
    const lightUserMessage = cssRule(css, '[data-theme="light"] .message.user');

    expect(cssRule(css, '.message.user')).toContain('width: fit-content;');
    expect(lightUserMessage).toContain('background: rgba(241, 245, 249');
    expect(lightUserMessage).not.toMatch(/16,\s*185,\s*129|52,\s*211,\s*153|110,\s*231,\s*183|emerald|green|linear-gradient/i);
  });

  it('keeps assistant message bubbles content-width while run cards can use full width', () => {
    const css = readWebStylesheet();
    const assistantMessage = cssRule(css, '.message.assistant');
    const assistantWithRun = cssRule(css, '.message.assistant.with-run');
    const assistantWithRunContent = cssRule(css, '.message.assistant.with-run .message-content');

    expect(assistantMessage).toContain('width: fit-content;');
    expect(assistantMessage).toMatch(/max-width:\s*min\(\d+px,\s*100%\)/);
    expect(assistantMessage).not.toContain('width: 100%');
    expect(assistantWithRun).toContain('width: 100%;');
    expect(assistantWithRunContent).toContain('width: fit-content;');
    expect(assistantWithRunContent).toContain('max-width: min(760px, 100%);');
  });

  it('keeps the Copilot layout responsive when the context panel is available', () => {
    const css = readWebStylesheet();

    expect(css).toContain('@media (max-width: 980px)');
    expect(css).toContain('.copilot-grid, .status-grid, .form-grid { grid-template-columns: 1fr; }');
    expect(css).toContain('.context-panel { position: static; }');
    expect(css).toContain('@media (max-width: 760px)');
  });

  it('keeps Product Tour Korean heading typography comfortable instead of cramped', () => {
    const css = readWebStylesheet();
    const heading = cssRule(css, '.tour-content h2');

    expect(heading).not.toContain('font-size: clamp(24px, 4vw, 34px);');
    expect(heading).not.toContain('letter-spacing: -0.045em;');
    expect(heading).toContain('word-break: keep-all;');
    expect(numericDeclaration(heading, 'line-height')).toBeGreaterThanOrEqual(1.2);
    expect(Math.abs(numericDeclaration(heading, 'letter-spacing'))).toBeLessThanOrEqual(0.025);

    const clampMax = heading.match(/font-size:\s*clamp\([^,]+,[^,]+,\s*(\d+)px\)/)?.[1];
    expect(clampMax).toBeDefined();
    expect(Number(clampMax)).toBeLessThanOrEqual(32);
  });


  it('guards shell-level viewport sizing against mobile browser chrome regressions', () => {
    const css = readWebStylesheet();
    const appShellSource = readWebSourceFile('components/layout/AppShell.tsx');
    const rootRule = cssRule(css, 'html, body, #root');
    const bodyRule = cssRule(css, 'body');
    const appShell = cssRule(css, '.app-shell');

    expect(css).toContain('100dvh');
    expect(`${rootRule}
${bodyRule}
${appShell}`).toMatch(/(?:min-)?height:\s*(?:var\(--[\w-]*viewport[\w-]*\)|100dvh)/);
    expect(`${bodyRule}
${appShell}`).not.toMatch(/min-height:\s*100vh;\s*}/);
    expect(appShellSource).not.toContain('min-h-screen');
  });

  it('keeps sticky composer and Product Tour surfaces safe-area aware', () => {
    const css = readWebStylesheet();
    const root = cssRule(css, ':root');
    const composerStickZone = cssRule(css, '.composer-stick-zone');
    const tourBackdrop = cssRule(css, '.tour-backdrop');
    const productTour = cssRule(css, '.product-tour');
    const mobileProductTour = cssRuleInBlock(css, '@media (max-width: 760px)', '.product-tour');

    expect(root).toContain('safe-area-inset-bottom');
    expect(composerStickZone).toContain('var(--safe-area-bottom)');
    expect(composerStickZone).toMatch(/padding[^;]*calc\([^;]*var\(--safe-area-bottom\)/);
    expect(`${tourBackdrop}
${productTour}
${mobileProductTour}`).toContain('safe-area-inset');
    expect(`${productTour}
${mobileProductTour}`).toContain('100dvh');
  });

  it('keeps mobile interactive controls at comfortable tap-target sizes', () => {
    const css = readWebStylesheet();

    for (const selector of [
      '.nav a',
      '.btn',
      '.send-button',
      '.suggestion-chip',
      '.theme-toggle-button',
      '.tour-replay-button',
      '.tour-close',
      '.tour-rail button',
    ]) {
      expectComfortableTouchTarget(combinedRuleForSelector(css, selector), selector);
    }
  });

  it('keeps narrow support and tool surfaces stacked instead of horizontally cramped', () => {
    const css = readWebStylesheet();
    const mobileBlock = allBlockContents(css, '@media (max-width: 760px)').join('\n');

    for (const selector of ['.tool-row', '.tool-call-row-header', '.tool-accordion-trigger', '.actions', '.model-field-actions']) {
      expect(mobileBlock).toContain(selector);
    }

    expect(combinedRuleForSelector(mobileBlock, '.tool-row')).toMatch(/(?:grid-template-columns:\s*1fr|flex-direction:\s*column)/);
    expect(combinedRuleForSelector(mobileBlock, '.actions')).toMatch(/(?:flex-direction:\s*column|display:\s*grid)/);
    expect(mobileBlock).toMatch(/\.model-field-actions\s+\.btn\s*{[^}]*flex:\s*1 1/s);
  });


  it('defines a complete light mode and overrides the main dark surfaces', () => {
    const css = readWebStylesheet();
    const lightRoot = cssRule(css, ':root[data-theme="light"]');

    for (const token of ['--background:', '--surface:', '--surface-raised:', '--border:', '--text-primary:', '--text-secondary:', '--text-muted:', '--primary:', '--primary-foreground:', '--accent-ai:', '--success:', '--warning:', '--danger:']) {
      expect(lightRoot).toContain(token);
    }
    expect(lightRoot).toContain('color-scheme: light');
    expect(cssRule(css, '[data-theme="light"] .app-shell')).toContain('rgb(var(--background))');
    expect(css).toContain('[data-theme="light"] .card,');
    expect(css).toContain('[data-theme="light"] .composer-box,');
    expect(cssRule(css, '[data-theme="light"] .product-tour')).toContain('255, 255, 255');
    expect(css).toContain('[data-theme="light"] .tour-replay-button,');
  });

  it('keeps Product Tour surfaces dark-first and neutral', () => {
    const css = readWebStylesheet();
    const productTour = cssRule(css, '.product-tour');
    const previewCard = cssRule(css, '.tour-preview-card');

    expect(productTour).toContain('rgba(15, 23, 42');
    expect(productTour).toContain('rgba(2, 6, 23');
    expect(previewCard).toContain('rgba(2, 6, 23');
    expect(`${productTour} ${previewCard}`).not.toMatch(/violet|purple|fuchsia/i);
  });

  it('prevents the mobile Product Tour step rail from forcing narrow two-column Korean wrapping', () => {
    const css = readWebStylesheet();
    const mobileRail = cssRuleInBlock(css, '@media (max-width: 760px)', '.tour-rail ol');

    expect(mobileRail).not.toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(mobileRail).toMatch(/(?:overflow-x:\s*auto|display:\s*flex|grid-template-columns:\s*1fr)/);

    if (mobileRail.includes('overflow-x: auto') || mobileRail.includes('display: flex')) {
      const mobileButton = cssRuleInBlock(css, '@media (max-width: 760px)', '.tour-rail button');
      expect(mobileButton).toContain('white-space: nowrap');
    }
  });

  it('keeps support pages and tool accordion rows stacked on narrow screens', () => {
    const css = readWebStylesheet();
    const supportRow = cssRule(css, '.tool-row, .evidence-item');
    const mobileSupportRow = cssRuleInBlock(css, '@media (max-width: 760px)', '.tool-row, .evidence-item');
    const mobileToolHeader = cssRuleInBlock(css, '@media (max-width: 760px)', '.tool-accordion-trigger, .tool-call-row-header');
    const mobileActions = cssRuleInBlock(css, '@media (max-width: 760px)', '.actions');
    const mobileDemoActions = cssRuleInBlock(css, '@media (max-width: 760px)', '.demo-mode-actions');

    expect(supportRow).toContain('min-width: 0;');
    expect(supportRow).toContain('align-items: flex-start;');
    expect(cssRule(css, '.tool-row strong, .evidence-item strong')).toContain('overflow-wrap: anywhere;');
    expect(mobileSupportRow).toContain('flex-direction: column;');
    expect(mobileSupportRow).toContain('align-items: stretch;');
    expect(mobileToolHeader).toContain('flex-direction: column;');
    expect(mobileToolHeader).toContain('align-items: stretch;');
    expect(mobileActions).toContain('flex-direction: column;');
    expect(mobileDemoActions).toContain('flex-direction: column;');
    expect(mobileDemoActions).toContain('align-items: stretch;');
  });

  it('keeps Settings form controls shrinkable and safe-area aware on mobile', () => {
    const css = readWebStylesheet();
    const settingsForm = cssRule(css, '.settings-form');
    const formLabel = cssRule(css, '.form-grid label');
    const formControls = cssRule(css, '.form-grid input, .form-grid select');
    const mobilePage = cssRuleInBlock(css, '@media (max-width: 760px)', '.page');

    expect(settingsForm).toContain('min-width: 0;');
    expect(formLabel).toContain('min-width: 0;');
    expect(formControls).toContain('min-width: 0;');
    expect(mobilePage).toContain('env(safe-area-inset-right)');
    expect(mobilePage).toContain('env(safe-area-inset-bottom)');
    expect(mobilePage).toContain('env(safe-area-inset-left)');
  });

  it('sizes Product Tour with dynamic viewport height and safe-area padding', () => {
    const css = readWebStylesheet();
    const backdrop = cssRule(css, '.tour-backdrop');
    const productTour = cssRule(css, '.product-tour');
    const mobileBackdrop = cssRuleInBlock(css, '@media (max-width: 760px)', '.tour-backdrop');
    const mobileProductTour = cssRuleInBlock(css, '@media (max-width: 760px)', '.product-tour');

    expect(backdrop).toContain('env(safe-area-inset-top)');
    expect(backdrop).toContain('env(safe-area-inset-bottom)');
    expect(productTour).toContain('100dvh');
    expect(productTour).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('@supports not (height: 100dvh)');
    expect(mobileBackdrop).toContain('env(safe-area-inset-left)');
    expect(mobileProductTour).toContain('100dvh');
    expect(mobileProductTour).toContain('100vw');
    expect(mobileProductTour).toContain('env(safe-area-inset-right)');
    expect(mobileProductTour).toContain('overflow-y: auto;');
  });

  it('keeps narrow mobile content from forcing page-level horizontal overflow', () => {
    const css = readWebStylesheet();
    const mobileLayoutCaps = cssRuleInBlock(css, '@media (max-width: 760px)', '.page,\n  .chat-column,\n  .support-panel,\n  .card,\n  .message,\n  .demo-mode-panel,\n  .settings-stack,\n  .settings-form,\n  .status-card,\n  .setup-guide,\n  .tool-accordion,\n  .product-tour,\n  .tour-content,\n  .tour-rail');
    const button = cssRule(css, '.btn');
    const mobileTextWrap = cssRuleInBlock(css, '@media (max-width: 760px)', '.status-card h3,\n  .status-card p,\n  .page-heading p,\n  .support-panel p,\n  .setup-step p,\n  .setup-detail li,\n  .tour-content h2,\n  .tour-content p,\n  .tour-preview-card strong');
    const mobileTourHeading = cssRuleInBlock(css, '@media (max-width: 760px)', '.tour-content h2,\n  .tour-content p');
    const mobileTourClose = cssRuleInBlock(css, '@media (max-width: 760px)', '.tour-close');

    expect(button).toContain('min-width: 0;');
    expect(button).toContain('white-space: normal;');
    expect(mobileLayoutCaps).toContain('max-width: 100%;');
    expect(mobileLayoutCaps).toContain('min-width: 0;');
    expect(mobileTextWrap).toContain('overflow-wrap: anywhere;');
    expect(mobileTourHeading).toContain('word-break: normal;');
    expect(mobileTourClose).toContain('flex: 0 0 40px;');
  });
});
