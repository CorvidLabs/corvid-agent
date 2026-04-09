---
spec: work-task-service.spec.md
---

## Active Tasks

- [ ] Address Ollama/Cursor quality regression: tighten `isInternTierModel` detection and improve stall detection for local models (#1500)
- [ ] Verification task auto-check: parse PR body test plan items and create per-item verification work tasks
- [ ] Add work task telemetry: track iteration counts, validation failure reasons, and model tier escalations in a queryable table
- [ ] Expose worktree disk usage and cleanup stale orphaned worktrees via a scheduled maintenance action

## Completed Tasks

- [x] Isolated git worktree execution per task at `<worktreeBase>/<taskId>`
- [x] Atomic one-active-task-per-project enforcement via `createWorkTaskAtomic`
- [x] Full validation pipeline: `bun install --frozen-lockfile`, `tsc`, tests, security/governance scans
- [x] Iteration loop up to `WORK_MAX_ITERATIONS` (default 3) with prompt refinement on failure
- [x] Intern-tier PR guard blocking Ollama models from `git push` / `gh pr create`
- [x] Task queue with configurable concurrency (`TASK_QUEUE_MAX_CONCURRENCY`, default 2)
- [x] Stall detector with tier escalation (HAIKU -> SONNET -> OPUS)
- [x] AlgoChat lifecycle notifications (`[WORK_TASK:created/completed/failed]`)
- [x] Skip repo locking for `work_task` scheduler actions to prevent silent triage failures (#1930)
