import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ActionApprovalRequestSchema,
  ActionCancelRequestSchema,
  AtlassianSettingsRequestSchema,
  CopilotSuggestionsResponseSchema,
  CopilotSseEventSchema,
  LlmProviderSchema,
  LlmSettingsRequestSchema,
  RunCreateRequestSchema,
  decideActionExecution,
  writeTools,
  type CopilotSseEvent,
  type WriteTool
} from '@akc/shared';
import { randomUUID } from 'node:crypto';
import { recordAudit } from '../services/audit/auditLog.js';
import { readMcpEnvironment, runWriteMcpTool } from '../services/mcp/mcpClient.js';
import { findActionReview, getStoredRun, resolveAction, storeRun } from '../services/runs/runStore.js';
import { streamStoredRunEvents } from '../services/runs/runOrchestrator.js';
import { clearPersonalAtlassianSettings, readResolvedAtlassianCredentials, recordPersonalAtlassianValidation, savePersonalAtlassianSettings, testResolvedAtlassianConnection } from '../services/settings/atlassianSettingsStore.js';
import { clearPersonalLlmSettings, getLlmRuntimeConfig, readResolvedLlmSettings, recordPersonalLlmValidation, savePersonalLlmSettings } from '../services/settings/llmSettingsStore.js';
import { buildSettingsStatus } from '../services/settings/settingsStatus.js';
import { testConfiguredLlmConnection } from '../services/llm/llmProviderFactory.js';
import { clearLlmModelCatalogCache, getLlmProviderModels } from '../services/llm/modelCatalog.js';
import { buildCopilotSuggestions } from '../services/suggestions/copilotSuggestions.js';
import { currentAuthSession, requireAuthSession, requireCsrf } from '../services/auth/sessionCookie.js';
import { createUserContext } from '../services/auth/userScope.js';

const publicRunBuckets = new Map<string, { count: number; resetsAt: number }>();

export function clearPublicRunRateLimitsForTests(): void {
  publicRunBuckets.clear();
}

export function registerCopilotRoutes(app: FastifyInstance): void {
  app.post('/api/copilot/runs', async (request, reply) => {
    const parsed = RunCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Copilot 요청 형식이 올바르지 않습니다.' });
    const session = currentAuthSession(request);
    if (session && !requireCsrf(request, reply, session)) return;
    if (!session && !consumePublicRunQuota(request, reply)) return;
    const runId = `run_${randomUUID().slice(0, 8)}`;
    storeRun({ runId, message: parsed.data.message, mode: session ? parsed.data.mode : 'mock', userId: session?.user.id ?? null });
    return reply.send({ runId, streamUrl: `/api/copilot/runs/${runId}/stream` });
  });

  app.get('/api/copilot/runs/:id/stream', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existingRun = getStoredRun(id);
    if (!existingRun) return reply.code(404).send({ error: '알 수 없는 실행 ID' });
    if (existingRun.userId) {
      const session = requireAuthSession(request, reply);
      if (!session) return;
      if (session.user.id !== existingRun.userId) return reply.code(404).send({ error: '알 수 없는 실행 ID' });
    }
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const streamEnv = existingRun.userId ? createUserContext(existingRun.userId).env : process.env;
    const runController = new AbortController();
    const iterator = streamStoredRunEvents(id, streamEnv, { signal: runController.signal })[Symbol.asyncIterator]();
    const startedAt = Date.now();
    try {
      while (true) {
        const remainingMs = copilotRunMaxDurationMs() - (Date.now() - startedAt);
        const next = await nextEventWithTimeout(iterator, remainingMs, () => runController.abort(new Error('Copilot run duration exceeded.')));
        if (next === 'timeout') {
          void iterator.return?.(undefined);
          writeSseEvent(reply, { type: 'run.failed', runId: id, error: 'Copilot 실행 시간이 초과되었습니다.' });
          break;
        }
        if (next.done) break;
        writeSseEvent(reply, next.value);
      }
    } catch {
      writeSseEvent(reply, { type: 'run.failed', runId: id, error: 'Copilot 응답 스트림이 실패했습니다.' });
    } finally {
      runController.abort();
      await closeIterator(iterator);
      reply.raw.end();
    }
  });

  app.post('/api/copilot/actions/:id/approve', async (request, reply) => {
    const session = requireAuthSession(request, reply);
    if (!session || !requireCsrf(request, reply, session)) return;
    const { id } = request.params as { id: string };
    const body = ActionApprovalRequestSchema.parse(request.body);
    const found = findActionReview(id, session.user.id);
    if (!found) return reply.code(404).send({ error: '알 수 없는 작업 검토 ID' });
    if (found.resolution.status !== 'pending') {
      if (found.resolution.status === 'cancelled') return reply.code(409).send({ error: '작업 검토가 이미 취소되었습니다.' });
      return reply.send(found.resolution.response);
    }
    if (body.inputPreview) found.action.inputPreview = body.inputPreview;

    const decision = decideActionExecution({ tool: found.action.tool, mode: found.run.mode, approved: body.approved });
    let status: 'mock_recorded' | 'executed' | 'blocked' = decision.allowed ? (decision.executes ? 'executed' : 'mock_recorded') : 'blocked';
    let executed = decision.executes;
    let message = decision.reason;

    if (decision.allowed && decision.executes && isWriteTool(found.action.tool)) {
      const writeResult = await runWriteMcpTool(found.action.tool, found.action, readMcpEnvironment(createUserContext(session.user.id).env));
      if (writeResult.status === 'ok') {
        status = 'executed';
        executed = true;
        message = writeResult.reason;
      } else {
        status = 'blocked';
        executed = false;
        message = writeResult.reason;
      }
    }

    const response = {
      actionId: id,
      status,
      executed,
      message
    } as const;
    resolveAction(found.run, id, { status: status === 'blocked' ? 'blocked' : 'approved', response });
    recordAudit({
      id: `audit_${id}_${status}`,
      runId: found.run.runId,
      actionId: id,
      risk: found.action.risk,
      approvalStatus: status === 'blocked' ? 'blocked' : 'approved',
      executionResult: status,
      targetResourceId: found.action.target,
      inputPreview: found.action.inputPreview,
      timestamp: new Date().toISOString()
    });
    return reply.code(status === 'blocked' ? 400 : 200).send(response);
  });

  app.post('/api/copilot/actions/:id/cancel', async (request, reply) => {
    const session = requireAuthSession(request, reply);
    if (!session || !requireCsrf(request, reply, session)) return;
    const { id } = request.params as { id: string };
    const body = ActionCancelRequestSchema.parse(request.body);
    const found = findActionReview(id, session.user.id);
    if (!found) return reply.code(404).send({ error: '알 수 없는 작업 검토 ID' });
    if (found.resolution.status !== 'pending') {
      if (found.resolution.status === 'cancelled') return reply.send(found.resolution.response);
      return reply.code(409).send({ error: '작업 검토가 이미 처리되었습니다.' });
    }

    const response = { actionId: id, status: 'cancelled', reason: body.reason, executed: false } as const;
    resolveAction(found.run, id, { status: 'cancelled', response });
    recordAudit({
      id: `audit_${id}_cancel`,
      runId: found.run.runId,
      actionId: id,
      risk: found.action.risk,
      approvalStatus: 'cancelled',
      executionResult: 'not_executed',
      targetResourceId: found.action.target,
      timestamp: new Date().toISOString()
    });
    return reply.send(response);
  });

  app.get('/api/history', async (request, reply) => {
    const session = requireAuthSession(request, reply);
    if (!session) return;
    return reply.send({ runs: [] });
  });

  app.get('/api/copilot/suggestions', async (_request, reply) => {
    return reply.send(CopilotSuggestionsResponseSchema.parse(buildCopilotSuggestions()));
  });

  app.get('/api/settings/status', async (request, reply) => {
    const session = requireAuthSession(request, reply);
    if (!session) return;
    return reply.send(buildSettingsStatus(createUserContext(session.user.id).env));
  });

  app.post('/api/settings/atlassian', async (request, reply) => {
    const session = requireAuthSession(request, reply);
    if (!session || !requireCsrf(request, reply, session)) return;
    const env = createUserContext(session.user.id).env;
    const parsed = AtlassianSettingsRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Atlassian 설정 형식이 올바르지 않습니다.' });
    try {
      savePersonalAtlassianSettings(parsed.data, env);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Atlassian 설정을 저장할 수 없습니다.' });
    }
    return reply.send({
      status: buildSettingsStatus(env),
      message: 'Atlassian 연결을 저장했습니다. 브라우저에는 토큰을 저장하지 않았습니다.'
    });
  });

  app.delete('/api/settings/atlassian', async (request, reply) => {
    const session = requireAuthSession(request, reply);
    if (!session || !requireCsrf(request, reply, session)) return;
    const env = createUserContext(session.user.id).env;
    clearPersonalAtlassianSettings(env);
    return reply.send({
      status: buildSettingsStatus(env),
      message: '개인 Atlassian 연결을 지웠습니다.'
    });
  });

  app.post('/api/settings/atlassian/test', async (request, reply) => {
    const session = requireAuthSession(request, reply);
    if (!session || !requireCsrf(request, reply, session)) return;
    const env = createUserContext(session.user.id).env;
    const before = readResolvedAtlassianCredentials(env);
    if (!before.configured || !before.apiToken) {
      const message = '테스트할 수 있는 Atlassian 연결 정보가 없습니다. 사이트 URL, 이메일, API 토큰을 저장한 뒤 테스트하세요.';
      return reply.code(409).send({
        error: message,
        status: buildSettingsStatus(env),
        ok: false,
        message
      });
    }
    const result = await testResolvedAtlassianConnection(before, env);
    if (before.source === 'personal') {
      recordPersonalAtlassianValidation({
        ok: result.ok,
        message: result.message,
        validatedAt: result.ok ? new Date().toISOString() : undefined,
        error: result.ok ? undefined : result.message
      }, env);
    }
    return reply.send({
      status: buildSettingsStatus(env),
      ok: result.ok,
      message: result.message
    });
  });

  app.post('/api/settings/llm', async (request, reply) => {
    const session = requireAuthSession(request, reply);
    if (!session || !requireCsrf(request, reply, session)) return;
    const env = createUserContext(session.user.id).env;
    const parsed = LlmSettingsRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'LLM 설정 형식이 올바르지 않습니다.' });
    try {
      savePersonalLlmSettings(parsed.data, env);
      clearLlmModelCatalogCache();
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'LLM 설정을 저장할 수 없습니다.' });
    }
    return reply.send({
      status: buildSettingsStatus(env),
      message: 'LLM 설정을 저장했습니다. 브라우저에는 API 키를 저장하지 않았습니다.'
    });
  });

  app.delete('/api/settings/llm', async (request, reply) => {
    const session = requireAuthSession(request, reply);
    if (!session || !requireCsrf(request, reply, session)) return;
    const env = createUserContext(session.user.id).env;
    clearPersonalLlmSettings(env);
    clearLlmModelCatalogCache();
    return reply.send({
      status: buildSettingsStatus(env),
      message: '개인 LLM 설정을 지웠습니다.'
    });
  });


  app.get('/api/settings/llm/providers/:provider/models', async (request, reply) => {
    const session = requireAuthSession(request, reply);
    if (!session) return;
    const env = createUserContext(session.user.id).env;
    const { provider } = request.params as { provider: string };
    const parsed = LlmProviderSchema.safeParse(provider);
    if (!parsed.success) return reply.code(400).send({ error: '지원하지 않는 LLM 제공자입니다.' });
    const query = request.query as { refresh?: string };
    const refresh = query.refresh === 'true';
    const response = await getLlmProviderModels(parsed.data, refresh, env);
    return reply.send(response);
  });

  app.post('/api/settings/llm/test', async (request, reply) => {
    const session = requireAuthSession(request, reply);
    if (!session || !requireCsrf(request, reply, session)) return;
    const env = createUserContext(session.user.id).env;
    const before = readResolvedLlmSettings(env);
    const runtimeConfig = getLlmRuntimeConfig(env);
    if (!runtimeConfig) {
      const message = llmTestUnavailableMessage(before);
      return reply.code(409).send({
        error: message,
        status: buildSettingsStatus(env),
        provider: before.provider,
        ok: false,
        message
      });
    }
    const result = await testConfiguredLlmConnection(runtimeConfig);
    if (before.source === 'personal') {
      recordPersonalLlmValidation({
        ok: result.ok,
        message: result.message,
        validatedAt: result.ok ? new Date().toISOString() : undefined,
        error: result.ok ? undefined : result.message
      }, env);
    }
    return reply.send({
      status: buildSettingsStatus(env),
      provider: before.provider,
      ok: result.ok,
      message: result.message
    });
  });
}

function isWriteTool(tool: string): tool is WriteTool {
  return (writeTools as readonly string[]).includes(tool);
}

function consumePublicRunQuota(request: FastifyRequest, reply: FastifyReply): boolean {
  const now = Date.now();
  const windowMs = readPositiveInteger(process.env.AKC_PUBLIC_COPILOT_RUN_WINDOW_MS, 60_000);
  const maxRequests = readPositiveInteger(process.env.AKC_PUBLIC_COPILOT_RUN_MAX, 30);
  for (const [key, bucket] of publicRunBuckets) {
    if (bucket.resetsAt <= now) publicRunBuckets.delete(key);
  }

  const key = publicRunRateLimitKey(request);
  const current = publicRunBuckets.get(key);
  if (!current || current.resetsAt <= now) {
    publicRunBuckets.set(key, { count: 1, resetsAt: now + windowMs });
    return true;
  }
  if (current.count >= maxRequests) {
    reply.header('Retry-After', String(Math.max(1, Math.ceil((current.resetsAt - now) / 1000))));
    reply.code(429).send({ error: '공개 데모 요청이 너무 많습니다. 잠시 후 다시 시도하세요.' });
    return false;
  }
  publicRunBuckets.set(key, { ...current, count: current.count + 1 });
  return true;
}

function publicRunRateLimitKey(request: FastifyRequest): string {
  return `ip:${(request.ip || 'unknown').slice(0, 128)}`;
}

async function nextEventWithTimeout(
  iterator: AsyncIterator<CopilotSseEvent>,
  timeoutMs: number,
  onTimeout: () => void
): Promise<IteratorResult<CopilotSseEvent> | 'timeout'> {
  if (timeoutMs <= 0) {
    onTimeout();
    return 'timeout';
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<'timeout'>((resolve) => {
        timeout = setTimeout(() => {
          onTimeout();
          resolve('timeout');
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function closeIterator(iterator: AsyncIterator<CopilotSseEvent>): Promise<void> {
  await Promise.race([
    iterator.return?.(undefined) ?? Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 100))
  ]).catch(() => undefined);
}

function writeSseEvent(reply: FastifyReply, event: CopilotSseEvent): void {
  const parsed = CopilotSseEventSchema.parse(event);
  reply.raw.write(`event: ${parsed.type}\n`);
  reply.raw.write(`data: ${JSON.stringify(parsed)}\n\n`);
}

function copilotRunMaxDurationMs(env = process.env): number {
  return readPositiveInteger(env.AKC_COPILOT_RUN_MAX_DURATION_MS, 60_000);
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function llmTestUnavailableMessage(settings: ReturnType<typeof readResolvedLlmSettings>): string {
  if (settings.provider === 'mock' || !settings.configured || !settings.keyConfigured) {
    return '테스트할 수 있는 개인 OpenAI, Claude 또는 OpenRouter 제공자가 없습니다. LLM 제공자를 저장하고 활성화한 뒤 테스트하세요.';
  }
  if (!settings.enabled) {
    const name = settings.provider === 'openai' ? 'OpenAI' : settings.provider === 'anthropic' ? 'Claude' : 'OpenRouter';
    return `${name} 설정이 저장되어 있지만 비활성 상태입니다. 실제 제공자 연결을 테스트하기 전에 활성화하세요.`;
  }
  return '테스트할 수 있는 활성 LLM 런타임이 없습니다.';
}
