---
module: work-task-service
version: 1
status: active
files:
  - server/work/service.ts
  - server/work/validation.ts
  - server/work/repo-map.ts
  - server/work/verification.ts
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

### Exported Types

| Type | Definition | Description |
|------|-----------|-------------|
| `StatusChangeCallback` | `(task: WorkTask) => void` | Callback fired on work task status transitions (branching, running, validating) |

### Exported Functions (server/work/validation.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `runBunInstall` | `(cwd: string)` | `Promise<void>` | Run `bun install --frozen-lockfile --ignore-scripts`, retrying without `--frozen-lockfile` on failure |
| `runValidation` | `(workingDir: string)` | `Promise<{ passed: boolean; output: string }>` | Full validation pipeline: install deps, tsc, tests, security/governance scans |

### Exported Constants (server/work/repo-map.ts)

| Constant | Type | Description |
|----------|------|-------------|
| `REPO_MAP_MAX_LINES` | `number` (200) | Max lines in the generated repo map to keep it lightweight |
| `PRIORITY_DIRS` | `string[]` | Directories prioritized in repo map ordering (`src/`, `server/`, `lib/`) |
| `STOP_WORDS` | `Set<string>` | Stop words excluded from keyword extraction for symbol search |

### Exported Functions (server/work/repo-map.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `filePathPriority` | `(relPath: string)` | `number` | Priority score for file path ordering (1=source dirs, 2=other, 3=test files) |
| `generateRepoMap` | `(astParserService: AstParserService, projectDir: string)` | `Promise<string \| null>` | Generate a lightweight repo map showing exported symbols per file, grouped by directory. Returns null if AST service unavailable or no exported symbols found |
| `extractRelevantSymbols` | `(repoMap: string, description: string)` | `string` | Extract symbols from the repo map that are relevant to a task description using keyword matching |
| `tokenizeDescription` | `(description: string)` | `string[]` | Tokenize a task description into lowercase keywords, filtering out stop words and short tokens |

### Exported Types (server/work/verification.ts)

| Type | Description |
|------|-------------|
| `TestPlanItem` | Parsed checkbox item from PR body: `text` (raw text without prefix) and `index` (0-based position) |
| `VerificationResult` | Created verification task: `itemText` and `taskId` |

### Exported Functions (server/work/verification.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `parseTestPlanItems` | `(prBody: string)` | `TestPlanItem[]` | Parse unchecked `- [ ]` test plan items from a PR body |
| `parsePrUrl` | `(prUrl: string)` | `{ repo: string; prNumber: number } \| null` | Extract owner/repo and PR number from a GitHub PR URL |
| `fetchPrBody` | `(repo: string, prNumber: number)` | `Promise<string \| null>` | Fetch the PR body from GitHub via `gh pr view` |
| `checkOffPrItem` | `(repo: string, prNumber: number, itemText: string)` | `Promise<boolean>` | Check off a specific checkbox item in the PR body by replacing `- [ ]` with `- [x]` |
| `buildVerificationPrompt` | `(prUrl: string, prNumber: number, branchName: string, itemText: string)` | `string` | Build the agent prompt for a verification work task with instructions to check out branch and verify the item |
| `createVerificationTasks` | `(db: Database, parentTaskId: string, prUrl: string)` | `Promise<VerificationResult[]>` | Create verification work tasks for all unchecked test plan items in a PR. Called from finalizeTask() after PR creation |
| `handleVerificationComplete` | `(db: Database, taskId: string, sessionOutput: string)` | `Promise<boolean>` | Check if a completed verification task passed (output ends with VERIFICATION_PASSED) and check off the PR item |
| `isVerificationTask` | `(sourceId: string \| null)` | `boolean` | Check if a work task is a verification task by sourceId pattern (`verify:` prefix) |

#### WorkTaskService Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database handle |
| `processManager` | `ProcessManager` | For spawning agent sessions |

#### WorkTaskService Properties

| Property | Type | Description |
|----------|------|-------------|
| `agentMessenger` | `AgentMessenger \| null` | Optional AlgoChat messenger for broadcasting lifecycle events; set via `setAgentMessenger` |

#### WorkTaskService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `recoverStaleTasks` | `()` | `Promise<void>` | On startup: mark stale tasks as failed, clean up orphaned worktrees |
| `create` | `(input: CreateWorkTaskInput)` | `Promise<WorkTask>` | Full lifecycle: validate inputs, create worktree, install deps, spawn session |
| `getTask` | `(id: string)` | `WorkTask \| null` | Fetch a task by ID |
| `listTasks` | `(agentId?: string)` | `WorkTask[]` | List tasks, optionally filtered by agent |
| `cancelTask` | `(id: string)` | `Promise<WorkTask \| null>` | Stop the session, fail the task, clean up worktree |
| `setAgentMessenger` | `(messenger: AgentMessenger)` | `void` | Set the AgentMessenger instance for lifecycle notifications |
| `onComplete` | `(taskId: string, callback: (task: WorkTask) => void)` | `void` | Register a completion callback |
| `onStatusChange` | `(taskId: string, callback: StatusChangeCallback) ` | `void` | Register a status-change callback (fires on branching, running, validating) |
| `pruneStaleWorktrees` | `()` | `Promise<void>` | Clean up worktrees for terminal tasks (completed/failed) with leftover worktree_dir; also runs `git worktree prune` |
| `startPeriodicCleanup` | `()` | `void` | Start a 6-hour interval timer for stale worktree cleanup |
| `stopPeriodicCleanup` | `()` | `void` | Stop the periodic cleanup timer |

## MCP Tool Interface

Three MCP tools expose the work task system to agents:

| Tool | Description |
|------|-------------|
| `corvid_create_work_task` | Create a work task with optional `model_tier` (light/standard/heavy) for cost-aware delegation and optional `agent_id` for delegating to a specific agent |
| `corvid_check_work_status` | Poll a work task by ID — returns status, branch, PR URL, errors |
| `corvid_list_work_tasks` | List work tasks for the calling agent, optionally filtered by status |

### Model Tier Parameter

The `model_tier` parameter on `corvid_create_work_task` maps to `ModelTier`:

| User Value | ModelTier | Model | Use Case |
|-----------|-----------|-------|----------|
| `light` | HAIKU | claude-haiku-4-5 | Trivial edits, formatting, renames |
| `standard` | SONNET | claude-sonnet-4-6 | Normal work tasks, bug fixes, tests |
| `heavy` | OPUS | claude-opus-4-6 | Architecture, multi-file refactors, specs |
| _(omitted)_ | _(auto)_ | _(complexity-based)_ | Router analyzes description to select |

When `modelTier` is set on `CreateWorkTaskInput`, the `WorkTaskService` passes it through to `ProcessManager.startProcess()` to select the appropriate model for the spawned session.

### Agent Delegation Parameter

The optional `agent_id` parameter on `corvid_create_work_task` allows the calling agent to delegate task execution and attribution to a specific agent. When provided:
- The target agent's identity is used for the work task session (branch naming, PR signatures, co-authored-by trailers)
- The target agent must exist in the database (validated before task creation)
- If omitted, the calling agent's own identity is used (default behavior)

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
10. **AlgoChat lifecycle notifications**: Work task lifecycle events (created, completed, failed) are broadcast via AlgoChat `sendOnChainToSelf` when `agentMessenger` is available

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

### Scenario: Work task creation notification

- **Given** a `WorkTaskService` with `agentMessenger` set via `setAgentMessenger`
- **When** a new work task is created
- **Then** `sendOnChainToSelf` is called fire-and-forget with `"[WORK_TASK:created] <description snippet>"`

### Scenario: Work task completion notification

- **Given** a work task completes (with or without PR URL)
- **When** `notifyCallbacks` is called
- **Then** `sendOnChainToSelf` is called fire-and-forget with `"[WORK_TASK:completed] PR: <url>"` or `"[WORK_TASK:failed] <error>"`

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
| `server/db/work-tasks.ts` | `createWorkTaskAtomic`, `getWorkTask`, `updateWorkTaskStatus`, `listWorkTasks`, `cleanupStaleWorkTasks`, `dequeueNextTask`, `getPendingTasksForProject`, `getActiveTaskForProject`, `pauseWorkTask`, `resumePausedTask`, `getPausedTasks`, `countQueuedTasks`, `getTerminalTasksWithWorktrees`, `clearWorktreeDir` |
| `server/db/audit.ts` | `recordAudit` |
| `server/process/types.ts` | `ClaudeStreamEvent`, `extractContentText` |
| `server/work/validation.ts` | `runBunInstall`, `runValidation` |
| `server/work/repo-map.ts` | `generateRepoMap`, `extractRelevantSymbols` |

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
| 2026-03-06 | corvid-agent | Added AlgoChat notifications for work task lifecycle events |
| 2026-03-07 | corvid-agent | Extracted `runValidation` and `runBunInstall` into `server/work/validation.ts` |
| 2026-03-08 | corvid-agent | Documented repo-map.ts exports: constants, `generateRepoMap`, `extractRelevantSymbols`, `tokenizeDescription`, `filePathPriority` |
| 2026-03-13 | corvid-agent | Added verification.ts: PR test plan verification tasks — parseTestPlanItems, createVerificationTasks, handleVerificationComplete, and helpers |
| 2026-03-14 | corvid-agent | Added MCP Tool Interface section: corvid_check_work_status, corvid_list_work_tasks tools; model_tier parameter on corvid_create_work_task for tiered dispatch |
| 2026-03-28 | corvid-agent | Added agent_id parameter to corvid_create_work_task for delegating task execution and PR attribution to a specific agent |
