---
spec: work-task-service.spec.md
---

## Automated Testing

No test files currently exist for this module. Recommended test files:

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/work/service.test.ts` | Integration | Full lifecycle happy path, max-iterations exhaustion, cancellation, PR URL extraction, fallback PR creation, queueing when project has active task |
| `server/work/validation.test.ts` | Unit | `runBunInstall` frozen-lockfile fallback, `runValidation` pass/fail detection |
| `server/work/repo-map.test.ts` | Unit | `filePathPriority` ordering, `tokenizeDescription` stop-word filtering, `extractRelevantSymbols` keyword matching, `REPO_MAP_MAX_LINES` truncation |
| `server/work/verification.test.ts` | Unit | `parseTestPlanItems` parses only unchecked items, `parsePrUrl` handles various URL formats, `isVerificationTask` detects `verify:` prefix |
| `server/work/service-recovery.test.ts` | Unit | `recoverStaleTasks` resets branching/running tasks, `pruneStaleWorktrees` clears orphaned dirs |

Key fixtures: in-memory SQLite with `work_tasks` schema; stub `ProcessManager` that resolves session events on demand; temporary `git init` repo for worktree tests.

## Manual Testing

- [ ] Create a work task from the UI; verify status transitions (pending → branching → running) appear in real time on the work tasks page.
- [ ] Let a work task complete successfully; confirm a PR appears on GitHub and the task shows `completed` with a PR link.
- [ ] Introduce a TypeScript error in a branch to trigger validation failure; verify the task retries up to 3 times then marks `failed`.
- [ ] Cancel a running work task; verify the worktree directory is cleaned up and the task shows `failed` with "Cancelled by user".
- [ ] Restart the server while a task is `branching`; verify `recoverStaleTasks` marks it `failed` on restart.
- [ ] Trigger `pruneStaleWorktrees` manually (or wait for the 6-hour timer); verify orphaned directories under `.corvid-worktrees` are removed.

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Agent not found | Throws `"Agent {id} not found"` before any DB writes |
| Project not found | Throws `"Project {id} not found"` |
| Project has no `workingDir` | Throws `"Project {id} has no workingDir"` |
| Agent has no `defaultProjectId` and none provided | Throws "No projectId provided" |
| Active task exists for project | New task queued (`status = 'queued'`), active task continues |
| Active task is lower priority | Active task preempted; new task runs immediately |
| Atomic insert race condition | New task is queued as fallback (never rejected) |
| Git worktree creation fails | Task status set to `failed`; worktree cleanup attempted; task returned |
| `bun install --frozen-lockfile` fails | Retried without `--frozen-lockfile`; task continues |
| Validation passes, session output has PR URL | Status `completed`, `pr_url` set, worktree removed |
| Validation passes, no PR URL in output | `gh pr create` fallback attempted |
| Validation passes, fallback PR creation fails | Task `failed` with "no PR URL" error |
| `iterationCount` reaches `WORK_MAX_ITERATIONS` | Task `failed` with validation output in `error` |
| `cancelTask` called with unknown ID | Returns `null` |
| `onComplete` callback throws | Error logged; other callbacks still fire |
| AlgoChat `sendOnChainToSelf` throws | Error swallowed (fire-and-forget); task lifecycle unaffected |
| Verification task output ends with `VERIFICATION_PASSED` | PR checkbox checked off via `gh pr edit` |
| Verification task output does not end with `VERIFICATION_PASSED` | Checkbox left unchecked |
