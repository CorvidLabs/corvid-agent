/**
 * Unified observability initialization.
 *
 * Bootstraps OpenTelemetry tracing and metrics. All features are opt-in:
 * - Tracing: requires OTEL_EXPORTER_OTLP_ENDPOINT
 * - Metrics: always collected in-memory, exposed via /metrics endpoint
 */

export { initTracing, getTracer, parseTraceparent, generateTraceId, generateSpanId, buildTraceparent } from './tracing';
export {
    renderMetrics,
    httpRequestsTotal,
    httpRequestDuration,
    sessionDuration,
    dbQueryDuration,
    agentMessagesTotal,
    creditsConsumedTotal,
    activeSessions,
} from './metrics';
export { traceContext, getTraceId, runWithTraceId } from './trace-context';
export { type EventContext, type EventSource, createEventContext, runWithEventContext } from './event-context';

import { initTracing } from './tracing';
import { createLogger } from '../lib/logger';

const log = createLogger('Observability');

/**
 * Initialize all observability subsystems.
 * Safe to call at startup — failures are logged but never crash the server.
 */
export async function initObservability(): Promise<void> {
    try {
        await initTracing();
        log.info('Observability initialized', {
            tracing: !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
            metrics: true,
        });
    } catch (err) {
        log.warn('Observability init failed (non-fatal)', {
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
