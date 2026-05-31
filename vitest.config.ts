import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@akc/shared/mock', replacement: fileURLToPath(new URL('./packages/shared/src/mock.ts', import.meta.url)) },
      { find: '@akc/shared', replacement: fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)) },
      { find: /^@akc\/shared\/(.+)$/, replacement: `${fileURLToPath(new URL('./packages/shared/src/', import.meta.url))}$1` }
    ]
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./apps/web/src/test/setup.ts'],
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.test.tsx'],
    coverage: { reporter: ['text', 'html'] }
  }
});
