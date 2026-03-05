---
module: repo-locks-db
version: 1
status: draft
files:
  - server/db/repo-locks.ts
db_tables:
  - repo_locks
depends_on: []
---

# Repo Locks DB

## Purpose

Provides a distributed locking mechanism to prevent concurrent schedule executions from working on the same repository simultaneously. Locks are keyed on GitHub repo identifier (e.g. `CorvidLabs/corvid-agent`) and auto-expire after a configurable TTL to prevent deadlocks. Also provides recent activity queries to help schedules avoid duplicate work.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `acquireRepoLock` | `(db: Database, repo: string, executionId: string, scheduleId: string, actionType: string, ttlMs?: number)` | `boolean` | Attempt to acquire a lock on a repo. Cleans expired locks first, then performs an atomic `INSERT OR IGNORE`. Returns `true` if acquired, `false` if already locked. Default TTL is 30 minutes |
| `releaseRepoLock` | `(db: Database, repo: string, executionId: string)` | `boolean` | Release a specific lock. Only the execution that acquired it can release it (matched by both `repo` and `execution_id`). Returns `true` if released, `false` if no matching lock |
| `releaseAllLocks` | `(db: Database, executionId: string)` | `number` | Release all locks held by a specific execution. Returns the count of released locks |
| `getRepoLock` | `(db: Database, repo: string)` | `RepoLock \| null` | Get the current lock on a repo, if any. Does not clean expired locks first |
| `listRepoLocks` | `(db: Database)` | `RepoLock[]` | List all active locks ordered by `locked_at ASC`. Cleans expired locks before returning |
| `cleanExpiredLocks` | `(db: Database)` | `number` | Remove all locks whose `expires_at` is in the past. Returns the count of removed locks |
| `getRecentRepoActivity` | `(db: Database, repo: string, windowHours?: number)` | `{ executions: RecentExecution[]; workTasks: RecentWorkTask[] }` | Query recent schedule executions and work tasks for a given repo within a time window (default 24 hours). Returns up to 20 of each, ordered by most recent first |

### Exported Types

| Type | Description |
|------|-------------|
| `RepoLock` | Lock record with `repo`, `executionId`, `scheduleId`, `actionType`, `lockedAt`, `expiresAt` fields (camelCase) |
| `RecentExecution` | Summary of a recent schedule execution: `id`, `schedule_id`, `action_type`, `status`, `result`, `started_at` (snake_case, raw DB row) |
| `RecentWorkTask` | Summary of a recent work task: `id`, `description`, `status`, `pr_url`, `created_at` (snake_case, raw DB row) |

## Invariants

1. **Atomic acquisition**: Lock acquisition uses `INSERT OR IGNORE` on the primary key, ensuring that only one execution can hold a lock on a given repo at a time
2. **Owner-only release**: `releaseRepoLock` deletes only when both `repo` and `execution_id` match, preventing one execution from releasing another's lock
3. **Auto-expiry**: Expired locks (where `expires_at < datetime('now')`) are cleaned before acquisition and listing, preventing deadlocks from crashed executions
4. **Default TTL**: The default lock TTL is 30 minutes (`DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000`)
5. **Logging**: All lock acquisitions, releases, blocks, and expirations are logged via `createLogger('RepoLocks')`
6. **Cross-table queries**: `getRecentRepoActivity` queries `schedule_executions` and `work_tasks` tables (not `repo_locks`) using `LIKE` pattern matching on `action_input` and `pr_url` columns

## Behavioral Examples

### Scenario: Acquire and release a lock
- **Given** no lock exists for repo `CorvidLabs/corvid-agent`
- **When** `acquireRepoLock(db, 'CorvidLabs/corvid-agent', 'exec-1', 'sched-1', 'code_review')` is called
- **Then** `true` is returned and a row is inserted into `repo_locks` with an expiry 30 minutes in the future

### Scenario: Blocked by existing lock
- **Given** repo `CorvidLabs/corvid-agent` is locked by `exec-1`
- **When** `acquireRepoLock(db, 'CorvidLabs/corvid-agent', 'exec-2', 'sched-2', 'code_review')` is called
- **Then** `false` is returned, and the existing lock holder details are logged

### Scenario: Expired lock is reclaimed
- **Given** repo `CorvidLabs/corvid-agent` has a lock with `expires_at` in the past
- **When** `acquireRepoLock(db, 'CorvidLabs/corvid-agent', 'exec-3', 'sched-3', 'code_review')` is called
- **Then** `cleanExpiredLocks` removes the stale lock first, then `INSERT OR IGNORE` succeeds, and `true` is returned

### Scenario: Wrong execution cannot release lock
- **Given** repo `CorvidLabs/corvid-agent` is locked by `exec-1`
- **When** `releaseRepoLock(db, 'CorvidLabs/corvid-agent', 'exec-2')` is called
- **Then** `false` is returned and the lock remains held by `exec-1`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Acquire lock on already-locked repo | Returns `false`; logs the existing lock holder |
| Release lock with wrong `executionId` | Returns `false`; lock remains |
| Release lock on unlocked repo | Returns `false` |
| `getRepoLock` on unlocked repo | Returns `null` |
| `getRecentRepoActivity` with no matching activity | Returns `{ executions: [], workTasks: [] }` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger` | `createLogger('RepoLocks')` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/scheduler/service.ts` | `acquireRepoLock`, `releaseRepoLock`, `releaseAllLocks`, `getRecentRepoActivity` for schedule execution coordination |

## Database Tables

### repo_locks

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `repo` | TEXT | NOT NULL, PRIMARY KEY | Repository identifier (e.g. `CorvidLabs/corvid-agent`) or project ID |
| `execution_id` | TEXT | NOT NULL | ID of the schedule execution that holds this lock |
| `schedule_id` | TEXT | NOT NULL | ID of the schedule that triggered the execution |
| `action_type` | TEXT | NOT NULL | Type of action being performed (e.g. `code_review`, `issue_triage`) |
| `locked_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | ISO 8601 timestamp when the lock was acquired |
| `expires_at` | TEXT | NOT NULL | ISO 8601 timestamp when the lock auto-expires |

**Indexes:**
- `idx_repo_locks_expires` on `expires_at`
- `idx_repo_locks_schedule` on `schedule_id`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
