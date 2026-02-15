/**
 * OpenTelemetry distributed tracing setup.
 *
 * Opt-in: only active when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 * Provides auto-instrumentation for HTTP requests and manual span helpers.
 */

import { trace, context, SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api';

let _tracer: Tracer | null = null;
let _initialized = false;

/**
 * Initialize OpenTelemetry tracing if OTEL_EXPORTER_OTLP_ENDPOINT is configured.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export async function initTracing(): Promise<void> {
    if (_initialized) return;
    _initialized = true;

    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (!endpoint) return; // No-op when not configured

    try {
        const { NodeSDK } = await import('@opentelemetry/sdk-node');
        const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
        const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
        // Dynamic imports with safe extraction to avoid TypeScript complaints
        // about cross-version module shape differences
        const resourceMod = await import('@opentelemetry/resources') as Record<string, unknown>;
        const ResourceClass = resourceMod.Resource as { new (attrs: Record<string, string>): Record<string, unknown> };

        const resource = new ResourceClass({
            'service.name': process.env.OTEL_SERVICE_NAME ?? 'corvid-agent',
            'service.version': process.env.npm_package_version ?? '0.4.0',
        });

        const traceExporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });

        const sdk = new NodeSDK({
            resource: resource as unknown as import('@opentelemetry/resources').Resource,
            traceExporter,
            instrumentations: [
                getNodeAutoInstrumentations({
                    // Disable fs instrumentation to reduce noise
                    '@opentelemetry/instrumentation-fs': { enabled: false },
                }),
            ],
        });

        sdk.start();

        // Graceful shutdown
        process.on('SIGTERM', () => sdk.shutdown().catch(() => {}));

        _tracer = trace.getTracer('corvid-agent');
    } catch (err) {
        // Tracing is optional — log and continue
        console.warn('[Tracing] Failed to initialize OpenTelemetry:', err instanceof Error ? err.message : String(err));
    }
}

/** Get the tracer instance (null if tracing is not configured). */
export function getTracer(): Tracer | null {
    return _tracer;
}

/**
 * Parse a W3C traceparent header into its components.
 * Format: version-traceId-spanId-traceFlags
 * Returns null if invalid.
 */
export function parseTraceparent(header: string | null): { traceId: string; spanId: string; traceFlags: string } | null {
    if (!header) return null;
    const parts = header.split('-');
    if (parts.length !== 4) return null;
    const [_version, traceId, spanId, traceFlags] = parts;
    if (traceId.length !== 32 || spanId.length !== 16) return null;
    return { traceId, spanId, traceFlags };
}

/**
 * Generate a new random trace ID (32 hex characters).
 */
export function generateTraceId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a new random span ID (16 hex characters).
 */
export function generateSpanId(): string {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build a W3C traceparent header from components.
 */
export function buildTraceparent(traceId: string, spanId: string, traceFlags: string = '01'): string {
    return `00-${traceId}-${spanId}-${traceFlags}`;
}

export { trace, context, SpanStatusCode, type Span };
