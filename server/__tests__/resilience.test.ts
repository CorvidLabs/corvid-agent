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
        expect(elapsed).toBeGreaterThanOrEqual(30);
        expect(calls).toBe(2);
    });

    test('caps delay at maxDelayMs', async () => {
        let calls = 0;
        const start = Date.now();
        await expect(
            withRetry(
                async () => {
                    calls++;
                    throw new Error('fail');
                },
                {
                    maxAttempts: 3,
                    baseDelayMs: 100,
                    maxDelayMs: 50,
                    multiplier: 10,
                    jitter: false,
                },
            ),
        ).rejects.toThrow('fail');
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(200);
        expect(calls).toBe(3);
    });

    test('uses defaults (3 attempts) when no options provided', async () => {
        let calls = 0;
        await expect(
            withRetry(async () => {
                calls++;
                throw new Error('fail');
            }),
        ).rejects.toThrow('fail');
        expect(calls).toBe(3);
    });

    test('retryIf receives the thrown error', async () => {
        const errors: unknown[] = [];
        await expect(
            withRetry(
                async () => { throw new Error('check me'); },
                {
                    maxAttempts: 2,
                    baseDelayMs: 1,
                    retryIf: (err) => {
                        errors.push(err);
                        return true;
                    },
                },
            ),
        ).rejects.toThrow('check me');
        // retryIf is called on every failed attempt (2 attempts = 2 calls)
        expect(errors).toHaveLength(2);
        expect((errors[0] as Error).message).toBe('check me');
        expect((errors[1] as Error).message).toBe('check me');
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

    test('success in CLOSED resets failure count', async () => {
        const cb = new CircuitBreaker({ failureThreshold: 3 });
        for (let i = 0; i < 2; i++) {
            try { await cb.execute(() => Promise.reject(new Error('fail'))); } catch { /* expected */ }
        }
        expect(cb.getState()).toBe('CLOSED');

        await cb.execute(() => Promise.resolve('ok'));

        for (let i = 0; i < 2; i++) {
            try { await cb.execute(() => Promise.reject(new Error('fail'))); } catch { /* expected */ }
        }
        expect(cb.getState()).toBe('CLOSED');
    });

    test('uses default options when none provided', () => {
        const cb = new CircuitBreaker();
        expect(cb.getState()).toBe('CLOSED');
    });

    test('execute returns the result on success', async () => {
        const cb = new CircuitBreaker();
        const result = await cb.execute(() => Promise.resolve('hello'));
        expect(result).toBe('hello');
    });

    test('execute re-throws the original error', async () => {
        const cb = new CircuitBreaker();
        const original = new Error('specific error');
        await expect(cb.execute(() => Promise.reject(original))).rejects.toBe(original);
    });
});

// ── CircuitOpenError ─────────────────────────────────────────────────────

describe('CircuitOpenError', () => {
    test('has code CIRCUIT_OPEN and status 503', () => {
        const err = new CircuitOpenError();
        expect(err.code).toBe('CIRCUIT_OPEN');
        expect(err.statusCode).toBe(503);
    });

    test('has default message', () => {
        const err = new CircuitOpenError();
        expect(err.message).toContain('OPEN');
    });

    test('accepts custom message', () => {
        const err = new CircuitOpenError('custom msg');
        expect(err.message).toBe('custom msg');
    });
});
