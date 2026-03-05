---
module: schedules
version: 1
status: draft
files:
  - server/db/schedules.ts
db_tables:
  - agent_schedules
  - schedule_executions
depends_on: []
---

# Schedules

## Purpose
Provides full CRUD and query operations for agent schedules (cron-based and event-triggered) and their execution logs, including multi-tenant filtering, event-based schedule lookup, approval resolution, and paginated filtered queries.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createSchedule` | `db: Database, input: CreateScheduleInput, tenantId?: string` | `AgentSchedule` | Creates a new schedule with a random UUID. Defaults tenantId to DEFAULT_TENANT_ID. Returns the created schedule. |
| `getSchedule` | `db: Database, id: string, tenantId?: string` | `AgentSchedule \| null` | Retrieves a single schedule by ID. Validates tenant ownership if tenantId is not default. |
| `listSchedules` | `db: Database, agentId?: string, tenantId?: string` | `AgentSchedule[]` | Lists schedules optionally filtered by agent ID. Ordered by cron hour ascending (non-cron schedules sorted last). Applies tenant filter. |
| `listActiveSchedules` | `db: Database` | `AgentSchedule[]` | Lists all schedules with status 'active', ordered by next_run_at ascending. No tenant filter. |
| `listDueSchedules` | `db: Database` | `AgentSchedule[]` | Lists active schedules whose next_run_at is at or before the current time. Used by the scheduler tick loop. |
| `updateSchedule` | `db: Database, id: string, input: UpdateScheduleInput, tenantId?: string` | `AgentSchedule \| null` | Partial update of a schedule. Only provided fields are modified. Returns null if schedule not found or tenant mismatch. |
| `updateScheduleNextRun` | `db: Database, id: string, nextRunAt: string \| null` | `void` | Sets the next_run_at timestamp for a schedule. |
| `updateScheduleLastRun` | `db: Database, id: string` | `void` | Sets last_run_at to now and increments execution_count by 1. |
| `deleteSchedule` | `db: Database, id: string, tenantId?: string` | `boolean` | Deletes a schedule by ID. Validates tenant ownership. Returns true if deleted. |
| `findSchedulesForEvent` | `db: Database, source: 'github_webhook' \| 'github_poll', event: string, repo?: string` | `AgentSchedule[]` | Finds active schedules whose trigger_events match the given source, event, and optional repo. |
| `createExecution` | `db: Database, scheduleId: string, agentId: string, actionType: ScheduleActionType, actionInput: Record<string, unknown>, configSnapshot?: Record<string, unknown>` | `ScheduleExecution` | Creates a new execution record for a schedule. Returns the created execution. |
| `getExecution` | `db: Database, id: string, tenantId?: string` | `ScheduleExecution \| null` | Retrieves a single execution by ID. Validates tenant ownership if not default. |
| `listExecutions` | `db: Database, scheduleId?: string, limit?: number, tenantId?: string` | `ScheduleExecution[]` | Lists executions optionally filtered by schedule ID, ordered by started_at DESC. Default limit 50. |
| `listExecutionsFiltered` | `db: Database, opts: ExecutionFilterOpts` | `{ executions: ScheduleExecution[]; total: number }` | Filtered, paginated execution query. Supports filtering by scheduleId, status, actionType, since, until with limit/offset. |
| `updateExecutionStatus` | `db: Database, id: string, status: ScheduleExecutionStatus, extras?: { result?: string; sessionId?: string; workTaskId?: string; costUsd?: number }` | `void` | Updates execution status and optional extra fields. Auto-sets completed_at for terminal statuses (completed, failed, denied, cancelled). |
| `resolveScheduleApproval` | `db: Database, executionId: string, approved: boolean` | `ScheduleExecution \| null` | Resolves an execution in 'awaiting_approval' status to either 'approved' or 'denied'. Returns null if execution not found or not awaiting approval. |

### Exported Types
| Type | Description |
|------|-------------|
| `ExecutionFilterOpts` | Options interface for `listExecutionsFiltered`: `scheduleId?`, `status?`, `actionType?`, `since?`, `until?`, `limit?`, `offset?` |

## Imported Types (from `shared/types/schedules`)

| Type | Description |
|------|-------------|
| `AgentSchedule` | Full schedule record with camelCase fields |
| `ScheduleExecution` | Execution log record |
| `CreateScheduleInput` | Input for creating a schedule |
| `UpdateScheduleInput` | Partial input for updating a schedule |
| `ScheduleAction` | Action definition with type, repos, description, etc. |
| `ScheduleApprovalPolicy` | `'auto' \| 'owner_approve' \| 'council_approve'` |
| `ScheduleStatus` | `'active' \| 'paused' \| 'completed' \| 'failed'` |
| `ScheduleExecutionStatus` | `'running' \| 'completed' \| 'failed' \| 'cancelled' \| 'awaiting_approval' \| 'approved' \| 'denied'` |
| `ScheduleActionType` | Union of action type strings (star_repo, work_task, review_prs, etc.) |
| `ScheduleTriggerEvent` | Event trigger definition with source, event, and optional repo |

## Invariants
1. All schedule IDs and execution IDs are generated via `crypto.randomUUID()`.
2. `createSchedule` always re-reads the record via `getSchedule` after insert to return the canonical row.
3. Tenant ownership is validated for get/update/delete operations when tenantId differs from DEFAULT_TENANT_ID.
4. `listSchedules` orders by extracted cron hour (non-cron schedules sorted last).
5. `updateSchedule` is a partial update: only fields present in the input are modified; omitted fields are unchanged.
6. `updateScheduleLastRun` atomically increments `execution_count` and sets `last_run_at`.
7. `findSchedulesForEvent` performs in-memory filtering after loading all active schedules with trigger_events.
8. `updateExecutionStatus` automatically sets `completed_at` for terminal statuses: `completed`, `failed`, `denied`, `cancelled`.
9. `resolveScheduleApproval` only operates on executions with status `'awaiting_approval'`; returns null otherwise.
10. JSON columns (`actions`, `trigger_events`, `action_input`, `config_snapshot`) are serialized/deserialized via `JSON.stringify`/`JSON.parse`.

## Behavioral Examples
### Scenario: Create and retrieve a schedule
- **Given** valid CreateScheduleInput with agentId "agent-1", name "Daily PR Review"
- **When** `createSchedule(db, input)` is called
- **Then** a new row is inserted into agent_schedules with a UUID and the schedule is returned with all fields populated

### Scenario: List due schedules for scheduler tick
- **Given** two active schedules exist, one with next_run_at in the past and one in the future
- **When** `listDueSchedules(db)` is called
- **Then** only the schedule with next_run_at <= now is returned

### Scenario: Event-triggered schedule lookup
- **Given** a schedule with trigger_events containing `{ source: 'github_webhook', event: 'push', repo: 'org/repo' }`
- **When** `findSchedulesForEvent(db, 'github_webhook', 'push', 'org/repo')` is called
- **Then** the matching schedule is returned

### Scenario: Approve an execution
- **Given** an execution exists with status 'awaiting_approval'
- **When** `resolveScheduleApproval(db, executionId, true)` is called
- **Then** the execution status changes to 'approved' with result "Approved by owner"

### Scenario: Filtered execution listing
- **Given** 100 executions exist, 30 with status 'completed'
- **When** `listExecutionsFiltered(db, { status: 'completed', limit: 10, offset: 0 })` is called
- **Then** the first 10 completed executions are returned with total = 30

## Error Cases
| Condition | Behavior |
|-----------|----------|
| Schedule ID not found | `getSchedule` returns `null`; `updateSchedule` returns `null`; `deleteSchedule` returns `false` |
| Tenant ownership mismatch | `getSchedule`, `getExecution` return `null`; `deleteSchedule` returns `false` |
| Resolve approval on non-awaiting execution | `resolveScheduleApproval` returns `null` |
| Empty update input | `updateSchedule` returns the existing schedule unchanged |
| Database constraint violation (e.g. missing agent FK) | Throws native bun:sqlite error |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `shared/types/schedules` | All schedule-related types (AgentSchedule, ScheduleExecution, CreateScheduleInput, etc.) |
| `server/db/types` | `queryCount` helper for paginated count queries |
| `server/tenant/types` | `DEFAULT_TENANT_ID` constant |
| `server/tenant/db-filter` | `withTenantFilter`, `validateTenantOwnership` for multi-tenant isolation |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/routes/schedules.ts` (likely) | API endpoints for schedule CRUD and execution listing |
| Scheduler tick service (likely) | `listDueSchedules`, `createExecution`, `updateScheduleLastRun`, `updateScheduleNextRun` |
| Event handler / webhook processor (likely) | `findSchedulesForEvent` for event-triggered schedule dispatch |
| Approval routes (likely) | `resolveScheduleApproval` for owner/council approval flow |

## Database Tables
### agent_schedules
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID identifier |
| `agent_id` | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | Owning agent |
| `name` | TEXT | NOT NULL | Human-readable schedule name |
| `description` | TEXT | DEFAULT '' | Optional description |
| `cron_expression` | TEXT | DEFAULT NULL | Cron expression (e.g. "0 9 * * *") |
| `interval_ms` | INTEGER | DEFAULT NULL | Alternative: interval in milliseconds |
| `actions` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of ScheduleAction objects |
| `approval_policy` | TEXT | DEFAULT 'owner_approve' | 'auto', 'owner_approve', or 'council_approve' |
| `status` | TEXT | DEFAULT 'active' | 'active', 'paused', 'completed', 'failed' |
| `max_executions` | INTEGER | DEFAULT NULL | Optional cap on total executions |
| `execution_count` | INTEGER | DEFAULT 0 | Running count of executions |
| `max_budget_per_run` | REAL | DEFAULT NULL | Optional cost cap per execution in USD |
| `notify_address` | TEXT | DEFAULT NULL | Address for notifications (added in migration) |
| `trigger_events` | TEXT | DEFAULT NULL | JSON array of ScheduleTriggerEvent objects (added in migration) |
| `tenant_id` | TEXT | NOT NULL, DEFAULT 'default' | Multi-tenant isolation (added in migration) |
| `last_run_at` | TEXT | DEFAULT NULL | Timestamp of last execution |
| `next_run_at` | TEXT | DEFAULT NULL | Computed next scheduled run time |
| `created_at` | TEXT | DEFAULT (datetime('now')) | Row creation timestamp |
| `updated_at` | TEXT | DEFAULT (datetime('now')) | Last update timestamp |

**Indexes:** `idx_agent_schedules_agent(agent_id)`, `idx_agent_schedules_status(status)`, `idx_agent_schedules_next_run(next_run_at)`

### schedule_executions
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID identifier |
| `schedule_id` | TEXT | NOT NULL, FK agent_schedules(id) ON DELETE CASCADE | Parent schedule |
| `agent_id` | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | Executing agent |
| `status` | TEXT | DEFAULT 'running' | Execution status (running, completed, failed, cancelled, awaiting_approval, approved, denied) |
| `action_type` | TEXT | NOT NULL | The ScheduleActionType being executed |
| `action_input` | TEXT | DEFAULT '{}' | JSON-serialized action input parameters |
| `result` | TEXT | DEFAULT NULL | Execution result text or error message |
| `session_id` | TEXT | DEFAULT NULL | Associated agent session ID if applicable |
| `work_task_id` | TEXT | DEFAULT NULL | Associated work task ID if applicable |
| `cost_usd` | REAL | DEFAULT 0 | Cost of this execution in USD |
| `config_snapshot` | TEXT | DEFAULT NULL | JSON snapshot of config at execution time (added in migration 25) |
| `started_at` | TEXT | DEFAULT (datetime('now')) | Execution start timestamp |
| `completed_at` | TEXT | DEFAULT NULL | Execution completion timestamp |

**Indexes:** `idx_schedule_executions_schedule(schedule_id)`, `idx_schedule_executions_status(status)`

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
