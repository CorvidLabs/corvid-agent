---
spec: scheduler-service.spec.md
---

## Active Tasks

- [ ] Add visual schedule management to the Automation settings panel: create, pause, resume, and view next-run times (#1490)
- [ ] Implement approval workflow UI: surface pending approval requests in the dashboard for operators to accept or reject
- [ ] Add GitHub external comment monitor handler — watch for PR/issue comments from external contributors and route to agents (#1932 adjacent)
- [ ] Expose schedule execution history (last N runs, status, duration) via API and dashboard

## Completed Tasks

- [x] Cron parser with 5-field expressions and preset aliases (`@hourly`, `@daily`, etc.)
- [x] `SchedulerService` polling every 30 seconds with `MAX_CONCURRENT_EXECUTIONS = 2`
- [x] Auto-pause after `MAX_CONSECUTIVE_FAILURES = 5` consecutive failures
- [x] `SystemStateDetector` with CI, P0, server health, and disk pressure gates (60-second TTL)
- [x] `evaluateAction` skip/boost logic with skip-takes-precedence over boost
- [x] Pipeline execution with sequential steps, shared context, and `on_success`/`on_failure` branching
- [x] `handleRepoLocking` all-or-nothing lock acquisition with release on failure
- [x] GitHub external comment monitor scheduler action (#72dd88e0)
- [x] 6 built-in pipeline templates: `github-digest-discord`, `audit-and-improve`, `review-and-report`, `daily-digest-discord`, `release-announcement`, `cross-channel-summary`
