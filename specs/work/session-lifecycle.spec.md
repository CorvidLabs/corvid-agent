---
module: session-lifecycle
version: 1
status: active
files:
  - server/work/session-lifecycle.ts
db_tables:
  - work_tasks
  - sessions
  - audit_log
depends_on:
  - specs/work/work-task-service.spec.md
  - specs/db/sessions.spec.md
  - specs/process/process-manager.spec.md
---

# Session Lifecycle

## Purpose

Manages the post-session lifecycle for work tasks: validates changes, iterates on failures (up to a configurable limit), finalizes completed tasks with PR URLs, and cleans up git worktrees. Extracted from `WorkTaskService` to separate session lifecycle concerns from task orchestration.

## Public API

### Exported Interfaces

| Interface | Description |
|-----------|-------------|
| `SessionLifecycleContext` | Context object providing `db`, `processManager`, `notifyCallbacks`, and `subscribeForCompletion` |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleSessionEnd` | `(ctx: SessionLifecycleContext, taskId: string, sessionOutput: string)` | `Promise<void>` | Runs post-session validation; on pass finalizes, on fail iterates or marks failed |
| `finalizeTask` | `(ctx: SessionLifecycleContext, taskId: string, sessionOutput: string)` | `Promise<void>` | Extracts PR URL from output (with fallback creation), updates task status, cleans up worktree |
| `createPrFallback` | `(db: Database, taskId: string, sessionOutput: string)` | `Promise<string \| null>` | Pushes branch and creates PR via `gh pr create` when agent did not produce a PR URL |
| `buildIterationPrompt` | `(branchName: string, validationOutput: string)` | `string` | Builds a follow-up prompt with validation errors for the next iteration session |
| `cleanupWorktree` | `(db: Database, taskId: string)` | `Promise<void>` | Removes the git worktree for a task while preserving the branch |

## Invariants

1. **Max iteration cap**: Tasks cannot exceed `WORK_MAX_ITERATIONS` (default 3, configurable via env) iterations
2. **Validation before finalization**: `handleSessionEnd` always runs validation before calling `finalizeTask`
3. **Worktree cleanup on all terminal states**: Both success and max-iteration failure paths clean up the worktree
4. **Callback notification on completion**: `notifyCallbacks` is called on both success and failure terminal states
5. **PR URL regex**: Only matches GitHub PR URLs of the form `https://github.com/<owner>/<repo>/pull/<number>`
6. **Fallback PR creation**: When agent output lacks a PR URL, `createPrFallback` attempts service-level push and PR creation

## Behavioral Examples

### Scenario: Validation passes on first attempt

- **Given** a work task with iteration count 1
- **When** `handleSessionEnd` is called and validation passes
- **Then** `finalizeTask` is called, PR URL is extracted, task status set to `completed`, worktree cleaned up

### Scenario: Validation fails and iteration limit not reached

- **Given** a work task with iteration 1 of 3
- **When** `handleSessionEnd` is called and validation fails
- **Then** a new iteration session is spawned with the validation errors as prompt context

### Scenario: Validation fails at max iterations

- **Given** a work task at iteration 3 (the max)
- **When** `handleSessionEnd` is called and validation fails
- **Then** task status is set to `failed` with truncated error output, worktree is cleaned up

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Task not found or missing projectId | `handleSessionEnd` returns early (no-op) |
| No validation directory available | Skips validation, proceeds directly to `finalizeTask` |
| No PR URL in output and fallback fails | Task marked as `failed` with descriptive error |
| Git push fails during fallback | Returns null, logs warning |
| `gh pr create` fails during fallback | Returns null, logs warning |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/work-tasks` | `getWorkTask`, `updateWorkTaskStatus` |
| `server/db/projects` | `getProject` |
| `server/db/sessions` | `createSession` |
| `server/db/audit` | `recordAudit` |
| `server/work/validation` | `runValidation` |
| `server/lib/worktree` | `removeWorktree` |
| `server/lib/logger` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/work/service.ts` | All exported functions and `SessionLifecycleContext` |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WORK_MAX_ITERATIONS` | `3` | Maximum validation-fix iterations before marking task as failed |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-23 | corvid-agent | Initial spec — extracted from WorkTaskService |
