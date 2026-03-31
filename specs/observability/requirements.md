---
spec: observability.spec.md
---

## User Stories

- As a platform administrator, I want Prometheus-compatible metrics exposed from the server so that I can monitor HTTP request rates, latencies, active sessions, and credit consumption in Grafana
- As a platform administrator, I want optional OpenTelemetry distributed tracing so that I can trace requests across agent sessions, webhooks, and service boundaries
- As an agent developer, I want AsyncLocalStorage-based trace context propagation so that log entries and database operations within a request automatically inherit the trace ID
- As a platform administrator, I want structured event correlation across all entry points (web, AlgoChat, scheduler, webhooks, workflows, councils, polling) so that I can trace the full lifecycle of an agent action
- As an agent operator, I want observability initialization to never crash the server so that a misconfigured OTLP endpoint does not prevent startup

## Acceptance Criteria

- `initObservability()` never throws; all errors are caught, logged, and swallowed
- `initTracing()` is idempotent; subsequent calls after the first are no-ops
- Tracing is opt-in: only active when `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable is set; `getTracer()` returns null when tracing is not configured
- Metrics collection is always active in-memory regardless of tracing configuration
- `renderMetrics()` returns Prometheus text exposition format with properly escaped label values (backslashes and double-quotes); metrics with no recorded observations are omitted
- `httpRequestsTotal` counter tracks total HTTP requests with labels: method, route, status_code
- `httpRequestDuration` histogram tracks request duration in seconds with labels: method, route, status_code
- `sessionDuration` histogram uses custom buckets (1-3600s) for agent session duration
- `dbQueryDuration` histogram tracks database query duration with operation label
- `activeSessions` gauge reflects the current number of active sessions
- `creditsConsumedTotal` counter tracks total credits consumed
- `circuitBreakerTransitions` counter tracks agent messaging circuit breaker state changes with labels: from_state, to_state, agent_id
- `agentRateLimitRejections` counter tracks messaging rejections with labels: reason, agent_id
- `endpointRateLimitRejections` counter tracks per-endpoint rate limit rejections with labels: method, path, tier
- `generateTraceId()` always returns exactly 32 hex characters; `generateSpanId()` always returns exactly 16 hex characters
- `parseTraceparent()` returns null for any header that does not conform to W3C traceparent format (4 dash-separated parts with correct field lengths)
- `runWithTraceId()` establishes AsyncLocalStorage context inherited by all async descendants; `getTraceId()` and `getRequestId()` return the values set by the enclosing `runWithTraceId()` call
- `createEventContext()` generates a new traceId if none is provided, and sets `parentId` to the existing in-scope traceId when a different traceId is supplied
- `runWithEventContext()` runs the callback within the trace context of an `EventContext` so that downstream calls inherit the traceId
- `EventSource` type covers all entry points: web, algochat, agent, telegram, discord, scheduler, webhook, workflow, council, polling

## Constraints

- OpenTelemetry SDK packages (`@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, etc.) are optional dynamic imports; missing packages are handled gracefully
- Metric rendering must conform to Prometheus text exposition format for compatibility with standard scrapers
- AsyncLocalStorage is the sole mechanism for trace context propagation; no thread-local or global state
- `initObservability()` must complete quickly at startup; tracing initialization should not block the server listen call

## Out of Scope

- Log aggregation or structured log shipping (logger is a separate module)
- Custom metric dashboards or alerting rules
- Span sampling or tail-based sampling configuration
- Metric persistence to disk or remote storage (metrics are in-memory only)
- Browser-side Real User Monitoring (RUM) or client-side tracing
- Jaeger or Zipkin native protocol support (OTLP only)
