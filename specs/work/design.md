---
spec: work-task-service.spec.md
sources:
  - server/work/service.ts
  - server/work/service-drain.ts
  - server/work/service-recovery.ts
  - server/work/service-prompt.ts
  - server/work/service-buddy.ts
  - server/work/validation.ts
  - server/work/repo-map.ts
  - server/work/verification.ts
---

## Module Structure

`server/work/` is split into focused sub-modules:

| File | Responsibility |
|------|---------------|
| `service.ts` | `WorkTaskService` class — orchestrates the full lifecycle, delegates to sub-modules |
| `service-drain.ts` | `drainRunningTasks` — graceful shutdown polling until active tasks complete |
| `service-recovery.ts` | `recoverStaleTasks`, `recoverInterruptedTasks`, `pruneStaleWorktrees` — startup recovery |
| `service-prompt.ts` | `buildWorkPrompt`, `extractReferencedPaths`, `assessGovernanceImpact` — prompt construction |
| `service-buddy.ts` | `extractBuddyConfig`, `triggerBuddyReview` — optional peer-review integration |
| `validation.ts` | `runBunInstall`, `runValidation` — dependency install and tsc/test pipeline |
| `repo-map.ts` | `generateRepoMap`, `extractRelevantSymbols`, `tokenizeDescription` — context maps |
| `verification.ts` | PR test-plan parsing and verification task creation |

## Key Classes and Functions

### WorkTaskService (service.ts)

The central class. The public `create()` method drives the full lifecycle:
1. Validate agent/project exist and project has a `workingDir`
2. Check for an existing active task on the same project: queue or preempt as needed (via `createWorkTaskAtomic`)
3. Create a git worktree on a new branch (`agent/<slug>/<desc-slug>-<timestamp>-<random>`)
4. Run `bun install --frozen-lockfile` in the worktree
5. Build a work prompt via `buildWorkPrompt` (with optional repo map and relevant symbols)
6. Spawn a session via `processManager.startProcess` with `workDir` = worktree path
7. Subscribe to session events; on `session_exited`, run `runValidation`
8. On validation pass: extract PR URL from session output (regex) or fall back to `createPrFallback()` (`gh pr create`)
9. On validation fail below max iterations: spawn a new session with the error context; increment `iterationCount`
10. On max iterations or other failure: set status `failed`, clean up worktree
11. On completion: clean up worktree, fire `onComplete` callbacks, send AlgoChat notification

**`cancelTask(id)`** — stops the session process, sets status to `failed` with reason "Cancelled by user", cleans up worktree.

**`pruneStaleWorktrees()`** — queries terminal tasks (`completed`/`failed`) with non-null `worktree_dir`, removes each directory, clears `worktree_dir` in DB, runs `git worktree prune`. Called periodically every 6 hours.

### validation.ts

`runBunInstall` tries `bun install --frozen-lockfile --ignore-scripts`; on failure retries without `--frozen-lockfile`. `runValidation` runs install, then `bun x tsc --noEmit`, then `bun test`, then optional security/governance scans. Returns `{ passed: boolean; output: string }`.

### repo-map.ts

`generateRepoMap` calls the `AstParserService` to enumerate exported symbols per file, groups them by directory, orders by `filePathPriority` (source dirs first), and truncates at `REPO_MAP_MAX_LINES = 200`. `extractRelevantSymbols` tokenizes the task description (filtering stop words) and selects repo map lines mentioning those keywords.

### verification.ts

`parseTestPlanItems` extracts unchecked `- [ ]` items from a PR body. `createVerificationTasks` spawns a work task per unchecked item. `handleVerificationComplete` checks if the task output ends with `VERIFICATION_PASSED` and, if so, checks off the PR checkbox via `gh pr edit`.

## Configuration Values / Constants

| Constant / Env Var | Default | Description |
|--------------------|---------|-------------|
| `WORK_MAX_ITERATIONS` | `3` | Max validation-retry iterations before failing |
| `WORKTREE_BASE_DIR` | `<project-parent>/.corvid-worktrees` | Base path for git worktrees |
| `DRAIN_POLL_INTERVAL_MS` | `10000` | Polling interval during graceful shutdown drain |
| `REPO_MAP_MAX_LINES` | `200` | Max lines in generated repo map |
| Periodic cleanup interval | 6 hours | `startPeriodicCleanup` timer frequency |
| Branch name format | `agent/<agent-slug>/<task-slug>-<timestamp-base36>-<random-6char>` | Naming convention |

## Related Resources

**DB tables:**
- `work_tasks` — full lifecycle state, branch name, worktree dir, session ID, PR URL, iteration count

**External tools:**
- `git worktree add` / `rm` — worktree lifecycle
- `bun install`, `bun x tsc`, `bun test` — dependency and validation pipeline
- `gh pr create` — fallback PR creation

**AlgoChat:**
- Lifecycle events (`created`, `completed`, `failed`) broadcast via `sendOnChainToSelf` when `agentMessenger` is set
