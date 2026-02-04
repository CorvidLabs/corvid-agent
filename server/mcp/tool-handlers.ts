import type { Database } from 'bun:sqlite';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AgentDirectory } from '../algochat/agent-directory';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { WorkTaskService } from '../work/service';
import { saveMemory, recallMemory, searchMemories, listMemories, updateMemoryTxid } from '../db/agent-memories';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { encryptMemoryContent } from '../lib/crypto';
import { createLogger } from '../lib/logger';

const log = createLogger('McpToolHandlers');

const MAX_INVOKE_DEPTH = 3;

// Dedup: track recent sends to prevent Claude from calling the tool twice
// with the same content in the same turn. Key = hash, value = timestamp.
const recentSends = new Map<string, number>();
const DEDUP_WINDOW_MS = 30_000; // 30 seconds

function sendKey(agentId: string, toAgent: string, message: string): string {
    // Simple hash: agent pair + first 200 chars of message
    return `${agentId}:${toAgent}:${message.slice(0, 200)}`;
}

/** Returns true if this key was already sent within the dedup window.
 *  First call with a given key records it and returns false (allow).
 *  Subsequent calls within the window return true (duplicate). */
function isDuplicateSend(key: string): boolean {
    const now = Date.now();
    // Prune expired entries
    for (const [k, ts] of recentSends) {
        if (now - ts > DEDUP_WINDOW_MS) recentSends.delete(k);
    }
    if (recentSends.has(key)) return true;
    recentSends.set(key, now);
    return false;
}

export interface McpToolContext {
    agentId: string;
    db: Database;
    agentMessenger: AgentMessenger;
    agentDirectory: AgentDirectory;
    agentWalletService: AgentWalletService;
    depth?: number;
    /** Session source — 'agent' sessions cannot use corvid_send_message. */
    sessionSource?: string;
    /** Emit a status message for UI progress updates (e.g. "Querying CorvidLabs..."). */
    emitStatus?: (message: string) => void;
    /** Server mnemonic for encryption (from AlgoChat config). */
    serverMnemonic?: string | null;
    /** Network name for encryption key policy (localnet allows default key). */
    network?: string;
    /** Work task service for creating agent work tasks. */
    workTaskService?: WorkTaskService;
}

function textResult(text: string): CallToolResult {
    return { content: [{ type: 'text', text }] };
}

function errorResult(text: string): CallToolResult {
    return { content: [{ type: 'text', text }], isError: true };
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

    try {
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

        // Dedup: reject duplicate sends within the time window
        const key = sendKey(ctx.agentId, match.agentId, args.message);
        if (isDuplicateSend(key)) {
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
        });

        ctx.emitStatus?.(`Received reply from ${match.agentName}`);

        return textResult(`${response}\n\n[thread: ${threadId}]`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP send_message failed', { error: message });
        return errorResult(`Failed to send message: ${message}`);
    }
}

export async function handleSaveMemory(
    ctx: McpToolContext,
    args: { key: string; content: string },
): Promise<CallToolResult> {
    try {
        const memory = saveMemory(ctx.db, {
            agentId: ctx.agentId,
            key: args.key,
            content: args.content,
        });

        // Fire-and-forget: store encrypted on-chain for audit trail
        encryptMemoryContent(args.content, ctx.serverMnemonic, ctx.network).then((encrypted) => {
            return ctx.agentMessenger.sendOnChainToSelf(
                ctx.agentId,
                `[MEMORY:${args.key}] ${encrypted}`,
            );
        }).then((txid) => {
            if (txid) {
                updateMemoryTxid(ctx.db, memory.id, txid);
            }
        }).catch((err) => {
            log.debug('On-chain memory send failed', {
                error: err instanceof Error ? err.message : String(err),
            });
        });

        return textResult(`Memory saved with key "${args.key}".`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP save_memory failed', { error: message });
        return errorResult(`Failed to save memory: ${message}`);
    }
}

export async function handleRecallMemory(
    ctx: McpToolContext,
    args: { key?: string; query?: string },
): Promise<CallToolResult> {
    try {
        if (args.key) {
            const memory = recallMemory(ctx.db, ctx.agentId, args.key);
            if (!memory) {
                return textResult(`No memory found with key "${args.key}".`);
            }
            return textResult(`[${memory.key}] ${memory.content}\n(saved: ${memory.updatedAt})`);
        }

        if (args.query) {
            const memories = searchMemories(ctx.db, ctx.agentId, args.query);
            if (memories.length === 0) {
                return textResult(`No memories found matching "${args.query}".`);
            }
            const lines = memories.map((m) => `[${m.key}] ${m.content}`);
            return textResult(`Found ${memories.length} memor${memories.length === 1 ? 'y' : 'ies'}:\n\n${lines.join('\n')}`);
        }

        // No key or query — list recent memories
        const memories = listMemories(ctx.db, ctx.agentId);
        if (memories.length === 0) {
            return textResult('No memories saved yet.');
        }
        const lines = memories.map((m) => `[${m.key}] ${m.content}`);
        return textResult(`Your ${memories.length} most recent memor${memories.length === 1 ? 'y' : 'ies'}:\n\n${lines.join('\n')}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP recall_memory failed', { error: message });
        return errorResult(`Failed to recall memory: ${message}`);
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

        const lines = others.map((a) => {
            const wallet = a.walletAddress ? ` (wallet: ${a.walletAddress})` : '';
            return `- ${a.agentName} [${a.agentId}]${wallet}`;
        });

        return textResult(`Available agents:\n\n${lines.join('\n')}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP list_agents failed', { error: message });
        return errorResult(`Failed to list agents: ${message}`);
    }
}

// Rate limiter for corvid_create_work_task: max 5 per agent per day (persisted via DB)
const WORK_TASK_MAX_PER_DAY = 5;

function checkWorkTaskRateLimit(db: Database, agentId: string): boolean {
    const row = db.query(
        `SELECT COUNT(*) as count FROM work_tasks WHERE agent_id = ? AND date(created_at) = date('now')`
    ).get(agentId) as { count: number } | null;
    return (row?.count ?? 0) < WORK_TASK_MAX_PER_DAY;
}

export async function handleCreateWorkTask(
    ctx: McpToolContext,
    args: { description: string; project_id?: string },
): Promise<CallToolResult> {
    if (!ctx.workTaskService) {
        return errorResult('Work task service is not available.');
    }

    if (!checkWorkTaskRateLimit(ctx.db, ctx.agentId)) {
        return errorResult(`Rate limit exceeded: maximum ${WORK_TASK_MAX_PER_DAY} work tasks per day.`);
    }

    try {
        ctx.emitStatus?.('Creating work task...');

        const task = await ctx.workTaskService.create({
            agentId: ctx.agentId,
            description: args.description,
            projectId: args.project_id,
            source: 'agent',
        });

        log.info('MCP create_work_task succeeded', {
            agentId: ctx.agentId,
            taskId: task.id,
            status: task.status,
        });

        return textResult(
            `Work task created.\n` +
            `  ID: ${task.id}\n` +
            `  Status: ${task.status}\n` +
            `  Branch: ${task.branchName ?? '(pending)'}`,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP create_work_task failed', { error: message });
        return errorResult(`Failed to create work task: ${message}`);
    }
}
