/**
 * ChainContinuationManager — Detects when a limited-tier model stalls mid
 * tool-chain and surfaces a signal to escalate to a higher tier.
 *
 * A "stalled step" is a model turn (message_stop event) that produced no
 * tool_use content blocks. When consecutive stalled steps reach the threshold
 * (MODEL_CHAIN_CONTINUATION_THRESHOLD env var, default 5), the caller should
 * escalate the session to the next ModelTier.
 *
 * Security constraints (per issue #1018):
 *   - Chain state serialization MUST NOT include raw mnemonics, API keys, or
 *     wallet credentials. serializeChainState() applies a redaction pass.
 *   - Escalation respects the 1-active-task-per-project invariant: the current
 *     task is failed before a replacement task is created.
 *   - Escalation events are logged at INFO with tier-from/tier-to only — no
 *     sensitive context appears in log lines.
 *
 * @module
 */

import { ModelTier } from '../providers/types';
import { CLAUDE_TIER_MODELS } from '../providers/router';
import { createLogger } from '../lib/logger';

export { ModelTier };

const log = createLogger('ChainContinuation');

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Number of consecutive stalled turns before escalation is triggered.
 * Override with MODEL_CHAIN_CONTINUATION_THRESHOLD env var.
 */
export const CHAIN_CONTINUATION_THRESHOLD = parseInt(
    process.env.MODEL_CHAIN_CONTINUATION_THRESHOLD ?? '5',
    10,
);

// ─── Tier utilities ───────────────────────────────────────────────────────────

/**
 * Map a ModelTier to the next higher tier for escalation.
 * Returns null if already at OPUS (no higher tier available).
 */
export function escalateTier(tier: ModelTier): ModelTier | null {
    switch (tier) {
        case ModelTier.INTERN: return ModelTier.HAIKU;
        case ModelTier.HAIKU:  return ModelTier.SONNET;
        case ModelTier.SONNET: return ModelTier.OPUS;
        case ModelTier.OPUS:   return null;
    }
}

/**
 * Infer the ModelTier from a Claude model identifier string.
 * Defaults to HAIKU (most restrictive) when unrecognized.
 */
export function inferModelTier(model: string): ModelTier {
    const lower = model.toLowerCase();
    if (lower.includes('opus'))   return ModelTier.OPUS;
    if (lower.includes('sonnet')) return ModelTier.SONNET;
    if (lower.includes('haiku'))  return ModelTier.HAIKU;
    return ModelTier.HAIKU;
}

/**
 * Return the canonical Claude model string for a given tier.
 * Delegates to CLAUDE_TIER_MODELS from the router.
 */
export function modelForTier(tier: ModelTier): string {
    return CLAUDE_TIER_MODELS[tier];
}

// ─── Stall detection ──────────────────────────────────────────────────────────

interface StallState {
    /** Consecutive turns with no tool calls. */
    stalledSteps: number;
    /** True if the current turn has seen a tool_use content block. */
    currentTurnHasToolUse: boolean;
    /** True once escalation has been triggered — prevents double-escalation. */
    escalated: boolean;
}

/**
 * StallDetector tracks per-session stall state.
 *
 * Usage:
 *   const detector = new StallDetector();
 *   detector.track(sessionId);
 *   ...
 *   const shouldEscalate = detector.onEvent(sessionId, event.type, contentBlockType);
 *   if (shouldEscalate) { detector.markEscalated(sessionId); ... }
 */
export class StallDetector {
    private readonly threshold: number;
    private readonly sessions = new Map<string, StallState>();

    constructor(threshold: number = CHAIN_CONTINUATION_THRESHOLD) {
        this.threshold = threshold;
    }

    /** Begin tracking stall state for a session. */
    track(sessionId: string): void {
        this.sessions.set(sessionId, {
            stalledSteps: 0,
            currentTurnHasToolUse: false,
            escalated: false,
        });
    }

    /**
     * Process a single event for the given session.
     *
     * @param sessionId - The session to update.
     * @param eventType - The `type` field of the ClaudeStreamEvent.
     * @param contentBlockType - The `content_block.type` when eventType is
     *   'content_block_start'; ignored otherwise.
     * @returns true when the stall threshold was just crossed for the first
     *   time on this session (caller should escalate and call markEscalated).
     */
    onEvent(sessionId: string, eventType: string, contentBlockType?: string): boolean {
        const state = this.sessions.get(sessionId);
        if (!state || state.escalated) return false;

        if (eventType === 'content_block_start' && contentBlockType === 'tool_use') {
            state.currentTurnHasToolUse = true;
        }

        if (eventType === 'message_stop') {
            if (!state.currentTurnHasToolUse) {
                state.stalledSteps++;
                log.debug('Stalled step counted', {
                    sessionId,
                    stalledSteps: state.stalledSteps,
                    threshold: this.threshold,
                });
                if (state.stalledSteps >= this.threshold) {
                    return true;
                }
            } else {
                // Productive turn — reset stall counter
                state.stalledSteps = 0;
            }
            state.currentTurnHasToolUse = false;
        }

        return false;
    }

    /** Return the current consecutive stalled-step count for a session. */
    getStalledSteps(sessionId: string): number {
        return this.sessions.get(sessionId)?.stalledSteps ?? 0;
    }

    /**
     * Mark a session as having been escalated.
     * Prevents the stall threshold from firing again on the same session.
     */
    markEscalated(sessionId: string): void {
        const state = this.sessions.get(sessionId);
        if (state) state.escalated = true;
    }

    /** Remove all stall state for a session (call on session cleanup). */
    remove(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    /** Number of sessions currently being tracked. */
    get trackedSessionCount(): number {
        return this.sessions.size;
    }
}

// ─── Chain state serialization ───────────────────────────────────────────────

/**
 * Patterns identifying content that must NOT appear in continuation state.
 * Applied as a redaction pass before including any session context.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
    /sk-[a-zA-Z0-9]{20,}/g,              // Anthropic / OpenAI API key prefix
    /ANTHROPIC_API_KEY\s*=\s*\S+/gi,     // Env-style key assignment
    /OPENAI_API_KEY\s*=\s*\S+/gi,
    /mnemonic[=:\s]+\S+/gi,              // Mnemonic assignments
    /ALGOCHAT_MNEMONIC\s*=\s*\S+/gi,     // AlgoChat wallet mnemonic
    /WALLET_ENCRYPTION_KEY\s*=\s*\S+/gi, // Wallet encryption key
    /-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/g, // PEM blocks
];

/**
 * Serialize the current chain state for inclusion as context in an escalated
 * task. Safe to embed in a new task description — all recognizable secret
 * patterns are redacted before any content is included.
 *
 * Security: Only the original task description and a short, scrubbed session
 * summary are included. Raw message history is never serialized.
 */
export function serializeChainState(opts: {
    taskDescription: string;
    fromTier: ModelTier;
    toTier: ModelTier;
    stalledSteps: number;
    /** Optional brief session summary (last ~500 chars of model output). */
    sessionSummary?: string;
}): string {
    const { taskDescription, fromTier, toTier, stalledSteps, sessionSummary } = opts;

    const parts: string[] = [
        `[Auto-escalated: ${fromTier} → ${toTier} after ${stalledSteps} stalled step(s)]`,
        '',
        'Original task:',
        taskDescription,
    ];

    if (sessionSummary?.trim()) {
        let safe = sessionSummary;
        for (const pattern of SENSITIVE_PATTERNS) {
            safe = safe.replace(pattern, '[REDACTED]');
        }
        const trimmed = safe.slice(0, 800).trim();
        if (trimmed) {
            parts.push('', 'Prior session context (truncated, sanitized):', trimmed);
        }
    }

    return parts.join('\n');
}

/**
 * Log an escalation event at INFO level.
 * Only tier-from/tier-to metadata is logged — no sensitive context.
 */
export function logEscalation(opts: {
    taskId: string;
    sessionId: string;
    fromTier: ModelTier;
    toTier: ModelTier;
    stalledSteps: number;
    newTaskId?: string;
}): void {
    log.info('Chain continuation: escalating stalled session', {
        taskId: opts.taskId,
        sessionId: opts.sessionId,
        fromTier: opts.fromTier,
        toTier: opts.toTier,
        stalledSteps: opts.stalledSteps,
        ...(opts.newTaskId ? { newTaskId: opts.newTaskId } : {}),
    });
}
