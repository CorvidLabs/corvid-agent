/**
 * Messaging guard: circuit breaker + per-agent rate limiting for agent-to-agent calls.
 *
 * Protects against cascading failures by tracking per-agent outbound call health
 * (circuit breaker) and prevents message flooding via per-agent sliding-window
 * rate limiting.
 *
 * Configuration via environment variables:
 * - AGENT_CB_FAILURE_THRESHOLD: failures before opening circuit (default: 5)
 * - AGENT_CB_RESET_TIMEOUT_MS: cooldown before half-open probe (default: 30000)
 * - AGENT_CB_SUCCESS_THRESHOLD: successes in half-open to close (default: 2)
 * - AGENT_RATE_LIMIT_PER_MIN: max messages per agent per minute (default: 10)
 */

import { CircuitBreaker, CircuitOpenError, type CircuitState } from '../lib/resilience';
import { createLogger } from '../lib/logger';
import { circuitBreakerTransitions, agentRateLimitRejections } from '../observability/metrics';

const log = createLogger('MessagingGuard');

// ── Configuration ────────────────────────────────────────────────────────

export interface MessagingGuardConfig {
    /** Failures before opening the circuit. Default: 5 */
    failureThreshold: number;
    /** Cooldown (ms) before transitioning OPEN → HALF_OPEN. Default: 30000 */
    resetTimeoutMs: number;
    /** Successes needed in HALF_OPEN to close the circuit. Default: 2 */
    successThreshold: number;
    /** Max messages per agent per sliding window. Default: 10 */
    rateLimitPerWindow: number;
    /** Sliding window size in ms. Default: 60000 (1 minute) */
    rateLimitWindowMs: number;
}

export function loadMessagingGuardConfig(): MessagingGuardConfig {
    const failureThreshold = parseInt(process.env.AGENT_CB_FAILURE_THRESHOLD ?? '5', 10);
    const resetTimeoutMs = parseInt(process.env.AGENT_CB_RESET_TIMEOUT_MS ?? '30000', 10);
    const successThreshold = parseInt(process.env.AGENT_CB_SUCCESS_THRESHOLD ?? '2', 10);
    const rateLimitPerWindow = parseInt(process.env.AGENT_RATE_LIMIT_PER_MIN ?? '10', 10);

    return {
        failureThreshold: Number.isFinite(failureThreshold) && failureThreshold > 0 ? failureThreshold : 5,
        resetTimeoutMs: Number.isFinite(resetTimeoutMs) && resetTimeoutMs > 0 ? resetTimeoutMs : 30_000,
        successThreshold: Number.isFinite(successThreshold) && successThreshold > 0 ? successThreshold : 2,
        rateLimitPerWindow: Number.isFinite(rateLimitPerWindow) && rateLimitPerWindow > 0 ? rateLimitPerWindow : 10,
        rateLimitWindowMs: 60_000,
    };
}

// ── Guard result ─────────────────────────────────────────────────────────

export type GuardRejectionReason = 'CIRCUIT_OPEN' | 'RATE_LIMITED';

export interface GuardResult {
    allowed: boolean;
    reason?: GuardRejectionReason;
    retryAfterMs?: number;
}

// ── MessagingGuard ───────────────────────────────────────────────────────

/**
 * Combined circuit breaker + per-agent rate limiter for agent messaging.
 *
 * Circuit breakers are keyed by target agent ID — if calls to a specific agent
 * consistently fail, the circuit opens and further calls are rejected until
 * the cooldown period elapses and a half-open probe succeeds.
 *
 * Rate limiting is keyed by sender agent ID — no single agent can send more
 * than `rateLimitPerWindow` messages within the sliding window.
 */
export class MessagingGuard {
    private readonly config: MessagingGuardConfig;

    /** Per-target-agent circuit breakers. */
    private readonly breakers = new Map<string, CircuitBreaker>();

    /** Per-sender-agent sliding window timestamps. */
    private readonly senderWindows = new Map<string, number[]>();

    /** Track previous state per breaker for transition logging. */
    private readonly previousStates = new Map<string, CircuitState>();

    private sweepTimer: ReturnType<typeof setInterval> | null = null;

    constructor(config?: Partial<MessagingGuardConfig>) {
        const defaults = loadMessagingGuardConfig();
        this.config = { ...defaults, ...config };

        // Sweep stale rate-limit entries every 5 minutes
        this.sweepTimer = setInterval(() => this.sweep(), 5 * 60_000);
        if (this.sweepTimer && typeof this.sweepTimer === 'object' && 'unref' in this.sweepTimer) {
            (this.sweepTimer as NodeJS.Timeout).unref();
        }
    }

    /**
     * Check whether a message from `fromAgentId` to `toAgentId` is allowed.
     *
     * Checks are performed in order:
     * 1. Circuit breaker for the target agent (is the agent healthy?)
     * 2. Rate limit for the sender agent (is the sender flooding?)
     */
    check(fromAgentId: string, toAgentId: string): GuardResult {
        // 1. Circuit breaker check
        const breaker = this.getOrCreateBreaker(toAgentId);
        const prevState = this.previousStates.get(toAgentId) ?? 'CLOSED';
        const currentState = breaker.getState();

        // Log state transitions
        if (currentState !== prevState) {
            this.logTransition(toAgentId, prevState, currentState);
            this.previousStates.set(toAgentId, currentState);
        }

        if (currentState === 'OPEN') {
            log.warn('Circuit breaker OPEN — rejecting call', {
                toAgentId,
                fromAgentId,
            });
            agentRateLimitRejections.inc({ reason: 'circuit_open', agent_id: toAgentId });
            return {
                allowed: false,
                reason: 'CIRCUIT_OPEN',
                retryAfterMs: this.config.resetTimeoutMs,
            };
        }

        // 2. Rate limit check
        const rateLimitResult = this.checkRateLimit(fromAgentId);
        if (!rateLimitResult.allowed) {
            log.warn('Agent rate limit exceeded', {
                fromAgentId,
                toAgentId,
                retryAfterMs: rateLimitResult.retryAfterMs,
            });
            agentRateLimitRejections.inc({ reason: 'rate_limited', agent_id: fromAgentId });
            return rateLimitResult;
        }

        // Record the send timestamp for rate limiting
        this.recordSend(fromAgentId);

        return { allowed: true };
    }

    /**
     * Record a successful call to the target agent.
     * Should be called after a message is successfully delivered/processed.
     */
    recordSuccess(toAgentId: string): void {
        const breaker = this.breakers.get(toAgentId);
        if (!breaker) return;

        const prevState = breaker.getState();
        breaker.recordSuccess();

        const newState = breaker.getState();
        if (newState !== prevState) {
            this.logTransition(toAgentId, prevState, newState);
            this.previousStates.set(toAgentId, newState);
        }
    }

    /**
     * Record a failed call to the target agent.
     * Should be called when a message delivery or processing fails.
     */
    recordFailure(toAgentId: string): void {
        const breaker = this.getOrCreateBreaker(toAgentId);
        const prevState = breaker.getState();
        breaker.recordFailure();

        const newState = breaker.getState();
        if (newState !== prevState) {
            this.logTransition(toAgentId, prevState, newState);
            this.previousStates.set(toAgentId, newState);
        }
    }

    /** Get the circuit breaker state for a target agent. */
    getCircuitState(toAgentId: string): CircuitState {
        const breaker = this.breakers.get(toAgentId);
        if (!breaker) return 'CLOSED';
        return breaker.getState();
    }

    /** Reset the circuit breaker for a specific target agent. */
    resetCircuit(toAgentId: string): void {
        const breaker = this.breakers.get(toAgentId);
        if (breaker) {
            breaker.reset();
            this.previousStates.set(toAgentId, 'CLOSED');
            log.info('Circuit breaker manually reset', { toAgentId });
        }
    }

    /** Reset all circuit breakers and rate limit windows. */
    resetAll(): void {
        this.breakers.clear();
        this.senderWindows.clear();
        this.previousStates.clear();
    }

    /** Stop the periodic sweep timer. */
    stop(): void {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
    }

    // ── Internal ─────────────────────────────────────────────────────────

    private getOrCreateBreaker(toAgentId: string): CircuitBreaker {
        let breaker = this.breakers.get(toAgentId);
        if (!breaker) {
            breaker = new CircuitBreaker({
                failureThreshold: this.config.failureThreshold,
                resetTimeoutMs: this.config.resetTimeoutMs,
                successThreshold: this.config.successThreshold,
            });
            this.breakers.set(toAgentId, breaker);
            this.previousStates.set(toAgentId, 'CLOSED');
        }
        return breaker;
    }

    private checkRateLimit(fromAgentId: string): GuardResult {
        const now = Date.now();
        const windowStart = now - this.config.rateLimitWindowMs;

        let timestamps = this.senderWindows.get(fromAgentId);
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

        if (timestamps.length >= this.config.rateLimitPerWindow) {
            const oldestInWindow = timestamps[0];
            const retryAfterMs = (oldestInWindow + this.config.rateLimitWindowMs) - now;
            return {
                allowed: false,
                reason: 'RATE_LIMITED',
                retryAfterMs: Math.max(retryAfterMs, 1),
            };
        }

        return { allowed: true };
    }

    private recordSend(fromAgentId: string): void {
        let timestamps = this.senderWindows.get(fromAgentId);
        if (!timestamps) {
            timestamps = [];
            this.senderWindows.set(fromAgentId, timestamps);
        }
        timestamps.push(Date.now());
    }

    private logTransition(agentId: string, from: CircuitState, to: CircuitState): void {
        const level = to === 'OPEN' ? 'warn' : 'info';
        log[level](`Circuit breaker transition: ${from} → ${to}`, { agentId });
        circuitBreakerTransitions.inc({ from_state: from, to_state: to, agent_id: agentId });
    }

    private sweep(): void {
        const now = Date.now();
        const windowStart = now - this.config.rateLimitWindowMs;
        let swept = 0;

        for (const [key, timestamps] of this.senderWindows) {
            const hasRecent = timestamps.some((t) => t > windowStart);
            if (!hasRecent) {
                this.senderWindows.delete(key);
                swept++;
            }
        }

        if (swept > 0) {
            log.debug('Swept stale agent rate-limit entries', { swept, remaining: this.senderWindows.size });
        }
    }
}

export { CircuitOpenError };
