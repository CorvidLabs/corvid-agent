---
module: github-polling
version: 1
status: active
files:
  - server/polling/auto-merge.ts
  - server/polling/auto-update.ts
  - server/polling/ci-retry.ts
  - server/polling/github-searcher.ts
db_tables:
  - mention_polling_configs
  - sessions
  - plugins
depends_on:
  - specs/lib/infra.spec.md
  - specs/db/connection.spec.md
  - specs/db/sessions.spec.md
  - specs/process/process-manager.spec.md
---

# GitHub Polling

## Purpose

Provides the GitHub polling subsystem for corvid-agent: searches GitHub for @mentions, assignments, and PR reviews using the `gh` CLI; auto-merges passing PRs authored by the agent; automatically self-updates by pulling new commits from origin/main; and retries CI failures by spawning fix sessions.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `repoQualifier` | `repo: string` | `string` | Builds a GitHub search qualifier: `repo:owner/name` if the string contains `/`, otherwise `org:<name>` |
| `resolveFullRepo` | `configRepo: string, htmlUrl: string` | `string` | Resolves the full `owner/repo` from a GitHub HTML URL when the config repo is just an org/user name; returns configRepo unchanged if it already contains `/` |
| `shouldPollEventType` | `config: MentionPollingConfig, type: string` | `boolean` | Checks whether a polling config includes a specific event type; returns true if eventFilter is empty (poll everything) |
| `containsMention` | `body: string, username: string` | `boolean` | Checks whether a text body contains an `@mention` of the given username using a regex match |
| `filterNewMentions` | `mentions: DetectedMention[], processedIds: string[]` | `DetectedMention[]` | Filters out mentions whose IDs are already in the processed set |
| `escapeRegex` | `str: string` | `string` | Escapes special regex characters in a string |

### Exported Types

| Type | Description |
|------|-------------|
| `DetectedMention` | Interface representing a detected GitHub mention with fields: id, type, body, sender, number, title, htmlUrl, createdAt, isPullRequest |
| `GhResult` | Interface for `gh` CLI command results: `{ ok: boolean; stdout: string; stderr: string }` |
| `RunGhFn` (github-searcher) | Type alias: `(args: string[]) => Promise<GhResult>` -- injectable `gh` CLI runner |
| `RunGhFn` (auto-merge) | Type alias: `(args: string[]) => Promise<{ ok: boolean; stdout: string; stderr: string }>` -- injectable `gh` CLI runner |
| `RunGhFn` (ci-retry) | Type alias: `(args: string[]) => Promise<{ ok: boolean; stdout: string; stderr: string }>` -- injectable `gh` CLI runner |
| `IsAllowedFn` | Type alias: `(sender: string) => boolean` -- callback to check if a GitHub user is in the allowlist |

### Exported Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `AUTO_MERGE_INTERVAL_MS` | `120000` (2 min) | How often AutoMergeService checks for mergeable PRs |
| `AUTO_UPDATE_INTERVAL_MS` | `300000` (5 min) | How often AutoUpdateService checks for new commits on origin/main |
| `CI_RETRY_INTERVAL_MS` | `600000` (10 min) | How often CIRetryService checks for CI-failed PRs |
| `CI_RETRY_COOLDOWN_MS` | `1800000` (30 min) | Per-PR cooldown before spawning another CI-fix session |

### Exported Classes

| Class | Description |
|-------|-------------|
| `GitHubSearcher` | Searches GitHub for @mentions, assignments, and PR reviews via the `gh` CLI; orchestrates multiple search methods and applies allowlist filtering |
| `AutoMergeService` | Periodically squash-merges open PRs authored by the agent that have all CI checks passing |
| `AutoUpdateService` | Periodically checks if origin/main has new commits, waits for active sessions to finish, pulls changes, installs deps if needed, and exits with code 75 to trigger restart |
| `CIRetryService` | Periodically finds open PRs authored by the agent with failed CI and spawns fix sessions to resolve the failures |

#### GitHubSearcher Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `runGh: RunGhFn` | `GitHubSearcher` | Creates a searcher with an injected `gh` CLI runner |
| `fetchMentions` | `config: MentionPollingConfig, isAllowed: IsAllowedFn` | `Promise<DetectedMention[]>` | Orchestrates all search methods for a polling config, applies global and per-config allowlist filtering, returns mentions sorted newest-first |
| `searchIssueMentions` | `repo: string, username: string, since: string` | `Promise<DetectedMention[]>` | Searches for issue/PR comments mentioning the username via GitHub search API, then fetches recent comments on each matching item |
| `fetchRecentComments` | `repo: string, issueNumber: number, username: string, since: string, isPR: boolean, issueData: Record<string, unknown>` | `Promise<DetectedMention[]>` | Fetches recent comments on a specific issue/PR and identifies @mentions |
| `searchNewIssueMentions` | `repo: string, username: string, since: string` | `Promise<DetectedMention[]>` | Searches for newly created issues that mention the username in their body |
| `searchAssignedIssues` | `repo: string, username: string, since: string` | `Promise<DetectedMention[]>` | Searches for open issues/PRs recently assigned to the username |
| `searchPullRequestMentions` | `repo: string, username: string, since: string` | `Promise<DetectedMention[]>` | Searches for open PRs where the user has been requested for review |
| `searchAuthoredPRReviews` | `repo: string, username: string, since: string` | `Promise<DetectedMention[]>` | Searches for open PRs authored by the user and fetches new reviews and review comments on each |
| `fetchPRReviews` | `repo: string, prNumber: number, username: string, since: string, prTitle: string, prHtmlUrl: string` | `Promise<DetectedMention[]>` | Fetches review submissions (approve/changes_requested/comment) on a specific PR, excluding self-reviews and dismissed reviews |
| `fetchPRReviewComments` | `repo: string, prNumber: number, username: string, since: string, prTitle: string, prHtmlUrl: string` | `Promise<DetectedMention[]>` | Fetches inline code review comments on a specific PR, excluding self-comments |

#### AutoMergeService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, runGh: RunGhFn` | `AutoMergeService` | Creates the service with a database handle and `gh` CLI runner |
| `start` | _(none)_ | `void` | Starts the periodic merge check (runs immediately, then every 2 minutes) |
| `stop` | _(none)_ | `void` | Stops the periodic merge check |
| `checkAll` | _(none)_ | `Promise<void>` | Gathers unique repos from active polling configs and checks each for mergeable PRs |

#### AutoUpdateService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database` | `AutoUpdateService` | Creates the service with a database handle |
| `start` | _(none)_ | `void` | Starts the periodic update check (every 5 minutes, does not run immediately) |
| `stop` | _(none)_ | `void` | Stops the periodic update check |
| `check` | _(none)_ | `Promise<void>` | Fetches origin/main, compares hashes, waits for active sessions to finish, pulls changes, runs `bun install` if lockfile changed, and exits with code 75 to trigger restart |

#### CIRetryService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, processManager: ProcessManager, runGh: RunGhFn` | `CIRetryService` | Creates the service with a database handle, process manager, and `gh` CLI runner |
| `start` | _(none)_ | `void` | Starts the periodic CI retry check (every 10 minutes, does not run immediately) |
| `stop` | _(none)_ | `void` | Stops the periodic CI retry check |
| `checkAll` | _(none)_ | `Promise<void>` | Gathers unique repos from active polling configs and checks each for CI-failed PRs |

## Invariants

1. `GitHubSearcher` is stateless and depends only on an injected `RunGhFn` for testability.
2. `fetchMentions` pads the `lastPollAt` date by subtracting 24 hours to avoid missing mentions near midnight (GitHub search `updated:` only supports date precision).
3. Duplicate mention prevention is handled by the `processedIds` set, not by date filtering.
4. Mentions are sorted by `createdAt` descending (newest first) before being returned.
5. Global allowlist filtering is applied first (empty allowlist = open mode), then per-config `allowedUsers` further restricts the set.
6. Self-reviews and self-comments are always excluded from PR review results.
7. Dismissed reviews are excluded from results.
8. Empty COMMENTED reviews (phantom top-level for inline comments) are excluded.
9. `AutoMergeService` only squash-merges PRs where all CI checks return `"SUCCESS"` (no partial passes).
10. `AutoMergeService` uses `--squash --delete-branch` for all merges.
11. `AutoUpdateService` only runs if the current branch is `main`.
12. `AutoUpdateService` defers the update if there are active sessions (status `'running'` with a non-null pid).
13. `AutoUpdateService` exits with code 75 (`EX_TEMPFAIL`) to signal restart; the wrapper script handles the restart.
14. `AutoUpdateService` runs `bun install --frozen-lockfile --ignore-scripts` if `bun.lock` or `package.json` changed; if install fails, it rolls back with `git reset --hard` to the previous commit.
15. `AutoUpdateService` verifies that HEAD actually advanced after pull; if not, it skips restart to avoid an infinite loop.
16. `CIRetryService` enforces a 30-minute per-PR cooldown before spawning another fix session.
17. `CIRetryService` only acts on PRs with at least one `FAILURE` check and no `PENDING`/`QUEUED`/`IN_PROGRESS` checks.
18. `CIRetryService` skips PRs that already have a running session (matched by session name prefix `Poll: <repo> #<number>:`).
19. All services read from the `mention_polling_configs` table with `status = 'active'` to determine which repos to monitor.
20. `resolveFullRepo` extracts `owner/repo` from GitHub HTML URLs when the config repo is an org name.

## Behavioral Examples

### Scenario: Fetching mentions with allowlist filtering
- **Given** a MentionPollingConfig for repo `CorvidLabs` with `allowedUsers: ['alice']` and a global allowlist that allows both `alice` and `bob`
- **When** `searcher.fetchMentions(config, isAllowed)` is called and returns mentions from `alice` and `bob`
- **Then** only mentions from `alice` are returned because the per-config filter restricts to `allowedUsers`

### Scenario: Auto-merging a PR with all checks passing
- **Given** an active polling config for `CorvidLabs/corvid-agent` with `mention_username: 'corvid-bot'` and an open PR #42 authored by `corvid-bot` where all CI checks return `SUCCESS`
- **When** `autoMergeService.checkAll()` runs
- **Then** the service calls `gh pr merge 42 --repo CorvidLabs/corvid-agent --squash --delete-branch`

### Scenario: Auto-update deferred due to active sessions
- **Given** origin/main has new commits and there are 2 active sessions in the database
- **When** `autoUpdateService.check()` runs
- **Then** the service logs "Deferring auto-update" and returns without pulling or restarting

### Scenario: CI retry with cooldown enforcement
- **Given** a CI-failed PR #10 in `CorvidLabs/corvid-agent` and a fix session was spawned 15 minutes ago
- **When** `ciRetryService.checkAll()` runs
- **Then** the PR is skipped because the 30-minute cooldown has not elapsed

### Scenario: CI retry spawns a fix session
- **Given** a CI-failed PR #10 with failing checks `['typecheck', 'test']`, no running session for this PR, and cooldown has elapsed
- **When** `ciRetryService.checkAll()` runs
- **Then** a new session is created with name `Poll: CorvidLabs/corvid-agent #10: <title>` and a detailed prompt instructing the agent to clone, checkout the PR branch, diagnose CI failures, fix, and push

### Scenario: Auto-update with dependency changes
- **Given** origin/main has new commits that changed `bun.lock`
- **When** `autoUpdateService.check()` runs with no active sessions
- **Then** the service pulls changes, runs `bun install --frozen-lockfile --ignore-scripts`, and if install succeeds, exits with code 75

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `gh` CLI command fails during search | The search method returns an empty array and logs the error |
| JSON parse fails on `gh` output | Exception is caught, error is logged, empty array returned |
| `git fetch origin main` fails | `AutoUpdateService.check()` returns early without pulling |
| Not on `main` branch | `AutoUpdateService.check()` skips the update with a debug log |
| `git pull --rebase` fails | Error is logged, no restart occurs |
| `bun install` fails after pull | The pull is rolled back with `git reset --hard` to the previous commit; no restart occurs |
| HEAD does not advance after pull | Restart is skipped to prevent infinite restart loops |
| Auto-merge `gh pr merge` fails | Failure is logged at debug level, processing continues with next PR |
| CI retry session creation fails | Error is logged, processing continues with next PR |
| CI checks are pending/in-progress | PR is skipped (only pure failures with no pending checks trigger a fix) |
| Plugin already has running session for PR | CIRetryService skips the PR |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `lib/logger` | `createLogger` for structured logging |
| `db/types` | `queryCount` helper for counting active sessions |
| `db/sessions` | `createSession` for spawning CI-fix sessions |
| `process/manager` | `ProcessManager.startProcess` for launching fix sessions |
| `shared/types` | `MentionPollingConfig` type for polling configuration |
| `bun:sqlite` | `Database` type for SQLite operations |

### Consumed By

| Module | What is used |
|--------|-------------|
| `polling/mention-polling-service` | Likely consumer of `GitHubSearcher`, `AutoMergeService`, `AutoUpdateService`, `CIRetryService` |
| `routes/*` | API routes may reference polling types or trigger polling actions |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
