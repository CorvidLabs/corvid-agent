/**
 * Koa-style middleware pipeline for HTTP request processing.
 *
 * Middleware functions follow the signature:
 *   (ctx: MiddlewareContext, next: () => Promise<void>) => Promise<void>
 *
 * Key features:
 * - Explicit ordering via numeric `order` property
 * - Abort semantics: middleware can halt the chain by not calling `next()`
 * - Downstream/upstream phases: code before `next()` runs on the way "down",
 *   code after `next()` runs on the way back "up" (like Koa)
 * - Context object is shared and mutable across all middleware
 *
 * @see https://github.com/CorvidLabs/corvid-agent/issues/151
 */

import type { RequestContext } from './guards';
import { createLogger } from '../lib/logger';

const log = createLogger('Pipeline');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shared context passed through the middleware pipeline.
 * Middleware can read/write properties to communicate with downstream
 * and upstream middleware.
 */
export interface MiddlewareContext {
    /** The incoming HTTP request (immutable by convention). */
    readonly req: Request;
    /** Parsed URL of the request. */
    readonly url: URL;
    /** HTTP method shorthand. */
    readonly method: string;
    /** Request context populated by auth/guard middleware. */
    requestContext: RequestContext;
    /** The response to send back. Set by route handlers or error middleware. */
    response: Response | null;
    /** Arbitrary key-value state bag for middleware to share data. */
    state: Record<string, unknown>;
    /** Timestamp when the pipeline started processing (for timing). */
    readonly startTime: number;
    /**
     * Signal that the pipeline should abort — no further downstream
     * middleware will execute. The current middleware can still set
     * `ctx.response` before returning.
     */
    aborted: boolean;
}

/** A `next` function that invokes the next middleware in the chain. */
export type NextFn = () => Promise<void>;

/**
 * A middleware function. Receives the shared context and a `next` function
 * to pass control to the next middleware. If `next()` is not called, the
 * pipeline is aborted (no downstream middleware runs).
 */
export type MiddlewareFn = (ctx: MiddlewareContext, next: NextFn) => Promise<void>;

/**
 * A named middleware with an explicit execution order.
 * Lower `order` values run first (upstream). Ties are broken by
 * registration order.
 */
export interface Middleware {
    /** Human-readable name for logging and debugging. */
    name: string;
    /**
     * Execution order. Lower values run first.
     * Suggested ranges:
     *   0-99:   Pre-processing (CORS, tracing, request ID)
     *   100-199: Security (rate-limit, auth, role)
     *   200-299: Request enrichment (body parsing, validation)
     *   300-399: Business logic / route handling
     *   400-499: Post-processing (response headers, compression)
     *   500+:    Observability (logging, metrics)
     */
    order: number;
    /** The middleware function. */
    handler: MiddlewareFn;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Create a fresh MiddlewareContext for an incoming request.
 */
export function createMiddlewareContext(
    req: Request,
    url: URL,
    requestContext: RequestContext,
): MiddlewareContext {
    return {
        req,
        url,
        method: req.method,
        requestContext,
        response: null,
        state: {},
        startTime: performance.now(),
        aborted: false,
    };
}

/**
 * Compose an ordered array of middleware into a single executable function.
 *
 * Returns a function that, given a context, runs the pipeline and returns
 * the context (with `.response` potentially set).
 *
 * The composition follows Koa semantics:
 * 1. Middleware are sorted by `order` (stable sort preserves registration order for ties).
 * 2. Each middleware receives `ctx` and a `next()` function.
 * 3. Calling `next()` passes control to the next middleware.
 * 4. NOT calling `next()` aborts the downstream chain (abort semantics).
 * 5. Code after `await next()` runs in reverse order (upstream phase).
 */
export function compose(middlewares: Middleware[]): (ctx: MiddlewareContext) => Promise<void> {
    // Sort by order (stable sort — preserves registration order for equal `order` values)
    const sorted = [...middlewares].sort((a, b) => a.order - b.order);

    return function pipeline(ctx: MiddlewareContext): Promise<void> {
        let index = -1;

        function dispatch(i: number): Promise<void> {
            // Guard against calling next() multiple times from the same middleware
            if (i <= index) {
                return Promise.reject(new Error('next() called multiple times'));
            }
            index = i;

            // If the pipeline was aborted by a previous middleware, stop
            if (ctx.aborted) {
                return Promise.resolve();
            }

            const entry = sorted[i];
            if (!entry) {
                // End of chain — all middleware have been invoked
                return Promise.resolve();
            }

            try {
                return entry.handler(ctx, () => {
                    // If the middleware set aborted, don't proceed
                    if (ctx.aborted) return Promise.resolve();
                    return dispatch(i + 1);
                });
            } catch (err) {
                return Promise.reject(err);
            }
        }

        return dispatch(0);
    };
}

// ---------------------------------------------------------------------------
// MiddlewarePipeline — builder / registry
// ---------------------------------------------------------------------------

/**
 * Builder for assembling and executing a middleware pipeline.
 *
 * Usage:
 * ```ts
 * const pipeline = new MiddlewarePipeline();
 * pipeline.use({ name: 'logging', order: 500, handler: loggingMiddleware });
 * pipeline.use({ name: 'auth', order: 100, handler: authMiddleware });
 *
 * const ctx = createMiddlewareContext(req, url, requestContext);
 * await pipeline.execute(ctx);
 * // ctx.response is now set
 * ```
 */
export class MiddlewarePipeline {
    private middlewares: Middleware[] = [];
    private compiled: ((ctx: MiddlewareContext) => Promise<void>) | null = null;

    /** Register a middleware. Invalidates the compiled pipeline. */
    use(middleware: Middleware): this {
        this.middlewares.push(middleware);
        this.compiled = null; // Force recompile on next execute
        return this;
    }

    /** Remove a middleware by name. */
    remove(name: string): this {
        this.middlewares = this.middlewares.filter((m) => m.name !== name);
        this.compiled = null;
        return this;
    }

    /** Get all registered middleware (sorted by order). */
    getMiddlewares(): ReadonlyArray<Readonly<Middleware>> {
        return [...this.middlewares].sort((a, b) => a.order - b.order);
    }

    /**
     * Execute the pipeline with the given context.
     * Returns the context after all middleware have run.
     */
    async execute(ctx: MiddlewareContext): Promise<MiddlewareContext> {
        if (!this.compiled) {
            this.compiled = compose(this.middlewares);
        }

        try {
            await this.compiled(ctx);
        } catch (err) {
            // If no middleware caught the error and set a response, log and set 500
            if (!ctx.response) {
                const message = err instanceof Error ? err.message : String(err);
                log.error('Unhandled pipeline error', { error: message });
                ctx.response = new Response(
                    JSON.stringify({ error: 'Internal server error', timestamp: new Date().toISOString() }),
                    { status: 500, headers: { 'Content-Type': 'application/json' } },
                );
            }
        }

        return ctx;
    }
}
