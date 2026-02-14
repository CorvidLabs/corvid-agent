/**
 * Shared HTTP response helpers.
 *
 * Replaces the per-route-file `json()` helper that was duplicated
 * across 13 route modules.
 */

import { ValidationError } from './validation';

/** Return a JSON response with an optional HTTP status (default 200). */
export function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/** Convenience: 400 Bad Request with a JSON error body. */
export function badRequest(message: string): Response {
    return json({ error: message }, 400);
}

/** Convenience: 404 Not Found with a JSON error body. */
export function notFound(message: string): Response {
    return json({ error: message }, 404);
}

/** Convenience: 503 Service Unavailable with a JSON error body. */
export function unavailable(message: string): Response {
    return json({ error: message }, 503);
}

/** Convenience: 500 error with a timestamp (used by the global error handler). */
export function serverError(err: unknown): Response {
    // Log the full error server-side for debugging
    const fullMessage = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.stack) {
        console.error('[serverError]', err.stack);
    }
    // Return a generic message to the client to avoid stack trace / internal detail exposure
    // (CodeQL js/stack-trace-exposure)
    const safeMessage = process.env.NODE_ENV === 'development'
        ? fullMessage
        : 'Internal server error';
    return json({ error: safeMessage, timestamp: new Date().toISOString() }, 500);
}

/** Extract a human-readable error message from an unknown thrown value. */
export function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/**
 * Standard route error handler.
 *
 * Returns 400 for ValidationError, 500 (with timestamp) for anything else.
 * Use in catch blocks: `catch (err) { return handleRouteError(err); }`
 */
export function handleRouteError(err: unknown): Response {
    if (err instanceof ValidationError) return badRequest(err.message);
    return serverError(err);
}
