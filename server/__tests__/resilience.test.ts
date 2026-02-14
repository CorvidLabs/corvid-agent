import { describe, expect, test } from 'bun:test';
import { withRetry, CircuitBreaker, CircuitOpenError } from '../lib/resilience';

// ── withRetry ───────────────────────────────────────────────────────────

describe('withRetry', () => {
    test('succeeds on first try', async () => {
        const result = await withRetry(() => Promise.resolve(42));
        expect(result).toBe(42);
    });

    test('retries on transient error then succeeds', async () => {
        let calls = 0;
        const result = await withRetry(
            async () => {
                calls++;
                if (calls < 3) throw new Error('transient');
                return 'ok';
            },
            { maxAttempts: 3, baseDelayMs: 1, jitter: false },
        );
        expect(result).toBe('ok');
        expect(calls).toBe(3);
    });

    test('throws after maxAttempts exhausted', async () => {
        let calls = 0;
        await expect(
            withRetry(
                async () => {
                    calls++;
                    throw new Error('always fails');
                },
                { maxAttempts: 3, baseDelayMs: 1, jitter: false },
            ),
        ).rejects.toThrow('always fails');
        expect(calls).toBe(3);
    });

    test('skips retry for non-retryable errors', async () => {
        let calls = 0;
        await expect(
            withRetry(
                async () => {
                    calls++;
                    throw new Error('fatal');
                },
                {
                    maxAttempts: 5,
                    baseDelayMs: 1,
                    retryIf: () => false,
                },
            ),
        ).rejects.toThrow('fatal');
        expect(calls).toBe(1);
    });

    test('applies jitter (delay is not zero)', async () => {
        let calls = 0;
        const start = Date.now();
        await expect(
            withRetry(
                async () => {
                    calls++;
                    throw new Error('fail');
                },
                { maxAttempts: 2, baseDelayMs: 50, jitter: true },
            ),
        ).rejects.toThrow('fail');
        const elapsed = Date.now() - start;
        // With baseDelayMs=50 + jitter, should take at least ~40ms
        expect(elapsed).toBeGreaterThanOrEqual(30);
        expect(calls).toBe(2);
    });
});

// ── CircuitBreaker ──────────────────────────────────────────────────────

describe('CircuitBreaker', () => {
    test('stays CLOSED on success', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 3 });
        await cb.execute(() => Promise.resolve('ok'));
        expect(cb.getState()).toBe('CLOSED');
    });

    test('opens after threshold failures', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 60_000 });
        for (let i = 0; i < 3; i++) {
            try {
                await cb.execute(() => Promise.reject(new Error('fail')));
            } catch { /* expected */ }
        }
        expect(cb.getState()).toBe('OPEN');
    });

    test('rejects calls when OPEN', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60_000 });
        try {
            await cb.execute(() => Promise.reject(new Error('fail')));
        } catch { /* trip the breaker */ }

        await expect(
            cb.execute(() => Promise.resolve('should not run')),
        ).rejects.toBeInstanceOf(CircuitOpenError);
    });

    test('transitions to HALF_OPEN after timeout', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });
        try {
            await cb.execute(() => Promise.reject(new Error('fail')));
        } catch { /* trip */ }
        expect(cb.getState()).toBe('OPEN');

        // Wait for reset timeout
        await new Promise((r) => setTimeout(r, 60));
        expect(cb.getState()).toBe('HALF_OPEN');
    });

    test('closes on HALF_OPEN success', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10, successThreshold: 1 });
        try {
            await cb.execute(() => Promise.reject(new Error('fail')));
        } catch { /* trip */ }

        await new Promise((r) => setTimeout(r, 20));
        expect(cb.getState()).toBe('HALF_OPEN');

        await cb.execute(() => Promise.resolve('ok'));
        expect(cb.getState()).toBe('CLOSED');
    });

    test('re-opens on HALF_OPEN failure', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10 });
        try {
            await cb.execute(() => Promise.reject(new Error('fail')));
        } catch { /* trip */ }

        await new Promise((r) => setTimeout(r, 20));
        expect(cb.getState()).toBe('HALF_OPEN');

        try {
            await cb.execute(() => Promise.reject(new Error('fail again')));
        } catch { /* expected */ }
        expect(cb.getState()).toBe('OPEN');
    });

    test('reset() restores CLOSED state', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 1 });
        try {
            await cb.execute(() => Promise.reject(new Error('fail')));
        } catch { /* trip */ }
        expect(cb.getState()).toBe('OPEN');

        cb.reset();
        expect(cb.getState()).toBe('CLOSED');
    });
});
