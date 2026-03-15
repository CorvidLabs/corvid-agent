---
module: session-metrics-db
version: 1
status: active
files:
  - server/db/session-metrics.ts
  - server/db/migrations/087_session_metrics.ts
db_tables:
  - session_metrics
depends_on:
  - specs/db/sessions.spec.md
---

# Session Metrics DB

## Purpose

Persists structured tool-chain analytics collected during direct-process execution. Enables observability into session quality, model performance, stall patterns, and nudge effectiveness. Data powers the analytics dashboard and feeds future model evaluation pipelines.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `insertSessionMetrics` | `(db: Database, input: SessionMetricsInput)` | `SessionMetrics` | Insert a metrics row for a completed session turn |
| `getSessionMetrics` | `(db: Database, sessionId: string)` | `SessionMetrics[]` | Get all metrics rows for a session, ordered by `created_at ASC` |
| `getMetricsAggregate` | `(db: Database, options?: { model?, tier?, days? })` | `MetricsAggregate` | Compute aggregate statistics with optional filters |
| `listRecentMetrics` | `(db: Database, limit?: number)` | `SessionMetrics[]` | List most recent metrics rows (default limit 20) |

### Exported Interfaces

| Interface | Description |
|-----------|-------------|
| `SessionMetricsInput` | Input shape for `insertSessionMetrics` |
| `SessionMetrics` | Domain object returned by all queries |
| `SessionMetricsRow` | Raw SQLite row shape |

## Invariants

1. **Session FK**: Every metrics row references a valid session via `session_id`
2. **Stall consistency**: `stall_detected` is `true` iff `stall_type` is non-null and `termination_reason` starts with `stall_`
3. **Termination values**: `termination_reason` is one of: `normal`, `stall_repeat`, `stall_same_tool`, `max_iterations`, `abort`, `error`
4. **Non-negative counts**: All count fields (`total_iterations`, `tool_call_count`, etc.) are non-negative integers
5. **Multiple per session**: A session may have multiple metrics rows (one per user-turn/runLoop invocation)

## Behavioral Examples

### Scenario: Insert and retrieve metrics

- **Given** a valid session ID
- **When** `insertSessionMetrics(db, { sessionId, model: 'llama3.1:70b', ... })` is called
- **Then** a row is inserted and the returned object has a positive `id` and correct field mapping

### Scenario: Aggregate with filters

- **Given** 3 metrics rows: 2 for model "alpha", 1 for model "beta"
- **When** `getMetricsAggregate(db, { model: 'alpha' })` is called
- **Then** `totalSessions` is 2, and averages reflect only the "alpha" rows

### Scenario: Stall rate computation

- **Given** 4 metrics rows, 1 with `stall_detected = true`
- **When** `getMetricsAggregate(db)` is called
- **Then** `stallRate` is 0.25

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getSessionMetrics` with nonexistent session | Returns empty array |
| `getMetricsAggregate` with no matching data | Returns zeroes for all fields, empty maps |
| `insertSessionMetrics` with invalid session FK | Throws SQLite foreign key error |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `insertSessionMetrics` (persists metrics on result event) |
| `server/routes/analytics.ts` | `getMetricsAggregate`, `getSessionMetrics`, `listRecentMetrics` |

## Database Tables

### session_metrics

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-incrementing ID |
| session_id | TEXT | NOT NULL, FK sessions(id) ON DELETE CASCADE | Parent session |
| model | TEXT | NOT NULL DEFAULT '' | Model identifier used |
| tier | TEXT | NOT NULL DEFAULT '' | Agent tier (high/standard/limited) |
| total_iterations | INTEGER | NOT NULL DEFAULT 0 | Total loop iterations |
| tool_call_count | INTEGER | NOT NULL DEFAULT 0 | Total individual tool calls |
| max_chain_depth | INTEGER | NOT NULL DEFAULT 0 | Longest unbroken tool-call sequence |
| nudge_count | INTEGER | NOT NULL DEFAULT 0 | Standard nudges issued |
| mid_chain_nudge_count | INTEGER | NOT NULL DEFAULT 0 | Hallucination correction nudges |
| exploration_drift_count | INTEGER | NOT NULL DEFAULT 0 | Times exploration drift was triggered |
| stall_detected | INTEGER | NOT NULL DEFAULT 0 | Whether a stall was detected (0/1) |
| stall_type | TEXT | nullable | Type of stall: repeat, same_tool |
| termination_reason | TEXT | NOT NULL DEFAULT 'normal' | How the loop ended |
| duration_ms | INTEGER | NOT NULL DEFAULT 0 | Wall-clock duration of the loop |
| needs_summary | INTEGER | NOT NULL DEFAULT 0 | Whether a summary epilogue was needed |
| created_at | TEXT | DEFAULT datetime('now') | When metrics were recorded |

## Configuration

No environment variables. This module is a pure data layer.

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | corvid-agent | Initial spec (#1022) |
