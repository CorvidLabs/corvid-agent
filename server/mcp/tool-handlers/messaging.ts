import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { createLogger } from '../../lib/logger';
import { DedupService } from '../../lib/dedup';
import { getAgent } from '../../db/agents';
import { checkCommunicationTier } from '../../lib/communication-tiers';

const log = createLogger('McpToolHandlers');

const MAX_INVOKE_DEPTH = 3;

// Dedup namespace for agent-to-agent message sends (30s window, bounded at 500 entries).
const SEND_DEDUP_NS = 'mcp:send-message';
DedupService.global().register(SEND_DEDUP_NS, { maxSize: 500, ttlMs: 30_000 });

function sendKey(agentId: string, toAgent: string, message: string): string {
    return `${agentId}:${toAgent}:${message.slice(0, 200)}`;
}


export async function handleSendMessage(
    ctx: McpToolContext,
    args: { to_agent: string; message: string; thread?: string },
): Promise<CallToolResult> {
    const depth = ctx.depth ?? 1;
    if (depth > MAX_INVOKE_DEPTH) {
        return errorResult(
            `Cannot send message: invocation depth ${depth} exceeds maximum of ${MAX_INVOKE_DEPTH}. ` +
            'This prevents circular invocation deadlocks.',
        );
    }

    // Per-session messaging rate limit (#1054)
    if (ctx.messageRateLimiter) {
        const rateLimitErr = ctx.messageRateLimiter.check(args.to_agent);
        if (rateLimitErr) {
            log.warn('Session message rate limit hit', {
                from: ctx.agentId,
                to: args.to_agent,
                sessionId: ctx.sessionId,
                error: rateLimitErr,
            });
            return errorResult(rateLimitErr);
        }
    }

    try {
        // TODO(#1067): When ctx.sessionSource is 'discord', consider warning or blocking
        // cross-channel sends. For now, channel affinity is enforced via prompt-level routing
        // hints in prependRoutingContext() and getResponseRoutingPrompt().

        // Resolve to_agent by name (case-insensitive) or ID
        const available = await ctx.agentDirectory.listAvailable();
        const match = available.find(
            (a) => a.agentId === args.to_agent ||
                a.agentName.toLowerCase() === args.to_agent.toLowerCase(),
        );

        if (!match) {
            return errorResult(`Agent not found: "${args.to_agent}". Use corvid_list_agents to see available agents.`);
        }

        if (match.agentId === ctx.agentId) {
            return errorResult('Cannot send a message to yourself.');
        }

        // Communication tier enforcement: messages flow downward in the hierarchy.
        // Top → anyone, Mid → mid + bottom, Bottom → bottom only.
        const senderAgent = getAgent(ctx.db, ctx.agentId);
        if (senderAgent) {
            const tierErr = checkCommunicationTier(senderAgent.name, match.agentName);
            if (tierErr) {
                return errorResult(tierErr);
            }
        }

        // Dedup: reject duplicate sends within the time window
        const key = sendKey(ctx.agentId, match.agentId, args.message);
        if (DedupService.global().isDuplicate(SEND_DEDUP_NS, key)) {
            log.warn('Duplicate send_message suppressed', {
                from: ctx.agentId,
                to: match.agentId,
                messagePreview: args.message.slice(0, 80),
            });
            return textResult('Message already sent (duplicate suppressed).');
        }

        log.info(`MCP send_message: ${ctx.agentId} → ${match.agentId}`, {
            depth,
            messagePreview: args.message.slice(0, 100),
            thread: args.thread ?? 'new',
        });

        ctx.emitStatus?.(`Querying ${match.agentName}...`);

        const { response, threadId } = await ctx.agentMessenger.invokeAndWait({
            fromAgentId: ctx.agentId,
            toAgentId: match.agentId,
            content: args.message,
            threadId: args.thread,
            depth: depth + 1,
        });

        ctx.emitStatus?.(`Received reply from ${match.agentName}`);

        // Record successful send for session rate limiting (#1054)
        ctx.messageRateLimiter?.record(match.agentId);

        return textResult(`${response}\n\n[thread: ${threadId}]`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP send_message failed', { error: message });
        return errorResult(`Failed to send message: ${message}`);
    }
}

export async function handleListAgents(
    ctx: McpToolContext,
): Promise<CallToolResult> {
    try {
        const available = await ctx.agentDirectory.listAvailable();
        const others = available.filter((a) => a.agentId !== ctx.agentId);

        if (others.length === 0) {
            return textResult('No other agents available.');
        }

        // Cross-reference Flock Directory for capabilities and reputation
        const flockSvc = ctx.flockDirectoryService;

        const lines = others.map((a) => {
            let extra = '';
            if (flockSvc && a.walletAddress) {
                const flockAgent = flockSvc.getByAddress(a.walletAddress);
                if (flockAgent) {
                    const caps = flockAgent.capabilities.length > 0
                        ? ` [${flockAgent.capabilities.join(', ')}]`
                        : '';
                    const rep = flockAgent.reputationScore > 0
                        ? ` rep: ${flockAgent.reputationScore}`
                        : '';
                    extra = `${caps}${rep}`;
                }
            }
            const wallet = a.walletAddress ? ` (wallet: ${a.walletAddress})` : '';
            return `- ${a.agentName} [${a.agentId}]${wallet}${extra}`;
        });

        return textResult(`Available agents:\n\n${lines.join('\n')}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP list_agents failed', { error: message });
        return errorResult(`Failed to list agents: ${message}`);
    }
}
