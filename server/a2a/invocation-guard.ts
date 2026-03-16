/**
 * A2A Invocation Guard — session-level budget enforcement and inbound rate limiting.
 *
 * Prevents abuse by:
 * - Limiting total remote invocations per session
 * - Limiting unique agents contacted per session
 * - Enforcing cooldown between invocations
 * - Rate-limiting inbound A2A tasks per source agent (sliding window)
 *
 * Configuration via environment variables:
 * - MAX_REMOTE_INVOCATIONS_PER_SESSION (default: 10)
 * - MAX_UNIQUE_AGENTS_PER_SESSION (default: 3)
 * - A2A_INVOCATION_COOLDOWN_MS (default: 5000)
 * - A2A_INBOUND_RATE_LIMIT_PER_MIN (default: 5)
 */

import { createLogger } from '../lib/logger';

const log = createLogger('A2AInvocationGuard');

// ── Configuration ────────────────────────────────────────────────────────

export interface InvocationGuardConfig {
    maxInvocationsPerSession: number;
    maxUniqueAgentsPerSession: number;
    cooldownMs: number;
    inboundRateLimitPerMin: number;
    inboundRateLimitWindowMs: number;
}

export function loadInvocationGuardConfig(): InvocationGuardConfig {
    const maxInv = parseInt(process.env.MAX_REMOTE_INVOCATIONS_PER_SESSION ?? '10', 10);
    const maxAgents = parseInt(process.env.MAX_UNIQUE_AGENTS_PER_SESSION ?? '3', 10);
    const cooldown = parseInt(process.env.A2A_INVOCATION_COOLDOWN_MS ?? '5000', 10);
    const inboundRate = parseInt(process.env.A2A_INBOUND_RATE_LIMIT_PER_MIN ?? '5', 10);

    return {
        maxInvocationsPerSession: Number.isFinite(maxInv) && maxInv > 0 ? maxInv : 10,
        maxUniqueAgentsPerSession: Number.isFinite(maxAgents) && maxAgents > 0 ? maxAgents : 3,
        cooldownMs: Number.isFinite(cooldown) && cooldown >= 0 ? cooldown : 5000,
        inboundRateLimitPerMin: Number.isFinite(inboundRate) && inboundRate > 0 ? inboundRate : 5,
        inboundRateLimitWindowMs: 60_000,
    };
}

// ── Session Budget ───────────────────────────────────────────────────────

export type BudgetRejectionReason =
    | 'INVOCATION_LIMIT'
    | 'UNIQUE_AGENT_LIMIT'
    | 'COOLDOWN';

export interface BudgetCheckResult {
    allowed: boolean;
    reason?: BudgetRejectionReason;
    detail?: string;
}

/**
 * Tracks per-session invocation budget.
 * Instantiate one per agent session; attach to the MCP context.
 */
export class SessionInvocationBudget {
    private invocationCount = 0;
    private readonly uniqueAgents = new Set<string>();
    private lastInvocationTs = 0;
    private readonly config: InvocationGuardConfig;

    constructor(config?: Partial<InvocationGuardConfig>) {
        const defaults = loadInvocationGuardConfig();
        this.config = { ...defaults, ...config };
    }

    /**
     * Check whether a remote agent invocation is allowed.
     */
    check(targetAgentUrl: string): BudgetCheckResult {
        // 1. Total invocation limit
        if (this.invocationCount >= this.config.maxInvocationsPerSession) {
            return {
                allowed: false,
                reason: 'INVOCATION_LIMIT',
                detail: `Session invocation limit reached (${this.config.maxInvocationsPerSession}).`,
            };
        }

        // 2. Unique agent limit
        if (
            !this.uniqueAgents.has(targetAgentUrl) &&
            this.uniqueAgents.size >= this.config.maxUniqueAgentsPerSession
        ) {
            return {
                allowed: false,
                reason: 'UNIQUE_AGENT_LIMIT',
                detail: `Unique agent limit reached (${this.config.maxUniqueAgentsPerSession}).`,
            };
        }

        // 3. Cooldown
        const now = Date.now();
        const elapsed = now - this.lastInvocationTs;
        if (this.lastInvocationTs > 0 && elapsed < this.config.cooldownMs) {
            const remaining = this.config.cooldownMs - elapsed;
            return {
                allowed: false,
                reason: 'COOLDOWN',
                detail: `Cooldown active. Retry after ${remaining}ms.`,
            };
        }

        return { allowed: true };
    }

    /**
     * Record a successful invocation (call after check passes and invocation starts).
     */
    record(targetAgentUrl: string): void {
        this.invocationCount++;
        this.uniqueAgents.add(targetAgentUrl);
        this.lastInvocationTs = Date.now();
    }

    /** Current invocation count for this session. */
    getInvocationCount(): number {
        return this.invocationCount;
    }

    /** Number of unique agents contacted. */
    getUniqueAgentCount(): number {
        return this.uniqueAgents.size;
    }
}

// ── Inbound Rate Limiter ─────────────────────────────────────────────────

/**
 * Per-source-agent sliding-window rate limiter for inbound A2A tasks.
 */
export class InboundA2ARateLimiter {
    private readonly config: InvocationGuardConfig;
    private readonly windows = new Map<string, number[]>();
    private sweepTimer: ReturnType<typeof setInterval> | null = null;

    constructor(config?: Partial<InvocationGuardConfig>) {
        const defaults = loadInvocationGuardConfig();
        this.config = { ...defaults, ...config };

        // Sweep stale entries every 5 minutes
        this.sweepTimer = setInterval(() => this.sweep(), 5 * 60_000);
        if (this.sweepTimer && typeof this.sweepTimer === 'object' && 'unref' in this.sweepTimer) {
            (this.sweepTimer as NodeJS.Timeout).unref();
        }
    }

    /**
     * Check whether an inbound task from `sourceAgent` is allowed.
     * Returns true if allowed, false if rate-limited.
     */
    check(sourceAgent: string): { allowed: boolean; retryAfterMs?: number } {
        const now = Date.now();
        const windowStart = now - this.config.inboundRateLimitWindowMs;

        let timestamps = this.windows.get(sourceAgent);
        if (!timestamps) {
            return { allowed: true };
        }

        // Prune expired timestamps
        const firstValid = timestamps.findIndex((t) => t > windowStart);
        if (firstValid > 0) {
            timestamps.splice(0, firstValid);
        } else if (firstValid === -1) {
            timestamps.length = 0;
        }

        if (timestamps.length >= this.config.inboundRateLimitPerMin) {
            const oldest = timestamps[0];
            const retryAfterMs = (oldest + this.config.inboundRateLimitWindowMs) - now;
            log.warn('Inbound A2A rate limit exceeded', {
                sourceAgent,
                count: timestamps.length,
                retryAfterMs,
            });
            return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1) };
        }

        return { allowed: true };
    }

    /**
     * Record an inbound task from a source agent.
     */
    record(sourceAgent: string): void {
        let timestamps = this.windows.get(sourceAgent);
        if (!timestamps) {
            timestamps = [];
            this.windows.set(sourceAgent, timestamps);
        }
        timestamps.push(Date.now());
    }

    /** Stop the sweep timer. */
    stop(): void {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
    }

    /** Reset all windows (for testing). */
    reset(): void {
        this.windows.clear();
    }

    private sweep(): void {
        const now = Date.now();
        const windowStart = now - this.config.inboundRateLimitWindowMs;
        let swept = 0;

        for (const [key, timestamps] of this.windows) {
            const hasRecent = timestamps.some((t) => t > windowStart);
            if (!hasRecent) {
                this.windows.delete(key);
                swept++;
            }
        }

        if (swept > 0) {
            log.debug('Swept stale inbound A2A rate-limit entries', { swept, remaining: this.windows.size });
        }
    }
}

// ── Max Depth ────────────────────────────────────────────────────────────

export const MAX_A2A_DEPTH = 3;
