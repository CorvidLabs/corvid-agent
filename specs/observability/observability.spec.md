---
module: observability
version: 1
status: draft
files:
  - server/observability/event-context.ts
  - server/observability/index.ts
  - server/observability/metrics.ts
  - server/observability/trace-context.ts
  - server/observability/tracing.ts
db_tables: []
depends_on:
  - specs/lib/infra.spec.md
---

# Observability

## Purpose

Provides unified observability for the corvid-agent server: distributed tracing via OpenTelemetry, AsyncLocalStorage-based trace context propagation, Prometheus-compatible in-memory metrics, and structured event correlation across all entry points (web, AlgoChat, scheduler, webhooks, workflows, councils, polling).

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `initObservability` | (none) | `Promise<void>` | Initialize all observability subsystems (tracing + metrics). Failures are logged but never crash the server. |
| `initTracing` | (none) | `Promise<void>` | Initialize OpenTelemetry tracing if `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Safe to call multiple times; subsequent calls are no-ops. |
| `getTracer` | (none) | `Tracer \| null` | Get the OpenTelemetry tracer instance, or null if tracing is not configured. |
| `parseTraceparent` | `header: string \| null` | `{ traceId: string; spanId: string; traceFlags: string } \| null` | Parse a W3C traceparent header into its components. Returns null if invalid. |
| `generateTraceId` | (none) | `string` | Generate a new random trace ID (32 hex characters). |
| `generateSpanId` | (none) | `string` | Generate a new random span ID (16 hex characters). |
| `buildTraceparent` | `traceId: string, spanId: string, traceFlags?: string` | `string` | Build a W3C traceparent header string from components (default traceFlags: '01'). |
| `getTraceId` | (none) | `string \| undefined` | Get the current trace ID from AsyncLocalStorage, or undefined if not set. |
| `getRequestId` | (none) | `string \| undefined` | Get the current request ID from AsyncLocalStorage, or undefined if not set. |
| `runWithTraceId` | `traceId: string, fn: () => T, requestId?: string` | `T` | Run a function within a trace context so all async descendants inherit the trace/request IDs. |
| `createEventContext` | `source: EventSource, existingTraceId?: string` | `EventContext` | Create an EventContext, optionally inheriting an existing traceId. Generates a new traceId if none provided or in scope. |
| `runWithEventContext` | `ctx: EventContext, fn: () => T` | `T` | Run a function within the trace context of an EventContext, ensuring all async descendants inherit the traceId. |
| `renderMetrics` | (none) | `string` | Render all metrics in Prometheus text exposition format. |

### Exported Types

| Type | Description |
|------|-------------|
| `EventSource` | Union type of event origination systems: `'web' \| 'algochat' \| 'agent' \| 'telegram' \| 'discord' \| 'scheduler' \| 'webhook' \| 'workflow' \| 'council' \| 'polling'`. |
| `EventContext` | Correlation context with `traceId` (32 hex chars), optional `parentId`, `timestamp` (epoch ms), and `source` (EventSource). |
| `TraceContextData` | AsyncLocalStorage store shape with optional `traceId` and `requestId` fields. |

Note: `Span` is re-exported as `type Span` from `@opentelemetry/api` via `tracing.ts`.

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `traceContext` | `AsyncLocalStorage<TraceContextData>` | The AsyncLocalStorage instance used for trace context propagation. |
| `httpRequestsTotal` | `Counter` | Total number of HTTP requests (labels: method, route, status_code). |
| `httpRequestDuration` | `Histogram` | HTTP request duration in seconds (labels: method, route, status_code). |
| `sessionDuration` | `Histogram` | Agent session duration in seconds (custom buckets: 1-3600s). |
| `dbQueryDuration` | `Histogram` | Database query duration in seconds (labels: operation). |
| `agentMessagesTotal` | `Counter` | Total number of agent messages (labels: direction, status). |
| `creditsConsumedTotal` | `Counter` | Total credits consumed. |
| `activeSessions` | `Gauge` | Number of currently active sessions. |
| `circuitBreakerTransitions` | `Counter` | Circuit breaker state transitions for agent messaging (labels: from_state, to_state, agent_id). |
| `agentRateLimitRejections` | `Counter` | Agent messaging rejections by circuit breaker or rate limiter (labels: reason, agent_id). |
| `endpointRateLimitRejections` | `Counter` | Per-endpoint rate limit rejections (labels: method, path, tier). |

### Re-exported from `@opentelemetry/api`

| Symbol | Description |
|--------|-------------|
| `trace` | OpenTelemetry trace API. |
| `context` | OpenTelemetry context API. |
| `SpanStatusCode` | Enum for span status codes. |

## Invariants

1. `initTracing()` is idempotent -- subsequent calls after the first are no-ops.
2. `initObservability()` never throws; all errors are caught, logged, and swallowed.
3. Tracing is opt-in: only active when `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable is set.
4. Metrics collection is always active in-memory regardless of tracing configuration.
5. `generateTraceId()` always returns exactly 32 hex characters.
6. `generateSpanId()` always returns exactly 16 hex characters.
7. `parseTraceparent()` returns null for any header that does not conform to the W3C traceparent format (4 dash-separated parts, 32-char traceId, 16-char spanId).
8. `runWithTraceId()` establishes AsyncLocalStorage context that is inherited by all async descendants of the callback.
9. `createEventContext()` will use an existing traceId from AsyncLocalStorage as `parentId` when a new or different traceId is provided.
10. Metric label values are escaped (backslashes and double-quotes) before rendering to Prometheus format.
11. `renderMetrics()` skips metrics with no recorded observations.

## Behavioral Examples

### Scenario: Initialize observability with tracing endpoint configured
- **Given** `OTEL_EXPORTER_OTLP_ENDPOINT` is set to `http://localhost:4318`
- **When** `initObservability()` is called
- **Then** OpenTelemetry NodeSDK starts with an OTLP trace exporter, the tracer is available via `getTracer()`, and a log line confirms tracing is enabled.

### Scenario: Initialize observability without tracing endpoint
- **Given** `OTEL_EXPORTER_OTLP_ENDPOINT` is not set
- **When** `initObservability()` is called
- **Then** tracing initialization is a no-op, `getTracer()` returns null, metrics are still available, and a log line confirms metrics are enabled.

### Scenario: Creating and using an EventContext
- **Given** no active trace context exists
- **When** `createEventContext('webhook')` is called
- **Then** a new `EventContext` is returned with a freshly generated 32-char `traceId`, no `parentId`, and `source` set to `'webhook'`.

### Scenario: Nested event context inherits parent traceId
- **Given** `runWithTraceId('aaa...aaa', ...)` is active
- **When** `createEventContext('agent', 'bbb...bbb')` is called inside the callback
- **Then** the returned `EventContext` has `traceId` = `'bbb...bbb'` and `parentId` = `'aaa...aaa'`.

### Scenario: Recording and rendering HTTP metrics
- **Given** `httpRequestsTotal` and `httpRequestDuration` are initialized
- **When** `httpRequestsTotal.inc({ method: 'GET', route: '/api/health', status_code: '200' })` and `httpRequestDuration.observe({ method: 'GET', route: '/api/health', status_code: '200' }, 0.042)` are called
- **Then** `renderMetrics()` returns Prometheus text containing `http_requests_total{method="GET",route="/api/health",status_code="200"} 1` and corresponding histogram buckets.

## Error Cases

| Condition | Behavior |
|-----------|----------|
| OpenTelemetry SDK import fails (packages not installed) | `initTracing()` catches the error, logs a warning, and continues. `getTracer()` returns null. |
| `initObservability()` encounters any error | Error is caught, logged as a non-fatal warning. Server continues. |
| `parseTraceparent()` receives null or malformed header | Returns null. |
| `parseTraceparent()` receives header with wrong number of parts | Returns null. |
| `parseTraceparent()` receives header with wrong-length traceId or spanId | Returns null. |
| `getTraceId()` called outside any trace context | Returns undefined. |
| `getRequestId()` called outside any trace context | Returns undefined. |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `@opentelemetry/api` | `trace`, `context`, `SpanStatusCode`, `Span`, `Tracer` types |
| `@opentelemetry/sdk-node` | `NodeSDK` (dynamic import, optional) |
| `@opentelemetry/exporter-trace-otlp-http` | `OTLPTraceExporter` (dynamic import, optional) |
| `@opentelemetry/auto-instrumentations-node` | `getNodeAutoInstrumentations` (dynamic import, optional) |
| `@opentelemetry/resources` | `Resource` (dynamic import, optional) |
| `node:async_hooks` | `AsyncLocalStorage` |
| lib (logger) | `createLogger` for internal logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| server/index.ts | `initObservability`, `initTracing`, `getTracer`, `parseTraceparent`, `generateTraceId`, `generateSpanId`, `buildTraceparent`, `renderMetrics`, metric instances, `runWithTraceId` |
| server/db/credits.ts | `creditsConsumedTotal` |
| server/db/audit.ts | `getTraceId` |
| server/middleware/endpoint-rate-limit.ts | `endpointRateLimitRejections` |
| server/algochat/messaging-guard.ts | `circuitBreakerTransitions`, `agentRateLimitRejections` |
| server/algochat/agent-messenger.ts | `createEventContext`, `runWithEventContext`, `agentMessagesTotal` |
| server/algochat/on-chain-transactor.ts | `getTraceId` |
| server/algochat/message-router.ts | `createEventContext`, `runWithEventContext` |
| server/scheduler/service.ts | `createEventContext`, `runWithEventContext` |
| server/webhooks/service.ts | `createEventContext`, `runWithEventContext` |
| server/polling/service.ts | `createEventContext`, `runWithEventContext` |
| server/workflow/service.ts | `createEventContext`, `runWithEventContext` |
| server/councils/discussion.ts | `createEventContext`, `runWithEventContext` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
