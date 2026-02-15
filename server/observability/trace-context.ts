/**
 * AsyncLocalStorage-based trace context propagation.
 *
 * Allows trace IDs and request IDs to flow through async call chains
 * without explicit parameter passing. The logger reads from this store
 * to automatically include traceId/requestId in all log output.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface TraceContextData {
    traceId?: string;
    requestId?: string;
}

export const traceContext = new AsyncLocalStorage<TraceContextData>();

/**
 * Get the current trace ID from AsyncLocalStorage, or undefined if not set.
 */
export function getTraceId(): string | undefined {
    return traceContext.getStore()?.traceId;
}

/**
 * Get the current request ID from AsyncLocalStorage, or undefined if not set.
 */
export function getRequestId(): string | undefined {
    return traceContext.getStore()?.requestId;
}

/**
 * Run a function within a trace context. The traceId and requestId
 * will be available via getTraceId()/getRequestId() in all async
 * descendants of the callback.
 */
export function runWithTraceId<T>(traceId: string, fn: () => T, requestId?: string): T {
    return traceContext.run({ traceId, requestId }, fn);
}
