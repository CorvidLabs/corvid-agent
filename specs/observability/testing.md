---
spec: observability.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/observability.test.ts` | Unit | `initObservability()` no-throw guarantee, `EventContext` creation, `runWithEventContext()` propagation, parent trace ID inheritance |
| `server/__tests__/observability-metrics.test.ts` | Unit | Counter/Histogram/Gauge recording, `renderMetrics()` Prometheus format, label escaping, zero-observation skip |

## Manual Testing

- [ ] Start server with `OTEL_EXPORTER_OTLP_ENDPOINT` unset — verify log says "metrics enabled" (not tracing); `getTracer()` returns null
- [ ] Start server with `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` — verify tracing enabled log; `getTracer()` returns a tracer instance
- [ ] Call `initObservability()` twice — verify second call is a no-op (no duplicate initialization logs)
- [ ] Make HTTP requests and call `GET /metrics` (as admin) — verify `http_requests_total` counter is present and incremented
- [ ] Create a session and let it complete — verify `session_duration_seconds` bucket is updated in metrics output
- [ ] Record a credit consumption event — verify `credits_consumed_total` counter increments in `renderMetrics()` output
- [ ] Trigger an endpoint rate limit rejection — verify `endpoint_rate_limit_rejections_total` counter increments
- [ ] Call `createEventContext('webhook')` inside `runWithTraceId('aaa...aaa', ...)` — verify `parentId` is set to `'aaa...aaa'`

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `initObservability()` throws internally | Error caught, logged as warning; server continues |
| OTel packages not installed (`@opentelemetry/sdk-node` missing) | `initTracing()` catches import error, logs warning, continues; `getTracer()` returns null |
| `parseTraceparent(null)` | Returns null |
| `parseTraceparent('bad-header')` | Returns null (wrong number of dash-separated parts) |
| `parseTraceparent('00-short-1234567890abcdef-01')` | Returns null (traceId not 32 chars) |
| `generateTraceId()` output length | Always exactly 32 hex characters |
| `generateSpanId()` output length | Always exactly 16 hex characters |
| `getTraceId()` called outside any ALS context | Returns `undefined` |
| `getRequestId()` called outside any ALS context | Returns `undefined` |
| `runWithTraceId()` async callback uses `await` | All async descendants inherit the trace ID |
| `createEventContext('scheduler')` with no ALS context active | `parentId` is undefined; fresh `traceId` generated |
| `renderMetrics()` with metric that has no observations | Metric is omitted from output |
| Label value containing `"` double-quote | Escaped as `\"` in Prometheus output |
| Label value containing `\` backslash | Escaped as `\\` in Prometheus output |
| `initTracing()` called multiple times | Subsequent calls are no-ops (idempotent) |
