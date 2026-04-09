/**
 * Shared HTTP response helpers.
 *
 * Replaces the per-route-file `json()` helper that was duplicated
 * across 13 route modules.
 */

import { isAppError, RateLimitError } from './errors';
import { createLogger } from './logger';

const log = createLogger('Response');

/**
 * Return a JSON response with an optional HTTP status (default 200).
 *
 * @param data - The payload to serialize as JSON.
 * @param status - HTTP status code (default 200).
 * @returns A `Response` with `Content-Type: application/json`.
 */
export function json(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Convenience: 400 Bad Request with a JSON error body.
 *
 * @param message - The error message to include in the response.
 * @returns A 400 `Response` with `{ error: message }`.
 */
export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

/**
 * Convenience: 404 Not Found with a JSON error body.
 *
 * @param message - The error message to include in the response.
 * @returns A 404 `Response` with `{ error: message }`.
 */
export function notFound(message: string): Response {
  return json({ error: message }, 404);
}

/**
 * Convenience: 503 Service Unavailable with a JSON error body.
 *
 * @param message - The error message to include in the response.
 * @returns A 503 `Response` with `{ error: message }`.
 */
export function unavailable(message: string): Response {
  return json({ error: message }, 503);
}

/**
 * Return a generic 500 Internal Server Error response.
 * Logs the full error server-side but never exposes details to the client.
 *
 * @param err - The thrown error to log internally.
 * @returns A 500 `Response` with a generic error message and timestamp.
 */
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

/**
 * Extract a human-readable error message from an unknown thrown value.
 *
 * @param err - The thrown value to extract a message from.
 * @returns The error's `.message` if it's an `Error`, otherwise `String(err)`.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Safely parse a numeric query parameter, returning the default if NaN or missing.
 *
 * @param value - The raw query parameter string (or null if absent).
 * @param defaultValue - The fallback value when `value` is null or not a number.
 * @returns The parsed number, or `defaultValue` if parsing fails.
 */
export function safeNumParam(value: string | null, defaultValue: number): number {
  if (value === null) return defaultValue;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Standard route error handler.
 *
 * Maps any `AppError` subclass to the correct HTTP status and a consistent
 * JSON body `{ error, code }`. Falls back to 500 for unknown errors.
 *
 * @param err - The thrown error to handle.
 * @returns A `Response` with the appropriate HTTP status and JSON error body.
 *
 * @example
 * ```ts
 * catch (err) { return handleRouteError(err); }
 * ```
 */
export function handleRouteError(err: unknown): Response {
  if (isAppError(err)) {
    const body: Record<string, unknown> = { error: err.message, code: err.code };
    if (err instanceof RateLimitError && err.retryAfter !== undefined) {
      body.retryAfter = err.retryAfter;
    }
    return json(body, err.statusCode);
  }
  return serverError(err);
}
