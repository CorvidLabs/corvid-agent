---
module: session-lifecycle
version: 1
status: active
files:
  - server/work/session-lifecycle.ts
depends_on:
  - specs/work/work-task-service.spec.md
  - specs/db/sessions/sessions.spec.md
---

# Session Lifecycle

## Purpose

Handles the post-session lifecycle for work tasks: validates output, iterates on failures, extracts or creates PRs, and cleans up worktrees. Extracted from `WorkTaskService` to separate session-end orchestration from task creation and management.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `SessionLifecycleContext` | Context object providing `db`, `processManager`, `notifyCallbacks`, `subscribeForCompletion`, and optional `notifyOwner` |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleSessionEnd` | `(ctx: SessionLifecycleContext, taskId: string, sessionOutput: string)` | `Promise<void>` | Main entry point: validate session output, iterate on failure or finalize on success |
| `finalizeTask` | `(ctx: SessionLifecycleContext, taskId: string, sessionOutput: string)` | `Promise<void>` | Extract PR URL from output (with fallback creation), update task status, clean up worktree |
| `createPrFallback` | `(db: Database, taskId: string, sessionOutput: string)` | `Promise<string \| null>` | Push branch and run `gh pr create` when agent output lacks a PR URL |
| `buildIterationPrompt` | `(branchName: string, validationOutput: string)` | `string` | Build the prompt for a follow-up iteration session with validation errors |
| `cleanupWorktree` | `(db: Database, taskId: string)` | `Promise<void>` | Remove the git worktree for a task while preserving the branch |
| `ensureOriginRemote` | `(db: Database, projectId: string, cwd: string)` | `Promise<boolean>` | Ensure git repo has an `origin` remote, adding one from project `gitUrl` if missing |

## Invariants

1. **Validation before finalization**: `handleSessionEnd` always runs validation before finalizing; tasks without a `validationDir` skip straight to `finalizeTask`
2. **Iteration cap**: Validation failures spawn new iterations only up to `WORK_MAX_ITERATIONS` (default 3); beyond that the task is marked `failed`
3. **Owner notification on cap**: When the iteration cap is reached and the task is marked `failed`, `notifyOwner` is called (if present in context) with an `error`-level message summarising the failure and suggesting a retry at a higher model tier
4. **PR URL fallback**: `finalizeTask` first checks session output for a PR URL, then falls back to `createPrFallback`; failure of both results in task failure
5. **Worktree cleanup on terminal states**: Both success and failure paths call `cleanupWorktree` to remove the worktree directory while preserving the branch

## Behavioral Examples

### Scenario: Session ends with passing validation

- **Given** a work task with a valid worktree directory
- **When** `handleSessionEnd` is called and `runValidation` passes
- **Then** `finalizeTask` is called to extract/create a PR and complete the task

### Scenario: Validation fails under iteration limit

- **Given** a work task on iteration 1 with `WORK_MAX_ITERATIONS` = 3
- **When** `handleSessionEnd` is called and validation fails
- **Then** a new session is spawned with `buildIterationPrompt` containing the validation errors
- **And** `iterationCount` is incremented to 2

### Scenario: Validation fails at iteration limit

- **Given** a work task on iteration 3
- **When** validation fails again
- **Then** the task is marked `failed` with the validation output in the error field
- **And** the worktree is cleaned up
- **And** `notifyOwner` is called with an `error`-level message that includes the task description and truncated validation output

### Scenario: Validation fails at iteration limit — no notification service

- **Given** a work task on iteration 3 and `notifyOwner` is `null` in the context
- **When** validation fails again
- **Then** the task is marked `failed` with the validation output in the error field
- **And** the worktree is cleaned up (same as before; absence of `notifyOwner` is safe)

### Scenario: Fallback PR creation

- **Given** a completed session with no PR URL in the output
- **When** `createPrFallback` is called
- **Then** it ensures an `origin` remote exists (adding one from the project's `gitUrl` if missing)
- **And** commits any unstaged changes, pushes the branch, and runs `gh pr create`
- **And** returns the PR URL on success or `null` on failure

### Scenario: Fallback PR creation with missing origin remote

- **Given** a project with `gitUrl` set but no `origin` remote configured in the worktree
- **When** `createPrFallback` is called
- **Then** it adds the project's `gitUrl` as the `origin` remote before pushing
- **And** proceeds with push and PR creation normally

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Task not found or missing projectId | `handleSessionEnd` returns early (no-op) |
| No validation directory available | Skips validation, proceeds directly to `finalizeTask` |
| PR URL not in output and fallback fails | Task marked `failed` with descriptive error |
| `createPrFallback` with no branch or worktree | Returns `null` immediately |
| No origin remote and no project `gitUrl` | Logs warning, returns `null` |
| Git push fails during fallback | Logs warning, returns `null` |
| `gh pr create` fails during fallback | Logs warning, returns `null` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/work-tasks.ts` | `getWorkTask`, `updateWorkTaskStatus` |
| `server/db/projects.ts` | `getProject` |
| `server/db/sessions.ts` | `createSession` |
| `server/db/audit.ts` | `recordAudit` |
| `server/work/validation.ts` | `runValidation` |
| `server/lib/worktree.ts` | `removeWorktree` |
| `server/lib/logger.ts` | `createLogger` |
| `server/process/manager.ts` | `ProcessManager` (via context) |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/work/service.ts` | `handleSessionEnd`, `SessionLifecycleContext` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-28 | corvid-agent | Add `notifyOwner` to `SessionLifecycleContext`; notify on iteration-cap failure (#2165) |
| 2026-03-23 | corvid-agent | Initial spec — extracted from work-task-service.spec.md |
