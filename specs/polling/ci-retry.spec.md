---
module: ci-retry
version: 1
status: active
files:
  - server/polling/ci-retry.ts
db_tables:
  - mention_polling_configs
  - sessions
depends_on:
  - specs/polling/mention-polling-db.spec.md
  - specs/db/sessions/sessions.spec.md
  - specs/process/process-manager.spec.md
---

# CI Retry

## Purpose

Spawns fix sessions for PRs authored by the agent that have failed CI checks. Runs on a 10-minute interval, scanning active polling configs for repos to check. Enforces a 30-minute cooldown per PR to avoid spawning redundant fix sessions. The spawned session clones the repo, checks out the PR branch, diagnoses failures, and pushes fixes to the existing branch.

## Public API

### Exported Constants

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `CI_RETRY_INTERVAL_MS` | — | `number` | Poll interval (10 minutes = 600 000 ms) |
| `CI_RETRY_COOLDOWN_MS` | — | `number` | Per-PR cooldown before re-spawning a fix session (30 minutes = 1 800 000 ms) |

### Exported Types

| Type | Description |
|------|-------------|
| `RunGhFn` | Signature for the `gh` CLI runner: `(args: string[]) => Promise<{ ok, stdout, stderr }>` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `CIRetryService` | Manages the CI retry poll loop and fix session spawning |

#### CIRetryService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start` | `()` | `void` | Start the interval timer (does NOT run immediately — waits for first interval) |
| `stop` | `()` | `void` | Stop the interval timer |
| `checkAll` | `()` | `Promise<void>` | Scan all active polling configs and spawn fix sessions for failing PRs |

## Invariants

1. **30-minute cooldown per PR**: The `lastSpawn` map enforces `CI_RETRY_COOLDOWN_MS` between fix sessions for the same `repo#number`
2. **No concurrent sessions per PR**: Checks for existing running sessions with a matching `name LIKE 'Poll: repo #number:%'` prefix
3. **Only acts on failures, not pending**: PRs with pending/queued/in-progress checks are skipped — only definitive failures trigger a fix session
4. **Does not run immediately on start**: Unlike AutoMergeService, the first check waits for the interval to elapse
5. **Fix sessions push to existing branch**: The generated prompt instructs the agent to checkout the PR branch, not create a new PR
6. **Idempotent start/stop**: Calling `start()` when already running is a no-op

## Behavioral Examples

### Scenario: PR with failed CI and no cooldown

- **Given** an open PR authored by the agent with `FAILURE` state checks and no pending checks
- **When** `checkAll` runs and no cooldown is active for this PR
- **Then** a session named `Poll: repo #N: <title>` is created with a CI-fix prompt, and the cooldown timer is set

### Scenario: PR with failed CI but within cooldown

- **Given** a PR that had a fix session spawned 15 minutes ago
- **When** `checkAll` runs
- **Then** the PR is skipped because `CI_RETRY_COOLDOWN_MS` (30 min) has not elapsed

### Scenario: PR with mixed failure and pending checks

- **Given** a PR with one `FAILURE` check and one `IN_PROGRESS` check
- **When** `checkAll` evaluates the checks
- **Then** the PR is skipped (pending checks mean CI is still running)

### Scenario: Existing running session for the PR

- **Given** a PR with failed CI but a session matching `Poll: repo #N:%` already has `status = 'running'`
- **When** `checkAll` runs
- **Then** the PR is skipped to avoid duplicate sessions

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `gh` search API fails | Returns early for that repo (silent skip) |
| `gh pr checks` fails | Skips that PR, continues to next |
| Session creation fails | Logs error, continues to next PR |
| Exception in `checkAll` | Caught at top level, logged as error, loop continues |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/polling/github-searcher.ts` | `resolveFullRepo` |
| `server/db/sessions.ts` | `createSession` |
| `server/process/manager.ts` | `ProcessManager.startProcess` |
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `CIRetryService` instantiation and `start()`/`stop()` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-11 | corvid-agent | Initial spec |
