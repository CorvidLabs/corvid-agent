/**
 * Tool guardrails for preventing emergent agent-to-agent networking behavior.
 *
 * Problem: Small models (Qwen 14B etc.) see MCP tools like corvid_send_message
 * and corvid_list_agents and use them unprompted, ignoring the user's actual
 * question. This wastes resources and creates orphaned sessions.
 *
 * Solution: Classify tools by cost/risk tier. "Expensive" networking tools are
 * opt-in per session. Unless a session explicitly enables them (via toolAccess
 * config or privileged source), these tools are hidden from the model entirely.
 *
 * Closes #1054
 */

import { createLogger } from '../lib/logger';

const log = createLogger('ToolGuardrails');

// ── Tool tiers ──────────────────────────────────────────────────────────────

/**
 * Tools that trigger agent-to-agent networking or expensive cross-agent
 * operations. These are hidden from sessions unless explicitly enabled.
 */
export const EXPENSIVE_NETWORKING_TOOLS = new Set([
    'corvid_send_message',
    'corvid_invoke_remote_agent',
    'corvid_list_agents',
    'corvid_discover_agent',
    'corvid_launch_council',
    'corvid_flock_directory',
]);

/**
 * Sources considered privileged — sessions from these sources get full tool
 * access by default (the operator deliberately chose to expose all tools).
 */
export const PRIVILEGED_SOURCES = new Set(['web']);

// ── Session tool access policy ──────────────────────────────────────────────

export type ToolAccessPolicy = 'full' | 'standard' | 'restricted';

/**
 * Configuration for session-level tool access control.
 *
 * - `full`: All tools available (no guardrails).
 * - `standard`: Default — expensive networking tools are hidden unless the
 *   session source is privileged or the agent has explicit permissions.
 * - `restricted`: Only safe, non-networking tools. For small models or
 *   untrusted sessions.
 *
 * `allowedExpensiveTools` overrides the policy for specific expensive tools.
 * E.g., a session with policy='standard' but allowedExpensiveTools=['corvid_list_agents']
 * will still have access to corvid_list_agents but not corvid_send_message.
 */
export interface ToolAccessConfig {
    policy: ToolAccessPolicy;
    /** Specific expensive tools to enable even under 'standard' or 'restricted' policy. */
    allowedExpensiveTools?: string[];
}

/**
 * Determine the default tool access policy for a session based on source and model.
 *
 * - Web sessions → 'full' (operator is directly controlling)
 * - Agent-to-agent sessions → 'restricted' (prevent recursive networking)
 * - External chat sources with small models → 'standard' (hide networking tools)
 * - External chat sources with large models → 'standard'
 */
export function resolveToolAccessPolicy(
    source: string | undefined,
    _agentModel?: string,
): ToolAccessPolicy {
    // Web sessions are always fully privileged
    if (source === 'web') return 'full';

    // Agent-to-agent sessions should never re-invoke networking tools
    if (source === 'agent') return 'restricted';

    // All other sources (discord, telegram, slack, algochat) get standard policy
    // which hides expensive networking tools unless explicitly allowed
    return 'standard';
}

/**
 * Check whether a tool should be hidden for the given session configuration.
 *
 * @returns true if the tool should be REMOVED from the tool set
 */
export function isToolBlockedByGuardrail(
    toolName: string,
    config: ToolAccessConfig,
): boolean {
    // 'full' policy — nothing blocked
    if (config.policy === 'full') return false;

    // Check if the tool is in the expensive set
    if (!EXPENSIVE_NETWORKING_TOOLS.has(toolName)) return false;

    // Check if explicitly allowed via override
    if (config.allowedExpensiveTools?.includes(toolName)) return false;

    // Under 'standard' or 'restricted', expensive tools are blocked
    return true;
}

/**
 * Filter a list of tool names, removing those blocked by the guardrail config.
 */
export function filterToolsByGuardrail<T extends { name: string }>(
    tools: T[],
    config: ToolAccessConfig,
): T[] {
    const before = tools.length;
    const filtered = tools.filter((t) => !isToolBlockedByGuardrail(t.name, config));
    const removed = before - filtered.length;

    if (removed > 0) {
        log.debug('Tool guardrails filtered tools', {
            policy: config.policy,
            removed,
            remainingCount: filtered.length,
        });
    }

    return filtered;
}

// ── Per-session messaging rate limiter ───────────────────────────────────────

export interface SessionMessageRateLimitConfig {
    /** Maximum agent-to-agent messages per session. */
    maxMessagesPerSession: number;
    /** Maximum unique agents a session can message. */
    maxUniqueTargetsPerSession: number;
    /** Minimum milliseconds between consecutive sends. */
    minIntervalMs: number;
}

const DEFAULT_SESSION_MESSAGE_LIMITS: SessionMessageRateLimitConfig = {
    maxMessagesPerSession: 5,
    maxUniqueTargetsPerSession: 2,
    minIntervalMs: 3000,
};

/**
 * Per-session rate limiter for agent-to-agent messaging.
 *
 * Prevents small models from creating infinite send loops by enforcing:
 * - Total message count per session
 * - Unique target agent count per session
 * - Minimum interval between sends
 */
export class SessionMessageRateLimiter {
    private sendCount = 0;
    private uniqueTargets = new Set<string>();
    private lastSendAt = 0;
    private readonly config: SessionMessageRateLimitConfig;

    constructor(config?: Partial<SessionMessageRateLimitConfig>) {
        this.config = { ...DEFAULT_SESSION_MESSAGE_LIMITS, ...config };
    }

    /**
     * Check if a send to the given target is allowed.
     * @returns null if allowed, or an error message if blocked.
     */
    check(targetAgent: string): string | null {
        if (this.sendCount >= this.config.maxMessagesPerSession) {
            return `Session message limit reached: max ${this.config.maxMessagesPerSession} agent messages per session (sent ${this.sendCount}).`;
        }

        if (
            !this.uniqueTargets.has(targetAgent) &&
            this.uniqueTargets.size >= this.config.maxUniqueTargetsPerSession
        ) {
            return `Session target limit reached: max ${this.config.maxUniqueTargetsPerSession} unique agents per session (contacted ${this.uniqueTargets.size}).`;
        }

        const now = Date.now();
        const elapsed = now - this.lastSendAt;
        if (this.lastSendAt > 0 && elapsed < this.config.minIntervalMs) {
            return `Message cooldown active: please wait ${this.config.minIntervalMs - elapsed}ms before sending again.`;
        }

        return null;
    }

    /** Record a successful send. */
    record(targetAgent: string): void {
        this.sendCount++;
        this.uniqueTargets.add(targetAgent);
        this.lastSendAt = Date.now();
    }

    /** Current send count. */
    getSendCount(): number {
        return this.sendCount;
    }

    /** Current unique target count. */
    getUniqueTargetCount(): number {
        return this.uniqueTargets.size;
    }
}

/**
 * Load session message rate limit config from environment variables.
 */
export function loadSessionMessageLimits(): SessionMessageRateLimitConfig {
    const parse = (key: string, fallback: number, allowZero = false): number => {
        const raw = process.env[key];
        if (!raw) return fallback;
        const n = parseInt(raw, 10);
        if (isNaN(n)) return fallback;
        if (allowZero ? n < 0 : n <= 0) return fallback;
        return n;
    };

    return {
        maxMessagesPerSession: parse('SESSION_MAX_AGENT_MESSAGES', DEFAULT_SESSION_MESSAGE_LIMITS.maxMessagesPerSession),
        maxUniqueTargetsPerSession: parse('SESSION_MAX_UNIQUE_TARGETS', DEFAULT_SESSION_MESSAGE_LIMITS.maxUniqueTargetsPerSession),
        minIntervalMs: parse('SESSION_MESSAGE_INTERVAL_MS', DEFAULT_SESSION_MESSAGE_LIMITS.minIntervalMs, true),
    };
}
