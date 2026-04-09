/**
 * Resilience utilities: exponential-backoff retry and circuit breaker.
 *
 * Usable by agent-messenger, process managers, or any code that calls
 * external services and needs fault tolerance.
 */

import { AppError } from './errors';

// ── CircuitOpenError ────────────────────────────────────────────────────

/** Thrown when a call is rejected because the circuit breaker is in the OPEN state. */
export class CircuitOpenError extends AppError {
  /**
   * @param message - Optional custom message (defaults to a standard circuit-open message).
   */
  constructor(message = 'Circuit breaker is OPEN — call rejected') {
    super(message, { code: 'CIRCUIT_OPEN', statusCode: 503 });
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
 *
 * @param fn - The async function to attempt.
 * @param options - Retry behavior configuration (see {@link RetryOptions}).
 * @returns The result of `fn` on the first successful attempt.
 * @throws The last error if all attempts are exhausted, or immediately if `retryIf` returns false.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 30_000, multiplier = 2, jitter = true, retryIf } = options;

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

/**
 * Circuit breaker pattern implementation.
 *
 * Tracks failures and opens the circuit after a threshold is reached,
 * rejecting subsequent calls until a reset timeout elapses. After the
 * timeout, allows a probe call (HALF_OPEN) and closes on success.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;

  /**
   * @param options - Circuit breaker thresholds and timing (see {@link CircuitBreakerOptions}).
   */
  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 60_000;
    this.successThreshold = options.successThreshold ?? 1;
  }

  /**
   * Get the current circuit state, lazily transitioning OPEN → HALF_OPEN
   * when the reset timeout has elapsed.
   *
   * @returns The current {@link CircuitState}.
   */
  getState(): CircuitState {
    // Lazily transition OPEN → HALF_OPEN when the timeout has elapsed
    if (this.state === 'OPEN' && Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
      this.state = 'HALF_OPEN';
      this.successCount = 0;
    }
    return this.state;
  }

  /** Reset the circuit to CLOSED with all counters zeroed. */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Execute `fn` through the circuit breaker.
   *
   * @param fn - The async function to execute.
   * @returns The result of `fn`.
   * @throws {CircuitOpenError} If the circuit is OPEN.
   * @throws Re-throws any error from `fn` after recording the failure.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      throw new CircuitOpenError();
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  /** Record a successful operation (used by execute() or externally). */
  recordSuccess(): void {
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

  /** Record a failed operation (used by execute() or externally). */
  recordFailure(): void {
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
