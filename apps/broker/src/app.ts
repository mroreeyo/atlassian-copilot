import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCopilotRoutes } from './routes/copilot.js';
import { getAllowedOrigins, isSafeBrowserMutationSource, securityHeaders } from './config/security.js';

export function buildApp() {
  const app = Fastify({ logger: false });
  app.register(cors, { credentials: true, origin: getAllowedOrigins() });
  app.addHook('onRequest', async (request, reply) => {
    for (const [name, value] of Object.entries(securityHeaders())) reply.header(name, value);
    if (!isUnsafeMutation(request.method)) return;
    const origin = request.headers.origin;
    const referer = request.headers.referer;
    if (isSafeBrowserMutationSource(origin, referer)) return;
    return reply.code(403).send({ error: '허용되지 않은 브라우저 출처의 변경 요청입니다.' });
  });
  registerAuthRoutes(app);
  registerCopilotRoutes(app);
  return app;
}

function isUnsafeMutation(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}
