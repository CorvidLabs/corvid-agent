# Database — Context

## Why This Module Exists

SQLite is the single persistent data store for corvid-agent. The db module provides all database access — schema definitions, migrations, and CRUD operations for every table. It's the data foundation that every other module builds on.

## Architectural Role

The db module is **infrastructure** — it sits at the bottom of the dependency graph. Nearly every server module depends on it for state persistence. It manages connection lifecycle, schema versioning, and provides typed query functions.

## Key Design Decisions

- **SQLite over Postgres**: SQLite is embedded, zero-config, and sufficient for single-node deployments. Multi-tenant scaling would require migration to Postgres.
- **Migration-based schema**: All schema changes go through numbered migration files, ensuring reproducible database state.
- **Agent blocklist**: A dedicated blocklist table enables instant security response — blocking an agent is a single DB write that takes effect immediately.
- **Multiple spec files**: The db module has many spec files (agent-blocklist, sessions, credits, etc.) because it covers all domain tables. Each spec covers one logical grouping.

## Relationship to Other Modules

- **Every module**: The db module is the most depended-upon module in the system. Sessions, memories, schedules, permissions, webhooks, and more all store state here.
- **Memory**: The agent_memories table is the SQLite tier of the two-tier memory system.
- **Migrations**: Schema changes are applied in order at startup.
