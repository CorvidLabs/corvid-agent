import type { McpToolContext } from './types';
import { errorResult, textResult } from './types';

export async function handleBridgeListSessions(ctx: McpToolContext, _args: Record<string, never>) {
  const bridgeService = ctx.bridgeService;
  if (!bridgeService) return errorResult('Bridge service not available');
  const sessions = bridgeService.listSessions();
  if (sessions.length === 0) return textResult('No active bridge sessions.');
  const lines = sessions.map(
    (s) =>
      `• ${s.sessionId} — ${s.label} (project: ${s.projectId || 'any'}, caps: ${formatCaps(s.capabilities)}, connected: ${s.connectedAt})`,
  );
  return textResult(`Active bridge sessions:\n${lines.join('\n')}`);
}

export async function handleBridgeRequest(
  ctx: McpToolContext,
  args: { session_id: string; request_type: string; path?: string; content?: string; command?: string; cwd?: string },
) {
  const bridgeService = ctx.bridgeService;
  if (!bridgeService) return errorResult('Bridge service not available');

  const requestId = crypto.randomUUID();
  const request = {
    id: requestId,
    type: args.request_type as 'file.read' | 'file.write' | 'file.list' | 'exec' | 'ping',
    path: args.path,
    content: args.content,
    command: args.command,
    cwd: args.cwd,
  };

  try {
    const response = await bridgeService.sendRequest(args.session_id, request);
    if (!response.success) return errorResult(response.error ?? 'Bridge request failed');

    if (typeof response.data === 'string') return textResult(response.data);
    return textResult(JSON.stringify(response.data, null, 2));
  } catch (err) {
    return errorResult(`Bridge error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function formatCaps(caps: { read: boolean; write: boolean; exec: boolean }): string {
  const parts: string[] = [];
  if (caps.read) parts.push('read');
  if (caps.write) parts.push('write');
  if (caps.exec) parts.push('exec');
  return parts.join('+') || 'none';
}
