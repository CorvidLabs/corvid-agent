/**
 * Custom error types for CorvidAgent.
 *
 * All application errors extend `AppError`, which carries a machine-readable
 * `code`, an HTTP `statusCode`, and optional structured `context`.
 * The global error-handling middleware uses these fields to produce consistent
 * JSON responses without leaking internal details.
 */

// ── Base class ──────────────────────────────────────────────────────────────────

/**
 * Base error class for all application-level errors.
 *
 * Carries a machine-readable `code`, an HTTP `statusCode`, and optional
 * structured `context` for the global error-handling middleware.
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly context?: Record<string, unknown>;

  /**
   * @param message - Human-readable error description (logged server-side, not sent to clients).
   * @param opts - Error metadata.
   * @param opts.code - Machine-readable error code (e.g. 'VALIDATION_ERROR').
   * @param opts.statusCode - HTTP status code to return.
   * @param opts.context - Optional structured data for logging/debugging.
   * @param opts.cause - Optional underlying error that caused this one.
   */
  constructor(
    message: string,
    opts: { code: string; statusCode: number; context?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = new.target.name;
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    if (opts.context) this.context = opts.context;
  }
}

/** Request validation error (400 Bad Request). */
export class ValidationError extends AppError {
  readonly detail: string;
  /**
   * @param message - Description of the validation failure.
   * @param context - Optional structured context for logging.
   */
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { code: 'VALIDATION_ERROR', statusCode: 400, context });
    this.detail = message;
  }
}

/** Authentication failure (401 Unauthorized). */
export class AuthenticationError extends AppError {
  /**
   * @param message - Description of the authentication failure.
   * @param context - Optional structured context for logging.
   */
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { code: 'AUTHENTICATION_ERROR', statusCode: 401, context });
  }
}

/** Insufficient permissions (403 Forbidden). */
export class AuthorizationError extends AppError {
  /**
   * @param message - Description of the authorization failure.
   * @param context - Optional structured context for logging.
   */
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { code: 'AUTHORIZATION_ERROR', statusCode: 403, context });
  }
}

/** Resource not found (404 Not Found). */
export class NotFoundError extends AppError {
  /**
   * @param resource - The type of resource (e.g. 'Agent', 'Session').
   * @param id - Optional resource identifier for the error message.
   * @param context - Optional structured context for logging.
   */
  constructor(resource: string, id?: string, context?: Record<string, unknown>) {
    const msg = id ? `${resource} ${id} not found` : `${resource} not found`;
    super(msg, { code: 'NOT_FOUND', statusCode: 404, context });
  }
}

/** Resource conflict (409 Conflict). */
export class ConflictError extends AppError {
  /**
   * @param message - Description of the conflict.
   * @param context - Optional structured context for logging.
   */
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { code: 'CONFLICT', statusCode: 409, context });
  }
}

/** Rate limit exceeded (429 Too Many Requests). */
export class RateLimitError extends AppError {
  readonly retryAfter?: number;
  /**
   * @param message - Description of the rate limit violation.
   * @param opts - Optional retry and context metadata.
   * @param opts.retryAfter - Seconds until the client should retry.
   * @param opts.context - Optional structured context for logging.
   */
  constructor(
    message: string = 'Too many requests',
    opts?: { retryAfter?: number; context?: Record<string, unknown> },
  ) {
    super(message, { code: 'RATE_LIMITED', statusCode: 429, context: opts?.context });
    this.retryAfter = opts?.retryAfter;
  }
}

/** Feature not yet implemented (501 Not Implemented). */
export class NotImplementedError extends AppError {
  /**
   * @param feature - Name of the unimplemented feature.
   * @param context - Optional additional context string.
   */
  constructor(feature: string, context?: string) {
    const message = context ? `Not implemented: ${feature} — ${context}` : `Not implemented: ${feature}`;
    super(message, { code: 'NOT_IMPLEMENTED', statusCode: 501 });
  }
}

/** Failure in an external dependency (502 Bad Gateway). */
export class ExternalServiceError extends AppError {
  /**
   * @param service - Name of the external service that failed.
   * @param message - Description of the failure.
   * @param context - Optional structured context for logging.
   */
  constructor(service: string, message: string, context?: Record<string, unknown>) {
    super(`${service}: ${message}`, {
      code: 'EXTERNAL_SERVICE_ERROR',
      statusCode: 502,
      context: { service, ...context },
    });
  }
}

/**
 * Type guard to check if an unknown error is an {@link AppError}.
 *
 * @param err - The value to check.
 * @returns `true` if `err` is an instance of `AppError`.
 */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
