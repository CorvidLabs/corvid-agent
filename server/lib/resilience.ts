/**
 * Resilience utilities: exponential-backoff retry and circuit breaker.
 *
 * Usable by agent-messenger, process managers, or any code that calls
 * external services and needs fault tolerance.
 */

// ── CircuitOpenError ────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
    constructor(message = 'Circuit breaker is OPEN — call rejected') {
        super(message);
        this.name = 'CircuitOpenError';
    }
}

// ── withRetry ───────────────────────────────────────────────────────────

export interface RetryOptions {
    /** Maximum number of attempts (including the first). Default: 3 */
    maxAttempts?: number;
    /** Base delay in ms before first retry. Default: 1000 */
    baseDelayMs?: number;
    /** Maximum delay cap in ms. Default: 30000 */
    maxDelayMs?: number;
    /** Multiplier applied each attempt. Default: 2 */
    multiplier?: number;
    /** Add random jitter to the delay. Default: true */
    jitter?: boolean;
    /** Predicate — return true if the error is retryable. Default: all errors are retryable */
    retryIf?: (error: unknown) => boolean;
}

/**
 * Retry `fn` with exponential backoff.
 * Formula: `min(baseDelayMs * multiplier^attempt, maxDelayMs) + random_jitter`
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {},
): Promise<T> {
    const {
        maxAttempts = 3,
        baseDelayMs = 1000,
        maxDelayMs = 30_000,
        multiplier = 2,
        jitter = true,
        retryIf,
    } = options;

    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;

            // If there's a retryIf predicate and it says no, throw immediately
            if (retryIf && !retryIf(err)) throw err;

            // Don't delay after the last attempt
            if (attempt + 1 >= maxAttempts) break;

            const exponentialDelay = Math.min(baseDelayMs * multiplier ** attempt, maxDelayMs);
            const jitterMs = jitter ? Math.random() * exponentialDelay * 0.1 : 0;
            const delay = exponentialDelay + jitterMs;

            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

// ── CircuitBreaker ──────────────────────────────────────────────────────

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
    /** Number of failures before opening the circuit. Default: 3 */
    failureThreshold?: number;
    /** How long to wait (ms) before transitioning OPEN → HALF_OPEN. Default: 60000 */
    resetTimeoutMs?: number;
    /** Successes needed in HALF_OPEN to close. Default: 1 */
    successThreshold?: number;
}

export class CircuitBreaker {
    private state: CircuitState = 'CLOSED';
    private failureCount = 0;
    private successCount = 0;
    private lastFailureTime = 0;

    private readonly failureThreshold: number;
    private readonly resetTimeoutMs: number;
    private readonly successThreshold: number;

    constructor(options: CircuitBreakerOptions = {}) {
        this.failureThreshold = options.failureThreshold ?? 3;
        this.resetTimeoutMs = options.resetTimeoutMs ?? 60_000;
        this.successThreshold = options.successThreshold ?? 1;
    }

    getState(): CircuitState {
        // Lazily transition OPEN → HALF_OPEN when the timeout has elapsed
        if (this.state === 'OPEN' && Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
            this.state = 'HALF_OPEN';
            this.successCount = 0;
        }
        return this.state;
    }

    reset(): void {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = 0;
    }

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        const currentState = this.getState();

        if (currentState === 'OPEN') {
            throw new CircuitOpenError();
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (err) {
            this.onFailure();
            throw err;
        }
    }

    private onSuccess(): void {
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= this.successThreshold) {
                this.state = 'CLOSED';
                this.failureCount = 0;
                this.successCount = 0;
            }
        } else {
            // CLOSED — reset failure count on success
            this.failureCount = 0;
        }
    }

    private onFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.state === 'HALF_OPEN') {
            // Any failure in HALF_OPEN re-opens
            this.state = 'OPEN';
            this.successCount = 0;
        } else if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }
}
