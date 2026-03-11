---
module: auto-update
version: 1
status: active
files:
  - server/polling/auto-update.ts
db_tables:
  - sessions
depends_on:
  - specs/db/sessions.spec.md
---

# Auto Update

## Purpose

Checks if `origin/main` has new commits, waits for all running sessions to finish, pulls changes (with `--rebase`), installs updated dependencies if `bun.lock` or `package.json` changed, and exits with code 75 to signal the wrapper script to restart the server. Runs on a 5-minute interval. Only operates when the server is on the `main` branch.

## Public API

### Exported Constants

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `AUTO_UPDATE_INTERVAL_MS` | — | `number` | Poll interval (5 minutes = 300 000 ms) |

### Exported Classes

| Class | Description |
|-------|-------------|
| `AutoUpdateService` | Manages the self-update poll loop |

#### AutoUpdateService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start` | `()` | `void` | Start the interval timer |
| `stop` | `()` | `void` | Stop the interval timer |
| `check` | `()` | `Promise<void>` | Fetch origin/main, compare hashes, pull and restart if new commits are available |

## Invariants

1. **Only updates on main branch**: If `HEAD` is not on `main`, the check exits early
2. **Waits for active sessions**: Will not pull while any session has `status = 'running'` and a non-null `pid`
3. **Reverts on failed install**: If `bun install` fails after pull, resets `HEAD` back to the pre-pull commit
4. **No-op if HEAD unchanged**: If `git pull` doesn't advance HEAD (e.g. merge conflict), skips restart to avoid infinite loop
5. **Exit code 75**: Uses `EX_TEMPFAIL` to signal "restart me" to the run-loop wrapper and launchd
6. **Idempotent start/stop**: Calling `start()` when already running is a no-op

## Behavioral Examples

### Scenario: New commits available, no active sessions

- **Given** `origin/main` is ahead of local `HEAD` and no sessions are running
- **When** `check` runs
- **Then** pulls with rebase, optionally runs `bun install`, and exits with code 75

### Scenario: New commits available but sessions running

- **Given** `origin/main` is ahead but 2 sessions have `status = 'running'`
- **When** `check` runs
- **Then** logs "Deferring auto-update" and returns without pulling; retries next cycle

### Scenario: Not on main branch

- **Given** the server is running on a feature branch
- **When** `check` runs
- **Then** exits early with a debug log

### Scenario: Dependencies changed after pull

- **Given** the pull includes changes to `bun.lock`
- **When** `check` runs after pulling
- **Then** runs `bun install --frozen-lockfile --ignore-scripts` before restarting

### Scenario: bun install fails after pull

- **Given** `bun install` exits non-zero after a successful pull
- **When** the install failure is detected
- **Then** runs `git reset --hard <pre-pull-hash>` to revert and does NOT restart

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `git fetch` fails | Returns early, no action taken |
| `git pull` fails | Logs error, returns without restarting |
| `bun install` fails | Reverts to previous commit via `git reset --hard`, returns without restarting |
| Pull doesn't advance HEAD | Logs warning, skips restart to avoid loop |
| Any exception | Caught at top level, logged as error |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/types.ts` | `queryCount` |
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `AutoUpdateService` instantiation and `start()`/`stop()` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-11 | corvid-agent | Initial spec |
