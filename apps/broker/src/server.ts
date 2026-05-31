import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const app = buildApp();
await app.listen({ port, host });
console.info(`Atlassian Copilot Broker listening on http://${host}:${port}`);
