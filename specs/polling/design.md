---
spec: github-polling.spec.md
sources:
  - server/polling/auto-merge.ts
  - server/polling/auto-update.ts
  - server/polling/ci-retry.ts
  - server/polling/github-searcher.ts
---

## Module Structure

Four focused files under `server/polling/`:
- `github-searcher.ts` — stateless `GitHubSearcher` class with injected `RunGhFn`; all search methods (issue/PR mentions, assignments, review requests, authored PR reviews)
- `auto-merge.ts` — `AutoMergeService` with 2-minute polling; squash-merges passing PRs authored by the agent
- `auto-update.ts` — `AutoUpdateService` with 5-minute polling; fetches origin/main, defers if sessions active, pulls and exits with code 75
- `ci-retry.ts` — `CIRetryService` with 10-minute polling; finds CI-failed PRs and spawns fix sessions

Mention polling orchestration is in `server/polling/mention-polling-service.ts` (separate spec), which composes `GitHubSearcher` with the above services.

## Key Classes and Functions

**`GitHubSearcher`** — Pure search logic with no state beyond the injected `RunGhFn`. `fetchMentions()` calls up to 6 search methods, deduplicates, applies allowlist (global first, then per-config), and sorts newest-first. All methods pad `lastPollAt` by 24 hours to compensate for GitHub search date-only precision.

**`AutoMergeService`** — Reads all `mention_polling_configs` with `status = 'active'` on each tick. For each unique repo, calls `gh pr list --author @me --json` then `gh pr checks` to verify all statuses are `SUCCESS`. Merges with `--squash --delete-branch`.

**`AutoUpdateService`** — Only runs on `main` branch. Compares `git rev-parse origin/main` vs `HEAD`. Defers if any session row has `status = 'running'` and non-null `pid`. After successful pull, checks if `bun.lock` or `package.json` changed; if so, runs `bun install --frozen-lockfile --ignore-scripts`. Rolls back on install failure. Exits with code 75 to trigger wrapper restart.

**`CIRetryService`** — Reads configs to find repos, lists open PRs authored by agent, runs `gh pr checks` to identify pure failures (no PENDING/IN_PROGRESS), checks 30-minute cooldown via session name prefix, then calls `processManager.startProcess()` with a detailed fix prompt.

## Configuration Values

| Constant | Value | Description |
|----------|-------|-------------|
| `AUTO_MERGE_INTERVAL_MS` | `120000` | 2-minute auto-merge polling |
| `AUTO_UPDATE_INTERVAL_MS` | `300000` | 5-minute auto-update check |
| `CI_RETRY_INTERVAL_MS` | `600000` | 10-minute CI retry polling |
| `CI_RETRY_COOLDOWN_MS` | `1800000` | 30-minute per-PR cooldown |

## Related Resources

**DB tables:** `mention_polling_configs` (active polling configurations), `sessions` (active session check for auto-update deferral and CI retry deduplication).

**Consumed by:**
- `server/polling/mention-polling-service.ts` — orchestrates all four services together
- `server/routes/*` — API routes may trigger polling or read config state
