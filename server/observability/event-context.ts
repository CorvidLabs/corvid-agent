/**
 * EventContext — correlation IDs for agent-to-agent and cross-boundary tracing.
 *
 * Provides a structured context that threads a traceId through all entry points
 * (AlgoChat, scheduler, webhooks, polling, workflows, councils) so that every
 * log line, on-chain message, and agent invocation within a logical operation
 * shares a single correlation identifier.
 *
 * Built on top of the existing AsyncLocalStorage-based tracing in trace-context.ts.
 */

import { generateTraceId } from './tracing';
import { getTraceId, runWithTraceId } from './trace-context';

/** Source system that originated the event. */
export type EventSource =
    | 'web'
    | 'algochat'
    | 'agent'
    | 'telegram'
    | 'discord'
    | 'scheduler'
    | 'webhook'
    | 'workflow'
    | 'council'
    | 'polling';

/**
 * Correlation context threaded through all agent-to-agent calls.
 *
 * Every entry point creates (or inherits) an EventContext so that all
 * downstream work — process spawns, on-chain messages, council rounds —
 * can be correlated via `traceId`.
 */
export interface EventContext {
    /** 32 hex-char trace identifier, from generateTraceId(). */
    traceId: string;
    /** Optional parent span/request ID for nesting within a trace. */
    parentId?: string;
    /** Date.now() when the context was created. */
    timestamp: number;
    /** Which entry-point system originated this context. */
    source: EventSource;
}

/**
 * Create an EventContext, optionally inheriting an existing traceId.
 *
 * If `existingTraceId` is provided it is reused; otherwise a new one is
 * generated.  If there is already a traceId in the current AsyncLocalStorage
 * context (from a parent call) it will be used as `parentId`.
 */
export function createEventContext(source: EventSource, existingTraceId?: string): EventContext {
    const currentTraceId = getTraceId();
    return {
        traceId: existingTraceId ?? currentTraceId ?? generateTraceId(),
        parentId: currentTraceId && currentTraceId !== existingTraceId ? currentTraceId : undefined,
        timestamp: Date.now(),
        source,
    };
}

/**
 * Run a function within the trace context of an EventContext.
 *
 * This is a convenience wrapper that calls `runWithTraceId()` using the
 * EventContext's traceId, ensuring all async descendants inherit the ID.
 */
export function runWithEventContext<T>(ctx: EventContext, fn: () => T): T {
    return runWithTraceId(ctx.traceId, fn);
}
