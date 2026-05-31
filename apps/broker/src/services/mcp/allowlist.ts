import { assertReadOnlyTool, readOnlyTools, type ReadOnlyTool, type ToolName } from '@akc/shared';

export function isAllowedMcpTool(tool: ToolName): tool is ReadOnlyTool {
  return (readOnlyTools as readonly string[]).includes(tool);
}

export function assertAllowedMcpTool(tool: ToolName): asserts tool is ReadOnlyTool {
  assertReadOnlyTool(tool);
}

export function getReadOnlyMcpTools(): readonly ReadOnlyTool[] {
  return readOnlyTools;
}
