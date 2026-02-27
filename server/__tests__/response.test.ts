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
import {
    ValidationError,
    NotFoundError,
    RateLimitError,
    ExternalServiceError,
} from '../lib/errors';

// --- json() -----------------------------------------------------------------

describe('json', () => {
    it('returns 200 by default', async () => {
        const res = json({ ok: true });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/json');
        expect(await res.json()).toEqual({ ok: true });
    });

    it('accepts a custom status code', () => {
        const res = json({ created: true }, 201);
        expect(res.status).toBe(201);
    });

    it('serializes arrays', async () => {
        const res = json([1, 2, 3]);
        expect(await res.json()).toEqual([1, 2, 3]);
    });

    it('serializes null', async () => {
        const res = json(null);
        expect(await res.json()).toBeNull();
    });

    it('serializes strings', async () => {
        const res = json('hello');
        expect(await res.text()).toBe('"hello"');
    });
});

// --- convenience responses --------------------------------------------------

describe('badRequest', () => {
    it('returns 400 with error message', async () => {
        const res = badRequest('missing field');
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('missing field');
    });
});

describe('notFound', () => {
    it('returns 404 with error message', async () => {
        const res = notFound('Session not found');
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe('Session not found');
    });
});

describe('unavailable', () => {
    it('returns 503 with error message', async () => {
        const res = unavailable('service down');
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.error).toBe('service down');
    });
});

// --- serverError() ----------------------------------------------------------

describe('serverError', () => {
    it('returns 500 with generic message', async () => {
        const res = serverError(new Error('secret details'));
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe('Internal server error');
        expect(body.timestamp).toBeTruthy();
        // Must NOT leak error details
        expect(JSON.stringify(body)).not.toContain('secret details');
    });

    it('handles non-Error thrown values', async () => {
        const res = serverError('string error');
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe('Internal server error');
    });

    it('includes an ISO timestamp', async () => {
        const res = serverError(new Error('test'));
        const body = await res.json();
        // Validate ISO 8601 format
        expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });
});

// --- errorMessage() ---------------------------------------------------------

describe('errorMessage', () => {
    it('extracts message from Error', () => {
        expect(errorMessage(new Error('test'))).toBe('test');
    });

    it('converts non-Error to string', () => {
        expect(errorMessage('oops')).toBe('oops');
        expect(errorMessage(42)).toBe('42');
        expect(errorMessage(null)).toBe('null');
    });
});

// --- safeNumParam() ---------------------------------------------------------

describe('safeNumParam', () => {
    it('returns parsed number for valid strings', () => {
        expect(safeNumParam('42', 10)).toBe(42);
        expect(safeNumParam('0', 10)).toBe(0);
        expect(safeNumParam('-5', 10)).toBe(-5);
        expect(safeNumParam('3.14', 10)).toBeCloseTo(3.14);
    });

    it('returns default for null', () => {
        expect(safeNumParam(null, 10)).toBe(10);
    });

    it('returns default for NaN strings', () => {
        expect(safeNumParam('abc', 10)).toBe(10);
    });

    it('treats empty string as 0 (Number("") === 0)', () => {
        expect(safeNumParam('', 10)).toBe(0);
    });
});

// --- handleRouteError() -----------------------------------------------------

describe('handleRouteError', () => {
    it('maps ValidationError to 400', async () => {
        const res = handleRouteError(new ValidationError('bad input'));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('bad input');
        expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('maps NotFoundError to 404', async () => {
        const res = handleRouteError(new NotFoundError('Agent', 'xyz'));
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe('Agent xyz not found');
        expect(body.code).toBe('NOT_FOUND');
    });

    it('maps RateLimitError to 429 with retryAfter', async () => {
        const res = handleRouteError(new RateLimitError('slow down', { retryAfter: 15 }));
        expect(res.status).toBe(429);
        const body = await res.json();
        expect(body.error).toBe('slow down');
        expect(body.code).toBe('RATE_LIMITED');
        expect(body.retryAfter).toBe(15);
    });

    it('maps RateLimitError without retryAfter', async () => {
        const res = handleRouteError(new RateLimitError());
        expect(res.status).toBe(429);
        const body = await res.json();
        expect(body.retryAfter).toBeUndefined();
    });

    it('maps ExternalServiceError to 502', async () => {
        const res = handleRouteError(new ExternalServiceError('Algo', 'timeout'));
        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.code).toBe('EXTERNAL_SERVICE_ERROR');
    });

    it('falls back to 500 for unknown errors', async () => {
        const res = handleRouteError(new Error('random'));
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe('Internal server error');
        expect(body.code).toBeUndefined();
    });

    it('falls back to 500 for non-Error values', async () => {
        const res = handleRouteError('string thrown');
        expect(res.status).toBe(500);
    });
});
