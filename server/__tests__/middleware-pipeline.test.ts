import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
    compose,
    createMiddlewareContext,
    MiddlewarePipeline,
    type Middleware,
    type MiddlewareContext,
    type MiddlewareFn,
} from '../middleware/pipeline';
import {
    errorHandlerMiddleware,
    requestLogMiddleware,
    corsMiddleware,
    rateLimitMiddleware,
    authMiddleware,
    roleMiddleware,
    ORDER,
} from '../middleware/builtin';
import type { AuthConfig } from '../middleware/auth';
import { RateLimiter } from '../middleware/rate-limit';
import { createRequestContext } from '../middleware/guards';

// --- Helpers ----------------------------------------------------------------

function makeRequest(path: string, options?: RequestInit & { headers?: Record<string, string> }): Request {
    return new Request(`http://localhost:3000${path}`, options);
}

function makeUrl(path: string, params?: Record<string, string>): URL {
    const url = new URL(`http://localhost:3000${path}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    return url;
}

function makeCtx(path: string = '/api/test', method: string = 'GET'): MiddlewareContext {
    const req = makeRequest(path, { method });
    const url = makeUrl(path);
    return createMiddlewareContext(req, url, createRequestContext());
}

function makeMiddleware(name: string, order: number, handler: MiddlewareFn): Middleware {
    return { name, order, handler };
}

// Simple tracking middleware that records when it runs
function trackingMiddleware(name: string, order: number, log: string[]): Middleware {
    return makeMiddleware(name, order, async (_ctx, next) => {
        log.push(`${name}:down`);
        await next();
        log.push(`${name}:up`);
    });
}

// --- compose() --------------------------------------------------------------

describe('compose', () => {
    it('executes middleware in order (downstream) and reverse (upstream)', async () => {
        const log: string[] = [];

        const pipeline = compose([
            trackingMiddleware('c', 30, log),
            trackingMiddleware('a', 10, log),
            trackingMiddleware('b', 20, log),
        ]);

        const ctx = makeCtx();
        await pipeline(ctx);

        expect(log).toEqual([
            'a:down', 'b:down', 'c:down',
            'c:up', 'b:up', 'a:up',
        ]);
    });

    it('preserves registration order for equal order values', async () => {
        const log: string[] = [];

        const pipeline = compose([
            trackingMiddleware('first', 10, log),
            trackingMiddleware('second', 10, log),
            trackingMiddleware('third', 10, log),
        ]);

        const ctx = makeCtx();
        await pipeline(ctx);

        expect(log).toEqual([
            'first:down', 'second:down', 'third:down',
            'third:up', 'second:up', 'first:up',
        ]);
    });

    it('handles empty middleware list', async () => {
        const pipeline = compose([]);
        const ctx = makeCtx();
        await pipeline(ctx); // Should not throw
    });

    it('handles single middleware', async () => {
        const log: string[] = [];
        const pipeline = compose([trackingMiddleware('only', 1, log)]);

        const ctx = makeCtx();
        await pipeline(ctx);

        expect(log).toEqual(['only:down', 'only:up']);
    });

    it('rejects when next() is called multiple times', async () => {
        const pipeline = compose([
            makeMiddleware('double-next', 1, async (_ctx, next) => {
                await next();
                await next(); // Second call should reject
            }),
        ]);

        const ctx = makeCtx();
        await expect(pipeline(ctx)).rejects.toThrow('next() called multiple times');
    });
});

// --- Abort semantics --------------------------------------------------------

describe('abort semantics', () => {
    it('stops downstream execution when middleware does not call next()', async () => {
        const log: string[] = [];

        const pipeline = compose([
            trackingMiddleware('first', 10, log),
            makeMiddleware('blocker', 20, async (ctx, _next) => {
                log.push('blocker:abort');
                ctx.response = new Response('Blocked', { status: 403 });
                // Does NOT call next() — aborts the chain
            }),
            trackingMiddleware('never', 30, log),
        ]);

        const ctx = makeCtx();
        await pipeline(ctx);

        expect(log).toEqual([
            'first:down',
            'blocker:abort',
            'first:up', // Upstream still runs for middleware that already entered
        ]);
        expect(ctx.response?.status).toBe(403);
    });

    it('stops downstream execution when ctx.aborted is set', async () => {
        const log: string[] = [];

        const pipeline = compose([
            trackingMiddleware('first', 10, log),
            makeMiddleware('aborter', 20, async (ctx, next) => {
                log.push('aborter:abort');
                ctx.aborted = true;
                ctx.response = new Response('Aborted', { status: 429 });
                await next(); // Calls next but pipeline checks aborted flag
            }),
            trackingMiddleware('skipped', 30, log),
        ]);

        const ctx = makeCtx();
        await pipeline(ctx);

        // - first:down runs
        // - aborter:abort runs (its handler)
        // - next() is called but ctx.aborted=true so dispatch(2) returns immediately
        // - aborter handler completes
        // - first's upstream runs
        expect(log).toEqual([
            'first:down',
            'aborter:abort',
            'first:up',
        ]);
    });

    it('allows middleware to set response without calling next', async () => {
        const pipeline = compose([
            makeMiddleware('early-response', 10, async (ctx, _next) => {
                ctx.response = new Response(JSON.stringify({ status: 'ok' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
                // No next() call — short-circuits
            }),
        ]);

        const ctx = makeCtx();
        await pipeline(ctx);

        expect(ctx.response?.status).toBe(200);
        const body = await ctx.response!.json();
        expect(body.status).toBe('ok');
    });
});

// --- Context sharing --------------------------------------------------------

describe('context sharing', () => {
    it('allows middleware to share data via ctx.state', async () => {
        const pipeline = compose([
            makeMiddleware('setter', 10, async (ctx, next) => {
                ctx.state.userId = '12345';
                ctx.state.startedAt = Date.now();
                await next();
            }),
            makeMiddleware('reader', 20, async (ctx, next) => {
                expect(ctx.state.userId).toBe('12345');
                expect(ctx.state.startedAt).toBeTypeOf('number');
                ctx.state.processed = true;
                await next();
            }),
            makeMiddleware('verifier', 30, async (ctx, _next) => {
                expect(ctx.state.processed).toBe(true);
            }),
        ]);

        const ctx = makeCtx();
        await pipeline(ctx);
    });

    it('allows middleware to modify requestContext', async () => {
        const pipeline = compose([
            makeMiddleware('auth', 10, async (ctx, next) => {
                ctx.requestContext.authenticated = true;
                ctx.requestContext.role = 'admin';
                await next();
            }),
            makeMiddleware('checker', 20, async (ctx, _next) => {
                expect(ctx.requestContext.authenticated).toBe(true);
                expect(ctx.requestContext.role).toBe('admin');
            }),
        ]);

        const ctx = makeCtx();
        await pipeline(ctx);
    });
});

// --- Error handling ---------------------------------------------------------

describe('error handling', () => {
    it('propagates errors to upstream middleware', async () => {
        let caughtError: Error | null = null;

        const pipeline = compose([
            makeMiddleware('catcher', 10, async (_ctx, next) => {
                try {
                    await next();
                } catch (err) {
                    caughtError = err as Error;
                }
            }),
            makeMiddleware('thrower', 20, async () => {
                throw new Error('test error');
            }),
        ]);

        const ctx = makeCtx();
        await pipeline(ctx); // Should not reject because catcher handles it

        expect(caughtError).not.toBeNull();
        expect(caughtError!.message).toBe('test error');
    });

    it('propagates errors when no middleware catches them', async () => {
        const pipeline = compose([
            makeMiddleware('thrower', 10, async () => {
                throw new Error('uncaught');
            }),
        ]);

        const ctx = makeCtx();
        await expect(pipeline(ctx)).rejects.toThrow('uncaught');
    });
});

// --- MiddlewarePipeline class -----------------------------------------------

describe('MiddlewarePipeline', () => {
    it('registers and executes middleware', async () => {
        const log: string[] = [];
        const pipeline = new MiddlewarePipeline();

        pipeline
            .use(trackingMiddleware('second', 20, log))
            .use(trackingMiddleware('first', 10, log));

        const ctx = makeCtx();
        await pipeline.execute(ctx);

        expect(log).toEqual(['first:down', 'second:down', 'second:up', 'first:up']);
    });

    it('removes middleware by name', async () => {
        const log: string[] = [];
        const pipeline = new MiddlewarePipeline();

        pipeline
            .use(trackingMiddleware('a', 10, log))
            .use(trackingMiddleware('b', 20, log))
            .use(trackingMiddleware('c', 30, log));

        pipeline.remove('b');

        const ctx = makeCtx();
        await pipeline.execute(ctx);

        expect(log).toEqual(['a:down', 'c:down', 'c:up', 'a:up']);
    });

    it('getMiddlewares returns sorted list', () => {
        const pipeline = new MiddlewarePipeline();

        pipeline
            .use(makeMiddleware('c', 30, async () => {}))
            .use(makeMiddleware('a', 10, async () => {}))
            .use(makeMiddleware('b', 20, async () => {}));

        const middlewares = pipeline.getMiddlewares();
        expect(middlewares.map((m) => m.name)).toEqual(['a', 'b', 'c']);
    });

    it('catches unhandled errors and sets 500 response', async () => {
        const pipeline = new MiddlewarePipeline();

        pipeline.use(makeMiddleware('thrower', 10, async () => {
            throw new Error('boom');
        }));

        const ctx = makeCtx();
        await pipeline.execute(ctx);

        expect(ctx.response).not.toBeNull();
        expect(ctx.response!.status).toBe(500);
        const body = await ctx.response!.json();
        expect(body.error).toBe('Internal server error');
    });

    it('does not override response if middleware already set one during error', async () => {
        const pipeline = new MiddlewarePipeline();

        pipeline.use(makeMiddleware('handler', 10, async (ctx, next) => {
            try {
                await next();
            } catch {
                ctx.response = new Response(JSON.stringify({ error: 'Custom error' }), {
                    status: 422,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }));
        pipeline.use(makeMiddleware('thrower', 20, async () => {
            throw new Error('handled');
        }));

        const ctx = makeCtx();
        await pipeline.execute(ctx);

        expect(ctx.response!.status).toBe(422);
    });

    it('recompiles pipeline when middleware list changes', async () => {
        const log: string[] = [];
        const pipeline = new MiddlewarePipeline();

        pipeline.use(trackingMiddleware('first', 10, log));

        // First execution
        let ctx = makeCtx();
        await pipeline.execute(ctx);
        expect(log).toEqual(['first:down', 'first:up']);

        log.length = 0;

        // Add more middleware and re-execute
        pipeline.use(trackingMiddleware('second', 20, log));

        ctx = makeCtx();
        await pipeline.execute(ctx);
        expect(log).toEqual(['first:down', 'second:down', 'second:up', 'first:up']);
    });
});

// --- Built-in middleware tests -----------------------------------------------

describe('errorHandlerMiddleware', () => {
    it('catches downstream errors and sets 500 response', async () => {
        const pipeline = new MiddlewarePipeline();
        pipeline.use(errorHandlerMiddleware());
        pipeline.use(makeMiddleware('thrower', 100, async () => {
            throw new Error('test error');
        }));

        const ctx = makeCtx();
        await pipeline.execute(ctx);

        expect(ctx.response!.status).toBe(500);
        const body = await ctx.response!.json();
        expect(body.error).toBe('Internal server error');
    });

    it('does not override existing response on error', async () => {
        const pipeline = new MiddlewarePipeline();
        pipeline.use(errorHandlerMiddleware());
        pipeline.use(makeMiddleware('handler', 50, async (ctx, next) => {
            try {
                await next();
            } catch {
                ctx.response = new Response('Custom', { status: 400 });
            }
        }));
        pipeline.use(makeMiddleware('thrower', 100, async () => {
            throw new Error('caught');
        }));

        const ctx = makeCtx();
        await pipeline.execute(ctx);

        // Error was caught by 'handler', so errorHandlerMiddleware sees no error
        expect(ctx.response!.status).toBe(400);
    });

    it('passes through when no error occurs', async () => {
        const pipeline = new MiddlewarePipeline();
        pipeline.use(errorHandlerMiddleware());
        pipeline.use(makeMiddleware('ok', 100, async (ctx) => {
            ctx.response = new Response('OK', { status: 200 });
        }));

        const ctx = makeCtx();
        await pipeline.execute(ctx);

        expect(ctx.response!.status).toBe(200);
    });
});

describe('requestLogMiddleware', () => {
    it('allows requests to pass through', async () => {
        const pipeline = new MiddlewarePipeline();
        pipeline.use(requestLogMiddleware());
        pipeline.use(makeMiddleware('handler', 100, async (ctx) => {
            ctx.response = new Response('OK', { status: 200 });
        }));

        const ctx = makeCtx('/api/test');
        await pipeline.execute(ctx);

        expect(ctx.response!.status).toBe(200);
    });

    it('runs upstream phase after downstream completes', async () => {
        const log: string[] = [];
        const pipeline = new MiddlewarePipeline();

        // Use a custom version that tracks execution
        pipeline.use(makeMiddleware('log', ORDER.REQUEST_LOG, async (_ctx, next) => {
            log.push('log:before');
            await next();
            log.push('log:after');
        }));
        pipeline.use(makeMiddleware('handler', 100, async (ctx) => {
            log.push('handler');
            ctx.response = new Response('OK', { status: 200 });
        }));

        const ctx = makeCtx();
        await pipeline.execute(ctx);

        expect(log).toEqual(['log:before', 'handler', 'log:after']);
    });
});

describe('corsMiddleware', () => {
    const config: AuthConfig = {
        apiKey: null,
        allowedOrigins: [],
        bindHost: '127.0.0.1',
    };

    it('handles OPTIONS preflight and aborts pipeline', async () => {
        const log: string[] = [];
        const pipeline = new MiddlewarePipeline();
        pipeline.use(corsMiddleware(config));
        pipeline.use(trackingMiddleware('handler', 100, log));

        const req = makeRequest('/api/test', { method: 'OPTIONS' });
        const url = makeUrl('/api/test');
        const ctx = createMiddlewareContext(req, url, createRequestContext());

        await pipeline.execute(ctx);

        expect(ctx.response!.status).toBe(204);
        expect(ctx.aborted).toBe(true);
        expect(log).toEqual([]); // Handler never ran
    });

    it('applies CORS headers on upstream for normal requests', async () => {
        const pipeline = new MiddlewarePipeline();
        pipeline.use(corsMiddleware(config));
        pipeline.use(makeMiddleware('handler', 100, async (ctx) => {
            ctx.response = new Response('OK', { status: 200 });
        }));

        const ctx = makeCtx('/api/test');
        await pipeline.execute(ctx);

        expect(ctx.response!.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
});

describe('rateLimitMiddleware', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
        limiter = new RateLimiter({ maxGet: 2, maxMutation: 1, windowMs: 1000 });
    });

    afterEach(() => {
        limiter.stop();
    });

    it('allows requests within rate limit', async () => {
        const pipeline = new MiddlewarePipeline();
        pipeline.use(rateLimitMiddleware(limiter));
        pipeline.use(makeMiddleware('handler', 200, async (ctx) => {
            ctx.response = new Response('OK', { status: 200 });
        }));

        const ctx = makeCtx('/api/test');
        await pipeline.execute(ctx);

        expect(ctx.response!.status).toBe(200);
    });

    it('blocks requests exceeding rate limit', async () => {
        const pipeline = new MiddlewarePipeline();
        pipeline.use(rateLimitMiddleware(limiter));
        pipeline.use(makeMiddleware('handler', 200, async (ctx) => {
            ctx.response = new Response('OK', { status: 200 });
        }));

        // Exhaust the limit
        for (let i = 0; i < 2; i++) {
            const ctx = makeCtx('/api/test');
            await pipeline.execute(ctx);
        }

        // Third request should be blocked
        const ctx = makeCtx('/api/test');
        await pipeline.execute(ctx);

        expect(ctx.response!.status).toBe(429);
        expect(ctx.aborted).toBe(true);
    });

    it('exempts /api/health from rate limiting', async () => {
        const pipeline = new MiddlewarePipeline();
        pipeline.use(rateLimitMiddleware(limiter));
        pipeline.use(makeMiddleware('handler', 200, async (ctx) => {
            ctx.response = new Response('OK', { status: 200 });
        }));

        // Should never be blocked
        for (let i = 0; i < 10; i++) {
            const req = makeRequest('/api/health');
            const url = makeUrl('/api/health');
            const ctx = createMiddlewareContext(req, url, createRequestContext());
            await pipeline.execute(ctx);
            expect(ctx.response!.status).toBe(200);
        }
    });
});

describe('authMiddleware', () => {
    const enabledConfig: AuthConfig = {
        apiKey: 'test-secret-key-12345',
        allowedOrigins: [],
        bindHost: '0.0.0.0',
    };

    const disabledConfig: AuthConfig = {
        apiKey: null,
        allowedOrigins: [],
        bindHost: '127.0.0.1',
    };

    it('allows authenticated requests', async () => {
        const pipeline = new MiddlewarePipeline();
        pipeline.use(authMiddleware(enabledConfig));
        pipeline.use(makeMiddleware('handler', 200, async (ctx) => {
            ctx.response = new Response('OK', { status: 200 });
        }));

        const req = makeRequest('/api/test', {
            headers: { Authorization: `Bearer ${enabledConfig.apiKey}` },
        });
        const url = makeUrl('/api/test');
        const ctx = createMiddlewareContext(req, url, createRequestContext());

        await pipeline.execute(ctx);

        expect(ctx.response!.status).toBe(200);
        expect(ctx.requestContext.authenticated).toBe(true);
        expect(ctx.requestContext.role).toBe('user');
    });

    it('denies unauthenticated requests', async () => {
        const pipeline = new MiddlewarePipeline();
        pipeline.use(authMiddleware(enabledConfig));
        pipeline.use(makeMiddleware('handler', 200, async (ctx) => {
            ctx.response = new Response('OK', { status: 200 });
        }));

        const ctx = makeCtx('/api/test');
        await pipeline.execute(ctx);

        expect(ctx.response!.status).toBe(401);
        expect(ctx.aborted).toBe(true);
    });

    it('grants admin in dev mode (no API key)', async () => {
        const pipeline = new MiddlewarePipeline();
        pipeline.use(authMiddleware(disabledConfig));
        pipeline.use(makeMiddleware('handler', 200, async (ctx) => {
            ctx.response = new Response('OK', { status: 200 });
        }));

        const ctx = makeCtx('/api/test');
        await pipeline.execute(ctx);

        expect(ctx.requestContext.authenticated).toBe(true);
        expect(ctx.requestContext.role).toBe('admin');
    });
});

describe('roleMiddleware', () => {
    it('allows requests with matching role', async () => {
        const pipeline = new MiddlewarePipeline();
        pipeline.use(roleMiddleware(['admin'], (p) => p === '/metrics'));
        pipeline.use(makeMiddleware('handler', 200, async (ctx) => {
            ctx.response = new Response('OK', { status: 200 });
        }));

        const req = makeRequest('/metrics');
        const url = makeUrl('/metrics');
        const ctx = createMiddlewareContext(req, url, { authenticated: true, role: 'admin' });

        await pipeline.execute(ctx);

        expect(ctx.response!.status).toBe(200);
    });

    it('denies requests with wrong role', async () => {
        const pipeline = new MiddlewarePipeline();
        pipeline.use(roleMiddleware(['admin'], (p) => p === '/metrics'));
        pipeline.use(makeMiddleware('handler', 200, async (ctx) => {
            ctx.response = new Response('OK', { status: 200 });
        }));

        const req = makeRequest('/metrics');
        const url = makeUrl('/metrics');
        const ctx = createMiddlewareContext(req, url, { authenticated: true, role: 'user' });

        await pipeline.execute(ctx);

        expect(ctx.response!.status).toBe(403);
        expect(ctx.aborted).toBe(true);
    });

    it('skips role check for non-matching paths', async () => {
        const pipeline = new MiddlewarePipeline();
        pipeline.use(roleMiddleware(['admin'], (p) => p === '/metrics'));
        pipeline.use(makeMiddleware('handler', 200, async (ctx) => {
            ctx.response = new Response('OK', { status: 200 });
        }));

        const req = makeRequest('/api/sessions');
        const url = makeUrl('/api/sessions');
        const ctx = createMiddlewareContext(req, url, { authenticated: true, role: 'user' });

        await pipeline.execute(ctx);

        expect(ctx.response!.status).toBe(200); // Role check skipped
    });
});

// --- Full pipeline integration test -----------------------------------------

describe('full pipeline integration', () => {
    let limiter: RateLimiter;

    const config: AuthConfig = {
        apiKey: null,
        allowedOrigins: [],
        bindHost: '127.0.0.1',
    };

    beforeEach(() => {
        limiter = new RateLimiter({ maxGet: 100, maxMutation: 50, windowMs: 60_000 });
    });

    afterEach(() => {
        limiter.stop();
    });

    it('runs full pipeline: cors → log → error → rateLimit → auth → role → handler', async () => {
        const log: string[] = [];
        const pipeline = new MiddlewarePipeline();

        pipeline.use(corsMiddleware(config));
        pipeline.use(requestLogMiddleware());
        pipeline.use(errorHandlerMiddleware());
        pipeline.use(rateLimitMiddleware(limiter));
        pipeline.use(authMiddleware(config));
        pipeline.use(roleMiddleware(['admin'], (p) => p === '/metrics'));

        // Route handler
        pipeline.use(makeMiddleware('handler', 300, async (ctx) => {
            log.push('handler');
            ctx.response = new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }));

        const ctx = makeCtx('/api/test');
        await pipeline.execute(ctx);

        expect(ctx.response!.status).toBe(200);
        expect(ctx.requestContext.authenticated).toBe(true);
        expect(ctx.response!.headers.get('Access-Control-Allow-Origin')).toBe('*');
        expect(log).toEqual(['handler']);
    });

    it('error handler catches route handler errors', async () => {
        const pipeline = new MiddlewarePipeline();

        pipeline.use(corsMiddleware(config));
        pipeline.use(errorHandlerMiddleware());
        pipeline.use(authMiddleware(config));

        pipeline.use(makeMiddleware('handler', 300, async () => {
            throw new Error('Route handler failed');
        }));

        const ctx = makeCtx('/api/test');
        await pipeline.execute(ctx);

        expect(ctx.response!.status).toBe(500);
        const body = await ctx.response!.json();
        expect(body.error).toBe('Internal server error');
        // CORS headers still applied (upstream phase of corsMiddleware)
        expect(ctx.response!.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('ordering is deterministic regardless of registration order', async () => {
        const log: string[] = [];
        const pipeline = new MiddlewarePipeline();

        // Register in reverse order — pipeline should still sort by order
        pipeline.use(makeMiddleware('handler', 300, async (ctx) => {
            log.push('handler');
            ctx.response = new Response('OK');
        }));
        pipeline.use(makeMiddleware('auth', 110, async (ctx, next) => {
            log.push('auth');
            ctx.requestContext.authenticated = true;
            await next();
        }));
        pipeline.use(makeMiddleware('rate-limit', 100, async (_ctx, next) => {
            log.push('rate-limit');
            await next();
        }));
        pipeline.use(makeMiddleware('cors', 10, async (_ctx, next) => {
            log.push('cors');
            await next();
        }));

        const ctx = makeCtx();
        await pipeline.execute(ctx);

        expect(log).toEqual(['cors', 'rate-limit', 'auth', 'handler']);
    });
});

// --- ORDER constants --------------------------------------------------------

describe('ORDER constants', () => {
    it('CORS runs before everything else', () => {
        expect(ORDER.CORS).toBeLessThan(ORDER.REQUEST_LOG);
        expect(ORDER.CORS).toBeLessThan(ORDER.ERROR_HANDLER);
        expect(ORDER.CORS).toBeLessThan(ORDER.RATE_LIMIT);
    });

    it('error handler runs before security middleware', () => {
        expect(ORDER.ERROR_HANDLER).toBeLessThan(ORDER.RATE_LIMIT);
        expect(ORDER.ERROR_HANDLER).toBeLessThan(ORDER.AUTH);
    });

    it('rate limit runs before auth', () => {
        expect(ORDER.RATE_LIMIT).toBeLessThan(ORDER.AUTH);
    });

    it('auth runs before role check', () => {
        expect(ORDER.AUTH).toBeLessThan(ORDER.ROLE);
    });
});
