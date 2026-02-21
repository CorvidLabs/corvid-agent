import type { Database } from 'bun:sqlite';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AgentDirectory } from '../algochat/agent-directory';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { WorkTaskService } from '../work/service';
import type { SchedulerService } from '../scheduler/service';
import type { WorkflowService } from '../workflow/service';
import type { OwnerQuestionManager } from '../process/owner-question-manager';
import type { NotificationService } from '../notifications/service';
import type { QuestionDispatcher } from '../notifications/question-dispatcher';
import type { ReputationScorer } from '../reputation/scorer';
import type { ReputationAttestation } from '../reputation/attestation';
import type { ReputationVerifier } from '../reputation/verifier';
import type { AstParserService } from '../ast/service';
import type { AstSymbolKind } from '../ast/types';
import { getRecentSnapshots, computeTrends, formatTrendsForPrompt } from '../improvement/health-store';
import { invokeRemoteAgent } from '../a2a/client';
import {
    listChannelsForAgent,
    upsertChannel,
    updateChannelEnabled,
    deleteChannel,
    getChannelByAgentAndType,
} from '../db/notifications';
import { getAgent } from '../db/agents';
import { getProject } from '../db/projects';
import { listSchedules, createSchedule, updateSchedule, listExecutions } from '../db/schedules';
import { listWorkflows, createWorkflow, updateWorkflow, getWorkflow, listWorkflowRuns, getWorkflowRun } from '../db/workflows';
import { validateScheduleFrequency } from '../scheduler/service';
import { saveMemory, recallMemory, searchMemories, listMemories, updateMemoryTxid, updateMemoryStatus } from '../db/agent-memories';
import {
    getBalance,
    getCreditConfig,
    grantCredits,
    updateCreditConfig,
} from '../db/credits';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { encryptMemoryContent } from '../lib/crypto';
import { createLogger } from '../lib/logger';
import { braveWebSearch, braveMultiSearch } from '../lib/web-search';
import * as github from '../github/operations';
import { discoverAgent } from '../a2a/client';

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
    /** Session source — 'web', 'algochat', or 'agent'. */
    sessionSource?: string;
    /** Emit a status message for UI progress updates (e.g. "Querying CorvidLabs..."). */
    emitStatus?: (message: string) => void;
    /** Server mnemonic for encryption (from AlgoChat config). */
    serverMnemonic?: string | null;
    /** Network name for encryption key policy (localnet allows default key). */
    network?: string;
    /** Work task service for creating agent work tasks. */
    workTaskService?: WorkTaskService;
    /** Scheduler service for managing automated schedules. */
    schedulerService?: SchedulerService;
    /** Workflow service for graph-based orchestration. */
    workflowService?: WorkflowService;
    /** Extend the current session's timeout by the given ms. */
    extendTimeout?: (additionalMs: number) => boolean;
    /** True when the session was started by the scheduler — restricts certain tools. */
    schedulerMode?: boolean;
    /** Broadcast a message to all connected WS clients on the 'owner' topic. */
    broadcastOwnerMessage?: (message: unknown) => void;
    /** Owner question manager for blocking agent→owner questions. */
    ownerQuestionManager?: OwnerQuestionManager;
    /** Session ID for this agent session (needed for question tracking). */
    sessionId?: string;
    /** Notification service for multi-channel owner notifications. */
    notificationService?: NotificationService;
    /** Question dispatcher for sending questions to external channels. */
    questionDispatcher?: QuestionDispatcher;
    /** Reputation scorer for querying agent reputation. */
    reputationScorer?: ReputationScorer;
    /** Reputation attestation service for publishing on-chain. */
    reputationAttestation?: ReputationAttestation;
    /** Reputation verifier for scanning remote agent attestations. */
    reputationVerifier?: ReputationVerifier;
    /** Pre-resolved tool permissions (agent base + skill bundle tools + project bundle tools).
     *  When set, used instead of reading agent.mcpToolPermissions directly. */
    resolvedToolPermissions?: string[] | null;
    /** AST parser service for structural code navigation (corvid_code_symbols, corvid_find_references). */
    astParserService?: AstParserService;
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
            depth: depth + 1,
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

        const isLocalnet = ctx.network === 'localnet' || !ctx.network;

        if (isLocalnet) {
            // Localnet: await on-chain write — zero cost, always available
            try {
                const encrypted = await encryptMemoryContent(args.content, ctx.serverMnemonic, ctx.network);
                const txid = await ctx.agentMessenger.sendOnChainToSelf(
                    ctx.agentId,
                    `[MEMORY:${args.key}] ${encrypted}`,
                );
                if (txid) {
                    updateMemoryTxid(ctx.db, memory.id, txid);
                    return textResult(`Memory saved with key "${args.key}".`);
                }
                // sendOnChainToSelf returned null — no wallet configured
                return textResult(`Memory saved with key "${args.key}".`);
            } catch (err) {
                log.warn('On-chain memory send failed (localnet)', {
                    key: args.key,
                    error: err instanceof Error ? err.message : String(err),
                });
                updateMemoryStatus(ctx.db, memory.id, 'failed');
                // Local save succeeded — don't expose on-chain failure to the model
                // (confusing error text causes Ollama models to retry the save)
                return textResult(`Memory saved with key "${args.key}".`);
            }
        } else {
            // Testnet/mainnet: fire-and-forget (costs ALGO, may be slow)
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
                updateMemoryStatus(ctx.db, memory.id, 'failed');
            });

            return textResult(`Memory saved with key "${args.key}".`);
        }
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
            const chainTag = memory.status === 'confirmed' ? `(on-chain: ${memory.txid?.slice(0, 8)}...)` : memory.status === 'pending' ? '(pending)' : '(sync-failed — will retry)';
            return textResult(`[${memory.key}] ${memory.content}\n(saved: ${memory.updatedAt}) ${chainTag}`);
        }

        if (args.query) {
            const memories = searchMemories(ctx.db, ctx.agentId, args.query);
            if (memories.length === 0) {
                return textResult(`No memories found matching "${args.query}".`);
            }
            const lines = memories.map((m) => {
                const tag = m.status === 'confirmed' ? `[on-chain]` : m.status === 'pending' ? `[pending]` : `[sync-failed]`;
                return `${tag} [${m.key}] ${m.content}`;
            });
            return textResult(`Found ${memories.length} memor${memories.length === 1 ? 'y' : 'ies'}:\n\n${lines.join('\n')}`);
        }

        // No key or query — list recent memories
        const memories = listMemories(ctx.db, ctx.agentId);
        if (memories.length === 0) {
            return textResult('No memories saved yet.');
        }
        const lines = memories.map((m) => {
            const tag = m.status === 'confirmed' ? `[on-chain]` : m.status === 'pending' ? `[pending]` : `[sync-failed]`;
            return `${tag} [${m.key}] ${m.content}`;
        });
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

// ─── Credit system handlers ──────────────────────────────────────────────

export async function handleCheckCredits(
    ctx: McpToolContext,
    args: { wallet_address?: string },
): Promise<CallToolResult> {
    try {
        const walletAddress = args.wallet_address;
        if (!walletAddress) {
            return errorResult('No wallet address provided. Use this tool with a wallet address to check credits.');
        }

        const balance = getBalance(ctx.db, walletAddress);
        const config = getCreditConfig(ctx.db);

        const lines = [
            `Credit Balance for ${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}:`,
            `  Available: ${balance.available} credits`,
            `  Reserved: ${balance.reserved} credits`,
            `  Total: ${balance.credits} credits`,
            `  Lifetime purchased: ${balance.totalPurchased}`,
            `  Lifetime consumed: ${balance.totalConsumed}`,
            ``,
            `Rates: 1 ALGO = ${config.creditsPerAlgo} credits, 1 turn = ${config.creditsPerTurn} credit(s)`,
            `Low credit threshold: ${config.lowCreditThreshold}`,
        ];

        return textResult(lines.join('\n'));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP check_credits failed', { error: message });
        return errorResult(`Failed to check credits: ${message}`);
    }
}

export async function handleGrantCredits(
    ctx: McpToolContext,
    args: { wallet_address: string; amount: number; reason?: string },
): Promise<CallToolResult> {
    try {
        if (args.amount <= 0 || args.amount > 1_000_000) {
            return errorResult('Amount must be between 1 and 1,000,000');
        }

        grantCredits(ctx.db, args.wallet_address, args.amount, args.reason ?? 'agent_grant');
        const balance = getBalance(ctx.db, args.wallet_address);

        return textResult(
            `Granted ${args.amount} credits to ${args.wallet_address.slice(0, 8)}...\n` +
            `New balance: ${balance.available} available (${balance.credits} total)`
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP grant_credits failed', { error: message });
        return errorResult(`Failed to grant credits: ${message}`);
    }
}

export async function handleCreditConfig(
    ctx: McpToolContext,
    args: { key?: string; value?: string },
): Promise<CallToolResult> {
    try {
        if (args.key && args.value) {
            updateCreditConfig(ctx.db, args.key, args.value);
            return textResult(`Credit config updated: ${args.key} = ${args.value}`);
        }

        const config = getCreditConfig(ctx.db);
        const lines = Object.entries(config).map(([k, v]) => `  ${k}: ${v}`);
        return textResult(`Credit Configuration:\n${lines.join('\n')}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP credit_config failed', { error: message });
        return errorResult(`Failed to manage credit config: ${message}`);
    }
}

// Rate limiter for corvid_create_work_task (persisted via DB)
const WORK_TASK_MAX_PER_DAY = parseInt(process.env.WORK_TASK_MAX_PER_DAY ?? '100', 10);

function checkWorkTaskRateLimit(db: Database, agentId: string): boolean {
    const row = db.query(
        `SELECT COUNT(*) as count FROM work_tasks WHERE agent_id = ? AND date(created_at) = date('now')`
    ).get(agentId) as { count: number } | null;
    return (row?.count ?? 0) < WORK_TASK_MAX_PER_DAY;
}

export async function handleManageSchedule(
    ctx: McpToolContext,
    args: {
        action: 'list' | 'create' | 'pause' | 'resume' | 'history';
        name?: string;
        description?: string;
        cron_expression?: string;
        interval_minutes?: number;
        schedule_actions?: Array<{ type: string; repos?: string[]; description?: string; project_id?: string; to_agent_id?: string; message?: string; prompt?: string }>;
        approval_policy?: string;
        schedule_id?: string;
    },
): Promise<CallToolResult> {
    try {
        switch (args.action) {
            case 'list': {
                const schedules = listSchedules(ctx.db, ctx.agentId);
                if (schedules.length === 0) return textResult('No schedules found.');
                const lines = schedules.map((s) =>
                    `- ${s.name} [${s.id}] status=${s.status} executions=${s.executionCount}${s.nextRunAt ? ` next=${s.nextRunAt}` : ''}`
                );
                return textResult(`Your schedules:\n\n${lines.join('\n')}`);
            }

            case 'create': {
                if (!args.name || !args.schedule_actions?.length) {
                    return errorResult('name and schedule_actions are required to create a schedule');
                }
                if (!args.cron_expression && !args.interval_minutes) {
                    return errorResult('Either cron_expression or interval_minutes is required');
                }

                const intervalMs = args.interval_minutes ? args.interval_minutes * 60 * 1000 : undefined;
                validateScheduleFrequency(args.cron_expression, intervalMs);

                const actions = args.schedule_actions.map((a) => ({
                    type: a.type as import('../../shared/types').ScheduleActionType,
                    repos: a.repos,
                    description: a.description,
                    projectId: a.project_id,
                    toAgentId: a.to_agent_id,
                    message: a.message,
                    prompt: a.prompt,
                }));

                const schedule = createSchedule(ctx.db, {
                    agentId: ctx.agentId,
                    name: args.name,
                    description: args.description,
                    cronExpression: args.cron_expression,
                    intervalMs: intervalMs,
                    actions,
                    approvalPolicy: (args.approval_policy as 'auto' | 'owner_approve' | 'council_approve') ?? 'owner_approve',
                });

                return textResult(
                    `Schedule created!\n` +
                    `  ID: ${schedule.id}\n` +
                    `  Name: ${schedule.name}\n` +
                    `  Status: ${schedule.status}\n` +
                    `  Next run: ${schedule.nextRunAt ?? 'pending calculation'}`,
                );
            }

            case 'pause': {
                if (!args.schedule_id) return errorResult('schedule_id is required');
                const updated = updateSchedule(ctx.db, args.schedule_id, { status: 'paused' });
                if (!updated) return errorResult('Schedule not found');
                return textResult(`Schedule "${updated.name}" paused.`);
            }

            case 'resume': {
                if (!args.schedule_id) return errorResult('schedule_id is required');
                const updated = updateSchedule(ctx.db, args.schedule_id, { status: 'active' });
                if (!updated) return errorResult('Schedule not found');
                return textResult(`Schedule "${updated.name}" resumed.`);
            }

            case 'history': {
                const scheduleId = args.schedule_id;
                const executions = listExecutions(ctx.db, scheduleId, 20);
                if (executions.length === 0) return textResult('No executions found.');
                const lines = executions.map((e) =>
                    `- [${e.id.slice(0, 8)}] ${e.actionType} status=${e.status} ${e.startedAt}${e.result ? ` — ${e.result.slice(0, 100)}` : ''}`
                );
                return textResult(`Recent executions:\n\n${lines.join('\n')}`);
            }

            default:
                return errorResult(`Unknown action: ${args.action}. Use list, create, pause, resume, or history.`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP manage_schedule failed', { error: message });
        return errorResult(`Failed to manage schedule: ${message}`);
    }
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

// ─── Web search handlers ─────────────────────────────────────────────────

export async function handleWebSearch(
    ctx: McpToolContext,
    args: { query: string; count?: number; freshness?: string },
): Promise<CallToolResult> {
    if (!args.query?.trim()) {
        return errorResult('A search query is required.');
    }

    try {
        ctx.emitStatus?.(`Searching the web for "${args.query}"...`);

        const results = await braveWebSearch(args.query, {
            count: args.count,
            freshness: args.freshness as 'pd' | 'pw' | 'pm' | 'py' | undefined,
        });

        if (results.length === 0) {
            return textResult(
                'No results found. This may mean BRAVE_SEARCH_API_KEY is not configured, or the query returned no matches.',
            );
        }

        const lines = results.map(
            (r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}${r.age ? ` (${r.age})` : ''}`,
        );

        ctx.emitStatus?.(`Found ${results.length} results`);
        return textResult(`Web search results for "${args.query}":\n\n${lines.join('\n\n')}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP web_search failed', { error: message });
        return errorResult(`Web search failed: ${message}`);
    }
}

// ─── GitHub handlers ─────────────────────────────────────────────────────

export async function handleGitHubStarRepo(
    _ctx: McpToolContext,
    args: { repo: string },
): Promise<CallToolResult> {
    try {
        const result = await github.starRepo(args.repo);
        return result.ok ? textResult(result.message) : errorResult(result.message);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to star repo: ${message}`);
    }
}

export async function handleGitHubUnstarRepo(
    _ctx: McpToolContext,
    args: { repo: string },
): Promise<CallToolResult> {
    try {
        const result = await github.unstarRepo(args.repo);
        return result.ok ? textResult(result.message) : errorResult(result.message);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to unstar repo: ${message}`);
    }
}

export async function handleGitHubForkRepo(
    _ctx: McpToolContext,
    args: { repo: string; org?: string },
): Promise<CallToolResult> {
    try {
        const result = await github.forkRepo(args.repo, args.org);
        if (!result.ok) return errorResult(result.message);
        const extra = result.forkUrl ? ` (${result.forkUrl})` : '';
        return textResult(`${result.message}${extra}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to fork repo: ${message}`);
    }
}

export async function handleGitHubListPrs(
    _ctx: McpToolContext,
    args: { repo: string; limit?: number },
): Promise<CallToolResult> {
    try {
        const result = await github.listOpenPrs(args.repo, args.limit ?? 10);
        if (!result.ok) return errorResult(result.error ?? 'Failed to list PRs');
        if (result.prs.length === 0) return textResult(`No open PRs in ${args.repo}.`);

        const lines = result.prs.map((pr) =>
            `#${pr.number} ${pr.title} (by ${pr.author}, +${pr.additions}/-${pr.deletions}, ${pr.changedFiles} files)\n   ${pr.url}`
        );
        return textResult(`Open PRs in ${args.repo}:\n\n${lines.join('\n\n')}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to list PRs: ${message}`);
    }
}

export async function handleGitHubCreatePr(
    _ctx: McpToolContext,
    args: { repo: string; title: string; body: string; head: string; base?: string },
): Promise<CallToolResult> {
    try {
        const result = await github.createPr(args.repo, args.title, args.body, args.head, args.base ?? 'main');
        if (!result.ok) return errorResult(result.error ?? 'Failed to create PR');
        return textResult(`PR created: ${result.prUrl ?? 'success'}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to create PR: ${message}`);
    }
}

export async function handleGitHubReviewPr(
    _ctx: McpToolContext,
    args: { repo: string; pr_number: number; event: string; body: string },
): Promise<CallToolResult> {
    try {
        const event = args.event.toUpperCase() as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
        if (!['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(event)) {
            return errorResult(`Invalid review event: ${args.event}. Use APPROVE, REQUEST_CHANGES, or COMMENT.`);
        }
        const result = await github.addPrReview(args.repo, args.pr_number, event, args.body);
        if (!result.ok) return errorResult(result.error ?? 'Failed to review PR');
        return textResult(`PR #${args.pr_number} reviewed with ${event}.`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to review PR: ${message}`);
    }
}

export async function handleGitHubCreateIssue(
    _ctx: McpToolContext,
    args: { repo: string; title: string; body: string; labels?: string[] },
): Promise<CallToolResult> {
    try {
        const result = await github.createIssue(args.repo, args.title, args.body, args.labels);
        if (!result.ok) return errorResult(result.error ?? 'Failed to create issue');
        return textResult(`Issue created: ${result.issueUrl ?? 'success'}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to create issue: ${message}`);
    }
}

export async function handleGitHubListIssues(
    _ctx: McpToolContext,
    args: { repo: string; state?: string; limit?: number },
): Promise<CallToolResult> {
    try {
        const state = (args.state ?? 'open') as 'open' | 'closed' | 'all';
        const result = await github.listIssues(args.repo, state, args.limit ?? 30);
        if (!result.ok) return errorResult(result.error ?? 'Failed to list issues');
        if (result.issues.length === 0) return textResult(`No ${state} issues in ${args.repo}.`);

        const lines = result.issues.map((issue) => {
            const labels = issue.labels.length > 0 ? ` [${issue.labels.map((l) => l.name).join(', ')}]` : '';
            return `#${issue.number} ${issue.title}${labels}\n   ${issue.url}`;
        });
        return textResult(`${state.charAt(0).toUpperCase() + state.slice(1)} issues in ${args.repo}:\n\n${lines.join('\n\n')}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to list issues: ${message}`);
    }
}

export async function handleGitHubRepoInfo(
    _ctx: McpToolContext,
    args: { repo: string },
): Promise<CallToolResult> {
    try {
        const result = await github.getRepoInfo(args.repo);
        if (!result.ok) return errorResult(result.error ?? 'Failed to get repo info');
        return textResult(JSON.stringify(result.info, null, 2));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to get repo info: ${message}`);
    }
}

export async function handleGitHubGetPrDiff(
    _ctx: McpToolContext,
    args: { repo: string; pr_number: number },
): Promise<CallToolResult> {
    try {
        const result = await github.getPrDiff(args.repo, args.pr_number);
        if (!result.ok) return errorResult(result.error ?? 'Failed to get PR diff');
        if (!result.diff) return textResult(`PR #${args.pr_number} has no diff (empty).`);
        return textResult(result.diff);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to get PR diff: ${message}`);
    }
}

export async function handleGitHubCommentOnPr(
    _ctx: McpToolContext,
    args: { repo: string; pr_number: number; body: string },
): Promise<CallToolResult> {
    try {
        const result = await github.addPrComment(args.repo, args.pr_number, args.body);
        if (!result.ok) return errorResult(result.error ?? 'Failed to comment on PR');
        return textResult(`Comment added to PR #${args.pr_number} in ${args.repo}.`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to comment on PR: ${message}`);
    }
}

export async function handleGitHubFollowUser(
    _ctx: McpToolContext,
    args: { username: string },
): Promise<CallToolResult> {
    try {
        const result = await github.followUser(args.username);
        return result.ok ? textResult(result.message) : errorResult(result.message);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to follow user: ${message}`);
    }
}

// ─── Workflow handlers ──────────────────────────────────────────────────

export async function handleManageWorkflow(
    ctx: McpToolContext,
    args: {
        action: 'list' | 'create' | 'get' | 'activate' | 'pause' | 'trigger' | 'runs' | 'run_status';
        workflow_id?: string;
        run_id?: string;
        name?: string;
        description?: string;
        nodes?: Array<{ id: string; type: string; label: string; config?: Record<string, unknown>; position?: { x: number; y: number } }>;
        edges?: Array<{ id: string; sourceNodeId: string; targetNodeId: string; condition?: string; label?: string }>;
        default_project_id?: string;
        max_concurrency?: number;
        input?: Record<string, unknown>;
    },
): Promise<CallToolResult> {
    try {
        switch (args.action) {
            case 'list': {
                const workflows = listWorkflows(ctx.db, ctx.agentId);
                if (workflows.length === 0) return textResult('No workflows found.');
                const lines = workflows.map((w) =>
                    `- ${w.name} [${w.id}] status=${w.status} nodes=${w.nodes.length} edges=${w.edges.length}`
                );
                return textResult(`Your workflows:\n\n${lines.join('\n')}`);
            }

            case 'create': {
                if (!args.name || !args.nodes?.length) {
                    return errorResult('name and nodes are required to create a workflow');
                }

                const hasStart = args.nodes.some((n) => n.type === 'start');
                if (!hasStart) {
                    return errorResult('Workflow must have at least one start node');
                }

                const nodes = args.nodes.map((n) => ({
                    id: n.id,
                    type: n.type as import('../../shared/types').WorkflowNodeType,
                    label: n.label,
                    config: n.config ?? {},
                    position: n.position,
                }));

                const edges = (args.edges ?? []).map((e) => ({
                    id: e.id,
                    sourceNodeId: e.sourceNodeId,
                    targetNodeId: e.targetNodeId,
                    condition: e.condition,
                    label: e.label,
                }));

                const workflow = createWorkflow(ctx.db, {
                    agentId: ctx.agentId,
                    name: args.name,
                    description: args.description,
                    nodes,
                    edges,
                    defaultProjectId: args.default_project_id,
                    maxConcurrency: args.max_concurrency,
                });

                return textResult(
                    `Workflow created!\n` +
                    `  ID: ${workflow.id}\n` +
                    `  Name: ${workflow.name}\n` +
                    `  Status: ${workflow.status} (use activate to enable)\n` +
                    `  Nodes: ${workflow.nodes.length}\n` +
                    `  Edges: ${workflow.edges.length}`,
                );
            }

            case 'get': {
                if (!args.workflow_id) return errorResult('workflow_id is required');
                const workflow = getWorkflow(ctx.db, args.workflow_id);
                if (!workflow) return errorResult('Workflow not found');

                const nodeList = workflow.nodes.map((n) => `  - ${n.id}: ${n.type} "${n.label}"`).join('\n');
                const edgeList = workflow.edges.map((e) =>
                    `  - ${e.sourceNodeId} → ${e.targetNodeId}${e.condition ? ` (${e.condition})` : ''}`
                ).join('\n');

                return textResult(
                    `Workflow: ${workflow.name} [${workflow.id}]\n` +
                    `Status: ${workflow.status}\n` +
                    `Description: ${workflow.description}\n\n` +
                    `Nodes:\n${nodeList}\n\n` +
                    `Edges:\n${edgeList}`,
                );
            }

            case 'activate': {
                if (!args.workflow_id) return errorResult('workflow_id is required');
                const updated = updateWorkflow(ctx.db, args.workflow_id, { status: 'active' });
                if (!updated) return errorResult('Workflow not found');
                return textResult(`Workflow "${updated.name}" activated. It can now be triggered.`);
            }

            case 'pause': {
                if (!args.workflow_id) return errorResult('workflow_id is required');
                const updated = updateWorkflow(ctx.db, args.workflow_id, { status: 'paused' });
                if (!updated) return errorResult('Workflow not found');
                return textResult(`Workflow "${updated.name}" paused.`);
            }

            case 'trigger': {
                if (!args.workflow_id) return errorResult('workflow_id is required');
                if (!ctx.workflowService) return errorResult('Workflow service not available');

                const run = await ctx.workflowService.triggerWorkflow(args.workflow_id, args.input ?? {});
                return textResult(
                    `Workflow triggered!\n` +
                    `  Run ID: ${run.id}\n` +
                    `  Status: ${run.status}\n` +
                    `  Current nodes: ${run.currentNodeIds.join(', ')}`,
                );
            }

            case 'runs': {
                const runs = listWorkflowRuns(ctx.db, args.workflow_id, 20);
                if (runs.length === 0) return textResult('No workflow runs found.');
                const lines = runs.map((r) =>
                    `- [${r.id.slice(0, 8)}] workflow=${r.workflowId.slice(0, 8)} status=${r.status} started=${r.startedAt}${r.error ? ` error="${r.error.slice(0, 80)}"` : ''}`
                );
                return textResult(`Recent workflow runs:\n\n${lines.join('\n')}`);
            }

            case 'run_status': {
                if (!args.run_id) return errorResult('run_id is required');
                const run = getWorkflowRun(ctx.db, args.run_id);
                if (!run) return errorResult('Run not found');

                const nodeLines = run.nodeRuns.map((nr) =>
                    `  - ${nr.nodeId} (${nr.nodeType}): ${nr.status}${nr.error ? ` — ${nr.error.slice(0, 80)}` : ''}${nr.sessionId ? ` session=${nr.sessionId.slice(0, 8)}` : ''}`
                );

                return textResult(
                    `Workflow Run: ${run.id}\n` +
                    `Status: ${run.status}\n` +
                    `Started: ${run.startedAt}\n` +
                    `Completed: ${run.completedAt ?? 'in progress'}\n` +
                    `Current nodes: ${run.currentNodeIds.join(', ') || 'none'}\n\n` +
                    `Node executions:\n${nodeLines.join('\n') || '  (none yet)'}`,
                );
            }

            default:
                return errorResult(`Unknown action: ${args.action}. Use list, create, get, activate, pause, trigger, runs, or run_status.`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP manage_workflow failed', { error: message });
        return errorResult(`Failed to manage workflow: ${message}`);
    }
}

// ─── A2A discovery handler ────────────────────────────────────────────────

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

// ─── Owner communication handlers ────────────────────────────────────────

export async function handleNotifyOwner(
    ctx: McpToolContext,
    args: { title?: string; message: string; level?: string },
): Promise<CallToolResult> {
    const level = args.level ?? 'info';
    const validLevels = ['info', 'warning', 'success', 'error'];
    if (!validLevels.includes(level)) {
        return errorResult(`Invalid level "${level}". Use one of: ${validLevels.join(', ')}`);
    }

    if (!args.message?.trim()) {
        return errorResult('A message is required.');
    }

    // Use NotificationService for multi-channel dispatch when available
    if (ctx.notificationService) {
        try {
            const result = await ctx.notificationService.notify({
                agentId: ctx.agentId,
                sessionId: ctx.sessionId,
                title: args.title,
                message: args.message,
                level,
            });

            log.info('Agent notification sent (multi-channel)', {
                agentId: ctx.agentId,
                level,
                notificationId: result.notificationId,
                channels: result.channels,
            });

            const channelList = result.channels.length > 0 ? result.channels.join(', ') : 'websocket';
            return textResult(
                `Notification sent to owner via [${channelList}]: "${args.message.slice(0, 100)}${args.message.length > 100 ? '...' : ''}"`,
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error('Multi-channel notification failed, falling back to WS', { error: message });
            // Fall through to WebSocket-only fallback
        }
    }

    // Fallback: WebSocket-only broadcast
    const notification = {
        type: 'agent_notification',
        agentId: ctx.agentId,
        sessionId: ctx.sessionId ?? '',
        title: args.title ?? null,
        message: args.message,
        level,
        timestamp: new Date().toISOString(),
    };

    if (ctx.broadcastOwnerMessage) {
        ctx.broadcastOwnerMessage(notification);
    }

    log.info('Agent notification sent', {
        agentId: ctx.agentId,
        level,
        messagePreview: args.message.slice(0, 100),
    });

    return textResult(`Notification sent to owner: "${args.message.slice(0, 100)}${args.message.length > 100 ? '...' : ''}"`);
}

export async function handleAskOwner(
    ctx: McpToolContext,
    args: { question: string; options?: string[]; context?: string; timeout_minutes?: number },
): Promise<CallToolResult> {
    if (!ctx.ownerQuestionManager) {
        return errorResult('Owner question service is not available.');
    }

    if (!args.question?.trim()) {
        return errorResult('A question is required.');
    }

    const timeoutMinutes = Math.max(1, Math.min(args.timeout_minutes ?? 2, 10));
    const timeoutMs = timeoutMinutes * 60 * 1000;

    // Broadcast the question to all connected WS clients
    const questionData = {
        sessionId: ctx.sessionId ?? '',
        agentId: ctx.agentId,
        question: args.question,
        options: args.options ?? null,
        context: args.context ?? null,
        timeoutMs,
    };

    // Create the blocking question — this will return the question ID
    const responsePromise = ctx.ownerQuestionManager.createQuestion(questionData);

    // Get the pending question to retrieve its ID for the broadcast
    const pending = ctx.ownerQuestionManager.getPendingForSession(ctx.sessionId ?? '');
    const latestQuestion = pending[pending.length - 1];

    if (latestQuestion && ctx.broadcastOwnerMessage) {
        ctx.broadcastOwnerMessage({
            type: 'agent_question',
            question: latestQuestion,
        });
    }

    // Dispatch to configured external channels (GitHub, Telegram, AlgoChat)
    if (ctx.questionDispatcher && latestQuestion) {
        ctx.questionDispatcher.dispatch(latestQuestion).catch((err) => {
            log.warn('Question channel dispatch failed', { error: err instanceof Error ? err.message : String(err) });
        });
    }

    ctx.emitStatus?.(`Waiting for owner response (${timeoutMinutes}min timeout)...`);

    const response = await responsePromise;

    if (!response) {
        log.info('Owner did not respond to question', {
            agentId: ctx.agentId,
            questionPreview: args.question.slice(0, 100),
        });
        return textResult(
            `Owner did not respond within ${timeoutMinutes} minute${timeoutMinutes > 1 ? 's' : ''}. ` +
            'You may proceed with your best judgment or try again later.',
        );
    }

    log.info('Owner responded to question', {
        agentId: ctx.agentId,
        answerPreview: response.answer.slice(0, 100),
    });

    const optionInfo = response.selectedOption !== null && args.options
        ? ` (selected option ${response.selectedOption + 1}: "${args.options[response.selectedOption]}")`
        : '';
    return textResult(`Owner response: ${response.answer}${optionInfo}`);
}

/** Default sub-query suffixes appended to the topic for deep research. */
const DEEP_RESEARCH_ANGLES = ['benefits', 'challenges', 'examples', 'latest news'];

export async function handleDeepResearch(
    ctx: McpToolContext,
    args: { topic: string; sub_questions?: string[] },
): Promise<CallToolResult> {
    if (!args.topic?.trim()) {
        return errorResult('A research topic is required.');
    }

    try {
        // Build query list: main topic + sub-questions (up to 5 total)
        const subQuestions = args.sub_questions?.length
            ? args.sub_questions
            : DEEP_RESEARCH_ANGLES.map((angle) => `${args.topic} ${angle}`);

        const queries = [args.topic, ...subQuestions].slice(0, 5);

        ctx.emitStatus?.(`Researching "${args.topic}" with ${queries.length} queries...`);

        const grouped = await braveMultiSearch(queries, { count: 5 });

        if (grouped.length === 0 || grouped.every((g) => g.results.length === 0)) {
            return textResult(
                'No results found. This may mean BRAVE_SEARCH_API_KEY is not configured, or the queries returned no matches.',
            );
        }

        const sections: string[] = [];
        let totalResults = 0;

        for (const group of grouped) {
            if (group.results.length === 0) continue;
            totalResults += group.results.length;
            const items = group.results.map(
                (r, i) => `  ${i + 1}. **${r.title}**\n     ${r.url}\n     ${r.description}${r.age ? ` (${r.age})` : ''}`,
            );
            sections.push(`### ${group.query}\n\n${items.join('\n\n')}`);
        }

        ctx.emitStatus?.(`Research complete — ${totalResults} results across ${grouped.length} queries`);
        return textResult(
            `# Deep Research: ${args.topic}\n\n` +
            `*${totalResults} results from ${queries.length} queries (deduplicated)*\n\n` +
            sections.join('\n\n---\n\n'),
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP deep_research failed', { error: message });
        return errorResult(`Deep research failed: ${message}`);
    }
}

// ─── Notification configuration handler ──────────────────────────────────

const VALID_CHANNEL_TYPES = ['discord', 'telegram', 'github', 'algochat', 'slack'];

export async function handleConfigureNotifications(
    ctx: McpToolContext,
    args: {
        action: 'list' | 'set' | 'enable' | 'disable' | 'remove';
        channel_type?: string;
        config?: Record<string, unknown>;
    },
): Promise<CallToolResult> {
    try {
        switch (args.action) {
            case 'list': {
                const channels = listChannelsForAgent(ctx.db, ctx.agentId);
                if (channels.length === 0) {
                    return textResult(
                        'No notification channels configured.\n\n' +
                        'Available channel types: discord, telegram, github, algochat\n' +
                        'Use action="set" with channel_type and config to add one.',
                    );
                }
                const lines = channels.map((ch) => {
                    const status = ch.enabled ? 'enabled' : 'disabled';
                    const configKeys = Object.keys(ch.config).join(', ') || '(empty)';
                    return `- ${ch.channelType} [${ch.id.slice(0, 8)}] ${status} config: {${configKeys}}`;
                });
                return textResult(`Notification channels:\n\n${lines.join('\n')}`);
            }

            case 'set': {
                if (!args.channel_type) {
                    return errorResult('channel_type is required for action "set"');
                }
                if (!VALID_CHANNEL_TYPES.includes(args.channel_type)) {
                    return errorResult(`Invalid channel_type "${args.channel_type}". Use: ${VALID_CHANNEL_TYPES.join(', ')}`);
                }
                if (!args.config || Object.keys(args.config).length === 0) {
                    return errorResult('config is required for action "set"');
                }
                const channel = upsertChannel(ctx.db, ctx.agentId, args.channel_type, args.config);
                return textResult(
                    `Channel "${args.channel_type}" configured.\n` +
                    `  ID: ${channel.id}\n` +
                    `  Enabled: ${channel.enabled}\n` +
                    `  Config keys: ${Object.keys(channel.config).join(', ')}`,
                );
            }

            case 'enable': {
                if (!args.channel_type) {
                    return errorResult('channel_type is required for action "enable"');
                }
                const ch = getChannelByAgentAndType(ctx.db, ctx.agentId, args.channel_type);
                if (!ch) return errorResult(`No "${args.channel_type}" channel configured. Use action="set" first.`);
                updateChannelEnabled(ctx.db, ch.id, true);
                return textResult(`Channel "${args.channel_type}" enabled.`);
            }

            case 'disable': {
                if (!args.channel_type) {
                    return errorResult('channel_type is required for action "disable"');
                }
                const ch = getChannelByAgentAndType(ctx.db, ctx.agentId, args.channel_type);
                if (!ch) return errorResult(`No "${args.channel_type}" channel configured.`);
                updateChannelEnabled(ctx.db, ch.id, false);
                return textResult(`Channel "${args.channel_type}" disabled.`);
            }

            case 'remove': {
                if (!args.channel_type) {
                    return errorResult('channel_type is required for action "remove"');
                }
                const ch = getChannelByAgentAndType(ctx.db, ctx.agentId, args.channel_type);
                if (!ch) return errorResult(`No "${args.channel_type}" channel configured.`);
                deleteChannel(ctx.db, ch.id);
                return textResult(`Channel "${args.channel_type}" removed.`);
            }

            default:
                return errorResult(`Unknown action: ${args.action}. Use list, set, enable, disable, or remove.`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP configure_notifications failed', { error: message });
        return errorResult(`Failed to configure notifications: ${message}`);
    }
}

// ─── Reputation & trust handlers ──────────────────────────────────────────

export async function handleCheckReputation(
    ctx: McpToolContext,
    args: { agent_id?: string },
): Promise<CallToolResult> {
    if (!ctx.reputationScorer) {
        return errorResult('Reputation service is not available.');
    }

    try {
        const targetId = args.agent_id ?? ctx.agentId;
        const score = ctx.reputationScorer.computeScore(targetId);
        const events = ctx.reputationScorer.getEvents(targetId, 10);

        const eventLines = events.length > 0
            ? events.map((e) => `  - [${e.created_at}] ${e.event_type} (impact: ${e.score_impact})`).join('\n')
            : '  No recent events.';

        return textResult(
            `Reputation for ${targetId}:\n` +
            `  Overall: ${score.overallScore}/100\n` +
            `  Trust Level: ${score.trustLevel}\n` +
            `  Components:\n` +
            `    Task Completion: ${score.components.taskCompletion}\n` +
            `    Peer Rating: ${score.components.peerRating}\n` +
            `    Credit Pattern: ${score.components.creditPattern}\n` +
            `    Security Compliance: ${score.components.securityCompliance}\n` +
            `    Activity Level: ${score.components.activityLevel}\n` +
            `  Attestation Hash: ${score.attestationHash ?? 'none'}\n` +
            `  Computed At: ${score.computedAt}\n\n` +
            `Recent Events:\n${eventLines}`,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP check_reputation failed', { error: message });
        return errorResult(`Failed to check reputation: ${message}`);
    }
}

export async function handleCheckHealthTrends(
    ctx: McpToolContext,
    args: { agent_id?: string; project_id?: string; limit?: number },
): Promise<CallToolResult> {
    try {
        const agentId = args.agent_id ?? ctx.agentId;
        const projectId = args.project_id;
        if (!projectId) {
            return errorResult('project_id is required.');
        }

        const snapshots = getRecentSnapshots(ctx.db, agentId, projectId, args.limit ?? 10);
        if (snapshots.length === 0) {
            return textResult('No health snapshots found. Run the improvement loop at least once to collect data.');
        }

        const trends = computeTrends(snapshots);
        const trendText = formatTrendsForPrompt(trends);

        const latest = snapshots[0];
        return textResult(
            `Health Trends (${snapshots.length} snapshots):\n\n` +
            `Latest snapshot (${latest.collectedAt}):\n` +
            `  TSC errors: ${latest.tscErrorCount} (${latest.tscPassed ? 'PASSING' : 'FAILING'})\n` +
            `  Test failures: ${latest.testFailureCount} (${latest.testsPassed ? 'PASSING' : 'FAILING'})\n` +
            `  TODOs: ${latest.todoCount}, FIXMEs: ${latest.fixmeCount}, HACKs: ${latest.hackCount}\n` +
            `  Large files: ${latest.largeFileCount}, Outdated deps: ${latest.outdatedDepCount}\n\n` +
            `Trend Analysis:\n${trendText}`,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP check_health_trends failed', { error: message });
        return errorResult(`Failed to check health trends: ${message}`);
    }
}

export async function handlePublishAttestation(
    ctx: McpToolContext,
    args: { agent_id?: string },
): Promise<CallToolResult> {
    if (!ctx.reputationScorer || !ctx.reputationAttestation) {
        return errorResult('Reputation services are not available.');
    }

    try {
        const targetId = args.agent_id ?? ctx.agentId;
        ctx.emitStatus?.('Computing reputation score...');

        const score = ctx.reputationScorer.computeScore(targetId);
        const hash = await ctx.reputationAttestation.createAttestation(score);

        ctx.emitStatus?.('Publishing attestation on-chain...');

        // Attempt on-chain publish via agent wallet
        let txid: string | null = null;
        try {
            txid = await ctx.reputationAttestation.publishOnChain(
                targetId,
                hash,
                async (note: string) => {
                    const result = await ctx.agentMessenger.sendOnChainToSelf(targetId, note);
                    if (!result) throw new Error('No wallet configured for on-chain publish');
                    return result;
                },
            );
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            log.warn('On-chain attestation publish failed', { error: errMsg });
        }

        ctx.reputationScorer.setAttestationHash(targetId, hash);

        const result = txid
            ? `Attestation published on-chain!\n  Hash: ${hash}\n  Txid: ${txid}\n  Score: ${score.overallScore}/100 (${score.trustLevel})`
            : `Attestation created (off-chain only — no wallet available).\n  Hash: ${hash}\n  Score: ${score.overallScore}/100 (${score.trustLevel})`;

        return textResult(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP publish_attestation failed', { error: message });
        return errorResult(`Failed to publish attestation: ${message}`);
    }
}

export async function handleVerifyAgentReputation(
    ctx: McpToolContext,
    args: { wallet_address?: string },
): Promise<CallToolResult> {
    if (!ctx.reputationVerifier) {
        return errorResult('Reputation verifier is not available.');
    }

    if (!args.wallet_address) {
        return errorResult('wallet_address is required.');
    }

    try {
        ctx.emitStatus?.(`Scanning on-chain attestations for ${args.wallet_address.slice(0, 8)}...`);

        const result = await ctx.reputationVerifier.checkRemoteTrust(args.wallet_address);

        const attestationLines = result.attestations.length > 0
            ? result.attestations.slice(0, 10).map((a) =>
                `  - [${a.timestamp || 'unknown'}] agent=${a.agentId} hash=${a.hash.slice(0, 16)}... txid=${a.txid.slice(0, 8)}...`
            ).join('\n')
            : '  No attestations found.';

        return textResult(
            `Remote Trust Check: ${args.wallet_address}\n` +
            `  Trust Level: ${result.trustLevel}\n` +
            `  Attestation Count: ${result.attestationCount}\n` +
            `  Meets Minimum: ${result.meetsMinimum ? 'yes' : 'no'}\n\n` +
            `Attestations:\n${attestationLines}`,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP verify_agent_reputation failed', { error: message });
        return errorResult(`Failed to verify agent reputation: ${message}`);
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

// ─── AST / Code navigation handlers ──────────────────────────────────────

/** Resolve the project directory for AST tools: explicit arg → agent's default project. */
function resolveProjectDir(ctx: McpToolContext, explicitDir?: string): string | null {
    if (explicitDir?.trim()) return explicitDir;
    const agent = getAgent(ctx.db, ctx.agentId);
    const projectId = agent?.defaultProjectId;
    if (!projectId) return null;
    const project = getProject(ctx.db, projectId);
    return project?.workingDir ?? null;
}

export async function handleCodeSymbols(
    ctx: McpToolContext,
    args: { project_dir?: string; query: string; kinds?: string[]; limit?: number },
): Promise<CallToolResult> {
    if (!ctx.astParserService) {
        return errorResult('AST parser service is not available.');
    }

    if (!args.query?.trim()) {
        return errorResult('A search query is required.');
    }

    const projectDir = resolveProjectDir(ctx, args.project_dir);
    if (!projectDir) {
        return errorResult('Could not resolve project directory. Provide project_dir or ensure the agent has a default project.');
    }

    try {
        // Ensure the project is indexed (uses cache if already indexed)
        if (!ctx.astParserService.getProjectIndex(projectDir)) {
            ctx.emitStatus?.('Indexing project symbols...');
            await ctx.astParserService.indexProject(projectDir);
        }

        const validKinds = args.kinds?.filter(
            (k): k is AstSymbolKind => ['function', 'class', 'interface', 'type_alias', 'enum', 'import', 'export', 'variable', 'method'].includes(k),
        );

        const results = ctx.astParserService.searchSymbols(projectDir, args.query, {
            kinds: validKinds?.length ? validKinds : undefined,
            limit: args.limit ?? 50,
        });

        if (results.length === 0) {
            return textResult(`No symbols matching "${args.query}" found in ${projectDir}.`);
        }

        const lines = results.map((s) => {
            const exported = s.isExported ? 'export ' : '';
            const children = s.children?.length ? ` (${s.children.length} members)` : '';
            return `${exported}${s.kind} ${s.name} [lines ${s.startLine}-${s.endLine}]${children}`;
        });

        return textResult(`Found ${results.length} symbol(s) matching "${args.query}":\n\n${lines.join('\n')}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP code_symbols failed', { error: message });
        return errorResult(`Failed to search code symbols: ${message}`);
    }
}

export async function handleFindReferences(
    ctx: McpToolContext,
    args: { project_dir?: string; symbol_name: string; limit?: number },
): Promise<CallToolResult> {
    if (!ctx.astParserService) {
        return errorResult('AST parser service is not available.');
    }

    if (!args.symbol_name?.trim()) {
        return errorResult('A symbol_name is required.');
    }

    const projectDir = resolveProjectDir(ctx, args.project_dir);
    if (!projectDir) {
        return errorResult('Could not resolve project directory. Provide project_dir or ensure the agent has a default project.');
    }

    try {
        // Index project for definition lookup
        if (!ctx.astParserService.getProjectIndex(projectDir)) {
            ctx.emitStatus?.('Indexing project symbols...');
            await ctx.astParserService.indexProject(projectDir);
        }

        // Find definitions via AST
        const definitions = ctx.astParserService.searchSymbols(projectDir, args.symbol_name, { limit: 10 });
        const exactDefs = definitions.filter((s) => s.name === args.symbol_name);

        // Find references via grep (text search across all TS/JS files)
        ctx.emitStatus?.(`Searching for references to "${args.symbol_name}"...`);
        const maxResults = args.limit ?? 50;

        const grepProc = Bun.spawn([
            'grep', '-rn', '--include=*.ts', '--include=*.tsx', '--include=*.js', '--include=*.jsx',
            '--exclude-dir=node_modules', '--exclude-dir=dist', '--exclude-dir=.git',
            '-w', args.symbol_name, projectDir,
        ], { stdout: 'pipe', stderr: 'pipe' });

        const grepStdout = await new Response(grepProc.stdout).text();
        await grepProc.exited;

        const referenceLines = grepStdout.trim().split('\n').filter(Boolean);
        const truncated = referenceLines.length > maxResults;
        const displayLines = referenceLines.slice(0, maxResults);

        // Format output
        const sections: string[] = [];

        if (exactDefs.length > 0) {
            const defLines = exactDefs.map((s) => {
                const exported = s.isExported ? 'export ' : '';
                return `  ${exported}${s.kind} ${s.name} [lines ${s.startLine}-${s.endLine}]`;
            });
            sections.push(`Definitions (${exactDefs.length}):\n${defLines.join('\n')}`);
        } else {
            sections.push(`No AST definition found for "${args.symbol_name}" (may be an external import).`);
        }

        if (displayLines.length > 0) {
            // Strip project dir prefix for readability
            const shortLines = displayLines.map((line) =>
                line.startsWith(projectDir) ? line.slice(projectDir.length + 1) : line,
            );
            sections.push(
                `References (${referenceLines.length}${truncated ? `, showing first ${maxResults}` : ''}):\n${shortLines.join('\n')}`,
            );
        } else {
            sections.push(`No text references found for "${args.symbol_name}".`);
        }

        return textResult(sections.join('\n\n'));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP find_references failed', { error: message });
        return errorResult(`Failed to find references: ${message}`);
    }
}
