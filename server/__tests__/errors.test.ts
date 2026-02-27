import { describe, it, expect } from 'bun:test';
import {
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    NotImplementedError,
    ExternalServiceError,
    isAppError,
} from '../lib/errors';

// ── AppError base class ──────────────────────────────────────────────────────

describe('AppError', () => {
    it('sets message, code, and statusCode', () => {
        const err = new AppError('something broke', {
            code: 'SOME_CODE',
            statusCode: 500,
        });
        expect(err.message).toBe('something broke');
        expect(err.code).toBe('SOME_CODE');
        expect(err.statusCode).toBe(500);
    });

    it('is an instance of Error', () => {
        const err = new AppError('test', { code: 'TEST', statusCode: 400 });
        expect(err).toBeInstanceOf(Error);
    });

    it('preserves optional context', () => {
        const ctx = { userId: 'abc', action: 'write' };
        const err = new AppError('ctx test', {
            code: 'CTX',
            statusCode: 400,
            context: ctx,
        });
        expect(err.context).toEqual(ctx);
    });

    it('omits context when not provided', () => {
        const err = new AppError('no ctx', { code: 'X', statusCode: 400 });
        expect(err.context).toBeUndefined();
    });

    it('preserves cause', () => {
        const cause = new Error('root cause');
        const err = new AppError('wrapper', {
            code: 'WRAP',
            statusCode: 500,
            cause,
        });
        expect(err.cause).toBe(cause);
    });

    it('sets name to the class name', () => {
        const err = new AppError('test', { code: 'T', statusCode: 400 });
        expect(err.name).toBe('AppError');
    });
});

// ── Subclass: ValidationError ────────────────────────────────────────────────

describe('ValidationError', () => {
    it('has status 400 and code VALIDATION_ERROR', () => {
        const err = new ValidationError('bad input');
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('VALIDATION_ERROR');
    });

    it('exposes detail property matching message', () => {
        const err = new ValidationError('field X is required');
        expect(err.detail).toBe('field X is required');
    });

    it('is an AppError', () => {
        expect(new ValidationError('x')).toBeInstanceOf(AppError);
    });

    it('preserves context', () => {
        const ctx = { field: 'email' };
        const err = new ValidationError('invalid email', ctx);
        expect(err.context).toEqual(ctx);
    });

    it('sets name to ValidationError', () => {
        expect(new ValidationError('x').name).toBe('ValidationError');
    });
});

// ── Subclass: AuthenticationError ────────────────────────────────────────────

describe('AuthenticationError', () => {
    it('has status 401 and code AUTHENTICATION_ERROR', () => {
        const err = new AuthenticationError('bad token');
        expect(err.statusCode).toBe(401);
        expect(err.code).toBe('AUTHENTICATION_ERROR');
    });

    it('is an AppError', () => {
        expect(new AuthenticationError('x')).toBeInstanceOf(AppError);
    });

    it('preserves context', () => {
        const err = new AuthenticationError('expired', { tokenAge: 3600 });
        expect(err.context).toEqual({ tokenAge: 3600 });
    });
});

// ── Subclass: AuthorizationError ─────────────────────────────────────────────

describe('AuthorizationError', () => {
    it('has status 403 and code AUTHORIZATION_ERROR', () => {
        const err = new AuthorizationError('forbidden');
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('AUTHORIZATION_ERROR');
    });

    it('is an AppError', () => {
        expect(new AuthorizationError('x')).toBeInstanceOf(AppError);
    });
});

// ── Subclass: NotFoundError ──────────────────────────────────────────────────

describe('NotFoundError', () => {
    it('has status 404 and code NOT_FOUND', () => {
        const err = new NotFoundError('Agent');
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe('NOT_FOUND');
    });

    it('formats message with resource only', () => {
        const err = new NotFoundError('Project');
        expect(err.message).toBe('Project not found');
    });

    it('formats message with resource and id', () => {
        const err = new NotFoundError('Agent', 'agent-42');
        expect(err.message).toBe('Agent agent-42 not found');
    });

    it('preserves context', () => {
        const err = new NotFoundError('Session', 'sess-1', { reason: 'expired' });
        expect(err.context).toEqual({ reason: 'expired' });
    });

    it('is an AppError', () => {
        expect(new NotFoundError('X')).toBeInstanceOf(AppError);
    });
});

// ── Subclass: ConflictError ──────────────────────────────────────────────────

describe('ConflictError', () => {
    it('has status 409 and code CONFLICT', () => {
        const err = new ConflictError('duplicate name');
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe('CONFLICT');
    });

    it('is an AppError', () => {
        expect(new ConflictError('x')).toBeInstanceOf(AppError);
    });
});

// ── Subclass: RateLimitError ─────────────────────────────────────────────────

describe('RateLimitError', () => {
    it('has status 429 and code RATE_LIMITED', () => {
        const err = new RateLimitError();
        expect(err.statusCode).toBe(429);
        expect(err.code).toBe('RATE_LIMITED');
    });

    it('uses default message', () => {
        const err = new RateLimitError();
        expect(err.message).toBe('Too many requests');
    });

    it('accepts custom message', () => {
        const err = new RateLimitError('slow down');
        expect(err.message).toBe('slow down');
    });

    it('exposes retryAfter', () => {
        const err = new RateLimitError('wait', { retryAfter: 60 });
        expect(err.retryAfter).toBe(60);
    });

    it('retryAfter is undefined when not provided', () => {
        const err = new RateLimitError();
        expect(err.retryAfter).toBeUndefined();
    });

    it('preserves context', () => {
        const err = new RateLimitError('wait', { context: { ip: '1.2.3.4' } });
        expect(err.context).toEqual({ ip: '1.2.3.4' });
    });

    it('is an AppError', () => {
        expect(new RateLimitError()).toBeInstanceOf(AppError);
    });
});

// ── Subclass: NotImplementedError ────────────────────────────────────────────

describe('NotImplementedError', () => {
    it('has status 501 and code NOT_IMPLEMENTED', () => {
        const err = new NotImplementedError('voice');
        expect(err.statusCode).toBe(501);
        expect(err.code).toBe('NOT_IMPLEMENTED');
    });

    it('formats message with feature only', () => {
        const err = new NotImplementedError('video calls');
        expect(err.message).toBe('Not implemented: video calls');
    });

    it('formats message with feature and context', () => {
        const err = new NotImplementedError('streaming', 'coming in v2');
        expect(err.message).toBe('Not implemented: streaming — coming in v2');
    });

    it('is an AppError', () => {
        expect(new NotImplementedError('x')).toBeInstanceOf(AppError);
    });
});

// ── Subclass: ExternalServiceError ───────────────────────────────────────────

describe('ExternalServiceError', () => {
    it('has status 502 and code EXTERNAL_SERVICE_ERROR', () => {
        const err = new ExternalServiceError('Algod', 'connection refused');
        expect(err.statusCode).toBe(502);
        expect(err.code).toBe('EXTERNAL_SERVICE_ERROR');
    });

    it('formats message with service name', () => {
        const err = new ExternalServiceError('Indexer', 'timeout');
        expect(err.message).toBe('Indexer: timeout');
    });

    it('includes service in context', () => {
        const err = new ExternalServiceError('GitHub', 'rate limited', { endpoint: '/repos' });
        expect(err.context).toEqual({ service: 'GitHub', endpoint: '/repos' });
    });

    it('is an AppError', () => {
        expect(new ExternalServiceError('X', 'Y')).toBeInstanceOf(AppError);
    });
});

// ── isAppError type guard ────────────────────────────────────────────────────

describe('isAppError', () => {
    it('returns true for AppError', () => {
        expect(isAppError(new AppError('x', { code: 'X', statusCode: 400 }))).toBe(true);
    });

    it('returns true for AppError subclasses', () => {
        expect(isAppError(new ValidationError('x'))).toBe(true);
        expect(isAppError(new AuthenticationError('x'))).toBe(true);
        expect(isAppError(new AuthorizationError('x'))).toBe(true);
        expect(isAppError(new NotFoundError('x'))).toBe(true);
        expect(isAppError(new ConflictError('x'))).toBe(true);
        expect(isAppError(new RateLimitError())).toBe(true);
        expect(isAppError(new NotImplementedError('x'))).toBe(true);
        expect(isAppError(new ExternalServiceError('x', 'y'))).toBe(true);
    });

    it('returns false for plain Error', () => {
        expect(isAppError(new Error('x'))).toBe(false);
    });

    it('returns false for non-error values', () => {
        expect(isAppError(null)).toBe(false);
        expect(isAppError(undefined)).toBe(false);
        expect(isAppError('string')).toBe(false);
        expect(isAppError(42)).toBe(false);
        expect(isAppError({ code: 'X', statusCode: 400 })).toBe(false);
    });
});

// ── Error code uniqueness ────────────────────────────────────────────────────

describe('error code uniqueness', () => {
    it('each error subclass has a distinct code', () => {
        const codes = [
            new ValidationError('x').code,
            new AuthenticationError('x').code,
            new AuthorizationError('x').code,
            new NotFoundError('x').code,
            new ConflictError('x').code,
            new RateLimitError().code,
            new NotImplementedError('x').code,
            new ExternalServiceError('x', 'y').code,
        ];
        const unique = new Set(codes);
        expect(unique.size).toBe(codes.length);
    });
});
