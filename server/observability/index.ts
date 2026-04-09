/**
 * Unified observability initialization.
 *
 * Bootstraps OpenTelemetry tracing and metrics. All features are opt-in:
 * - Tracing: requires OTEL_EXPORTER_OTLP_ENDPOINT
 * - Metrics: always collected in-memory, exposed via /metrics endpoint
 */

export { createEventContext, type EventContext, type EventSource, runWithEventContext } from './event-context';
export {
  activeSessions,
  agentMessagesTotal,
  creditsConsumedTotal,
  dbQueryDuration,
  httpRequestDuration,
  httpRequestsTotal,
  renderMetrics,
  sessionDuration,
} from './metrics';
export { getTraceId, runWithTraceId, traceContext } from './trace-context';
export { buildTraceparent, generateSpanId, generateTraceId, getTracer, initTracing, parseTraceparent } from './tracing';

import { createLogger } from '../lib/logger';
import { initTracing } from './tracing';

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
