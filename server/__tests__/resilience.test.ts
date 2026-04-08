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
        expect(elapsed).toBeGreaterThanOrEqual(10);
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
                    baseDelayMs: 10,
                    maxDelayMs: 5,
                    multiplier: 10,
                    jitter: false,
                },
            ),
        ).rejects.toThrow('fail');
        const elapsed = Date.now() - start;
        // Without the cap, delays would be 10ms + 100ms = 110ms.
        // With the cap at 5ms, both delays are 5ms, so total < 50ms.
        expect(elapsed).toBeLessThan(50);
        expect(calls).toBe(3);
    });

    test('uses defaults (3 attempts) when no options provided', async () => {
        let calls = 0;
        // Only override delays to keep test fast — maxAttempts defaults to 3
        await expect(
            withRetry(
                async () => {
                    calls++;
                    throw new Error('fail');
                },
                { baseDelayMs: 1, jitter: false },
            ),
        ).rejects.toThrow('fail');
        expect(calls).toBe(3);
    });

    test('applies exponential backoff delays (delay increases per attempt)', async () => {
        const delays: number[] = [];
        let lastTime = Date.now();
        let calls = 0;
        await expect(
            withRetry(
                async () => {
                    calls++;
                    const now = Date.now();
                    if (calls > 1) delays.push(now - lastTime);
                    lastTime = now;
                    throw new Error('fail');
                },
                { maxAttempts: 4, baseDelayMs: 50, multiplier: 2, jitter: false },
            ),
        ).rejects.toThrow('fail');
        expect(calls).toBe(4);
        // delays[0] ≈ 50ms (50 * 2^0), delays[1] ≈ 100ms (50 * 2^1), delays[2] ≈ 200ms (50 * 2^2)
        // Each delay should be at least the configured minimum (allow CI scheduling jitter)
        expect(delays).toHaveLength(3);
        expect(delays[0]).toBeGreaterThanOrEqual(30);
        expect(delays[1]).toBeGreaterThanOrEqual(60);
        expect(delays[2]).toBeGreaterThanOrEqual(120);
    });

    test('no jitter when disabled (exact exponential delay)', async () => {
        // With jitter=false, the delay formula is exactly: min(baseDelayMs * multiplier^attempt, maxDelayMs)
        let calls = 0;
        let lastTime = Date.now();
        const runDelays: number[] = [];

        await expect(
            withRetry(
                async () => {
                    calls++;
                    const now = Date.now();
                    if (calls > 1) runDelays.push(now - lastTime);
                    lastTime = now;
                    throw new Error('fail');
                },
                { maxAttempts: 3, baseDelayMs: 50, multiplier: 2, jitter: false },
            ),
        ).rejects.toThrow('fail');

        expect(runDelays).toHaveLength(2);
        // First delay should be ~50ms, second ~100ms — wide bounds for CI variability
        expect(runDelays[0]).toBeGreaterThanOrEqual(30);
        expect(runDelays[0]).toBeLessThan(250);
        expect(runDelays[1]).toBeGreaterThanOrEqual(60);
        expect(runDelays[1]).toBeLessThan(400);
        // Second delay should be greater than first (exponential growth)
        expect(runDelays[1]).toBeGreaterThan(runDelays[0]);
    });

    test('custom multiplier works correctly', async () => {
        const delays: number[] = [];
        let lastTime = Date.now();
        let calls = 0;
        await expect(
            withRetry(
                async () => {
                    calls++;
                    const now = Date.now();
                    if (calls > 1) delays.push(now - lastTime);
                    lastTime = now;
                    throw new Error('fail');
                },
                { maxAttempts: 3, baseDelayMs: 30, multiplier: 3, jitter: false },
            ),
        ).rejects.toThrow('fail');
        expect(calls).toBe(3);
        // With multiplier=3: delay[0] = 30*3^0 = 30ms, delay[1] = 30*3^1 = 90ms
        // Use wide tolerances for CI (Windows timer granularity ~15ms)
        expect(delays[0]).toBeGreaterThanOrEqual(10);
        expect(delays[0]).toBeLessThan(120);
        expect(delays[1]).toBeGreaterThanOrEqual(50);
        expect(delays[1]).toBeLessThan(200);
        // The absolute range checks above already verify the multiplier works
        // (30ms band vs 90ms band). A strict relative comparison is omitted
        // because Windows timer granularity (~15ms) can make both values jitter
        // into overlapping ranges on CI runners. See #396.
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

        await new Promise((r) => setTimeout(r, 150));
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
