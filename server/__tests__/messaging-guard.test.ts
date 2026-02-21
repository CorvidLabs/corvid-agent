import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MessagingGuard } from '../algochat/messaging-guard';

describe('MessagingGuard', () => {
    let guard: MessagingGuard;

    beforeEach(() => {
        guard = new MessagingGuard({
            failureThreshold: 3,
            resetTimeoutMs: 50,     // Short timeout for tests
            successThreshold: 2,
            rateLimitPerWindow: 5,
            rateLimitWindowMs: 500, // Short window for tests
        });
    });

    afterEach(() => {
        guard.stop();
    });

    // ── Circuit Breaker ──────────────────────────────────────────────────

    describe('circuit breaker', () => {
        it('allows calls when circuit is CLOSED', () => {
            const result = guard.check('sender-1', 'target-1');
            expect(result.allowed).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('stays CLOSED after successes', () => {
            guard.check('sender-1', 'target-1');
            guard.recordSuccess('target-1');
            guard.recordSuccess('target-1');

            expect(guard.getCircuitState('target-1')).toBe('CLOSED');
            const result = guard.check('sender-1', 'target-1');
            expect(result.allowed).toBe(true);
        });

        it('opens after failureThreshold failures', () => {
            // First call allowed (creates breaker)
            guard.check('sender-1', 'target-1');

            // Record 3 failures (our threshold)
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');

            expect(guard.getCircuitState('target-1')).toBe('OPEN');

            // Next call should be rejected
            const result = guard.check('sender-1', 'target-1');
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('CIRCUIT_OPEN');
            expect(result.retryAfterMs).toBe(50);
        });

        it('transitions from OPEN to HALF_OPEN after resetTimeout', async () => {
            guard.check('sender-1', 'target-1');
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');

            expect(guard.getCircuitState('target-1')).toBe('OPEN');

            // Wait for reset timeout
            await new Promise((r) => setTimeout(r, 60));

            expect(guard.getCircuitState('target-1')).toBe('HALF_OPEN');

            // Should allow a probe call
            const result = guard.check('sender-1', 'target-1');
            expect(result.allowed).toBe(true);
        });

        it('closes circuit after successThreshold successes in HALF_OPEN', async () => {
            guard.check('sender-1', 'target-1');
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');

            // Wait for HALF_OPEN
            await new Promise((r) => setTimeout(r, 60));
            expect(guard.getCircuitState('target-1')).toBe('HALF_OPEN');

            // 2 successes needed (our threshold)
            guard.recordSuccess('target-1');
            guard.recordSuccess('target-1');

            expect(guard.getCircuitState('target-1')).toBe('CLOSED');
        });

        it('re-opens on failure in HALF_OPEN state', async () => {
            guard.check('sender-1', 'target-1');
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');

            // Wait for HALF_OPEN
            await new Promise((r) => setTimeout(r, 60));
            expect(guard.getCircuitState('target-1')).toBe('HALF_OPEN');

            // Failure re-opens
            guard.recordFailure('target-1');
            expect(guard.getCircuitState('target-1')).toBe('OPEN');

            // Should be rejected again
            const result = guard.check('sender-1', 'target-1');
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('CIRCUIT_OPEN');
        });

        it('tracks circuit breakers per target agent independently', () => {
            guard.check('sender-1', 'target-1');
            guard.check('sender-1', 'target-2');

            // Only fail target-1
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');

            expect(guard.getCircuitState('target-1')).toBe('OPEN');
            expect(guard.getCircuitState('target-2')).toBe('CLOSED');

            // target-1 blocked, target-2 allowed
            expect(guard.check('sender-1', 'target-1').allowed).toBe(false);
            expect(guard.check('sender-1', 'target-2').allowed).toBe(true);
        });

        it('resets circuit for a specific agent', () => {
            guard.check('sender-1', 'target-1');
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');

            expect(guard.getCircuitState('target-1')).toBe('OPEN');
            guard.resetCircuit('target-1');
            expect(guard.getCircuitState('target-1')).toBe('CLOSED');

            const result = guard.check('sender-1', 'target-1');
            expect(result.allowed).toBe(true);
        });

        it('getCircuitState returns CLOSED for unknown agents', () => {
            expect(guard.getCircuitState('unknown-agent')).toBe('CLOSED');
        });
    });

    // ── Rate Limiting ────────────────────────────────────────────────────

    describe('rate limiting', () => {
        it('allows messages under the limit', () => {
            for (let i = 0; i < 5; i++) {
                const result = guard.check('sender-1', `target-${i}`);
                expect(result.allowed).toBe(true);
            }
        });

        it('blocks messages over the per-agent limit', () => {
            // 5 messages allowed
            for (let i = 0; i < 5; i++) {
                expect(guard.check('sender-1', `target-${i}`).allowed).toBe(true);
            }

            // 6th message blocked
            const result = guard.check('sender-1', 'target-5');
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('RATE_LIMITED');
            expect(result.retryAfterMs).toBeGreaterThan(0);
        });

        it('tracks different senders independently', () => {
            // Fill sender-1's bucket
            for (let i = 0; i < 5; i++) {
                expect(guard.check('sender-1', `target-${i}`).allowed).toBe(true);
            }
            expect(guard.check('sender-1', 'target-extra').allowed).toBe(false);

            // sender-2 should still have capacity
            expect(guard.check('sender-2', 'target-1').allowed).toBe(true);
        });

        it('allows messages after window expires', async () => {
            // Fill the window
            for (let i = 0; i < 5; i++) {
                guard.check('sender-1', `target-${i}`);
            }
            expect(guard.check('sender-1', 'target-extra').allowed).toBe(false);

            // Wait for window to expire
            await new Promise((r) => setTimeout(r, 550));

            // Should be allowed again
            const result = guard.check('sender-1', 'target-1');
            expect(result.allowed).toBe(true);
        });

        it('returns retryAfterMs based on oldest request in window', () => {
            for (let i = 0; i < 5; i++) {
                guard.check('sender-1', `target-${i}`);
            }

            const result = guard.check('sender-1', 'target-extra');
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('RATE_LIMITED');
            // retryAfterMs should be close to the window size
            expect(result.retryAfterMs!).toBeGreaterThan(0);
            expect(result.retryAfterMs!).toBeLessThanOrEqual(500);
        });
    });

    // ── Combined behavior ────────────────────────────────────────────────

    describe('combined checks', () => {
        it('circuit breaker takes priority over rate limit', () => {
            guard.check('sender-1', 'target-1');
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');

            // Circuit is OPEN; even though rate limit is fine, should get CIRCUIT_OPEN
            const result = guard.check('sender-1', 'target-1');
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('CIRCUIT_OPEN');
        });

        it('rate limit checked after circuit breaker passes', () => {
            // Fill sender-1's rate limit
            for (let i = 0; i < 5; i++) {
                guard.check('sender-1', `target-${i}`);
            }

            // Circuit for target-new is CLOSED, but sender-1 is rate limited
            const result = guard.check('sender-1', 'target-new');
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('RATE_LIMITED');
        });
    });

    // ── Lifecycle ────────────────────────────────────────────────────────

    describe('lifecycle', () => {
        it('resetAll clears all state', () => {
            // Create some state
            guard.check('sender-1', 'target-1');
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');
            guard.recordFailure('target-1');

            for (let i = 0; i < 5; i++) {
                guard.check('sender-2', `target-${i}`);
            }

            guard.resetAll();

            // Everything should be fresh
            expect(guard.getCircuitState('target-1')).toBe('CLOSED');
            expect(guard.check('sender-1', 'target-1').allowed).toBe(true);
            expect(guard.check('sender-2', 'target-1').allowed).toBe(true);
        });

        it('stop cleans up sweep timer', () => {
            guard.stop();
            // No assertion needed — just confirm no error
        });
    });
});

describe('MessagingGuard config', () => {
    it('uses defaults when no config provided', () => {
        const guard = new MessagingGuard();
        // Just verify it creates without error
        const result = guard.check('a', 'b');
        expect(result.allowed).toBe(true);
        guard.stop();
    });

    it('accepts partial config overrides', () => {
        const guard = new MessagingGuard({ failureThreshold: 1 });
        guard.check('sender', 'target');
        guard.recordFailure('target');
        expect(guard.getCircuitState('target')).toBe('OPEN');
        guard.stop();
    });
});
