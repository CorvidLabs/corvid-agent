---
module: audit
version: 1
status: draft
files:
  - server/db/audit.ts
db_tables:
  - audit_log
depends_on: []
---

# Audit

## Purpose
Provides an immutable, append-only audit log for security and compliance. All significant system actions (credit changes, schedule operations, agent lifecycle, authentication events, etc.) are recorded with actor, resource, trace context, and IP address metadata.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `recordAudit` | `db: Database, action: AuditAction, actor: string, resourceType: string, resourceId?: string \| null, detail?: string \| null, traceId?: string \| null, ipAddress?: string \| null` | `void` | Inserts a single audit log entry; automatically resolves traceId from AsyncLocalStorage if not provided; never throws (logs error and continues) |
| `queryAuditLog` | `db: Database, options?: AuditQueryOptions` | `{ entries: AuditEntry[]; total: number }` | Queries audit log with optional filters and pagination; returns matching entries and total count |

### Exported Types
| Type | Description |
|------|-------------|
| `AuditAction` | Union of 28 string literals representing all auditable actions (e.g., `'credit_grant'`, `'credit_deduction'`, `'schedule_create'`, `'agent_message_send'`, `'auth_login'`, `'auth_failed'`, etc.) |
| `AuditEntry` | `{ id: number; timestamp: string; action: AuditAction; actor: string; resourceType: string; resourceId: string \| null; detail: string \| null; traceId: string \| null; ipAddress: string \| null }` |
| `AuditQueryOptions` | `{ action?: string; actor?: string; resourceType?: string; startDate?: string; endDate?: string; offset?: number; limit?: number }` |

## Invariants
1. The `audit_log` table is append-only: no UPDATE or DELETE operations are ever performed.
2. `recordAudit` must never throw or crash the caller. On failure, it logs the error and returns silently.
3. If no `traceId` is provided to `recordAudit`, it attempts to resolve one from `getTraceId()` (AsyncLocalStorage-based trace context).
4. `queryAuditLog` caps the page size at 500 rows (`Math.min(options.limit ?? 50, 500)`).
5. Results from `queryAuditLog` are ordered by `id DESC` (newest first).
6. All filter parameters in `AuditQueryOptions` are optional; omitting all yields an unfiltered query.

## Behavioral Examples
### Scenario: Recording a credit grant
- **Given** a valid database connection
- **When** `recordAudit(db, 'credit_grant', 'admin@example.com', 'credits', 'user-123', 'Granted 100 credits')` is called
- **Then** a new row is inserted into `audit_log` with the provided values and a resolved trace ID

### Scenario: Recording fails gracefully
- **Given** the database is in a read-only state or the connection is broken
- **When** `recordAudit(db, 'auth_login', 'user@example.com', 'session', 'sess-1')` is called
- **Then** the error is caught and logged via `createLogger('Audit')`, and no exception propagates to the caller

### Scenario: Querying with filters and pagination
- **Given** the audit log contains 200 entries for action `'agent_create'`
- **When** `queryAuditLog(db, { action: 'agent_create', limit: 20, offset: 40 })` is called
- **Then** the result contains up to 20 entries starting from offset 40, with `total` reflecting the full 200 matching rows

### Scenario: Querying with date range
- **Given** audit entries spanning multiple days
- **When** `queryAuditLog(db, { startDate: '2026-03-01', endDate: '2026-03-03' })` is called
- **Then** only entries with `timestamp` between those dates (inclusive) are returned

## Error Cases
| Condition | Behavior |
|-----------|----------|
| `recordAudit` encounters a database error | Error is caught and logged; function returns normally without throwing |
| `queryAuditLog` with limit > 500 | Clamped to 500 |
| `queryAuditLog` with no matching rows | Returns `{ entries: [], total: 0 }` |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type for all DB operations |
| `db/types` | `queryCount` for counting matching rows in pagination |
| `observability/trace-context` | `getTraceId()` to auto-resolve trace ID from AsyncLocalStorage |
| `lib/logger` | `createLogger('Audit')` for structured error logging |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/routes/audit.ts` | `queryAuditLog` for the audit log API endpoint |
| `server/db/credits.ts` | `recordAudit` for credit grant/deduction events |
| `server/routes/sessions.ts` | `recordAudit` for session lifecycle events |
| `server/routes/agents.ts` | `recordAudit` for agent CRUD events |
| `server/routes/settings.ts` | `recordAudit` for config change events |
| `server/routes/webhooks.ts` | `recordAudit` for webhook register/delete events |
| `server/routes/tenants.ts` | `recordAudit` for tenant and member events |
| `server/scheduler/service.ts` | `recordAudit` for schedule execution events |
| `server/work/service.ts` | `recordAudit` for work task events |
| `server/algochat/message-router.ts` | `recordAudit` for message and injection-blocked events |
| `server/algochat/agent-messenger.ts` | `recordAudit` for agent message send events |
| `server/algochat/psk.ts` | `recordAudit` for PSK rotation and drift alerts |
| `server/lib/key-rotation.ts` | `recordAudit` for key rotation events |
| `server/marketplace/escrow.ts` | `recordAudit` for escrow transaction events |
| `server/discord/bridge.ts` | `recordAudit` for Discord bridge events |
| `server/telegram/bridge.ts` | `recordAudit` for Telegram bridge events |

## Database Tables
### audit_log
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-incrementing unique identifier |
| `timestamp` | TEXT | NOT NULL, DEFAULT datetime('now') | ISO-8601 timestamp of when the event occurred |
| `action` | TEXT | NOT NULL | The audit action type (must match an `AuditAction` value) |
| `actor` | TEXT | NOT NULL | Identifier of who performed the action (email, system name, wallet address) |
| `resource_type` | TEXT | NOT NULL | Category of the affected resource (e.g., 'credits', 'session', 'agent') |
| `resource_id` | TEXT | | Identifier of the specific resource affected |
| `detail` | TEXT | | Free-form detail string with additional context |
| `trace_id` | TEXT | | Distributed trace ID for correlation with logs and traces |
| `ip_address` | TEXT | | IP address of the request originator |

### Indexes
| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_audit_log_action` | `action` | Fast filtering by action type |
| `idx_audit_log_timestamp` | `timestamp` | Fast date-range queries |
| `idx_audit_log_trace_id` | `trace_id` | Fast trace correlation lookups |

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
