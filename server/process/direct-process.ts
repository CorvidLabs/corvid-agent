/**
 * Direct execution engine for non-SDK providers (e.g. Ollama).
 *
 * Implements the same SdkProcess interface so the ProcessManager and WebSocket
 * clients are unaware of the difference between SDK and direct mode.
 */

import type { Session, Agent, Project, McpServerConfig } from '../../shared/types';
import type { ClaudeStreamEvent, DirectProcessMetrics } from './types';
import type { ApprovalManager } from './approval-manager';
import type { ApprovalRequest, ApprovalRequestWire } from './approval-types';
import { formatToolDescription } from './approval-types';
import type { SdkProcess } from './sdk-process';
import type { LlmProvider, LlmToolCall } from '../providers/types';
import type { McpToolContext } from '../mcp/tool-handlers';
import { buildDirectTools, toProviderTools, type DirectToolDefinition } from '../mcp/direct-tools';
import { type CodingToolContext, buildSafeEnvForCoding } from '../mcp/coding-tools';
import { getToolInstructionPrompt, getResponseRoutingPrompt, getCodingToolPrompt, getMessagingSafetyPrompt, detectModelFamily } from '../providers/ollama/tool-prompt-templates';
import { ExternalMcpClientManager } from '../mcp/external-client';
import { getAgentTierConfig, type AgentTierConfig } from '../lib/agent-tiers';
import { AgentSessionLimiter } from '../lib/agent-session-limits';
import { sanitizeAgentInput } from '../lib/agent-input-sanitizer';
import { createLogger } from '../lib/logger';

const log = createLogger('DirectProcess');

const MAX_MESSAGES = 40;
const KEEP_RECENT = 30;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Content-aware token estimation.
 * Code-heavy content averages ~0.33 tokens/char (more tokens per char due to
 * operators, short identifiers, indentation). Prose averages ~0.25 tokens/char.
 * We use a simple heuristic: if the text has many code indicators, use the
 * code factor; otherwise use prose.
 */
function estimateTokens(text: string): number {
    if (!text) return 0;
    // Simple heuristic: count code-like characters
    const codeIndicators = (text.match(/[{}();=<>[\]|&!+\-*/\\^~`]/g) || []).length;
    const codeRatio = codeIndicators / text.length;
    // If >8% of chars are code-like, use code factor (3 chars/token)
    // Otherwise use prose factor (4 chars/token)
    const charsPerToken = codeRatio > 0.08 ? 3 : 4;
    return Math.ceil(text.length / charsPerToken);
}

/** Get the configured context window size in tokens. */
function getContextBudget(): number {
    return parseInt(process.env.OLLAMA_NUM_CTX ?? '8192', 10);
}

/**
 * Calculate the maximum tool result size based on remaining context budget.
 * Ensures a single tool result never consumes more than 30% of the total
 * context window, and scales down further when context is already full.
 *
 * Returns max chars (not tokens).
 */
function calculateMaxToolResultChars(
    messages: Array<{ role: string; content: string }>,
    systemPrompt: string,
): number {
    const ctxSize = getContextBudget();
    // Absolute max: 30% of context window for a single result
    const absoluteMax = Math.floor(ctxSize * 0.3) * 4; // tokens → chars
    // Absolute min: always allow at least 1K chars for errors etc.
    const absoluteMin = 1_000;

    const usedTokens = estimateTokens(systemPrompt) +
        messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const remainingTokens = ctxSize - usedTokens;

    // Reserve 40% of remaining for the model's response
    const availableForResult = Math.floor(remainingTokens * 0.6) * 4; // tokens → chars

    return Math.max(absoluteMin, Math.min(absoluteMax, availableForResult));
}

/**
 * Truncate council synthesis messages if they exceed 70% of the context window.
 * Keeps the system prompt contribution (already separate), first user message,
 * and the most recent N messages. Logs a warning when truncation occurs.
 */
function truncateCouncilContext(
    messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }>,
    systemPrompt: string,
): void {
    const ctxSize = parseInt(process.env.OLLAMA_NUM_CTX ?? '16384', 10);
    const threshold = Math.floor(ctxSize * 0.7);

    const systemTokens = estimateTokens(systemPrompt);
    let messageTokens = 0;
    for (const m of messages) {
        messageTokens += estimateTokens(m.content);
    }

    const totalTokens = systemTokens + messageTokens;
    if (totalTokens <= threshold) return;

    // Keep first user message + last 4 messages
    const keepTail = 4;
    if (messages.length <= keepTail + 1) return; // Nothing to trim

    const first = messages[0];
    const tail = messages.slice(-keepTail);

    if (tail.includes(first)) {
        messages.length = 0;
        messages.push(...tail);
    } else {
        messages.length = 0;
        messages.push(first, ...tail);
    }

    const newTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0) + systemTokens;
    log.warn(`Council context truncated: ${totalTokens} → ${newTokens} estimated tokens (threshold: ${threshold})`);
}

/**
 * Progressive compression tiers based on context usage percentage.
 * Each tier applies increasingly aggressive compression to keep the
 * conversation within the context window.
 */
const COMPRESSION_TIERS = [
    { name: 'tier1', threshold: 0.60, description: 'light tool result summarization' },
    { name: 'tier2', threshold: 0.75, description: 'reduce recent window + summarize discarded' },
    { name: 'tier3', threshold: 0.85, description: 'aggressive compression to 4 exchanges' },
    { name: 'tier4', threshold: 0.90, description: 'full context summary + last 2 exchanges' },
] as const;

type ConversationMessage = { role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string };

/**
 * Compress tool result messages in-place by truncating content older than
 * `maxAge` positions from the end of the array to at most `maxChars`.
 */
export function compressToolResults(
    messages: ConversationMessage[],
    maxAge: number,
    maxChars: number,
): number {
    let compressed = 0;
    const cutoff = messages.length - maxAge;
    for (let i = 0; i < cutoff; i++) {
        const msg = messages[i];
        if (msg.role === 'tool' && msg.content.length > maxChars) {
            const original = msg.content.length;
            msg.content = msg.content.slice(0, maxChars).replace(/\n/g, ' ').trim()
                + `... [compressed, was ${original} chars]`;
            compressed++;
        }
    }
    return compressed;
}

/**
 * Generate a brief plain-text summary of the key points in a conversation.
 * Used for Tier 4 compression and context reset in ProcessManager.
 */
export function summarizeConversation(
    messages: Array<{ role: string; content: string }>,
): string {
    const points: string[] = [];

    // Extract key user requests
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length > 0) {
        const firstRequest = userMessages[0].content.slice(0, 300).replace(/\n/g, ' ').trim();
        points.push(`Original request: ${firstRequest}${userMessages[0].content.length > 300 ? '...' : ''}`);
    }

    // Extract tool usage summary
    const toolMessages = messages.filter(m => m.role === 'tool');
    if (toolMessages.length > 0) {
        points.push(`Tools used: ${toolMessages.length} tool calls executed.`);
    }

    // Extract key assistant conclusions (last few assistant messages)
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    if (assistantMessages.length > 0) {
        const last = assistantMessages[assistantMessages.length - 1];
        const conclusion = last.content.slice(0, 300).replace(/\n/g, ' ').trim();
        points.push(`Last assistant response: ${conclusion}${last.content.length > 300 ? '...' : ''}`);
    }

    // Summarize intermediate user follow-ups
    if (userMessages.length > 1) {
        const followUps = userMessages.slice(1).map(m => {
            const text = m.content.slice(0, 100).replace(/\n/g, ' ').trim();
            return text + (m.content.length > 100 ? '...' : '');
        });
        if (followUps.length <= 5) {
            points.push(`Follow-up messages: ${followUps.join('; ')}`);
        } else {
            points.push(`Follow-up messages (${followUps.length} total): ${followUps.slice(0, 3).join('; ')}; ... and ${followUps.length - 3} more`);
        }
    }

    return `[Context Summary]\n${points.join('\n')}`;
}

/**
 * Truncate tool result messages older than `ageThreshold` positions from the
 * end to at most `maxChars`, appending a truncation notice.
 * This is a post-trim pass for additional size reduction.
 */
export function truncateOldToolResults(
    messages: ConversationMessage[],
    ageThreshold: number,
    maxChars: number,
): number {
    let truncated = 0;
    const cutoff = messages.length - ageThreshold;
    for (let i = 0; i < cutoff; i++) {
        const msg = messages[i];
        if (msg.role === 'tool' && msg.content.length > maxChars) {
            const original = msg.content.length;
            msg.content = msg.content.slice(0, maxChars) + `... [truncated, was ${original} chars]`;
            truncated++;
        }
    }
    return truncated;
}

/**
 * Internal: Original trim logic (Tier 2 behavior).
 * Reduces the message window and summarizes discarded tool results.
 */
function trimMessagesTier2(
    messages: ConversationMessage[],
    _systemPrompt?: string,
): void {
    const keepCount = Math.max(6, Math.min(KEEP_RECENT, Math.floor(messages.length * 0.4)));

    const first = messages[0];
    const discarded = messages.slice(1, -keepCount);
    const recent = messages.slice(-keepCount);

    // Summarize discarded tool results so the model retains some context
    const summaries: string[] = [];
    for (const msg of discarded) {
        if (msg.role === 'tool' && msg.content.length > 0) {
            const preview = msg.content.slice(0, 200).replace(/\n/g, ' ').trim();
            const lineCount = (msg.content.match(/\n/g) || []).length + 1;
            summaries.push(`[Previous tool result: ${preview}${msg.content.length > 200 ? '...' : ''} (${lineCount} lines)]`);
        }
    }

    if (recent[0] === first) {
        messages.length = 0;
        if (summaries.length > 0) {
            messages.push({ role: 'user', content: summaries.join('\n') });
        }
        messages.push(...recent);
    } else {
        messages.length = 0;
        messages.push(first);
        if (summaries.length > 0) {
            messages.push({ role: 'user', content: summaries.join('\n') });
        }
        messages.push(...recent);
    }
}

/**
 * Trim conversation history using progressive compression tiers.
 *
 * Tier 1 (60%): Summarize tool results older than 5 messages (200 char max).
 * Tier 2 (75%): Reduce recent window dynamically, summarize discarded results.
 * Tier 3 (85%): Keep only last 4 exchanges (8 messages), one-line tool summaries.
 * Tier 4 (90%): Replace all with context summary + last 2 exchanges (4 messages).
 *
 * Also triggers on message count exceeding MAX_MESSAGES.
 */
function trimMessages(
    messages: ConversationMessage[],
    systemPrompt?: string,
): void {
    const ctxSize = getContextBudget();
    const systemTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
    const messageTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const totalTokens = systemTokens + messageTokens;
    const usageRatio = totalTokens / ctxSize;

    const overCount = messages.length > MAX_MESSAGES;

    // Determine which tier applies
    if (usageRatio >= COMPRESSION_TIERS[3].threshold) {
        // Tier 4: Full context summary + last 2 exchanges
        const summary = summarizeConversation(messages);
        const keepLast = Math.min(4, messages.length);
        const recent = messages.slice(-keepLast);
        messages.length = 0;
        messages.push({ role: 'user', content: summary });
        messages.push(...recent);
        const newTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0) + systemTokens;
        log.info(`Trimmed conversation (tier4: full summary) to ${messages.length} messages — token budget (${totalTokens}→${newTokens} of ${ctxSize})`);
        return;
    }

    if (usageRatio >= COMPRESSION_TIERS[2].threshold) {
        // Tier 3: Aggressive — keep last 4 exchanges (8 messages)
        const keepLast = Math.min(8, messages.length);
        const first = messages[0];
        const recent = messages.slice(-keepLast);
        // One-line summaries for all tool results older than 2 turns (4 messages)
        const discarded = messages.slice(0, -keepLast);
        const summaries: string[] = [];
        for (const msg of discarded) {
            if (msg.role === 'tool' && msg.content.length > 0) {
                const preview = msg.content.slice(0, 80).replace(/\n/g, ' ').trim();
                summaries.push(`[Tool: ${preview}${msg.content.length > 80 ? '...' : ''}]`);
            }
        }

        if (recent[0] === first || !discarded.includes(first)) {
            messages.length = 0;
            if (summaries.length > 0) {
                messages.push({ role: 'user', content: summaries.join('\n') });
            }
            messages.push(...recent);
        } else {
            messages.length = 0;
            messages.push(first);
            if (summaries.length > 0) {
                messages.push({ role: 'user', content: summaries.join('\n') });
            }
            messages.push(...recent);
        }

        // Additionally compress any remaining old tool results
        compressToolResults(messages, 4, 80);

        const newTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0) + systemTokens;
        log.info(`Trimmed conversation (tier3: aggressive) to ${messages.length} messages — token budget (${totalTokens}→${newTokens} of ${ctxSize})`);
        return;
    }

    if (usageRatio >= COMPRESSION_TIERS[1].threshold || overCount) {
        // Tier 2: Original behavior with dynamic keep count
        trimMessagesTier2(messages, systemPrompt);
        const newTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0) + systemTokens;
        const reason = overCount && usageRatio < COMPRESSION_TIERS[1].threshold
            ? `message count (>${MAX_MESSAGES})`
            : `token budget (${totalTokens}→${newTokens} of ${ctxSize})`;
        log.info(`Trimmed conversation (tier2: reduce window) to ${messages.length} messages — ${reason}`);
        return;
    }

    if (usageRatio >= COMPRESSION_TIERS[0].threshold) {
        // Tier 1: Light touch — just compress old tool results
        const compressed = compressToolResults(messages, 5, 200);
        if (compressed > 0) {
            const newTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0) + systemTokens;
            log.info(`Compressed ${compressed} old tool results (tier1: light) — token budget (${totalTokens}→${newTokens} of ${ctxSize})`);
        }
        return;
    }

    // Below all thresholds — no action needed
}

/** Compute context usage metrics for the current message state. */
export function computeContextUsage(
    msgs: Array<{ role: string; content: string }>,
    sysPrompt: string,
    trimmed: boolean,
): { estimatedTokens: number; contextWindow: number; usagePercent: number; messagesCount: number; trimmed: boolean } {
    const contextWindow = getContextBudget();
    const estimatedTokens = estimateTokens(sysPrompt) +
        msgs.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const usagePercent = Math.round((estimatedTokens / contextWindow) * 100);
    return { estimatedTokens, contextWindow, usagePercent, messagesCount: msgs.length, trimmed };
}

/** Determine warning level and message for a given usage percent. */
export function determineWarningLevel(
    usagePercent: number,
): { level: 'info' | 'warning' | 'critical'; message: string } | null {
    if (usagePercent >= 85) {
        return { level: 'critical', message: `Context usage at ${usagePercent}% — session at risk of exhaustion. Consider starting a new session.` };
    } else if (usagePercent >= 70) {
        return { level: 'warning', message: `Context usage at ${usagePercent}% — message trimming will start soon.` };
    } else if (usagePercent >= 50) {
        return { level: 'info', message: `Context usage at ${usagePercent}%.` };
    }
    return null;
}

export interface DirectProcessOptions {
    session: Session;
    project: Project;
    agent: Agent | null;
    prompt: string;
    provider: LlmProvider;
    approvalManager: ApprovalManager;
    onEvent: (event: ClaudeStreamEvent) => void;
    onExit: (code: number | null, errorMessage?: string) => void;
    onApprovalRequest: (request: ApprovalRequestWire) => void;
    mcpToolContext: McpToolContext | null;
    /** Called to reset the session timeout when the agent is still active. */
    extendTimeout?: (additionalMs: number) => void;
    /** Persona system prompt section (from agent_personas table) */
    personaPrompt?: string;
    /** Skill bundle prompt additions (from assigned skill_bundles) */
    skillPrompt?: string;
    /** Override the agent/provider default model (e.g. COUNCIL_MODEL for chairman). */
    modelOverride?: string;
    /** External MCP server configs to connect to. */
    externalMcpConfigs?: McpServerConfig[];
    /** If set, only these tool names are available (all others filtered out). */
    toolAllowList?: string[];
}

let nextPseudoPid = 800_000;

export function startDirectProcess(options: DirectProcessOptions): SdkProcess {
    const {
        session,
        project,
        agent,
        prompt,
        provider,
        approvalManager,
        onEvent,
        onExit,
        onApprovalRequest,
        mcpToolContext,
        extendTimeout,
        personaPrompt,
        skillPrompt,
        modelOverride,
        externalMcpConfigs,
    } = options;

    const pseudoPid = nextPseudoPid++;
    let aborted = false;
    let toolsDisabled = false;
    const abortController = new AbortController();

    // Message queue for follow-up user messages
    const pendingMessages: string[] = [];
    let processing = false;

    // Idle-wait state: instead of exiting after each turn, wait for the next message
    let idleResolver: ((msg: string | null) => void) | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    // Council deliberation sessions (member, discusser, reviewer) should reason,
    // not call tools. Only chairman/chat sessions get tools.
    const isDeliberationSession = session.councilRole === 'member'
        || session.councilRole === 'discusser'
        || session.councilRole === 'reviewer';

    // Build coding context (always available — file/command tools don't need MCP)
    const codingCtx: CodingToolContext = {
        workingDir: project.workingDir,
        env: buildSafeEnvForCoding(),
    };

    // External MCP client manager for third-party MCP servers
    const externalMcpManager = new ExternalMcpClientManager();

    // Build tools — skip for council deliberation sessions
    let directTools = isDeliberationSession ? [] : buildDirectTools(mcpToolContext, codingCtx);
    // Filter to allowlist if specified (e.g. poll sessions only need run_command)
    if (options.toolAllowList && options.toolAllowList.length > 0) {
        const allowed = new Set(options.toolAllowList);
        directTools = directTools.filter(t => allowed.has(t.name));
    }
    const toolMap = new Map<string, DirectToolDefinition>();
    for (const t of directTools) {
        toolMap.set(t.name, t);
    }

    const model = modelOverride ?? agent?.model ?? provider.getInfo().defaultModel;

    // Tier-based limits for this agent's model
    const tierConfig = getAgentTierConfig(model);
    const sessionLimiter = new AgentSessionLimiter(session.id, model);
    log.info(`Agent tier: ${tierConfig.tier} for model ${model}`, {
        maxIterations: tierConfig.maxToolIterations,
        maxNudges: tierConfig.maxNudges,
        sessionId: session.id,
    });

    // Connect external MCP servers and merge their tools before starting the loop
    const initPromise = (async () => {
        if (!isDeliberationSession && externalMcpConfigs && externalMcpConfigs.length > 0) {
            await externalMcpManager.connectAll(externalMcpConfigs);
            const externalTools = externalMcpManager.getAllTools();
            for (const t of externalTools) {
                directTools.push(t);
                toolMap.set(t.name, t);
            }
            if (externalTools.length > 0) {
                log.info(`Added ${externalTools.length} external MCP tools for session ${session.id}`);
            }
        }
    })();

    // Build system prompt (with tool instructions if tools are available) — deferred until external tools are loaded
    let systemPrompt = '';

    // Conversation history for the current session
    const messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }> = [];

    // For AlgoChat/agent-sourced sessions, prepend routing context to the initial prompt
    const effectivePrompt = prependRoutingContext(prompt, session.source, tierConfig);

    // Wait for external MCP initialization, then build system prompt and start loop
    initPromise.then(() => {
        const toolDefs = directTools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
        systemPrompt = buildSystemPrompt(agent, project, model, toolDefs, !toolsDisabled && directTools.length > 0, isDeliberationSession, personaPrompt, skillPrompt, tierConfig);
        return runLoop(effectivePrompt);
    }).catch((err) => {
        if (aborted) return;
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error(`Direct process error for session ${session.id}`, { error: errorMsg });
        onEvent({
            type: 'error',
            error: { message: errorMsg, type: 'direct_process_error' },
        } as ClaudeStreamEvent);
        onExit(1, errorMsg);
    });

    async function runLoop(userMessage: string): Promise<void> {
        processing = true;
        messages.push({ role: 'user', content: userMessage });

        // Council synthesis prompts can be very long — truncate if needed
        if (session.councilRole === 'chairman') {
            truncateCouncilContext(messages, systemPrompt);
        }

        // Signal that the agent is working
        onEvent({ type: 'thinking', thinking: true } as ClaudeStreamEvent);

        // Extend session timeout on activity (debounced to once per minute)
        let lastExtend = 0;
        const EXTEND_DEBOUNCE_MS = 60_000;
        const TIMEOUT_EXTENSION_MS = 30 * 60 * 1000; // 30 minutes

        const extendTimeoutIfNeeded = () => {
            if (extendTimeout) {
                const now = Date.now();
                if (now - lastExtend > EXTEND_DEBOUNCE_MS) {
                    extendTimeout(TIMEOUT_EXTENSION_MS);
                    lastExtend = now;
                }
            }
        };

        // Acquire inference slot BEFORE the agentic loop so this agent runs all
        // its turns to completion without yielding. This keeps the model loaded
        // in Ollama's memory (preserves KV cache) and avoids context-switching.
        const onSlotStatus = (status: string) => {
            if (status) {
                onEvent({
                    type: 'queue_status',
                    statusMessage: status,
                } as ClaudeStreamEvent);
            } else {
                onEvent({ type: 'thinking', thinking: true } as ClaudeStreamEvent);
            }
        };

        // Heartbeat while waiting for slot (so UI doesn't look frozen)
        const slotHeartbeat = setInterval(() => {
            extendTimeoutIfNeeded();
            onEvent({ type: 'thinking', thinking: true } as ClaudeStreamEvent);
        }, 10_000);

        let slotAcquired = false;
        if (provider.acquireSlot) {
            slotAcquired = await provider.acquireSlot(model, abortController.signal, onSlotStatus);
        }
        clearInterval(slotHeartbeat);

        if (aborted) {
            if (slotAcquired) provider.releaseSlot?.(model);
            return;
        }

        let iteration = 0;
        let lastToolCallKey = '';
        let lastToolNames = '';
        let repeatCount = 0;
        let sameToolNameCount = 0;
        let nudgeCount = 0;
        let midChainNudgeCount = 0;
        let toolsEverCalled = false;
        let needsSummary = false; // Set true when loop breaks abnormally (repeat/max-iter)
        const MAX_REPEATS = 2; // Break if same tool+args called 3 times in a row
        const MAX_SAME_TOOL = 4; // Break if same tool name called 5 times (even with different args)
        // Tier-based nudge limits: weaker models get more nudges (they need more guidance)
        const MAX_NUDGES = tierConfig.maxNudges;
        const MAX_MID_CHAIN_NUDGES = tierConfig.maxMidChainNudges;
        const MAX_TOOL_ITERATIONS = tierConfig.maxToolIterations;
        let explorationToolCalls = 0; // Track how many list_files/search_files calls
        let totalExplorationDrifts = 0; // Cumulative exploration drift triggers
        let toolCallCount = 0; // Total tool calls across all iterations
        let currentChainDepth = 0; // Current unbroken tool-call sequence
        let maxChainDepth = 0; // Longest unbroken tool-call sequence
        let terminationReason: DirectProcessMetrics['terminationReason'] = 'normal';
        let stallType: string | null = null;
        const loopStartTime = Date.now();

        // ── Context usage tracking ──────────────────────────────────
        let lastWarningLevel: string | null = null;
        let hasTrimmed = false;

        function emitContextUsage(
            msgs: Array<{ role: string; content: string }>,
            sysPrompt: string,
        ): void {
            const usage = computeContextUsage(msgs, sysPrompt, hasTrimmed);

            onEvent({
                type: 'context_usage',
                session_id: session.id,
                ...usage,
            } as ClaudeStreamEvent);

            // Emit warnings at thresholds (only when crossing a new level)
            const warning = determineWarningLevel(usage.usagePercent);

            if (warning && warning.level !== lastWarningLevel) {
                lastWarningLevel = warning.level;
                onEvent({
                    type: 'context_warning',
                    session_id: session.id,
                    level: warning.level,
                    usagePercent: usage.usagePercent,
                    message: warning.message,
                } as ClaudeStreamEvent);
            }
        }

        try {

        while (!aborted && iteration < MAX_TOOL_ITERATIONS) {
            iteration++;

            const providerTools = (!toolsDisabled && directTools.length > 0)
                ? toProviderTools(directTools)
                : undefined;

            const activityCallback = () => {
                onEvent({ type: 'thinking', thinking: true } as ClaudeStreamEvent);
                extendTimeoutIfNeeded();
            };

            // Heartbeat while waiting for inference
            const heartbeat = setInterval(activityCallback, 10_000);

            let result;
            try {
                const countBefore = messages.length;
                trimMessages(messages, systemPrompt);
                if (messages.length < countBefore) hasTrimmed = true;
                // Post-trim pass: truncate old tool results for additional savings
                truncateOldToolResults(messages, 3, 500);
                emitContextUsage(messages, systemPrompt);
                result = await provider.complete({
                    model,
                    systemPrompt,
                    messages,
                    tools: providerTools,
                    signal: abortController.signal,
                    onActivity: activityCallback,
                    onStream: (text) => onEvent({
                        type: 'content_block_delta',
                        delta: { text },
                    } as ClaudeStreamEvent),
                });
            } catch (err) {
                clearInterval(heartbeat);
                // Tool fallback: if the model doesn't support tools, retry without them
                const errorMsg = err instanceof Error ? err.message : String(err);
                if (!toolsDisabled && providerTools && isToolUnsupportedError(errorMsg)) {
                    log.warn(`Model ${model} does not support tools — disabling for this session`);
                    toolsDisabled = true;
                    // Retry without tools
                    const countBefore2 = messages.length;
                    trimMessages(messages, systemPrompt);
                    if (messages.length < countBefore2) hasTrimmed = true;
                    // Post-trim pass: truncate old tool results
                    truncateOldToolResults(messages, 3, 500);
                    emitContextUsage(messages, systemPrompt);
                    result = await provider.complete({
                        model,
                        systemPrompt,
                        messages,
                        signal: abortController.signal,
                        onActivity: activityCallback,
                        onStream: (text) => onEvent({
                            type: 'content_block_delta',
                            delta: { text },
                        } as ClaudeStreamEvent),
                    });
                } else {
                    throw err;
                }
            } finally {
                clearInterval(heartbeat);
            }

            if (aborted) return;

            // Emit assistant response
            if (result.content) {
                onEvent({
                    type: 'assistant',
                    message: {
                        role: 'assistant',
                        content: [{ type: 'text', text: result.content }],
                    },
                } as ClaudeStreamEvent);
            }

            // Emit performance metrics (tok/s) if available
            if (result.performance && result.performance.tokensPerSecond > 0) {
                onEvent({
                    type: 'performance',
                    model: result.model,
                    tokensPerSecond: result.performance.tokensPerSecond,
                    outputTokens: result.usage?.outputTokens ?? 0,
                    evalDurationMs: result.performance.evalDurationMs,
                } as ClaudeStreamEvent);
            }

            // Handle tool calls
            if (result.toolCalls && result.toolCalls.length > 0) {
                toolsEverCalled = true;
                toolCallCount += result.toolCalls.length;
                currentChainDepth++;
                if (currentChainDepth > maxChainDepth) {
                    maxChainDepth = currentChainDepth;
                }
                // Detect repeated tool calls — uses normalized comparison to catch
                // near-identical loops (same tool, args differ only in whitespace/order)
                const callKey = normalizeToolCallKey(result.toolCalls);
                if (callKey === lastToolCallKey) {
                    repeatCount++;
                    if (repeatCount >= MAX_REPEATS) {
                        log.warn(`Breaking tool loop: same call repeated ${repeatCount + 1} times`, { calls: callKey.slice(0, 200) });
                        messages.push({ role: 'assistant', content: result.content || '' });
                        needsSummary = true;
                        terminationReason = 'stall_repeat';
                        stallType = 'repeat';
                        break;
                    }
                } else {
                    lastToolCallKey = callKey;
                    repeatCount = 0;
                }

                // Also detect same tool name called repeatedly with different args
                // (e.g., model keeps re-calling save_memory with slightly different content)
                const toolNames = result.toolCalls.map(tc => tc.name).join('|');
                if (toolNames === lastToolNames) {
                    sameToolNameCount++;
                    if (sameToolNameCount >= MAX_SAME_TOOL) {
                        log.warn(`Breaking tool loop: same tool name repeated ${sameToolNameCount + 1} times with varying args`, { tools: toolNames });
                        messages.push({ role: 'assistant', content: result.content || '' });
                        needsSummary = true;
                        terminationReason = 'stall_same_tool';
                        stallType = 'same_tool';
                        break;
                    }
                } else {
                    lastToolNames = toolNames;
                    sameToolNameCount = 0;
                }

                // Add assistant message with tool call indication
                messages.push({ role: 'assistant', content: result.content || '' });

                for (const toolCall of result.toolCalls) {
                    if (aborted) return;

                    // Emit structured tool_use event so CLI/dashboard can display it
                    onEvent({
                        type: 'content_block_start',
                        content_block: {
                            type: 'tool_use',
                            name: toolCall.name,
                            input: toolCall.arguments,
                        },
                    } as ClaudeStreamEvent);

                    const toolDef = toolMap.get(toolCall.name);
                    if (!toolDef) {
                        const errorText = `Unknown tool: ${toolCall.name}`;
                        messages.push({ role: 'tool', content: errorText, toolCallId: toolCall.id });
                        emitToolStatus(toolCall.name, errorText, true);
                        continue;
                    }

                    // Session rate limiting (tier-based)
                    const rateLimitError = sessionLimiter.checkAndIncrement(toolCall.name);
                    if (rateLimitError) {
                        messages.push({ role: 'tool', content: rateLimitError, toolCallId: toolCall.id });
                        emitToolStatus(toolCall.name, rateLimitError, true);
                        continue;
                    }

                    // Permission check via approval flow
                    const permitted = await checkToolPermission(
                        toolCall, session, agent, approvalManager, onApprovalRequest,
                    );
                    if (aborted) return;

                    if (!permitted) {
                        const deniedText = `Permission denied for tool: ${toolCall.name}`;
                        messages.push({ role: 'tool', content: deniedText, toolCallId: toolCall.id });
                        emitToolStatus(toolCall.name, deniedText, true);
                        continue;
                    }

                    // Execute tool
                    emitToolStatus(toolCall.name, `Running ${toolCall.name}...`, false);
                    try {
                        const toolResult = await toolDef.handler(toolCall.arguments);
                        const maxChars = calculateMaxToolResultChars(messages, systemPrompt);
                        let resultText = toolResult.text;
                        if (resultText.length > maxChars) {
                            log.warn(`Truncated tool result for ${toolCall.name}`, { original: resultText.length, maxChars, contextBudget: getContextBudget() });
                            // For structured data (JSON), try to keep head + tail
                            if (resultText.startsWith('{') || resultText.startsWith('[')) {
                                const headSize = Math.floor(maxChars * 0.7);
                                const tailSize = Math.floor(maxChars * 0.2);
                                resultText = resultText.slice(0, headSize)
                                    + `\n\n[... ${toolResult.text.length - headSize - tailSize} chars omitted ...]\n\n`
                                    + resultText.slice(-tailSize);
                            } else {
                                resultText = resultText.slice(0, maxChars) + `\n\n[... truncated, ${toolResult.text.length - maxChars} chars omitted]`;
                            }
                        }
                        // Strip lone surrogates that would produce invalid JSON
                        // (e.g. from binary output or malformed UTF-16 in tool results)
                        resultText = resultText.replace(/[\uD800-\uDFFF]/g, '\uFFFD');
                        messages.push({
                            role: 'tool',
                            content: resultText,
                            toolCallId: toolCall.id,
                        });
                        emitToolStatus(toolCall.name, toolResult.isError ? `Error: ${toolResult.text.slice(0, 200)}` : `Done`, false);
                    } catch (err) {
                        const errorText = `Tool execution error: ${err instanceof Error ? err.message : String(err)}`;
                        messages.push({ role: 'tool', content: errorText, toolCallId: toolCall.id });
                        emitToolStatus(toolCall.name, errorText, true);
                    }
                }

                // Exploration drift detection: if the agent is calling exploration
                // tools excessively, inject a focus reminder
                const explorationTools = new Set(['list_files', 'search_files']);
                const driftCalls = result.toolCalls.filter(tc => explorationTools.has(tc.name));
                explorationToolCalls += driftCalls.length;
                if (explorationToolCalls >= 5 && tierConfig.tier !== 'high') {
                    totalExplorationDrifts++;
                    log.info('Exploration drift detected — injecting focus reminder', {
                        explorationCalls: explorationToolCalls,
                        tier: tierConfig.tier,
                        sessionId: session.id,
                    });
                    messages.push({
                        role: 'user',
                        content: 'FOCUS: You have been exploring many directories. Stop browsing and focus on the specific task. '
                            + 'Only read files that are directly relevant to completing the task. '
                            + 'If you have enough information, proceed to take action now.',
                    });
                    explorationToolCalls = 0; // Reset so we don't spam
                }

                // Continue loop to let the model process tool results
                continue;
            }

            // No tool calls — reset chain depth counter
            currentChainDepth = 0;

            // No tool calls — check if the model stopped prematurely
            const responseText = (result.content || '').trim();

            // Detect hallucinated tool results: if the model generated tool output
            // markers in its text, it's imitating the tool result format instead of making
            // actual tool calls. Strip the hallucination and nudge it to call tools properly.
            const hasHallucinatedResult = responseText.includes('[Tool Result]')
                || responseText.includes('«tool_output»')
                || responseText.includes('«/tool_output»');
            if (toolsEverCalled && hasHallucinatedResult && midChainNudgeCount < MAX_MID_CHAIN_NUDGES) {
                midChainNudgeCount++;
                log.warn(`Detected hallucinated tool result in model output (mid-chain nudge ${midChainNudgeCount}/${MAX_MID_CHAIN_NUDGES})`, {
                    preview: responseText.slice(0, 300),
                });
                // Strip the hallucinated content — don't add it to messages
                // Instead, nudge the model to make a real tool call
                messages.push({
                    role: 'user',
                    content: 'STOP. You just wrote fake tool results instead of calling a tool. '
                        + 'You must NOT write tool output tags or results yourself — only the system provides those. '
                        + 'Call the next tool now by outputting ONLY the JSON array: '
                        + '[{"name": "tool_name", "arguments": {...}}]',
                });
                continue;
            }

            messages.push({ role: 'assistant', content: responseText });

            // Skip nudging if we've already nudged too many times or tools are disabled
            if (nudgeCount >= MAX_NUDGES || toolsDisabled) {
                break;
            }

            // After tools have been called, only allow mid-chain nudges (handled above).
            // Standard nudges are for initial engagement only.
            if (toolsEverCalled) {
                break;
            }

            // Detect incomplete responses that need a nudge to use tools.
            // Only nudge if the model has never successfully called a tool yet.
            // Once it has used tools, a text-only response means it's genuinely done.
            const nudgeReason = detectNudgeReason(responseText, iteration, directTools);

            if (nudgeReason && iteration < MAX_TOOL_ITERATIONS - 1) {
                nudgeCount++;
                log.info(`Nudging model to continue (iteration=${iteration}, reason=${nudgeReason}, nudge=${nudgeCount}/${MAX_NUDGES})`);
                const nudge = buildNudgeMessage(nudgeReason, directTools);
                messages.push({ role: 'user', content: nudge });
                continue;
            }

            break;
        }

        // Max iterations reached — also needs a summary epilogue
        if (iteration >= MAX_TOOL_ITERATIONS && toolsEverCalled) {
            needsSummary = true;
            if (terminationReason === 'normal') {
                terminationReason = 'max_iterations';
            }
        }

        // Final summary epilogue: when the tool loop broke abnormally (repeat
        // detection, same-tool detection, or max iterations), the model never
        // got a chance to produce a coherent text conclusion. Run one last
        // inference call with tools disabled so it can summarize its work.
        if (needsSummary && toolsEverCalled && !aborted) {
            log.info('Running final summary call (tools disabled)', { sessionId: session.id, iteration });
            messages.push({
                role: 'user',
                content: 'Summarize what you accomplished. Be concise — state the key actions taken and their results.',
            });
            try {
                const countBeforeSummary = messages.length;
                trimMessages(messages, systemPrompt);
                if (messages.length < countBeforeSummary) hasTrimmed = true;
                emitContextUsage(messages, systemPrompt);
                const summaryResult = await provider.complete({
                    model,
                    systemPrompt,
                    messages,
                    // No tools — force a text-only response
                    signal: abortController.signal,
                    onStream: (text) => onEvent({
                        type: 'content_block_delta',
                        delta: { text },
                    } as ClaudeStreamEvent),
                });
                if (summaryResult.content && !aborted) {
                    messages.push({ role: 'assistant', content: summaryResult.content });
                    onEvent({
                        type: 'assistant',
                        message: {
                            role: 'assistant',
                            content: [{ type: 'text', text: summaryResult.content }],
                        },
                    } as ClaudeStreamEvent);
                }
            } catch (err) {
                log.warn('Final summary call failed', {
                    sessionId: session.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        } catch (err) {
            terminationReason = 'error';
            const loopDurationMs = Date.now() - loopStartTime;
            const sessionMetrics = buildSessionMetrics({
                model,
                tier: tierConfig.tier,
                iteration,
                toolCallCount,
                maxChainDepth,
                nudgeCount,
                midChainNudgeCount,
                totalExplorationDrifts,
                stallType,
                terminationReason,
                loopDurationMs,
                needsSummary,
            });
            onEvent({
                type: 'result',
                subtype: 'error',
                total_cost_usd: 0,
                duration_ms: loopDurationMs,
                num_turns: iteration,
                session_id: session.id,
                metrics: sessionMetrics,
            } as ClaudeStreamEvent);
            throw err;
        } finally {
            // Release the slot so the next agent can run
            if (slotAcquired) provider.releaseSlot?.(model);
        }

        if (aborted) {
            const loopDurationMs = Date.now() - loopStartTime;
            const sessionMetrics = buildSessionMetrics({
                model,
                tier: tierConfig.tier,
                iteration,
                toolCallCount,
                maxChainDepth,
                nudgeCount,
                midChainNudgeCount,
                totalExplorationDrifts,
                stallType,
                terminationReason: 'abort',
                loopDurationMs,
                needsSummary,
            });
            onEvent({
                type: 'result',
                subtype: 'abort',
                total_cost_usd: 0,
                duration_ms: loopDurationMs,
                num_turns: iteration,
                session_id: session.id,
                metrics: sessionMetrics,
            } as ClaudeStreamEvent);
            return;
        }

        // Signal that the agent is done thinking
        onEvent({ type: 'thinking', thinking: false } as ClaudeStreamEvent);

        // Build session metrics
        const loopDurationMs = Date.now() - loopStartTime;
        const sessionMetrics = buildSessionMetrics({
            model,
            tier: tierConfig.tier,
            iteration,
            toolCallCount,
            maxChainDepth,
            nudgeCount,
            midChainNudgeCount,
            totalExplorationDrifts,
            stallType,
            terminationReason,
            loopDurationMs,
            needsSummary,
        });

        // Emit result event with metrics
        onEvent({
            type: 'result',
            subtype: 'success',
            total_cost_usd: 0, // Local models are free
            duration_ms: loopDurationMs,
            num_turns: iteration,
            session_id: session.id,
            metrics: sessionMetrics,
        } as ClaudeStreamEvent);

        processing = false;

        // Check for queued messages or wait for the next one
        if (aborted) {
            onExit(0);
            return;
        }

        const next = pendingMessages.length > 0
            ? pendingMessages.shift()!
            : await waitForNextMessage();

        if (next === null) {
            // Idle timeout or abort — exit cleanly
            onExit(0);
            return;
        }

        runLoop(next).catch((err) => {
            if (aborted) return;
            const errorMsg = err instanceof Error ? err.message : String(err);
            log.error(`Direct process error for session ${session.id}`, { error: errorMsg });
            onEvent({
                type: 'error',
                error: { message: errorMsg, type: 'direct_process_error' },
            } as ClaudeStreamEvent);
            onExit(1, errorMsg);
        });
    }

    /** Wait for the next user message or idle timeout. Returns null on timeout/abort. */
    function waitForNextMessage(): Promise<string | null> {
        return new Promise<string | null>((resolve) => {
            idleResolver = resolve;
            idleTimer = setTimeout(() => {
                idleResolver = null;
                idleTimer = null;
                log.info(`Session ${session.id} idle timeout after ${IDLE_TIMEOUT_MS / 1000}s`);
                resolve(null);
            }, IDLE_TIMEOUT_MS);
        });
    }

    function emitToolStatus(toolName: string, message: string, _isError: boolean): void {
        onEvent({
            type: 'tool_status',
            statusMessage: `[${toolName}] ${message}`,
        });
    }

    function sendMessage(content: string): boolean {
        if (aborted) return false;
        if (processing) {
            pendingMessages.push(content);
        } else if (idleResolver) {
            // Waiting for next message — resolve the idle promise
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = null;
            }
            const resolve = idleResolver;
            idleResolver = null;
            resolve(content);
        } else {
            runLoop(content).catch((err) => {
                if (aborted) return;
                const errorMsg = err instanceof Error ? err.message : String(err);
                log.error(`Direct process error for session ${session.id}`, { error: errorMsg });
                onEvent({
                    type: 'error',
                    error: { message: errorMsg, type: 'direct_process_error' },
                } as ClaudeStreamEvent);
                onExit(1, errorMsg);
            });
        }
        return true;
    }

    function kill(): void {
        aborted = true;
        abortController.abort();
        // Clear idle wait so the process exits immediately
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
        if (idleResolver) {
            idleResolver(null);
            idleResolver = null;
        }
        approvalManager.cancelSession(session.id);
        // Clean up external MCP server connections
        externalMcpManager.disconnectAll().catch((err: unknown) => {
            log.warn(`Error cleaning up external MCP connections for session ${session.id}`, {
                error: err instanceof Error ? err.message : String(err),
            });
        });
    }

    return { pid: pseudoPid, sendMessage, kill };
}

// ── Nudge system ──────────────────────────────────────────────────────────

type NudgeReason = 'promisedAction' | 'tooShort' | 'wroteButDidntAct' | 'askedInsteadOfActing' | 'explorationDrift';

/**
 * Detect if the model's response indicates it should have called a tool but didn't.
 * Returns the reason string or null if no nudge is needed.
 */
function detectNudgeReason(
    responseText: string,
    iteration: number,
    tools: DirectToolDefinition[],
): NudgeReason | null {
    if (!responseText || tools.length === 0) return null;

    // (a) Model promised future action without doing it
    // More targeted regex — avoid matching genuine explanations
    const promisedAction = /\b(i('ll| will) (now |proceed to )?(review|check|analyze|look|fetch|investigate|read|search|run|execute)|let me (start|begin|check|review|look|examine|read)|working on (it|this|that)|one moment|getting (the|that|this))\b/i.test(responseText);
    if (promisedAction && iteration <= 3) return 'promisedAction';

    // (b) Very short early reply — model didn't engage with the task
    if (responseText.length < 100 && iteration <= 2) return 'tooShort';

    // (c) Model asked what to do instead of acting (Qwen3 pattern)
    const askedInstead = /\b(would you like me to|shall i|do you want me to|what would you like|which (file|tool|command|approach)|should i)\b/i.test(responseText);
    if (askedInstead && iteration <= 2) return 'askedInsteadOfActing';

    // (d) On first iteration, model wrote substantial text but never called a tool
    // This catches cases where the model writes a PR review as text instead of
    // actually using tools to interact with the system
    if (iteration === 1 && responseText.length > 300) return 'wroteButDidntAct';

    return null;
}

/**
 * Build a targeted nudge message based on the detected reason.
 * Different nudge messages for different failure modes.
 */
function buildNudgeMessage(reason: NudgeReason, tools: DirectToolDefinition[]): string {
    const toolNames = tools.map(t => t.name);
    const hasRunCommand = toolNames.includes('run_command');
    const hasReadFile = toolNames.includes('read_file');

    switch (reason) {
        case 'promisedAction':
            return 'Do not describe what you will do — call the tool now. ' +
                (hasReadFile ? 'For example: [{"name": "read_file", "arguments": {"path": "..."}}]' : 'Output ONLY the JSON tool call array.');

        case 'tooShort':
            return 'Your response was too brief. You have tools available — use them to complete the task. ' +
                'Output a tool call as a JSON array: [{"name": "tool_name", "arguments": {...}}]';

        case 'askedInsteadOfActing':
            return 'Do not ask what to do — take action now. Use the tools available to you. ' +
                'Start by reading relevant files or running a command. ' +
                'Output ONLY the JSON tool call, no surrounding text.';

        case 'wroteButDidntAct':
            if (hasRunCommand) {
                return 'You wrote your response as text, but you need to use tools to take action. ' +
                    'If you need to post a comment, use run_command with gh. ' +
                    'If you need to make changes, use the file editing tools. ' +
                    'Output ONLY the JSON tool call array.';
            }
            return 'You wrote a text response, but this task requires using tools. ' +
                'Call the appropriate tool now as a JSON array: [{"name": "tool_name", "arguments": {...}}]';

        case 'explorationDrift':
            return 'FOCUS: You are exploring too many files and directories. ' +
                'Stop browsing and focus on the specific task you were given. ' +
                'Only read files that are directly needed to complete the task. ' +
                'Take action now — do not explore further.';
    }
}

// ── Repeat detection ──────────────────────────────────────────────────────

/**
 * Normalize a tool call sequence into a canonical string for repeat detection.
 * Sorts JSON object keys so `{"a":1,"b":2}` and `{"b":2,"a":1}` match.
 * Strips whitespace differences in string values.
 */
function normalizeToolCallKey(toolCalls: LlmToolCall[]): string {
    return toolCalls.map(tc => {
        const normalizedArgs = normalizeArgsForComparison(tc.arguments);
        return `${tc.name}:${normalizedArgs}`;
    }).join('|');
}

/** Recursively sort object keys and normalize string values for comparison. */
function normalizeArgsForComparison(obj: unknown): string {
    if (obj === null || obj === undefined) return '';
    if (typeof obj === 'string') return obj.trim().replace(/\s+/g, ' ');
    if (typeof obj !== 'object') return String(obj);
    if (Array.isArray(obj)) {
        return '[' + obj.map(normalizeArgsForComparison).join(',') + ']';
    }
    // Sort keys for stable comparison
    const sorted = Object.keys(obj as Record<string, unknown>).sort();
    return '{' + sorted.map(k => `${k}:${normalizeArgsForComparison((obj as Record<string, unknown>)[k])}`).join(',') + '}';
}

// ── Routing helpers ───────────────────────────────────────────────────────

/**
 * For AlgoChat/agent-sourced messages, prepend a routing hint so the model
 * knows to reply with text directly rather than wrapping responses in
 * corvid_send_message tool calls.
 */
/** Exported for testing. */
export function prependRoutingContext(message: string, source: string, tierConfig?: AgentTierConfig): string {
    let sanitizedMessage = message;

    // Sanitize external content for non-high-tier agents
    if (tierConfig && tierConfig.tier !== 'high') {
        const result = sanitizeAgentInput(message, source);
        sanitizedMessage = result.text;
    }

    if (source === 'algochat' || source === 'agent') {
        return `[This message was sent to you via AlgoChat. Reply directly with text. Do NOT use corvid_send_message to respond — your text reply will be automatically routed back to the sender.]\n\n${sanitizedMessage}`;
    }
    if (source === 'discord') {
        return `[This message came from Discord. Reply directly in this conversation — do NOT use corvid_send_message or other cross-channel tools to respond. Your text reply will be posted back to the Discord thread automatically.]\n\n${sanitizedMessage}`;
    }
    return sanitizedMessage;
}

/** Input state captured from the direct-process main loop for metrics. */
export interface SessionMetricsState {
    model: string;
    tier: string;
    iteration: number;
    toolCallCount: number;
    maxChainDepth: number;
    nudgeCount: number;
    midChainNudgeCount: number;
    totalExplorationDrifts: number;
    stallType: string | null;
    terminationReason: DirectProcessMetrics['terminationReason'];
    loopDurationMs: number;
    needsSummary: boolean;
}

/**
 * Build a DirectProcessMetrics object from loop state variables.
 * Exported for testing — this pure function is called at the end of the
 * tool-use loop to construct the metrics payload.
 */
export function buildSessionMetrics(state: SessionMetricsState): DirectProcessMetrics {
    const stallDetected = state.terminationReason === 'stall_repeat'
        || state.terminationReason === 'stall_same_tool';
    return {
        model: state.model,
        tier: state.tier,
        totalIterations: state.iteration,
        toolCallCount: state.toolCallCount,
        maxChainDepth: state.maxChainDepth,
        nudgeCount: state.nudgeCount,
        midChainNudgeCount: state.midChainNudgeCount,
        explorationDriftCount: state.totalExplorationDrifts,
        stallDetected,
        stallType: state.stallType,
        terminationReason: state.terminationReason,
        durationMs: state.loopDurationMs,
        needsSummary: state.needsSummary,
    };
}

export interface ToolDef {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

export function buildSystemPrompt(
    agent: Agent | null,
    project: Project,
    model: string,
    toolDefs: ToolDef[],
    hasTools: boolean,
    isDeliberation = false,
    personaPrompt?: string,
    skillPrompt?: string,
    agentTierConfig?: AgentTierConfig,
): string {
    const parts: string[] = [];

    // Council deliberation sessions: override with reasoning-only instructions
    if (isDeliberation) {
        parts.push(
            'You are a council member participating in a structured deliberation.',
            'Answer the question directly using your expertise and reasoning.',
            'Do NOT attempt to call tools, read files, or review code — you have no tools available.',
            'Provide your analysis, recommendations, and trade-offs based on your knowledge.',
            'Be specific and opinionated. Take a clear position rather than listing generic pros and cons.',
        );
        if (agent?.systemPrompt) {
            parts.push('', `Your role: ${agent.systemPrompt}`);
        }
        if (agent?.appendPrompt) {
            parts.push('', agent.appendPrompt);
        }
        if (personaPrompt) parts.push('', personaPrompt);
        return parts.join('\n');
    }

    if (agent?.systemPrompt) {
        parts.push(agent.systemPrompt);
    } else {
        parts.push(
            'You are a helpful AI assistant. You have access to tools that let you interact with other agents, save/recall memories, and manage tasks.',
            `You are working in the project directory: ${project.workingDir}`,
        );
    }

    if (agent?.appendPrompt) {
        parts.push('', agent.appendPrompt);
    }

    // Inject persona and skill prompts
    if (personaPrompt) parts.push('', personaPrompt);
    if (skillPrompt) parts.push('', `## Skill Instructions\n${skillPrompt}`);

    // Append tool-specific instructions when tools are available
    const toolNames = toolDefs.map((t) => t.name);
    if (hasTools && toolDefs.length > 0) {
        const family = detectModelFamily(model);
        parts.push('', getToolInstructionPrompt(family, toolNames, toolDefs));

        // Add response routing instructions if messaging tools are present
        if (toolNames.includes('corvid_send_message')) {
            parts.push('', getResponseRoutingPrompt());
        }

        // Add coding tool guidelines if coding tools are present
        if (toolNames.includes('read_file')) {
            parts.push('', getCodingToolPrompt());
        }

        // Always add messaging safety instructions when tools are available.
        // Unlike response routing (gated on corvid_send_message) or coding guidance
        // (gated on read_file), this is unconditional — any agent with tools must not
        // generate scripts to bypass MCP tool-only messaging. See spec invariant #7.
        parts.push('', getMessagingSafetyPrompt());
    }

    // Add focus/scoping instructions for non-high-tier agents
    if (agentTierConfig && agentTierConfig.tier !== 'high') {
        parts.push('', getAgentScopingInstructions(agentTierConfig));
    }

    return parts.join('\n');
}

/**
 * Generate scoping/focus instructions for non-high-tier agents.
 * These help prevent unfocused exploration and tool misuse.
 */
function getAgentScopingInstructions(tierConfig: AgentTierConfig): string {
    const parts = [
        '## Task Focus Guidelines',
        '',
        'IMPORTANT: Stay focused on the specific task you were given.',
        '- Do NOT explore directories or files unrelated to the task.',
        '- Do NOT browse the entire project structure. Only read files directly relevant to completing the task.',
        '- Before reading a file, ask yourself: "Is this file necessary for completing my specific task?"',
        '- If the task is about a specific file or module, focus only on that area.',
        '- Complete the task as efficiently as possible with the minimum number of tool calls.',
    ];

    if (tierConfig.tier === 'limited') {
        parts.push(
            '',
            'CRITICAL CONSTRAINTS:',
            `- You have a maximum of ${tierConfig.maxToolIterations} tool calls. Use them wisely.`,
            `- You may create at most ${tierConfig.maxPrsPerSession} PR(s) and ${tierConfig.maxIssuesPerSession} issue(s) per session.`,
            '- Plan your approach before making tool calls. Do not explore randomly.',
            '- If you are unsure what to do, state your uncertainty rather than exploring blindly.',
        );
    }

    return parts.join('\n');
}

async function checkToolPermission(
    toolCall: LlmToolCall,
    session: Session,
    agent: Agent | null,
    approvalManager: ApprovalManager,
    onApprovalRequest: (request: ApprovalRequestWire) => void,
): Promise<boolean> {
    const permissionMode = agent?.permissionMode ?? 'default';
    const BYPASS_MODES = new Set(['full-auto', 'auto-edit']);

    // corvid_* tools are MCP tools — auto-approve in bypass modes
    if (BYPASS_MODES.has(permissionMode)) {
        return true;
    }

    // For non-bypass modes, request approval
    const requestId = crypto.randomUUID().slice(0, 8);
    const timeoutMs = approvalManager.getDefaultTimeout(session.source);

    const request: ApprovalRequest = {
        id: requestId,
        sessionId: session.id,
        toolName: toolCall.name,
        toolInput: toolCall.arguments,
        description: formatToolDescription(toolCall.name, toolCall.arguments),
        createdAt: Date.now(),
        timeoutMs,
        source: session.source,
    };

    onApprovalRequest({
        id: request.id,
        sessionId: request.sessionId,
        toolName: request.toolName,
        description: request.description,
        createdAt: request.createdAt,
        timeoutMs: request.timeoutMs,
    });

    const response = await approvalManager.createRequest(request);
    return response.behavior === 'allow';
}

function isToolUnsupportedError(errorMsg: string): boolean {
    const lower = errorMsg.toLowerCase();
    return (
        lower.includes('does not support tools') ||
        lower.includes('tool') && lower.includes('not supported') ||
        lower.includes('unknown parameter') && lower.includes('tool')
    );
}
