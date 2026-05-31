import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const configuredPort = Number.parseInt(process.env.VITE_DEV_PORT ?? '5173', 10);
const devPort = Number.isFinite(configuredPort) ? configuredPort : 5173;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@akc/shared/mock', replacement: fileURLToPath(new URL('../../packages/shared/src/mock.ts', import.meta.url)) },
      { find: '@akc/shared', replacement: fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
      { find: /^@akc\/shared\/(.+)$/, replacement: `${fileURLToPath(new URL('../../packages/shared/src/', import.meta.url))}$1` }
    ]
  },
  server: {
    host: '0.0.0.0',
    port: devPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_BROKER_PROXY_TARGET ?? 'http://localhost:8787',
        changeOrigin: true
      }
    }
  }
});
