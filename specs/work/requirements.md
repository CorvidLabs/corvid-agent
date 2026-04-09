---
spec: work-task-service.spec.md
---

## Product Requirements

- Agents autonomously write code, run tests, and create pull requests — all in isolated environments that cannot break the main codebase.
- If an agent's code fails tests or type checks, it automatically tries again (up to a configurable number of times) before giving up, reducing the need for human intervention.
- Less capable (local/intern-tier) models are blocked from publishing code to GitHub, ensuring only quality-checked work reaches the team's repositories.
- When many tasks arrive at once, they are queued and run in a controlled order so the system stays responsive and doesn't get overwhelmed.
- Operators can cancel any running task at any time, and the system will clean up after itself without leaving behind broken branches or dangling files.

## User Stories

- As a team agent, I want to create autonomous work tasks that spawn sessions in isolated git worktrees so that my code changes do not interfere with the main working tree or other tasks
- As an agent operator, I want work tasks to automatically validate changes with TypeScript checks and tests, iterating on failures up to a configurable limit, so that only passing code produces pull requests
- As a team agent, I want stalled sessions to escalate to higher-tier models automatically so that tasks blocked by model limitations are retried with more capable models
- As a platform administrator, I want intern-tier models (local Ollama) blocked from git push and PR creation so that unreliable models cannot publish broken code
- As an agent operator, I want a concurrency-controlled task queue so that the system does not overload when many tasks arrive simultaneously
- As a team agent, I want PR test plan items to be verified automatically via dedicated verification tasks so that each checklist item is tested independently
- As an agent operator, I want to cancel a running work task and have the session stopped, worktree cleaned up, and status set to failed so that stuck tasks can be terminated cleanly

## Acceptance Criteria

- `WorkTaskService.create` enforces one active task per project via `createWorkTaskAtomic`; attempting to create a second active task on the same project throws an error
- Work tasks execute in git worktrees at `<worktreeBase>/<taskId>`, never in the main working tree
- Branch naming follows the convention `agent/<agent-slug>/<task-slug>-<timestamp-base36>-<random-6char>`
- Status follows the state machine: `pending -> branching -> running -> validating -> (completed | failed)`; no backward transitions are allowed
- `runValidation` executes the full pipeline: `bun install --frozen-lockfile --ignore-scripts`, then `tsc`, then tests, then security/governance scans
- Failed validation triggers a new iteration (new session with `buildIterationPrompt`) up to `WORK_MAX_ITERATIONS` (default 3); exceeding the limit marks the task as `failed`
- `finalizeTask` first checks session output for a GitHub PR URL matching `https://github.com/[^\\s]+/pull/\\d+`, then falls back to `createPrFallback` which pushes and runs `gh pr create`; failure of both marks the task as `failed`
- Worktree cleanup runs on all terminal states (completed, failed, cancelled), preserving the git branch for PR review
- `bun install` uses `--ignore-scripts` to prevent postinstall hooks from bypassing protected-file checks; falls back to non-frozen lockfile if frozen fails
- `StallDetector.onEvent` returns `true` when consecutive stalled turns (no `tool_use` content blocks) reach `CHAIN_CONTINUATION_THRESHOLD` (default 5); productive turns reset the counter
- `escalateTier` maps HAIKU -> SONNET -> OPUS; returns null for OPUS (cannot escalate further)
- `serializeChainState` redacts API keys, mnemonics, PEM blocks, and wallet credentials; caps session summaries at 800 characters
- `isInternTierModel` returns `true` for explicit `intern` name, Ollama models where `isCloud !== true`, and unknown models matching Ollama naming patterns
- `checkInternPrGuard` returns `{ blocked: true, reason }` for intern-tier models and never throws
- `TaskQueueService` enforces `maxConcurrency` (default 2 via `TASK_QUEUE_MAX_CONCURRENCY`) and dispatches pending tasks via a polling loop every `TASK_QUEUE_POLL_INTERVAL_MS` (default 5000ms)
- `TaskQueueService.enqueue` rejects with `ValidationError` when the server is shutting down
- `createVerificationTasks` parses unchecked `- [ ]` items from PR bodies and creates a work task for each; `handleVerificationComplete` checks off the PR item on success
- `WorkTaskService.recoverStaleTasks` marks stale tasks as failed and cleans up orphaned worktrees on startup
- AlgoChat lifecycle notifications (`[WORK_TASK:created]`, `[WORK_TASK:completed]`, `[WORK_TASK:failed]`) are broadcast via `sendOnChainToSelf` when `agentMessenger` is available

## Constraints

- `WORKTREE_BASE_DIR` defaults to `<project-parent>/.corvid-worktrees`
- Dispatch tick uses `BEGIN IMMEDIATE` (via `writeTransaction`) to prevent concurrent ticks from racing on the same candidates
- `model_tier` parameter on `corvid_create_work_task` maps to ModelTier (light=HAIKU, standard=SONNET, heavy=OPUS); omitting it triggers complexity-based auto-selection
- Unknown models default to HAIKU tier in `inferModelTier` (most restrictive)
- Repo map generation is capped at `REPO_MAP_MAX_LINES` (200) to keep prompts lightweight

## Out of Scope

- Git worktree creation/removal primitives (handled by lib/worktree)
- Process spawning mechanics (delegated to ProcessManager)
- Provider selection and model routing (handled by the providers module)
- GitHub API operations (handled by the github module)
- Scheduler-initiated work task execution (handled by the scheduler module)
