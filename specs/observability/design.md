---
spec: observability.spec.md
sources:
  - server/observability/event-context.ts
  - server/observability/index.ts
  - server/observability/metrics.ts
  - server/observability/trace-context.ts
  - server/observability/tracing.ts
---

## Module Structure

`server/observability/` provides three independent subsystems that can be used together or separately:

| File | Subsystem | Description |
|------|-----------|-------------|
| `tracing.ts` | OpenTelemetry tracing | `initTracing()`, `getTracer()`, W3C traceparent helpers; OTel SDK dynamically imported |
| `trace-context.ts` | AsyncLocalStorage context | `traceContext` ALS store, `runWithTraceId()`, `getTraceId()`, `getRequestId()` |
| `event-context.ts` | Event correlation | `EventContext` type, `createEventContext()`, `runWithEventContext()`, `EventSource` union |
| `metrics.ts` | Prometheus metrics | All metric instances (counters, histograms, gauges), `renderMetrics()` |
| `index.ts` | Initialization | `initObservability()` — calls `initTracing()` and metric initialization; never throws |

## Key Subsystems

### OpenTelemetry Tracing (tracing.ts)
Opt-in: only activates when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Uses dynamic `import()` for all OTel packages so they are optional dependencies — if packages are absent, `initTracing()` catches the import error and continues. Safe to call multiple times (`initTracing()` is idempotent after first successful init).

W3C traceparent helpers:
- `generateTraceId()` → 32 hex chars
- `generateSpanId()` → 16 hex chars
- `buildTraceparent(traceId, spanId, traceFlags?)` → `"00-{traceId}-{spanId}-{flags}"` format
- `parseTraceparent(header)` → parsed object or `null` for invalid/malformed headers

### AsyncLocalStorage Context (trace-context.ts)
`traceContext` is an `AsyncLocalStorage<{ traceId?, requestId? }>` instance. `runWithTraceId()` establishes the context so all async descendants (including awaited continuations) inherit the trace ID. This enables correlation across all entry points — web requests, AlgoChat messages, scheduler runs, webhooks — without explicit parameter threading.

### EventContext (event-context.ts)
`EventContext` is an `{ traceId, parentId?, timestamp, source }` record. `createEventContext(source, existingTraceId?)` generates a new trace ID (or inherits from ALS context as `parentId`), creating a causal chain. `runWithEventContext(ctx, fn)` calls `runWithTraceId` internally to propagate the trace ID.

`EventSource` values: `'web' | 'algochat' | 'agent' | 'telegram' | 'discord' | 'scheduler' | 'webhook' | 'workflow' | 'council' | 'polling'`

### Prometheus Metrics (metrics.ts)
All metrics are in-process in-memory (no push to an external endpoint). `renderMetrics()` serializes all metrics with observations in Prometheus text exposition format. Label values are escaped (backslash + double-quote). Metrics with zero observations are skipped.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `httpRequestsTotal` | Counter | method, route, status_code | HTTP request count |
| `httpRequestDuration` | Histogram | method, route, status_code | Request latency (seconds) |
| `sessionDuration` | Histogram | (none) | Session length (1–3600s custom buckets) |
| `dbQueryDuration` | Histogram | operation | DB query latency |
| `agentMessagesTotal` | Counter | direction, status | Agent message count |
| `creditsConsumedTotal` | Counter | (none) | Total credits consumed |
| `activeSessions` | Gauge | (none) | Current active session count |
| `circuitBreakerTransitions` | Counter | from_state, to_state, agent_id | Circuit breaker state changes |
| `agentRateLimitRejections` | Counter | reason, agent_id | Rate limit / circuit breaker rejections |
| `endpointRateLimitRejections` | Counter | method, path, tier | Per-endpoint 429 responses |

## Configuration Values and Constants

| Env Var | Default | Description |
|---------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | (unset) | OTLP endpoint URL; tracing is disabled when not set |

| Constant | Description |
|----------|-------------|
| `traceContext` | Exported `AsyncLocalStorage` instance — shareable across modules |

## Related Resources

| Resource | Description |
|----------|-------------|
| `server/index.ts` | Calls `initObservability()` at startup; uses `runWithTraceId()` for HTTP requests |
| `server/algochat/agent-messenger.ts` | Uses `createEventContext` + `runWithEventContext` + `agentMessagesTotal` |
| `server/algochat/messaging-guard.ts` | Uses `circuitBreakerTransitions` + `agentRateLimitRejections` |
| `server/middleware/endpoint-rate-limit.ts` | Uses `endpointRateLimitRejections` counter |
| `server/db/credits.ts` | Uses `creditsConsumedTotal` counter |
| `server/db/audit.ts` | Uses `getTraceId()` for audit log correlation |
| `GET /metrics` | Admin-protected endpoint serving `renderMetrics()` output |
