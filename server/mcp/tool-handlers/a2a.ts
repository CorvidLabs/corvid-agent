import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { invokeRemoteAgent, discoverAgent } from '../../a2a/client';
import { createLogger } from '../../lib/logger';

const log = createLogger('McpToolHandlers');

export async function handleDiscoverAgent(
    ctx: McpToolContext,
    args: { url: string },
): Promise<CallToolResult> {
    if (!args.url?.trim()) {
        return errorResult('A URL is required (e.g. "https://agent.example.com").');
    }

    try {
        ctx.emitStatus?.(`Discovering agent at ${args.url}...`);

        const card = await discoverAgent(args.url);

        if (!card) {
            return textResult(
                `No A2A Agent Card found at ${args.url}.\n` +
                `The remote server may not support the A2A protocol, or the URL may be incorrect.`,
            );
        }

        const skillLines = (card.skills ?? []).map(
            (s) => `  - ${s.name}: ${s.description} [${s.tags?.join(', ') ?? ''}]`,
        );

        const protocolLines = (card as { supportedProtocols?: Array<{ protocol: string; description: string }> }).supportedProtocols?.map(
            (p) => `  - ${p.protocol}: ${p.description}`,
        ) ?? [];

        const lines = [
            `Agent: ${card.name} v${card.version}`,
            `Description: ${card.description}`,
            `URL: ${card.url}`,
            card.provider ? `Provider: ${card.provider.organization} (${card.provider.url})` : null,
            card.documentationUrl ? `Docs: ${card.documentationUrl}` : null,
            ``,
            `Capabilities:`,
            `  Streaming: ${card.capabilities?.streaming ?? false}`,
            `  Push Notifications: ${card.capabilities?.pushNotifications ?? false}`,
            ``,
            `Authentication: ${card.authentication?.schemes?.join(', ') ?? 'none'}`,
            `Input Modes: ${card.defaultInputModes?.join(', ') ?? 'unknown'}`,
            `Output Modes: ${card.defaultOutputModes?.join(', ') ?? 'unknown'}`,
            ``,
            skillLines.length > 0 ? `Skills (${skillLines.length}):` : 'Skills: none',
            ...skillLines,
            protocolLines.length > 0 ? `\nSupported Protocols:` : null,
            ...protocolLines,
        ].filter(Boolean);

        ctx.emitStatus?.(`Discovered ${card.name} with ${card.skills?.length ?? 0} skills`);
        return textResult(lines.join('\n'));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP discover_agent failed', { error: message });
        return errorResult(`Failed to discover agent: ${message}`);
    }
}

export async function handleInvokeRemoteAgent(
    ctx: McpToolContext,
    args: {
        agent_url: string;
        message: string;
        skill?: string;
        timeout_minutes?: number;
        min_trust?: string;
    },
): Promise<CallToolResult> {
    if (!args.agent_url?.trim() || !args.message?.trim()) {
        return errorResult('agent_url and message are required.');
    }

    try {
        ctx.emitStatus?.(`Invoking remote agent at ${args.agent_url}...`);

        const timeoutMs = (args.timeout_minutes ?? 5) * 60 * 1000;

        const result = await invokeRemoteAgent(args.agent_url, args.message, {
            skill: args.skill,
            timeoutMs,
        });

        if (!result.success) {
            return errorResult(`Remote agent invocation failed: ${result.error ?? 'unknown error'}`);
        }

        ctx.emitStatus?.('Received response from remote agent');
        return textResult(
            `Remote Agent Response (task ${result.taskId}):\n\n${result.responseText ?? '(no response text)'}`,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP invoke_remote_agent failed', { error: message });
        return errorResult(`Failed to invoke remote agent: ${message}`);
    }
}
