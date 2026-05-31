import { z } from 'zod';
import type { ReadOnlyTool } from '@akc/shared';
import { getReadOnlyMcpTools } from '../services/mcp/allowlist.js';
import { runReadOnlyMcpTool } from '../services/mcp/mcpClient.js';

const allowedTools = getReadOnlyMcpTools();
const ToolArg = z.custom<ReadOnlyTool>(
  (value): value is ReadOnlyTool => typeof value === 'string' && allowedTools.includes(value as ReadOnlyTool),
  { message: `Tool must be one of: ${allowedTools.join(', ')}` }
);
const tool = ToolArg.parse(process.argv[2]);
const query = smokeQueryForTool(tool);
if (!query) {
  console.info(JSON.stringify({
    tool,
    status: 'skipped',
    reason: tool === 'jira_get_issue' ? 'Set AKC_SMOKE_JIRA_ISSUE_KEY to smoke-test jira_get_issue.' : 'Set AKC_SMOKE_CONFLUENCE_PAGE_ID to smoke-test confluence_get_page.',
    sources: []
  }, null, 2));
  process.exit(0);
}
const result = await runReadOnlyMcpTool(tool, query);
console.info(JSON.stringify(result, null, 2));
if (result.status === 'skipped') process.exitCode = 0;
if (result.status === 'failed') process.exitCode = 1;

function smokeQueryForTool(tool: ReadOnlyTool): string | null {
  if (tool === 'jira_search') return process.env.AKC_SMOKE_JIRA_JQL ?? 'assignee = currentUser() ORDER BY updated DESC';
  if (tool === 'jira_get_issue') return process.env.AKC_SMOKE_JIRA_ISSUE_KEY ?? null;
  if (tool === 'confluence_search') return process.env.AKC_SMOKE_CONFLUENCE_CQL ?? 'type = page';
  return process.env.AKC_SMOKE_CONFLUENCE_PAGE_ID ?? null;
}
