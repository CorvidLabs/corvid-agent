import { describe, it, expect } from 'bun:test';
import {
    errorHandlerMiddleware,
    requestLogMiddleware,
    roleMiddleware,
    ORDER,
} from '../middleware/builtin';
import type { MiddlewareContext } from '../middleware/pipeline';
import { RateLimitError, ValidationError } from '../lib/errors';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
    const url = new URL('http://localhost:3000/api/test');
    return {
        req: new Request(url),
        url,
        method: 'GET',
        requestContext: {
            authenticated: false,
            role: undefined,
            walletAddress: undefined,
        } as any,
        response: null,
        state: {},
        startTime: performance.now(),
        aborted: false,
        ...overrides,
    } as MiddlewareContext;
}

// ── ORDER constants ──────────────────────────────────────────────────────────

describe('ORDER constants', () => {
    it('CORS runs before REQUEST_LOG', () => {
        expect(ORDER.CORS).toBeLessThan(ORDER.REQUEST_LOG);
    });

    it('ERROR_HANDLER runs before RATE_LIMIT', () => {
        expect(ORDER.ERROR_HANDLER).toBeLessThan(ORDER.RATE_LIMIT);
    });

    it('AUTH runs before ROLE', () => {
        expect(ORDER.AUTH).toBeLessThan(ORDER.ROLE);
    });

    it('RATE_LIMIT runs before AUTH', () => {
        expect(ORDER.RATE_LIMIT).toBeLessThan(ORDER.AUTH);
    });
});

// ── Error handler middleware ─────────────────────────────────────────────────

describe('errorHandlerMiddleware', () => {
    it('passes through when no error', async () => {
        const mw = errorHandlerMiddleware();
        const ctx = makeCtx();
        await mw.handler(ctx, async () => {
            ctx.response = new Response('ok', { status: 200 });
        });
        expect(ctx.response?.status).toBe(200);
    });

    it('catches unknown errors and returns 500', async () => {
        const mw = errorHandlerMiddleware();
        const ctx = makeCtx();
        await mw.handler(ctx, async () => {
            throw new Error('unexpected');
        });
        expect(ctx.response?.status).toBe(500);
        const body = await ctx.response!.json();
        expect(body.error).toBe('Internal server error');
        expect(body.timestamp).toBeDefined();
    });

    it('maps AppError to correct status and code', async () => {
        const mw = errorHandlerMiddleware();
        const ctx = makeCtx();
        await mw.handler(ctx, async () => {
            throw new ValidationError('bad field');
        });
        expect(ctx.response?.status).toBe(400);
        const body = await ctx.response!.json();
        expect(body.code).toBe('VALIDATION_ERROR');
        expect(body.error).toBe('bad field');
    });

    it('includes retryAfter for RateLimitError', async () => {
        const mw = errorHandlerMiddleware();
        const ctx = makeCtx();
        await mw.handler(ctx, async () => {
            throw new RateLimitError('slow down', { retryAfter: 30 });
        });
        expect(ctx.response?.status).toBe(429);
        const body = await ctx.response!.json();
        expect(body.retryAfter).toBe(30);
        expect(body.code).toBe('RATE_LIMITED');
    });

    it('does not overwrite existing response on error', async () => {
        const mw = errorHandlerMiddleware();
        const existing = new Response('already set', { status: 202 });
        const ctx = makeCtx({ response: existing });
        await mw.handler(ctx, async () => {
            throw new Error('oops');
        });
        // Should keep the existing response since ctx.response was already set
        expect(ctx.response?.status).toBe(202);
    });

    it('catches non-Error thrown values', async () => {
        const mw = errorHandlerMiddleware();
        const ctx = makeCtx();
        await mw.handler(ctx, async () => {
            throw 'string error';
        });
        expect(ctx.response?.status).toBe(500);
        const body = await ctx.response!.json();
        expect(body.error).toBe('Internal server error');
    });

    it('has name and correct order', () => {
        const mw = errorHandlerMiddleware();
        expect(mw.name).toBe('error-handler');
        expect(mw.order).toBe(ORDER.ERROR_HANDLER);
    });
});

// ── Request log middleware ───────────────────────────────────────────────────

describe('requestLogMiddleware', () => {
    it('calls next and does not interfere with response', async () => {
        const mw = requestLogMiddleware();
        const ctx = makeCtx();
        await mw.handler(ctx, async () => {
            ctx.response = new Response('ok', { status: 200 });
        });
        expect(ctx.response?.status).toBe(200);
    });

    it('has correct name and order', () => {
        const mw = requestLogMiddleware();
        expect(mw.name).toBe('request-log');
        expect(mw.order).toBe(ORDER.REQUEST_LOG);
    });
});

// ── Role middleware ──────────────────────────────────────────────────────────

describe('roleMiddleware', () => {
    it('allows access when role matches', async () => {
        const mw = roleMiddleware(['admin'], (p) => p.startsWith('/api/admin'));
        const ctx = makeCtx({
            url: new URL('http://localhost:3000/api/admin/users'),
        });
        ctx.requestContext.authenticated = true;
        ctx.requestContext.role = 'admin';

        await mw.handler(ctx, async () => {
            ctx.response = new Response('ok', { status: 200 });
        });
        expect(ctx.response?.status).toBe(200);
        expect(ctx.aborted).toBe(false);
    });

    it('returns 403 when role does not match', async () => {
        const mw = roleMiddleware(['admin'], (p) => p.startsWith('/api/admin'));
        const ctx = makeCtx({
            url: new URL('http://localhost:3000/api/admin/users'),
        });
        ctx.requestContext.authenticated = true;
        ctx.requestContext.role = 'user';

        await mw.handler(ctx, async () => {
            ctx.response = new Response('ok');
        });
        expect(ctx.response?.status).toBe(403);
        expect(ctx.aborted).toBe(true);
        const body = await ctx.response!.json();
        expect(body.error).toContain('insufficient role');
    });

    it('returns 401 when not authenticated on protected path', async () => {
        const mw = roleMiddleware(['admin'], (p) => p.startsWith('/api/admin'));
        const ctx = makeCtx({
            url: new URL('http://localhost:3000/api/admin/users'),
        });
        ctx.requestContext.authenticated = false;

        await mw.handler(ctx, async () => {});
        expect(ctx.response?.status).toBe(401);
        expect(ctx.aborted).toBe(true);
    });

    it('skips role check for non-matching paths', async () => {
        const mw = roleMiddleware(['admin'], (p) => p.startsWith('/api/admin'));
        const ctx = makeCtx({
            url: new URL('http://localhost:3000/api/public/info'),
        });
        ctx.requestContext.authenticated = false;

        let nextCalled = false;
        await mw.handler(ctx, async () => {
            nextCalled = true;
        });
        expect(nextCalled).toBe(true);
        expect(ctx.aborted).toBe(false);
    });

    it('accepts multiple allowed roles', async () => {
        const mw = roleMiddleware(['admin', 'moderator'], () => true);
        const ctx = makeCtx();
        ctx.requestContext.authenticated = true;
        ctx.requestContext.role = 'moderator';

        await mw.handler(ctx, async () => {
            ctx.response = new Response('ok', { status: 200 });
        });
        expect(ctx.response?.status).toBe(200);
    });

    it('has correct name and order', () => {
        const mw = roleMiddleware(['admin'], () => true);
        expect(mw.name).toBe('role');
        expect(mw.order).toBe(ORDER.ROLE);
    });
});
