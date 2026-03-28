/**
 * Messaging guard: circuit breaker + per-agent rate limiting + blocklist + behavioral drift
 * detection for agent-to-agent calls.
 *
 * Protects against cascading failures by tracking per-agent outbound call health
 * (circuit breaker), prevents message flooding via per-agent sliding-window
 * rate limiting, blocks blacklisted agents, and detects behavioral anomalies
 * (target spreading, burst messaging).
 *
 * Configuration via environment variables:
 * - AGENT_CB_FAILURE_THRESHOLD: failures before opening circuit (default: 5)
 * - AGENT_CB_RESET_TIMEOUT_MS: cooldown before half-open probe (default: 30000)
 * - AGENT_CB_SUCCESS_THRESHOLD: successes in half-open to close (default: 2)
 * - AGENT_RATE_LIMIT_PER_MIN: max messages per agent per minute (default: 10)
 */

import type { Database } from 'bun:sqlite';
import { CircuitBreaker, CircuitOpenError, type CircuitState } from '../lib/resilience';
import { createLogger } from '../lib/logger';
import { circuitBreakerTransitions, agentRateLimitRejections } from '../observability/metrics';
import { isAgentBlocked } from '../db/agent-blocklist';

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
    /** Enable behavioral drift detection. Default: true */
    driftDetectionEnabled: boolean;
    /** Minimum messages before drift detection activates. Default: 5 */
    driftMinMessages: number;
    /** Unique targets in window to trigger target-spreading alert. Default: 3 */
    driftTargetSpikeThreshold: number;
    /** Drift detection window in ms. Default: 300000 (5 minutes) */
    driftWindowMs: number;
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
        driftDetectionEnabled: true,
        driftMinMessages: 5,
        driftTargetSpikeThreshold: parseInt(process.env.AGENT_DRIFT_TARGET_THRESHOLD ?? '8', 10),
        driftWindowMs: 5 * 60_000,
    };
}

// ── Guard result ─────────────────────────────────────────────────────────

export type GuardRejectionReason = 'CIRCUIT_OPEN' | 'RATE_LIMITED' | 'AGENT_BLOCKED' | 'BEHAVIORAL_DRIFT';

export interface GuardResult {
    allowed: boolean;
    reason?: GuardRejectionReason;
    retryAfterMs?: number;
}

// ── Behavioral Drift Detection ───────────────────────────────────────────

/** Tracks per-agent message patterns for drift detection. */
interface AgentBehaviorProfile {
    /** Rolling window of inter-message intervals (ms). */
    intervals: number[];
    /** Last message timestamp. */
    lastMessageAt: number;
    /** Count of unique targets in current window. */
    targetSet: Set<string>;
    /** Total messages in current window. */
    messageCount: number;
    /** Window start time. */
    windowStart: number;
}

/** Default: 5 messages in 10 seconds = burst */
const DRIFT_BURST_COUNT = 5;

// ── MessagingGuard ───────────────────────────────────────────────────────

/**
 * Combined circuit breaker + per-agent rate limiter + blocklist + drift detector
 * for agent messaging.
 *
 * Circuit breakers are keyed by target agent ID — if calls to a specific agent
 * consistently fail, the circuit opens and further calls are rejected until
 * the cooldown period elapses and a half-open probe succeeds.
 *
 * Rate limiting is keyed by sender agent ID — no single agent can send more
 * than `rateLimitPerWindow` messages within the sliding window.
 *
 * Blocklist check rejects messages from blacklisted agents instantly.
 *
 * Behavioral drift detection flags agents that suddenly change messaging
 * patterns (target spreading, burst messaging).
 */
export class MessagingGuard {
    private readonly config: MessagingGuardConfig;
    private db: Database | null = null;

    /** Per-target-agent circuit breakers. */
    private readonly breakers = new Map<string, CircuitBreaker>();

    /** Per-sender-agent sliding window timestamps. */
    private readonly senderWindows = new Map<string, number[]>();

    /** Track previous state per breaker for transition logging. */
    private readonly previousStates = new Map<string, CircuitState>();

    /** Per-agent behavioral profiles for drift detection. */
    private readonly behaviorProfiles = new Map<string, AgentBehaviorProfile>();

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

    /** Set database reference for blocklist checks. */
    setDb(db: Database): void {
        this.db = db;
    }

    /**
     * Check whether a message from `fromAgentId` to `toAgentId` is allowed.
     *
     * Checks are performed in order:
     * 0. Blocklist check (is the sender blacklisted?)
     * 0b. Behavioral drift check (is the sender behaving anomalously?)
     * 1. Circuit breaker for the target agent (is the agent healthy?)
     * 2. Rate limit for the sender agent (is the sender flooding?)
     */
    check(fromAgentId: string, toAgentId: string, _contentLength?: number): GuardResult {
        // 0. Blocklist check — instant reject if sender is blacklisted
        if (this.db && isAgentBlocked(this.db, fromAgentId)) {
            log.warn('Blocked agent attempted to send message', { fromAgentId, toAgentId });
            agentRateLimitRejections.inc({ reason: 'agent_blocked', agent_id: fromAgentId });
            return { allowed: false, reason: 'AGENT_BLOCKED' };
        }

        // 0b. Behavioral drift check
        if (this.config.driftDetectionEnabled) {
            const driftResult = this.checkBehavioralDrift(fromAgentId, toAgentId);
            if (!driftResult.allowed) {
                return driftResult;
            }
        }

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
        this.behaviorProfiles.clear();
    }

    /** Stop the periodic sweep timer. */
    stop(): void {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
    }

    /** Get the behavioral profile for an agent (for monitoring/debugging). */
    getBehaviorProfile(agentId: string): {
        messageCount: number;
        uniqueTargets: number;
        windowStartedAt: number;
    } | null {
        const profile = this.behaviorProfiles.get(agentId);
        if (!profile) return null;
        return {
            messageCount: profile.messageCount,
            uniqueTargets: profile.targetSet.size,
            windowStartedAt: profile.windowStart,
        };
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

        const timestamps = this.senderWindows.get(fromAgentId);
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

    // ── Behavioral Drift Detection ─────────────────────────────────

    /**
     * Check for behavioral anomalies in an agent's messaging patterns.
     * Flags sudden target-spreading (contacting many new agents fast)
     * and burst messaging (rapid-fire sends).
     */
    private checkBehavioralDrift(fromAgentId: string, toAgentId: string): GuardResult {
        const now = Date.now();
        let profile = this.behaviorProfiles.get(fromAgentId);

        if (!profile) {
            profile = {
                intervals: [],
                lastMessageAt: now,
                targetSet: new Set([toAgentId]),
                messageCount: 1,
                windowStart: now,
            };
            this.behaviorProfiles.set(fromAgentId, profile);
            return { allowed: true };
        }

        // Slide window — reset if window expired
        if (now - profile.windowStart > this.config.driftWindowMs) {
            profile.intervals = [];
            profile.targetSet = new Set();
            profile.messageCount = 0;
            profile.windowStart = now;
        }

        // Record the interval since last message
        const interval = now - profile.lastMessageAt;
        profile.intervals.push(interval);
        profile.lastMessageAt = now;
        profile.targetSet.add(toAgentId);
        profile.messageCount++;

        // Not enough data to detect drift yet
        if (profile.messageCount < this.config.driftMinMessages) {
            return { allowed: true };
        }

        // Check 1: Target spreading — agent suddenly messaging many different agents
        if (profile.targetSet.size >= this.config.driftTargetSpikeThreshold) {
            log.warn('Behavioral drift: target spreading detected', {
                fromAgentId,
                uniqueTargets: profile.targetSet.size,
                messageCount: profile.messageCount,
                windowMs: now - profile.windowStart,
            });
            agentRateLimitRejections.inc({ reason: 'behavioral_drift', agent_id: fromAgentId });
            return { allowed: false, reason: 'BEHAVIORAL_DRIFT' };
        }

        // Check 2: Burst messaging — many messages in a very short window
        const recentIntervals = profile.intervals.slice(-DRIFT_BURST_COUNT);
        if (recentIntervals.length >= DRIFT_BURST_COUNT) {
            const avgInterval = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
            if (avgInterval < 2000) { // Less than 2 seconds average between messages
                log.warn('Behavioral drift: burst messaging detected', {
                    fromAgentId,
                    avgIntervalMs: Math.round(avgInterval),
                    burstCount: recentIntervals.length,
                });
                agentRateLimitRejections.inc({ reason: 'behavioral_drift', agent_id: fromAgentId });
                return { allowed: false, reason: 'BEHAVIORAL_DRIFT' };
            }
        }

        return { allowed: true };
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

        // Also sweep stale behavioral profiles
        for (const [key, profile] of this.behaviorProfiles) {
            if (now - profile.lastMessageAt > this.config.driftWindowMs * 2) {
                this.behaviorProfiles.delete(key);
                swept++;
            }
        }

        if (swept > 0) {
            log.debug('Swept stale agent rate-limit entries', { swept, remaining: this.senderWindows.size });
        }
    }
}

export { CircuitOpenError };
