---
module: db-escalation-queue
version: 1
status: draft
files:
  - server/db/escalation-queue.ts
db_tables:
  - escalation_queue
depends_on:
  - specs/db/schema.spec.md
---

# DB Escalation Queue

## Purpose

Provides the data-access layer for the tool-call escalation queue, enabling agents to enqueue tool invocations that require human approval, and allowing operators to approve, deny, or auto-expire pending requests.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `enqueueRequest` | `db: Database, sessionId: string, toolName: string, toolInput: Record<string, unknown>` | `EscalationRequest` | Insert a new pending escalation request; `toolInput` is JSON-serialized before storage |
| `resolveRequest` | `db: Database, id: number, resolution: 'approved' \| 'denied'` | `EscalationRequest \| null` | Resolve a pending request by setting its status and `resolved_at` timestamp; only updates if current status is `'pending'`; returns null if the row does not exist |
| `getPendingRequests` | `db: Database` | `EscalationRequest[]` | Retrieve all requests with status `'pending'`, ordered by `created_at` ascending |
| `expireOldRequests` | `db: Database, maxAgeHours?: number` | `number` | Mark all pending requests older than `maxAgeHours` (default 24) as `'expired'`; returns the count of rows updated |

### Exported Types

| Type | Description |
|------|-------------|
| `EscalationStatus` | String union: `'pending' \| 'approved' \| 'denied' \| 'expired'` |
| `EscalationRequest` | Interface with fields: `id: number`, `sessionId: string`, `toolName: string`, `toolInput: string`, `status: EscalationStatus`, `createdAt: string`, `resolvedAt: string \| null` |

## Invariants

1. New requests are always created with status `'pending'` (enforced by the DB default).
2. `resolveRequest` only transitions requests that are currently `'pending'` -- it will not re-resolve an already resolved or expired request.
3. `toolInput` is stored as a JSON string; callers pass a `Record<string, unknown>` which is serialized via `JSON.stringify`.
4. `expireOldRequests` only affects rows with status `'pending'` -- resolved requests are never expired.
5. `resolved_at` is set to `datetime('now')` at resolution/expiration time and remains NULL for pending requests.
6. The `getPendingRequests` function returns results in FIFO order (`created_at ASC`).

## Behavioral Examples

### Scenario: Enqueue and approve a tool call
- **Given** an active session `"sess-1"` and a tool call `"shell_exec"` with input `{ "command": "rm -rf /tmp/build" }`
- **When** `enqueueRequest(db, "sess-1", "shell_exec", { command: "rm -rf /tmp/build" })` is called
- **Then** a new row is inserted with status `'pending'`, `tool_input` as `'{"command":"rm -rf /tmp/build"}'`, and the returned `EscalationRequest` has a numeric `id`

### Scenario: Resolve a pending request
- **Given** a pending escalation request with `id: 42`
- **When** `resolveRequest(db, 42, 'approved')` is called
- **Then** the request's status becomes `'approved'`, `resolved_at` is set to the current timestamp, and the updated request is returned

### Scenario: Deny and re-resolve is idempotent
- **Given** an escalation request with `id: 42` already resolved as `'denied'`
- **When** `resolveRequest(db, 42, 'approved')` is called
- **Then** the UPDATE matches zero rows (WHERE `status = 'pending'` fails), the status remains `'denied'`, and the existing row is returned unchanged

### Scenario: Expire stale requests
- **Given** three pending requests: one created 25 hours ago, one created 23 hours ago, one created 1 hour ago
- **When** `expireOldRequests(db, 24)` is called
- **Then** only the 25-hour-old request is marked as `'expired'`; the function returns `1`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `resolveRequest` with non-existent ID | UPDATE matches zero rows; SELECT returns null; function returns `null` |
| `resolveRequest` on already-resolved request | UPDATE WHERE `status = 'pending'` matches zero rows; original row is returned unchanged |
| `enqueueRequest` with invalid session ID (no FK) | Row is inserted (no FK constraint on `session_id` in the schema) |
| `expireOldRequests` with no qualifying rows | Returns `0` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type, query execution |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/approval-manager` | `enqueueRequest`, `resolveRequest` (aliased as `resolveEscalation`), `getPendingRequests`, `expireOldRequests`, `EscalationRequest` type |
| `server/__tests__/escalation-queue.test.ts` | All exported functions and types (test coverage) |

## Database Tables

### escalation_queue

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-incrementing identifier |
| session_id | TEXT | NOT NULL | Session that triggered the escalation |
| tool_name | TEXT | NOT NULL | Name of the tool being escalated |
| tool_input | TEXT | NOT NULL DEFAULT '{}' | JSON-serialized tool input parameters |
| status | TEXT | DEFAULT 'pending' | Current status: pending, approved, denied, expired |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| resolved_at | TEXT | DEFAULT NULL | Timestamp when resolved or expired; NULL while pending |

**Indexes:** `idx_escalation_queue_status` on `status`, `idx_escalation_queue_session` on `session_id`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
