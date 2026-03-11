---
module: auto-merge
version: 1
status: active
files:
  - server/polling/auto-merge.ts
db_tables:
  - mention_polling_configs
depends_on:
  - specs/polling/mention-polling-db.spec.md
---

# Auto Merge

## Purpose

Squash-merges open PRs authored by the agent that have all CI checks passing. Runs on a 2-minute interval, scanning active polling configs for repos to check. Before merging, validates each PR's diff for security issues (protected file modifications, unapproved external fetches, malicious code patterns). Flagged PRs receive a comment and are left for human review.

## Public API

### Exported Constants

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `AUTO_MERGE_INTERVAL_MS` | — | `number` | Poll interval (2 minutes = 120 000 ms) |

### Exported Types

| Type | Description |
|------|-------------|
| `RunGhFn` | Signature for the `gh` CLI runner: `(args: string[]) => Promise<{ ok, stdout, stderr }>` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `AutoMergeService` | Manages the auto-merge poll loop and security validation |

#### AutoMergeService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start` | `()` | `void` | Start the interval timer; runs `checkAll` immediately then every `AUTO_MERGE_INTERVAL_MS` |
| `stop` | `()` | `void` | Stop the interval timer |
| `checkAll` | `()` | `Promise<void>` | Scan all active polling configs and attempt to merge qualifying PRs |
| `validateDiff` | `(repo: string, prNumber: number)` | `Promise<string \| 'skip' \| null>` | Validate a PR diff for security issues. Returns `null` if safe, `'skip'` if diff unavailable, or a rejection reason string |

## Invariants

1. **Blocklisted repos are never merged**: `isRepoBlocked` check runs before any merge attempt
2. **Security validation before merge**: Every PR passes `validateDiff` (protected paths, fetch detector, code scanner) before squash-merge
3. **Flagged PRs are commented once**: The `flaggedPRs` set prevents duplicate security-flag comments on the same PR
4. **PRs are never closed by this service**: Only humans may close PRs — the service only merges or leaves a comment
5. **Only agent-authored PRs are processed**: Search query filters by `author:<username>` from the polling config
6. **Idempotent start/stop**: Calling `start()` when already running is a no-op; `stop()` clears the timer

## Behavioral Examples

### Scenario: All CI checks pass and diff is clean

- **Given** an open PR authored by the agent with all checks in `SUCCESS` state
- **When** `checkAll` runs
- **Then** `validateDiff` returns `null`, and the PR is squash-merged with `--delete-branch`

### Scenario: CI checks pass but diff has security issues

- **Given** an open PR with passing CI but the diff modifies a protected file
- **When** `checkAll` runs
- **Then** `validateDiff` returns a rejection string, a comment is posted on the PR, and the PR is NOT merged

### Scenario: Diff cannot be fetched

- **Given** a PR where the GitHub API returns an error for the diff endpoint
- **When** `validateDiff` is called
- **Then** it returns `'skip'` and the PR is retried next cycle (no comment posted)

### Scenario: Repo is blocklisted

- **Given** a repo that appears in the repo blocklist
- **When** `checkAll` iterates active configs
- **Then** that repo is skipped entirely

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `gh` search API fails | Returns early for that repo, logs nothing (silent skip) |
| PR diff fetch fails | Returns `'skip'` — retried next cycle |
| Merge command fails | Logs debug message, continues to next PR |
| Exception in `checkAll` | Caught at top level, logged as error, loop continues |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/polling/github-searcher.ts` | `resolveFullRepo` |
| `server/db/repo-blocklist.ts` | `isRepoBlocked` |
| `server/process/protected-paths.ts` | `isProtectedPath` |
| `server/lib/fetch-detector.ts` | `scanDiff` |
| `server/lib/code-scanner.ts` | `scanDiff` |
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `AutoMergeService` instantiation and `start()`/`stop()` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-11 | corvid-agent | Initial spec |
