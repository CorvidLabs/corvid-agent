/**
 * Context management helpers for direct-process sessions.
 *
 * Handles token estimation, context budget tracking, message trimming, and
 * progressive compression tiers to keep conversations within the context window.
 */

import { createLogger } from '../lib/logger';

const log = createLogger('DirectProcess');

const MAX_MESSAGES = 40;
const KEEP_RECENT = 30;

/**
 * Content-aware token estimation.
 * Code-heavy content averages ~0.33 tokens/char (more tokens per char due to
 * operators, short identifiers, indentation). Prose averages ~0.25 tokens/char.
 * We use a simple heuristic: if the text has many code indicators, use the
 * code factor; otherwise use prose.
 */
export function estimateTokens(text: string): number {
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
export function getContextBudget(): number {
    return parseInt(process.env.OLLAMA_NUM_CTX ?? '8192', 10);
}

/**
 * Calculate the maximum tool result size based on remaining context budget.
 * Ensures a single tool result never consumes more than 30% of the total
 * context window, and scales down further when context is already full.
 *
 * Returns max chars (not tokens).
 */
export function calculateMaxToolResultChars(
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
export function truncateCouncilContext(
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

export type ConversationMessage = { role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string; toolCalls?: import('../providers/types').LlmToolCall[] };

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
export function trimMessages(
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
