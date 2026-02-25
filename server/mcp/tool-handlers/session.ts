import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { errorResult, textResult } from './types';
import { createLogger } from '../../lib/logger';

const log = createLogger('McpToolHandlers');

export async function handleExtendTimeout(
    ctx: McpToolContext,
    args: { minutes: number },
): Promise<CallToolResult> {
    if (!ctx.extendTimeout) {
        return errorResult('Timeout extension is not available for this session.');
    }

    const minutes = Math.max(1, Math.min(args.minutes, 120));
    const ms = minutes * 60 * 1000;
    const ok = ctx.extendTimeout(ms);

    if (!ok) {
        return errorResult('Failed to extend timeout — session may have already ended.');
    }

    log.info(`Session timeout extended by ${minutes} minutes`, { agentId: ctx.agentId });
    return textResult(`Timeout extended by ${minutes} minutes.`);
}
