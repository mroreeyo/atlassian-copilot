/* @vitest-environment node */
/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readWebStylesheet() {
  return readFileSync(join(process.cwd(), 'apps/web/src/styles/index.css'), 'utf8');
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

function blockContents(css: string, blockStart: string) {
  const start = css.indexOf(blockStart);
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

function cssRuleInBlock(css: string, blockStart: string, selector: string) {
  return cssRule(blockContents(css, blockStart), selector);
}

function numericDeclaration(rule: string, property: string) {
  const match = rule.match(new RegExp(`${property}:\\s*(-?\\d+(?:\\.\\d+)?)`));
  expect(match?.[1]).toBeDefined();
  return Number(match![1]);
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
});
