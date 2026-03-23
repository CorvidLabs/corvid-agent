---
module: session-lifecycle
version: 1
status: active
files:
  - server/work/session-lifecycle.ts
db_tables:
  - work_tasks
  - projects
  - sessions
depends_on:
  - specs/work/work-task-service.spec.md
  - specs/db/work-tasks.spec.md
  - specs/process/process-manager.spec.md
---

# Session Lifecycle

## Purpose

Manages the lifecycle of work task sessions: handling session completion, running post-session validation, iterating on validation failures, and finalizing tasks with PR creation. This module bridges session execution with work task state management, determining whether to rerun the agent (iteration) or complete the task.

## Public API

### Exported Interfaces

| Interface | Description |
|-----------|-------------|
| `SessionLifecycleContext` | Context dependencies for session lifecycle operations: database, process manager, notification callbacks |

#### SessionLifecycleContext Properties

| Property | Type | Description |
|----------|------|-------------|
| `db` | `Database` | SQLite database handle |
| `processManager` | `ProcessManager` | For starting follow-up iteration sessions |
| `notifyCallbacks` | `(taskId: string) => void` | Fire-and-forget notification callback on task completion/failure |
| `subscribeForCompletion` | `(taskId: string, sessionId: string) => void` | Subscribe to session completion events for task iteration |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleSessionEnd` | `(ctx: SessionLifecycleContext, taskId: string, sessionOutput: string)` | `Promise<void>` | Handle session completion: validate output, iterate if validation fails (up to max), or finalize |
| `finalizeTask` | `(ctx: SessionLifecycleContext, taskId: string, sessionOutput: string)` | `Promise<void>` | Mark task as completed (with PR) or failed (no PR), clean up worktree, notify callbacks |
| `createPrFallback` | `(db: Database, taskId: string, sessionOutput: string)` | `Promise<string \| null>` | Fallback PR creation: commit unstaged changes, push branch, run `gh pr create`; returns PR URL or null |
| `buildIterationPrompt` | `(branchName: string, validationOutput: string)` | `string` | Build agent prompt for a validation iteration with validation errors and fix instructions |
| `cleanupWorktree` | `(db: Database, taskId: string)` | `Promise<void>` | Remove git worktree directory; the branch is preserved for PR review |

## Invariants

1. **Validation-driven iteration**: `handleSessionEnd` always runs validation before deciding to iterate or finalize
2. **Max iteration enforcement**: If `iterationCount >= WORK_MAX_ITERATIONS`, the task fails immediately without spawning another iteration
3. **PR URL extraction before fallback**: `finalizeTask` first attempts to extract a PR URL from session output using `PR_URL_REGEX`. Only if none is found does it call `createPrFallback`
4. **Worktree cleanup on terminal state**: Every path in `handleSessionEnd` and `finalizeTask` calls `cleanupWorktree` before returning
5. **Session linkage for iterations**: Each spawned iteration creates a new session and subscribes for its completion via `subscribeForCompletion`
6. **Iteration count increment**: When spawning an iteration, `iterationCount` is incremented in DB before the session starts
7. **Fallback commits unstaged changes**: `createPrFallback` ensures all changes are committed (via `git add -A` and `git commit`) before pushing
8. **PR fallback returns null on any error**: `createPrFallback` catches all exceptions and returns null rather than throwing

## Behavioral Examples

### Scenario: Session ends, validation passes, PR found in output

- **Given** a running work task on iteration 1 with a valid worktree
- **When** `handleSessionEnd` is called with output containing `https://github.com/org/repo/pull/42`
- **Then** validation runs and passes
- **And** `finalizeTask` is called
- **And** status becomes `completed` with `prUrl = "https://github.com/org/repo/pull/42"`
- **And** worktree is cleaned up
- **And** `notifyCallbacks` is called

### Scenario: Session ends, validation passes, no PR in output — fallback succeeds

- **Given** a running work task on iteration 1 with valid worktree and uncommitted changes
- **When** `handleSessionEnd` is called with output containing no PR URL
- **Then** validation runs and passes
- **And** `finalizeTask` is called
- **And** `createPrFallback` commits changes, pushes branch, and runs `gh pr create`
- **And** `gh pr create` returns `https://github.com/org/repo/pull/43`
- **Then** status becomes `completed` with `prUrl = "https://github.com/org/repo/pull/43"`
- **And** worktree is cleaned up

### Scenario: Session ends, validation fails on iteration 1

- **Given** a running work task on iteration 1 with valid worktree
- **When** `handleSessionEnd` is called with any output
- **Then** validation runs and fails with TypeScript or test errors
- **And** status becomes `running` with `iterationCount = 2`
- **And** a new session is spawned with an iteration prompt containing the validation errors
- **And** `subscribeForCompletion` is called for the new session

### Scenario: Session ends, validation fails on iteration 3 (max reached)

- **Given** a running work task on iteration 3 (WORK_MAX_ITERATIONS = 3) with valid worktree
- **When** `handleSessionEnd` is called with any output
- **Then** validation runs and fails
- **And** status becomes `failed` with error message containing the validation output
- **And** worktree is cleaned up
- **And** `notifyCallbacks` is called

### Scenario: No validation directory available

- **Given** a work task with no `worktreeDir` and no project `workingDir`
- **When** `handleSessionEnd` is called
- **Then** validation is skipped
- **And** `finalizeTask` is called directly

### Scenario: Session ends, validation passes, no PR URL, fallback fails

- **Given** a running work task where validation passes and no PR URL is in output
- **When** `createPrFallback` is called
- **And** `git push` fails (network error, authentication issue, etc.)
- **Then** `createPrFallback` returns null
- **And** status becomes `failed` with error "Session completed but no PR URL was found in output and service-level PR creation failed"

### Scenario: Build iteration prompt with validation errors

- **Given** a branch name "agent/foo/fix-bug-abc123" and validation output "error TS2345: ..."
- **When** `buildIterationPrompt` is called
- **Then** the returned prompt contains:
  - The branch name
  - The validation error output in a code block
  - Clear instructions to fix, commit, validate, and create/push PR

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Work task not found | `handleSessionEnd` returns early (no-op) |
| Project not found | `handleSessionEnd` skips validation and calls `finalizeTask` directly |
| No worktree directory | `handleSessionEnd` skips validation and calls `finalizeTask` directly |
| Validation process fails (exception) | Task status set to `failed` with error details |
| No PR URL and fallback throws exception | Exception is caught, `createPrFallback` returns null, task marked failed |
| Git diff returns non-zero exit (changes exist) | `createPrFallback` commits those changes |
| Git diff returns zero exit (no changes) | `createPrFallback` skips commit and goes straight to push |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/work/validation.ts` | `runValidation` |
| `server/db/work-tasks.ts` | `getWorkTask`, `updateWorkTaskStatus` |
| `server/db/projects.ts` | `getProject` |
| `server/db/sessions.ts` | `createSession` |
| `server/db/audit.ts` | `recordAudit` |
| `server/lib/worktree.ts` | `removeWorktree` |
| `server/lib/logger.ts` | `createLogger` |
| `Bun.spawn` | For running git and gh CLI commands |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `handleSessionEnd` (via session completion event handler) |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `WORK_MAX_ITERATIONS` | `3` | Maximum validation iterations before failing |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-23 | corvid-agent | Initial spec for session-lifecycle.ts: handleSessionEnd, finalizeTask, createPrFallback, buildIterationPrompt, cleanupWorktree |
