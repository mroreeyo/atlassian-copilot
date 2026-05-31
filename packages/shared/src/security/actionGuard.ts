import { destructiveTools, readOnlyTools, writeTools, type RunMode, type ToolName, type ToolRisk } from '../contracts/domain.js';

export function classifyToolRisk(tool: ToolName): ToolRisk {
  if ((readOnlyTools as readonly string[]).includes(tool)) return 'read';
  if ((writeTools as readonly string[]).includes(tool)) return 'write';
  if ((destructiveTools as readonly string[]).includes(tool)) return 'destructive';
  return 'destructive';
}

export function isReadOnlyTool(tool: ToolName): boolean {
  return classifyToolRisk(tool) === 'read';
}

export function assertReadOnlyTool(tool: ToolName): void {
  if (!isReadOnlyTool(tool)) {
    throw new Error(`Tool ${tool} is not allowed in read-only MCP mode.`);
  }
}

export interface ActionDecisionInput {
  tool: ToolName;
  mode: RunMode;
  approved?: boolean;
  sandboxTarget?: boolean;
}

export interface ActionDecision {
  allowed: boolean;
  executes: boolean;
  reason: string;
}

export function decideActionExecution(input: ActionDecisionInput): ActionDecision {
  const risk = classifyToolRisk(input.tool);
  if (risk === 'destructive') {
    return { allowed: false, executes: false, reason: '삭제성 작업은 포트폴리오 모드에서 차단됩니다.' };
  }
  if (risk === 'read') {
    return { allowed: true, executes: true, reason: '읽기 전용 도구는 서버 경유로 즉시 실행할 수 있습니다.' };
  }
  if (!input.approved) {
    return { allowed: false, executes: false, reason: '변경 작업은 먼저 내용을 확인하고 승인해야 합니다.' };
  }
  if (input.mode === 'sandbox-write') {
    return {
      allowed: true,
      executes: true,
      reason: '승인되어 요청한 변경을 진행합니다.'
    };
  }
  return {
    allowed: true,
    executes: false,
    reason: '승인은 기록했지만 현재는 읽기 전용 상태라 실제 변경은 하지 않습니다.'
  };
}
