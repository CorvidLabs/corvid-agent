# Observability — Context

## Why This Module Exists

Debugging distributed agent systems requires understanding what happened, when, and in what order. The observability module provides structured tracing, metrics, and event correlation across all entry points — web requests, AlgoChat messages, scheduled tasks, webhooks, workflows, and councils.

## Architectural Role

Observability is **cross-cutting infrastructure** — it instruments every entry point and propagates trace context through the entire request lifecycle using AsyncLocalStorage.

## Key Design Decisions

- **OpenTelemetry-compatible**: Uses OpenTelemetry standards for distributed tracing, making it compatible with external observability platforms.
- **AsyncLocalStorage for context**: Trace context propagates automatically through async call chains without manual threading.
- **Prometheus-compatible metrics**: In-memory metrics that can be scraped by Prometheus for alerting and dashboards.
- **Event correlation**: Every significant event includes a trace ID, enabling correlation across modules.

## Relationship to Other Modules

- **Every module**: Observability instruments all entry points and can trace requests through any module.
- **Health**: Health checks may use observability metrics.
- **Performance**: Overlaps with performance metrics but at a finer granularity (per-request vs. periodic snapshots).
