/**
 * Custom error types for CorvidAgent.
 *
 * Typed error classes allow callers to catch specific failure modes
 * and route handlers to map them to appropriate HTTP status codes.
 */

export class NotImplementedError extends Error {
    constructor(feature: string, context?: string) {
        const message = context
            ? `Not implemented: ${feature} — ${context}`
            : `Not implemented: ${feature}`;
        super(message);
        this.name = 'NotImplementedError';
    }
}

export class NotFoundError extends Error {
    constructor(resource: string, id?: string, context?: Record<string, unknown>) {
        const msg = id ? `${resource} ${id} not found` : `${resource} not found`;
        super(msg);
        this.name = 'NotFoundError';
        if (context) Object.assign(this, { context });
    }
}

export class ValidationError extends Error {
    constructor(message: string, context?: Record<string, unknown>) {
        super(message);
        this.name = 'ValidationError';
        if (context) Object.assign(this, { context });
    }
}

export class ConflictError extends Error {
    constructor(message: string, context?: Record<string, unknown>) {
        super(message);
        this.name = 'ConflictError';
        if (context) Object.assign(this, { context });
    }
}

export class ExternalServiceError extends Error {
    constructor(service: string, message: string, context?: Record<string, unknown>) {
        super(`${service}: ${message}`);
        this.name = 'ExternalServiceError';
        if (context) Object.assign(this, { context });
    }
}

export class AuthenticationError extends Error {
    constructor(message: string, context?: Record<string, unknown>) {
        super(message);
        this.name = 'AuthenticationError';
        if (context) Object.assign(this, { context });
    }
}

export class AuthorizationError extends Error {
    constructor(message: string, context?: Record<string, unknown>) {
        super(message);
        this.name = 'AuthorizationError';
        if (context) Object.assign(this, { context });
    }
}
