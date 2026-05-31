import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerCopilotRoutes } from './routes/copilot.js';
import { getAllowedOrigins } from './config/security.js';

export function buildApp() {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: getAllowedOrigins() });
  registerCopilotRoutes(app);
  return app;
}
