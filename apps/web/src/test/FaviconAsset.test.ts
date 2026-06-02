import { readFileSync, statSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('favicon asset', () => {
  it('exposes the service favicon from the web public root', () => {
    const indexHtml = readFileSync('apps/web/index.html', 'utf8');

    expect(indexHtml).toContain('/favicon-32x32.png?v=20260602');
    expect(indexHtml).toContain('/favicon.ico?v=20260602');
    expect(indexHtml).toContain('/favicon-256x256.png?v=20260602');
    expect(statSync('apps/web/public/favicon.ico').size).toBeGreaterThan(0);
    expect(statSync('apps/web/public/favicon-32x32.png').size).toBeGreaterThan(0);
    expect(statSync('apps/web/public/favicon-256x256.png').size).toBeGreaterThan(0);
  });
});
