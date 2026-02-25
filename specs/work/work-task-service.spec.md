---
module: work-task-service
version: 1
status: active
files:
  - server/work/service.ts
db_tables:
  - work_tasks
depends_on:
  - specs/db/sessions.spec.md
  - specs/process/process-manager.spec.md
---

# Work Task Service

## Purpose

Manages the full lifecycle of autonomous work tasks: create a git worktree, spawn an agent session to implement changes, validate with TypeScript checks and tests, iterate on failures (up to a configurable limit), and produce a pull request. This is the core mechanism for agent self-improvement -- agents create work tasks to propose codebase changes.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `WorkTaskService` | Orchestrates the create-branch-execute-validate-PR lifecycle |

#### WorkTaskService Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database handle |
| `processManager` | `ProcessManager` | For spawning agent sessions |

#### WorkTaskService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `recoverStaleTasks` | `()` | `Promise<void>` | On startup: mark stale tasks as failed, clean up orphaned worktrees |
| `create` | `(input: CreateWorkTaskInput)` | `Promise<WorkTask>` | Full lifecycle: validate inputs, create worktree, install deps, spawn session |
| `getTask` | `(id: string)` | `WorkTask \| null` | Fetch a task by ID |
| `listTasks` | `(agentId?: string)` | `WorkTask[]` | List tasks, optionally filtered by agent |
| `cancelTask` | `(id: string)` | `Promise<WorkTask \| null>` | Stop the session, fail the task, clean up worktree |
| `onComplete` | `(taskId: string, callback: (task: WorkTask) => void)` | `void` | Register a completion callback |

## Invariants

1. **One active task per project**: `createWorkTaskAtomic` enforces that only one task can be in an active state (pending/branching/running/validating) per project at a time
2. **Worktree isolation**: Work tasks execute in a git worktree, never in the main working tree. The worktree directory is always `<worktreeBase>/<taskId>`
3. **Worktree cleanup**: Every terminal state (completed, failed, cancelled) must clean up the worktree directory. The git branch is preserved for PR review
4. **Validation iteration limit**: Failed validation triggers a new iteration up to `WORK_MAX_ITERATIONS` (default 3). After that, the task is marked failed
5. **Branch naming convention**: `agent/<agent-slug>/<task-slug>-<timestamp-base36>-<random-6char>`
6. **PR URL extraction with fallback**: After validation passes, the service first checks session output for a GitHub PR URL matching `https://github.com/[^\\s]+/pull/\\d+`. If none is found, it falls back to service-level PR creation via `createPrFallback()` which pushes the branch and runs `gh pr create`. The task only fails if both extraction and fallback fail
7. **Status state machine**: `pending` -> `branching` -> `running` -> `validating` -> (`completed` | `failed`) or (`running` for next iteration). No backward transitions
8. **Dependency installation**: `bun install --frozen-lockfile --ignore-scripts` is run in the worktree before execution and before each validation. Falls back to non-frozen if frozen fails. `--ignore-scripts` prevents postinstall hooks from bypassing protected-file checks
9. **Session linkage**: Each running iteration creates a new session with `workDir` pointing to the worktree

## Behavioral Examples

### Scenario: Successful work task with PR

- **Given** an agent with a valid project that has a `workingDir`
- **When** `create({ agentId, description: "Fix the bug" })` is called
- **Then** status transitions: `pending` -> `branching` -> `running`
- **And** a git worktree is created on a new branch
- **And** a session is spawned with a work prompt
- **When** the session completes with output containing `https://github.com/org/repo/pull/42`
- **Then** validation runs (tsc + tests)
- **When** validation passes
- **Then** status becomes `completed` with `prUrl` set, worktree is cleaned up

### Scenario: Validation fails then succeeds on iteration 2

- **Given** a running work task on iteration 1
- **When** the session completes and validation fails (tsc errors)
- **Then** status stays `running`, `iterationCount` increments to 2
- **And** a new session is spawned with an iteration prompt containing the validation errors
- **When** the new session fixes the issues and validation passes
- **Then** the task completes normally

### Scenario: Max iterations exhausted

- **Given** a running work task on iteration 3 (WORK_MAX_ITERATIONS = 3)
- **When** the session completes and validation fails again
- **Then** status becomes `failed` with the validation output in the error field
- **And** worktree is cleaned up

### Scenario: No PR URL in output — fallback PR creation

- **Given** a running work task where validation passes
- **When** the session output does not contain a GitHub PR URL
- **Then** the service pushes the branch and runs `gh pr create` as a fallback
- **When** the fallback succeeds and returns a PR URL
- **Then** status becomes `completed` with `prUrl` set, worktree is cleaned up

### Scenario: No PR URL and fallback fails

- **Given** a running work task where validation passes
- **When** the session output does not contain a GitHub PR URL
- **And** the fallback `gh pr create` also fails
- **Then** status becomes `failed` with error "Session completed but no PR URL was found in output and service-level PR creation failed"

### Scenario: Cancel a running task

- **Given** a running work task with an active session
- **When** `cancelTask(taskId)` is called
- **Then** the session process is stopped, status becomes `failed` with error "Cancelled by user", worktree is cleaned up

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Agent not found | Throws `Error("Agent {id} not found")` |
| No project ID (none provided, agent has no default) | Throws `Error("No projectId provided and agent has no defaultProjectId")` |
| Project not found | Throws `Error("Project {id} not found")` |
| Project has no workingDir | Throws `Error("Project {id} has no workingDir")` |
| Another active task on same project | Throws `Error("Another task is already active on project {id}")` |
| Git worktree creation fails | Task status set to `failed` with error message, task returned |
| `cancelTask` with nonexistent ID | Returns `null` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `ProcessManager` for starting/stopping sessions, subscribing to events |
| `server/db/sessions.ts` | `createSession` |
| `server/db/agents.ts` | `getAgent` |
| `server/db/projects.ts` | `getProject` |
| `server/db/work-tasks.ts` | `createWorkTaskAtomic`, `getWorkTask`, `updateWorkTaskStatus`, `listWorkTasks`, `cleanupStaleWorkTasks` |
| `server/db/audit.ts` | `recordAudit` |
| `server/process/types.ts` | `ClaudeStreamEvent`, `extractContentText` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | Injected as `mcpWorkTaskService` for MCP tools |
| `server/scheduler/service.ts` | `create` (for `work_task` actions) |
| `server/mcp/tool-handlers/work.ts` | `create`, `getTask`, `listTasks` |
| `server/routes/work-tasks.ts` | All public methods |

## Database Tables

### work_tasks

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| agent_id | TEXT | NOT NULL | Agent performing the work |
| project_id | TEXT | NOT NULL | Target project |
| description | TEXT | NOT NULL | What needs to be done |
| source | TEXT | DEFAULT 'web' | Origin: web/agent/algochat |
| source_id | TEXT | nullable | ID of the originating entity |
| requester_info | TEXT | nullable | Info about who requested the task |
| status | TEXT | DEFAULT 'pending' | pending/branching/running/validating/completed/failed |
| branch_name | TEXT | nullable | Git branch name |
| worktree_dir | TEXT | nullable | Filesystem path to worktree |
| session_id | TEXT | nullable | Current session running the task |
| iteration_count | INTEGER | DEFAULT 0 | Current validation iteration |
| pr_url | TEXT | nullable | GitHub PR URL on success |
| summary | TEXT | nullable | Output summary |
| error | TEXT | nullable | Error message on failure |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | DEFAULT datetime('now') | Last modification |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `WORK_MAX_ITERATIONS` | `3` | Maximum validation iterations before failing |
| `WORKTREE_BASE_DIR` | `<project-parent>/.corvid-worktrees` | Base directory for git worktrees |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-19 | corvid-agent | Initial spec |
| 2026-02-20 | corvid-agent | Updated invariant #6 and behavioral example: PR creation now falls back to service-level `createPrFallback()` (fixes #182) |
