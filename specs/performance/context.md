# Performance — Context

## Why This Module Exists

Long-running agent servers need performance trending to detect regressions and resource leaks. The performance module periodically samples system metrics (memory, database health, disk usage, uptime) and persists them for analysis.

## Architectural Role

Performance is a **monitoring service** — it collects and stores metrics on a timer for retrospective analysis. Unlike health (which monitors "is it working?"), performance focuses on "how well is it working?"

## Key Design Decisions

- **Periodic sampling**: Collects metrics at regular intervals rather than on every request. This keeps overhead low.
- **Database-stored**: Metrics are persisted to SQLite for local trend analysis without requiring external monitoring infrastructure.
- **System-level focus**: Tracks OS-level metrics (memory, disk) rather than application-level metrics (request latency). Application metrics are handled by observability.

## Relationship to Other Modules

- **Health**: Complementary — health checks system status, performance tracks system trends.
- **Improvement**: Performance data can inform improvement recommendations.
- **DB**: Stores snapshots in the `performance_metrics` table.
