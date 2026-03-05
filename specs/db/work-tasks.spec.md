---
module: work-tasks-db
version: 1
status: draft
files:
  - server/db/work-tasks.ts
db_tables:
  - work_tasks
depends_on:
  - specs/tenant/tenant.spec.md
---

# Work Tasks DB

## Purpose
Provides CRUD, query, and lifecycle operations for work tasks -- autonomous agent work units that create branches, run agent sessions, validate results, and optionally create PRs. Supports atomic creation with concurrency guards and stale task cleanup on server restart.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createWorkTask` | `db: Database, params: { agentId: string; projectId: string; description: string; source?: string; sourceId?: string; requesterInfo?: Record<string, unknown>; tenantId?: string }` | `WorkTask` | Inserts a new work task with generated UUID and default status 'pending' |
| `createWorkTaskAtomic` | `db: Database, params: { agentId: string; projectId: string; description: string; source?: string; sourceId?: string; requesterInfo?: Record<string, unknown>; tenantId?: string }` | `WorkTask \| null` | Atomically inserts a work task only if no concurrent active task (branching/running/validating) exists on the same project; returns null if blocked |
| `getWorkTask` | `db: Database, id: string, tenantId?: string` | `WorkTask \| null` | Retrieves a work task by ID with tenant ownership validation |
| `getWorkTaskBySessionId` | `db: Database, sessionId: string` | `WorkTask \| null` | Retrieves a work task by its associated session ID (no tenant filter) |
| `updateWorkTaskStatus` | `db: Database, id: string, status: WorkTaskStatus, extra?: { sessionId?: string; branchName?: string; prUrl?: string; summary?: string; error?: string; originalBranch?: string; worktreeDir?: string; iterationCount?: number }` | `void` | Updates a work task's status and optionally sets associated metadata fields; auto-sets completed_at when status is 'completed' or 'failed' |
| `cleanupStaleWorkTasks` | `db: Database` | `WorkTask[]` | Marks all active tasks (branching/running/validating) as failed with error 'Interrupted by server restart'; returns the affected tasks for branch restoration; runs in a transaction |
| `listWorkTasks` | `db: Database, agentId?: string, tenantId?: string` | `WorkTask[]` | Lists work tasks, optionally filtered by agent ID, ordered by created_at DESC |

### Exported Types
| Type | Description |
|------|-------------|
| _(none)_ | All types are imported from `shared/types/work-tasks`; `WorkTaskRow` is an internal (non-exported) interface |

## Invariants
1. Every work task has a UUID primary key generated via `crypto.randomUUID()`.
2. `createWorkTaskAtomic` uses a single INSERT...WHERE NOT EXISTS SQL statement to atomically prevent concurrent active tasks on the same project. Active statuses are: `'branching'`, `'running'`, `'validating'`.
3. `cleanupStaleWorkTasks` wraps SELECT and UPDATE in a database transaction to prevent a race condition where a task starts between the read and the status update.
4. `completed_at` is automatically set to `datetime('now')` when status transitions to `'completed'` or `'failed'`.
5. The `requester_info` column stores a JSON-serialized object; parsing failures default to an empty object `{}`.
6. The `source` field defaults to `'web'` if not specified.
7. Valid statuses are: `'pending'`, `'branching'`, `'running'`, `'validating'`, `'completed'`, `'failed'`.
8. Tenant ownership is validated via `validateTenantOwnership` before returning data in `getWorkTask`.

## Behavioral Examples
### Scenario: Creating a work task atomically when no active task exists
- **Given** no work tasks with status 'branching', 'running', or 'validating' exist for project P1
- **When** `createWorkTaskAtomic(db, { agentId: 'a1', projectId: 'P1', description: 'Fix bug' })` is called
- **Then** a new work task is inserted with status 'pending' and the WorkTask object is returned

### Scenario: Atomic creation blocked by concurrent active task
- **Given** a work task with status 'running' exists for project P1
- **When** `createWorkTaskAtomic(db, { agentId: 'a1', projectId: 'P1', description: 'Another task' })` is called
- **Then** no row is inserted and `null` is returned

### Scenario: Cleaning up stale tasks on server restart
- **Given** two work tasks exist with status 'running' and one with status 'completed'
- **When** `cleanupStaleWorkTasks(db)` is called
- **Then** the two running tasks are set to status 'failed' with error 'Interrupted by server restart' and completed_at is set; the completed task is unaffected; the two affected WorkTask objects are returned

### Scenario: Updating task status through lifecycle
- **Given** a work task exists with status 'pending'
- **When** `updateWorkTaskStatus(db, id, 'branching', { branchName: 'fix/bug-123', originalBranch: 'main' })` is called
- **Then** the task's status, branch_name, and original_branch are updated

## Error Cases
| Condition | Behavior |
|-----------|----------|
| `getWorkTask` with non-existent ID | Returns `null` |
| `getWorkTask` with wrong tenant ID | Returns `null` (tenant ownership validation fails) |
| `getWorkTaskBySessionId` with non-existent session | Returns `null` |
| `createWorkTaskAtomic` with concurrent active task on same project | Returns `null` (no insert performed) |
| `requester_info` contains invalid JSON in database | Defaults to empty object `{}` on parse |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `shared/types/work-tasks` | `WorkTask`, `WorkTaskStatus` |
| `server/tenant/types` | `DEFAULT_TENANT_ID` |
| `server/tenant/db-filter` | `withTenantFilter`, `validateTenantOwnership` |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/work/service.ts` | `createWorkTask`, `createWorkTaskAtomic`, `getWorkTask`, `getWorkTaskBySessionId`, `updateWorkTaskStatus`, `cleanupStaleWorkTasks`, `listWorkTasks` |
| `server/feedback/outcome-tracker.ts` | `listWorkTasks` |
| `server/routes/work-tasks.ts` (implied) | Work task listing and retrieval via routes |

## Database Tables
### work_tasks
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID identifier |
| agent_id | TEXT | NOT NULL, FK agents(id) | Owning agent |
| project_id | TEXT | NOT NULL, FK projects(id) | Associated project |
| session_id | TEXT | DEFAULT NULL | Agent session executing the task |
| source | TEXT | DEFAULT 'web' | Origin of the task: 'web', 'algochat', or 'agent' |
| source_id | TEXT | DEFAULT NULL | External identifier from the source (e.g. AlgoChat message ID) |
| requester_info | TEXT | DEFAULT '{}' | JSON object with requester metadata |
| description | TEXT | NOT NULL | Human-readable description of the work to do |
| branch_name | TEXT | DEFAULT NULL | Git branch created for this task |
| status | TEXT | DEFAULT 'pending' | Lifecycle status: pending, branching, running, validating, completed, failed |
| pr_url | TEXT | DEFAULT NULL | URL of the pull request created on completion |
| summary | TEXT | DEFAULT NULL | Agent-generated summary of work done |
| error | TEXT | DEFAULT NULL | Error message if task failed |
| original_branch | TEXT | DEFAULT NULL | The branch that was checked out before the task created its worktree |
| worktree_dir | TEXT | DEFAULT NULL | Path to the git worktree directory |
| iteration_count | INTEGER | DEFAULT 0 | Number of validation-retry iterations performed |
| tenant_id | TEXT | NOT NULL, DEFAULT 'default' | Multi-tenant isolation key |
| created_at | TEXT | DEFAULT datetime('now') | ISO 8601 creation timestamp |
| completed_at | TEXT | DEFAULT NULL | ISO 8601 completion timestamp (set on completed/failed) |

**Indexes:** `idx_work_tasks_agent(agent_id)`, `idx_work_tasks_status(status)`, `idx_work_tasks_session(session_id)`

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
