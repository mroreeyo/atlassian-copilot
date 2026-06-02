import type { FastifyInstance } from 'fastify';
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
  type WriteTool
} from '@akc/shared';
import { randomUUID } from 'node:crypto';
import { recordAudit } from '../services/audit/auditLog.js';
import { runWriteMcpTool } from '../services/mcp/mcpClient.js';
import { findActionReview, getStoredRun, resolveAction, storeRun } from '../services/runs/runStore.js';
import { streamStoredRunEvents } from '../services/runs/runOrchestrator.js';
import { clearPersonalAtlassianSettings, readResolvedAtlassianCredentials, recordPersonalAtlassianValidation, savePersonalAtlassianSettings, testResolvedAtlassianConnection } from '../services/settings/atlassianSettingsStore.js';
import { clearPersonalLlmSettings, getLlmRuntimeConfig, readResolvedLlmSettings, recordPersonalLlmValidation, savePersonalLlmSettings } from '../services/settings/llmSettingsStore.js';
import { buildSettingsStatus } from '../services/settings/settingsStatus.js';
import { testConfiguredLlmConnection } from '../services/llm/llmProviderFactory.js';
import { clearLlmModelCatalogCache, getLlmProviderModels } from '../services/llm/modelCatalog.js';
import { buildCopilotSuggestions } from '../services/suggestions/copilotSuggestions.js';
import { currentAuthUser, requireAuth } from '../services/auth/sessionCookie.js';

export function registerCopilotRoutes(app: FastifyInstance): void {
  app.post('/api/copilot/runs', async (request, reply) => {
    const parsed = RunCreateRequestSchema.parse(request.body);
    const user = currentAuthUser(request);
    const runId = `run_${randomUUID().slice(0, 8)}`;
    storeRun({ runId, message: parsed.message, mode: user ? parsed.mode : 'mock' });
    return reply.send({ runId, streamUrl: `/api/copilot/runs/${runId}/stream` });
  });

  app.get('/api/copilot/runs/:id/stream', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!getStoredRun(id)) return reply.code(404).send({ error: '알 수 없는 실행 ID' });
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    for await (const event of streamStoredRunEvents(id)) {
      const parsed = CopilotSseEventSchema.parse(event);
      reply.raw.write(`event: ${parsed.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(parsed)}\n\n`);
    }
    reply.raw.end();
  });

  app.post('/api/copilot/actions/:id/approve', async (request, reply) => {
    if (!requireAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    const body = ActionApprovalRequestSchema.parse(request.body);
    const found = findActionReview(id);
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
      const writeResult = await runWriteMcpTool(found.action.tool, found.action);
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
    if (!requireAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    const body = ActionCancelRequestSchema.parse(request.body);
    const found = findActionReview(id);
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
    if (!requireAuth(request, reply)) return;
    return reply.send({ runs: [] });
  });

  app.get('/api/copilot/suggestions', async (_request, reply) => {
    return reply.send(CopilotSuggestionsResponseSchema.parse(buildCopilotSuggestions()));
  });

  app.get('/api/settings/status', async (request, reply) => {
    if (!requireAuth(request, reply)) return;
    return reply.send(buildSettingsStatus());
  });

  app.post('/api/settings/atlassian', async (request, reply) => {
    if (!requireAuth(request, reply)) return;
    const parsed = AtlassianSettingsRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Atlassian 설정 형식이 올바르지 않습니다.' });
    try {
      savePersonalAtlassianSettings(parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Atlassian 설정을 저장할 수 없습니다.' });
    }
    return reply.send({
      status: buildSettingsStatus(),
      message: 'Atlassian 연결을 저장했습니다. 브라우저에는 토큰을 저장하지 않았습니다.'
    });
  });

  app.delete('/api/settings/atlassian', async (request, reply) => {
    if (!requireAuth(request, reply)) return;
    clearPersonalAtlassianSettings();
    return reply.send({
      status: buildSettingsStatus(),
      message: '개인 Atlassian 연결을 지웠습니다.'
    });
  });

  app.post('/api/settings/atlassian/test', async (request, reply) => {
    if (!requireAuth(request, reply)) return;
    const before = readResolvedAtlassianCredentials();
    if (!before.configured || !before.apiToken) {
      const message = '테스트할 수 있는 Atlassian 연결 정보가 없습니다. 사이트 URL, 이메일, API 토큰을 저장한 뒤 테스트하세요.';
      return reply.code(409).send({
        error: message,
        status: buildSettingsStatus(),
        ok: false,
        message
      });
    }
    const result = await testResolvedAtlassianConnection(before);
    if (before.source === 'personal') {
      recordPersonalAtlassianValidation({
        ok: result.ok,
        message: result.message,
        validatedAt: result.ok ? new Date().toISOString() : undefined,
        error: result.ok ? undefined : result.message
      });
    }
    return reply.send({
      status: buildSettingsStatus(),
      ok: result.ok,
      message: result.message
    });
  });

  app.post('/api/settings/llm', async (request, reply) => {
    if (!requireAuth(request, reply)) return;
    const parsed = LlmSettingsRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'LLM 설정 형식이 올바르지 않습니다.' });
    try {
      savePersonalLlmSettings(parsed.data);
      clearLlmModelCatalogCache();
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'LLM 설정을 저장할 수 없습니다.' });
    }
    return reply.send({
      status: buildSettingsStatus(),
      message: 'LLM 설정을 저장했습니다. 브라우저에는 API 키를 저장하지 않았습니다.'
    });
  });

  app.delete('/api/settings/llm', async (request, reply) => {
    if (!requireAuth(request, reply)) return;
    clearPersonalLlmSettings();
    clearLlmModelCatalogCache();
    return reply.send({
      status: buildSettingsStatus(),
      message: '개인 LLM 설정을 지웠습니다.'
    });
  });


  app.get('/api/settings/llm/providers/:provider/models', async (request, reply) => {
    if (!requireAuth(request, reply)) return;
    const { provider } = request.params as { provider: string };
    const parsed = LlmProviderSchema.safeParse(provider);
    if (!parsed.success) return reply.code(400).send({ error: '지원하지 않는 LLM 제공자입니다.' });
    const query = request.query as { refresh?: string };
    const refresh = query.refresh === 'true';
    const response = await getLlmProviderModels(parsed.data, refresh);
    return reply.send(response);
  });

  app.post('/api/settings/llm/test', async (request, reply) => {
    if (!requireAuth(request, reply)) return;
    const before = readResolvedLlmSettings();
    const runtimeConfig = getLlmRuntimeConfig();
    if (!runtimeConfig) {
      const message = llmTestUnavailableMessage(before);
      return reply.code(409).send({
        error: message,
        status: buildSettingsStatus(),
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
      });
    }
    return reply.send({
      status: buildSettingsStatus(),
      provider: before.provider,
      ok: result.ok,
      message: result.message
    });
  });
}

function isWriteTool(tool: string): tool is WriteTool {
  return (writeTools as readonly string[]).includes(tool);
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
