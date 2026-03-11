import { describe, it, expect } from 'bun:test';
import {
    json,
    badRequest,
    notFound,
    unavailable,
    serverError,
    errorMessage,
    safeNumParam,
    handleRouteError,
} from '../lib/response';
import { ValidationError, RateLimitError, NotFoundError } from '../lib/errors';

// ── json() ──────────────────────────────────────────────────────────────────

describe('json()', () => {
    it('returns a Response with JSON content type', async () => {
        const res = json({ foo: 'bar' });
        expect(res.headers.get('Content-Type')).toBe('application/json');
    });

    it('defaults to status 200', () => {
        const res = json({ ok: true });
        expect(res.status).toBe(200);
    });

    it('accepts a custom status code', () => {
        const res = json({ created: true }, 201);
        expect(res.status).toBe(201);
    });

    it('serializes data correctly', async () => {
        const data = { count: 42, items: ['a', 'b'] };
        const res = json(data);
        const body = await res.json();
        expect(body).toEqual(data);
    });

    it('handles null data', async () => {
        const res = json(null);
        const body = await res.json();
        expect(body).toBeNull();
    });
});

// ── Convenience helpers ─────────────────────────────────────────────────────

describe('badRequest()', () => {
    it('returns 400 with error message', async () => {
        const res = badRequest('missing field');
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('missing field');
    });
});

describe('notFound()', () => {
    it('returns 404 with error message', async () => {
        const res = notFound('agent not found');
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe('agent not found');
    });
});

describe('unavailable()', () => {
    it('returns 503 with error message', async () => {
        const res = unavailable('service down');
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.error).toBe('service down');
    });
});

// ── serverError() ───────────────────────────────────────────────────────────

describe('serverError()', () => {
    it('returns 500 with generic message (no internals leaked)', async () => {
        const res = serverError(new Error('SQL syntax error at line 42'));
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe('Internal server error');
        // Ensure no internal details leaked
        expect(JSON.stringify(body)).not.toContain('SQL');
    });

    it('includes a timestamp', async () => {
        const res = serverError(new Error('oops'));
        const body = await res.json();
        expect(body.timestamp).toBeDefined();
        // Timestamp should be a valid ISO string
        expect(() => new Date(body.timestamp)).not.toThrow();
    });

    it('handles non-Error thrown values', async () => {
        const res = serverError('raw string error');
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe('Internal server error');
    });
});

// ── errorMessage() ──────────────────────────────────────────────────────────

describe('errorMessage()', () => {
    it('extracts message from Error instance', () => {
        expect(errorMessage(new Error('hello'))).toBe('hello');
    });

    it('converts non-Error to string', () => {
        expect(errorMessage(42)).toBe('42');
        expect(errorMessage(null)).toBe('null');
        expect(errorMessage(undefined)).toBe('undefined');
    });

    it('handles string values', () => {
        expect(errorMessage('raw error')).toBe('raw error');
    });
});

// ── safeNumParam() ──────────────────────────────────────────────────────────

describe('safeNumParam()', () => {
    it('returns parsed number for valid string', () => {
        expect(safeNumParam('42', 10)).toBe(42);
    });

    it('returns default for null', () => {
        expect(safeNumParam(null, 10)).toBe(10);
    });

    it('returns default for NaN string', () => {
        expect(safeNumParam('abc', 5)).toBe(5);
    });

    it('returns 0 for empty string (Number("") === 0)', () => {
        expect(safeNumParam('', 7)).toBe(0);
    });

    it('handles zero correctly', () => {
        expect(safeNumParam('0', 10)).toBe(0);
    });

    it('handles negative numbers', () => {
        expect(safeNumParam('-5', 0)).toBe(-5);
    });

    it('handles floating point', () => {
        expect(safeNumParam('3.14', 0)).toBeCloseTo(3.14);
    });
});

// ── handleRouteError() ──────────────────────────────────────────────────────

describe('handleRouteError()', () => {
    it('maps ValidationError to 400 with code', async () => {
        const res = handleRouteError(new ValidationError('bad input'));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('bad input');
        expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('maps NotFoundError to 404', async () => {
        const res = handleRouteError(new NotFoundError('Agent', 'abc'));
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.code).toBe('NOT_FOUND');
    });

    it('includes retryAfter for RateLimitError', async () => {
        const res = handleRouteError(new RateLimitError('wait', { retryAfter: 60 }));
        expect(res.status).toBe(429);
        const body = await res.json();
        expect(body.retryAfter).toBe(60);
        expect(body.code).toBe('RATE_LIMITED');
    });

    it('omits retryAfter when not set on RateLimitError', async () => {
        const res = handleRouteError(new RateLimitError());
        const body = await res.json();
        expect(body.retryAfter).toBeUndefined();
    });

    it('falls back to 500 for unknown errors', async () => {
        const res = handleRouteError(new Error('kaboom'));
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe('Internal server error');
        expect(body.code).toBeUndefined();
    });

    it('falls back to 500 for non-Error values', async () => {
        const res = handleRouteError('string error');
        expect(res.status).toBe(500);
    });
});
