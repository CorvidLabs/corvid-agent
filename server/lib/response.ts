/**
 * Shared HTTP response helpers.
 *
 * Replaces the per-route-file `json()` helper that was duplicated
 * across 13 route modules.
 */

import { ValidationError } from './validation';
import { createLogger } from './logger';

const log = createLogger('Response');

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
    // Log the full error server-side for debugging — never send to client.
    // Logging is isolated so CodeQL doesn't taint-track through the return value.
    logInternalError(err);
    // Always return a generic message to avoid stack trace / internal detail exposure
    return json({ error: 'Internal server error', timestamp: new Date().toISOString() }, 500);
}

/** @internal Log error details server-side only. Separated to break taint propagation. */
function logInternalError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log.error('Internal server error', { error: message, stack });
}

/** Extract a human-readable error message from an unknown thrown value. */
export function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/** Safely parse a numeric query parameter, returning the default if NaN or missing. */
export function safeNumParam(value: string | null, defaultValue: number): number {
    if (value === null) return defaultValue;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Standard route error handler.
 *
 * Returns 400 for ValidationError, 500 (with timestamp) for anything else.
 * Use in catch blocks: `catch (err) { return handleRouteError(err); }`
 */
export function handleRouteError(err: unknown): Response {
    if (err instanceof ValidationError) return badRequest(err.detail);
    return serverError(err);
}
