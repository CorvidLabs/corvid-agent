/**
 * Custom error types for CorvidAgent.
 *
 * All application errors extend `AppError`, which carries a machine-readable
 * `code`, an HTTP `statusCode`, and optional structured `context`.
 * The global error-handling middleware uses these fields to produce consistent
 * JSON responses without leaking internal details.
 */

// ── Base class ──────────────────────────────────────────────────────────────────

export class AppError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly context?: Record<string, unknown>;

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

export class ValidationError extends AppError {
    readonly detail: string;
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, { code: 'VALIDATION_ERROR', statusCode: 400, context });
        this.detail = message;
    }
}

export class AuthenticationError extends AppError {
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, { code: 'AUTHENTICATION_ERROR', statusCode: 401, context });
    }
}

export class AuthorizationError extends AppError {
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, { code: 'AUTHORIZATION_ERROR', statusCode: 403, context });
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string, id?: string, context?: Record<string, unknown>) {
        const msg = id ? `${resource} ${id} not found` : `${resource} not found`;
        super(msg, { code: 'NOT_FOUND', statusCode: 404, context });
    }
}

export class ConflictError extends AppError {
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, { code: 'CONFLICT', statusCode: 409, context });
    }
}

export class RateLimitError extends AppError {
    readonly retryAfter?: number;
    constructor(message: string = 'Too many requests', opts?: { retryAfter?: number; context?: Record<string, unknown> }) {
        super(message, { code: 'RATE_LIMITED', statusCode: 429, context: opts?.context });
        this.retryAfter = opts?.retryAfter;
    }
}

export class NotImplementedError extends AppError {
    constructor(feature: string, context?: string) {
        const message = context
            ? `Not implemented: ${feature} — ${context}`
            : `Not implemented: ${feature}`;
        super(message, { code: 'NOT_IMPLEMENTED', statusCode: 501 });
    }
}

export class ExternalServiceError extends AppError {
    constructor(service: string, message: string, context?: Record<string, unknown>) {
        super(`${service}: ${message}`, {
            code: 'EXTERNAL_SERVICE_ERROR',
            statusCode: 502,
            context: { service, ...context },
        });
    }
}

export function isAppError(err: unknown): err is AppError {
    return err instanceof AppError;
}
