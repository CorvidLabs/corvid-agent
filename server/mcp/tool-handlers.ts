import type { Database } from 'bun:sqlite';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AgentDirectory } from '../algochat/agent-directory';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { WorkTaskService } from '../work/service';
import type { SchedulerService } from '../scheduler/service';
import { listSchedules, createSchedule, updateSchedule, listExecutions } from '../db/schedules';
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
    /** Extend the current session's timeout by the given ms. */
    extendTimeout?: (additionalMs: number) => boolean;
    /** True when the session was started by the scheduler — restricts certain tools. */
    schedulerMode?: boolean;
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
                    return textResult(`Memory saved with key "${args.key}" (on-chain txid: ${txid})`);
                }
                // sendOnChainToSelf returned null — no wallet configured
                return textResult(`Memory saved locally with key "${args.key}" (on-chain unavailable — no wallet)`);
            } catch (err) {
                log.warn('On-chain memory send failed (localnet)', {
                    key: args.key,
                    error: err instanceof Error ? err.message : String(err),
                });
                updateMemoryStatus(ctx.db, memory.id, 'failed');
                return textResult(`Memory saved with key "${args.key}" (on-chain send failed — will retry)`);
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

            return textResult(`Memory saved with key "${args.key}" (on-chain send pending)`);
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

// Rate limiter for corvid_create_work_task: max 5 per agent per day (persisted via DB)
const WORK_TASK_MAX_PER_DAY = 5;

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
