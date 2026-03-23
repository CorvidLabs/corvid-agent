---
module: session-lifecycle
version: 1
status: active
files:
  - server/work/session-lifecycle.ts
db_tables:
  - work_tasks
depends_on:
  - specs/db/work-tasks.spec.md
  - specs/db/projects.spec.md
  - specs/db/sessions.spec.md
  - specs/db/audit.spec.md
  - specs/work/work-task-service.spec.md
  - specs/process/process-manager.spec.md
---

# Session Lifecycle

## Purpose

Extracted session lifecycle helpers for `WorkTaskService`. Handles the post-session lifecycle: running validation, spawning retry iterations on failure, finalizing tasks with PR URL extraction, and cleaning up git worktrees. Separates these concerns from the orchestration logic in `WorkTaskService` to keep them independently testable.

## Public API

### Exported Interfaces

| Interface | Fields | Description |
|-----------|--------|-------------|
| `SessionLifecycleContext` | `db: Database`, `processManager: ProcessManager`, `notifyCallbacks: (taskId: string) => void`, `subscribeForCompletion: (taskId: string, sessionId: string) => void` | Context object passed to lifecycle functions in place of `this`, enabling use outside `WorkTaskService` |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleSessionEnd` | `(ctx: SessionLifecycleContext, taskId: string, sessionOutput: string)` | `Promise<void>` | Called when a work-task session ends. Runs validation; on pass, finalizes the task; on fail, either marks the task failed (max iterations reached) or spawns a follow-up iteration session |
| `finalizeTask` | `(ctx: SessionLifecycleContext, taskId: string, sessionOutput: string)` | `Promise<void>` | Extracts a PR URL from session output, falls back to `createPrFallback`, updates task status to completed or failed, cleans up the worktree, and fires notify callbacks |
| `createPrFallback` | `(db: Database, taskId: string, sessionOutput: string)` | `Promise<string \| null>` | Service-level fallback PR creation: commits any unstaged changes, pushes the branch, runs `gh pr create`. Returns the PR URL or null on failure |
| `buildIterationPrompt` | `(branchName: string, validationOutput: string)` | `string` | Builds the prompt for a follow-up iteration session, embedding the branch name and validation error output |
| `cleanupWorktree` | `(db: Database, taskId: string)` | `Promise<void>` | Removes the git worktree for a task (branch is kept for PR purposes) |

## Invariants

1. **Validation required before finalization**: `handleSessionEnd` always runs `runValidation` before calling `finalizeTask`
2. **Max iteration guard**: When `iterationCount >= WORK_MAX_ITERATIONS`, the task is marked `failed` rather than spawning another iteration
3. **PR URL extraction order**: `finalizeTask` tries regex extraction from session output first; `createPrFallback` is only called if that yields nothing
4. **Worktree cleanup is always attempted**: Both success and failure paths in `finalizeTask` call `cleanupWorktree`
5. **Notify callbacks always fire**: `notifyCallbacks` is called at the end of every terminal path (completed, failed, or iteration-exceeded)
6. **Branch preserved on cleanup**: `cleanupWorktree` removes only the worktree directory; the git branch is retained for PR review

## Behavioral Examples

### Scenario: Validation passes — task finalized with PR

- **Given** a task with a valid worktree and session output containing a GitHub PR URL
- **When** `handleSessionEnd` is called
- **Then** `runValidation` passes, `finalizeTask` sets status to `completed` with the extracted PR URL, worktree is removed, and `notifyCallbacks` fires

### Scenario: Validation fails within iteration limit — retry spawned

- **Given** a task with `iterationCount = 1` and `WORK_MAX_ITERATIONS = 3`
- **When** `handleSessionEnd` is called and validation fails
- **Then** a new session is created with `buildIterationPrompt`, task status is updated to `running` with `iterationCount = 2`, and the new session is started

### Scenario: Validation fails at max iterations — task marked failed

- **Given** a task with `iterationCount = 3` and `WORK_MAX_ITERATIONS = 3`
- **When** `handleSessionEnd` is called and validation fails
- **Then** task status is set to `failed` with the validation output, worktree is cleaned up, and `notifyCallbacks` fires

### Scenario: Agent produced no PR URL — fallback creates PR

- **Given** session output with no GitHub PR URL and a task with `branchName` and `worktreeDir`
- **When** `finalizeTask` calls `createPrFallback`
- **Then** the branch is pushed and `gh pr create` is run; returned URL is used to mark the task `completed`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Task or project not found in `handleSessionEnd` | Early return (no-op) |
| No `validationDir` available | Skips validation, calls `finalizeTask` directly |
| `createPrFallback` — git push fails | Returns null; task is marked `failed` |
| `createPrFallback` — `gh pr create` fails | Returns null; task is marked `failed` |
| `cleanupWorktree` — task has no `worktreeDir` | No-op |

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
| `server/process/manager` | `ProcessManager` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/work/service.ts` | All exports via `SessionLifecycleContext` delegation |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WORK_MAX_ITERATIONS` | `3` | Maximum number of validation-retry iterations before a task is marked failed |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-23 | corvid-agent | Initial spec — extracted from work-task-service |
