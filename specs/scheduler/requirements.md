---
spec: scheduler-service.spec.md
---

## User Stories

- As an agent operator, I want to schedule recurring agent actions using cron expressions or intervals so that agents can proactively perform tasks (PR reviews, codebase audits, status check-ins) without manual triggering
- As a platform administrator, I want health-aware scheduling that skips or boosts actions based on system state (CI broken, P0 open, server degraded, disk pressure) so that scheduled work respects operational priorities
- As an agent operator, I want approval workflows for destructive scheduled actions so that work tasks, GitHub suggestions, and other high-impact actions require explicit authorization before execution
- As a team agent, I want pipeline execution that chains multiple actions sequentially with shared context and conditional steps so that complex workflows like "review then notify" can be expressed as a single schedule
- As a platform administrator, I want auto-pause after 5 consecutive failures so that broken schedules do not waste resources indefinitely
- As an agent operator, I want to manage schedules via MCP tools (corvid_manage_schedule) so that agents can create, pause, resume, and view their own schedules
- As a platform administrator, I want scheduled actions gated by repo locking so that two schedules targeting the same repository do not execute concurrently

## Acceptance Criteria

- `parseCron` accepts 5-field cron expressions and preset aliases (`@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`, `@annually`); throws `ValidationError` for invalid expressions
- `getNextCronDate` searches up to 366 days ahead and throws `ValidationError` if no match is found
- `describeCron` returns human-readable descriptions (e.g., "At 14:30 on Mon, Tue, Wed, Thu, Fri")
- `validateScheduleFrequency` enforces a minimum 5-minute interval (`MIN_SCHEDULE_INTERVAL_MS = 300,000`) for both cron and interval schedules
- `SchedulerService` polls for due schedules every 30 seconds; at most `MAX_CONCURRENT_EXECUTIONS` (2) actions run simultaneously
- After `MAX_CONSECUTIVE_FAILURES` (5) consecutive failures, the schedule is auto-paused and the failure counter is reset
- When `maxExecutions` is reached, the schedule status is set to `completed`
- `SystemStateDetector.evaluate` aggregates CI status, server health, P0 issues, and disk usage with a 60-second cache TTL; sub-checks run in parallel and silently return null on failure
- `evaluateAction` returns `skip` for feature_work when CI is broken or P0 is open; `server_degraded` suppresses all categories except `lightweight`; if both skip and boost apply, skip takes precedence
- `needsApproval` returns `false` for `auto` policy; checks destructive actions list for `owner_approve`; returns `true` for `council_approve`
- Destructive actions requiring approval under `owner_approve`: `work_task`, `github_suggest`, `fork_repo`, `codebase_review`, `dependency_audit`, `improvement_loop`
- `handleRepoLocking` is all-or-nothing: if any repo lock fails, all previously acquired locks are released and the execution is cancelled
- `runAction` always removes the execution from `runningExecutions` and releases all repo locks in the `finally` block
- On startup, `next_run_at` is computed from now (no missed-run catch-up) to prevent thundering herd after restart
- Session-based handlers use "early completion" pattern: set execution to `running` with `sessionId`, start the process, then immediately mark `completed`; sessions run asynchronously with `{ schedulerMode: true, schedulerActionType }`
- `executePipeline` runs steps sequentially with shared context; first step always runs; `on_success` steps run only when `!hasFailure`; `on_failure` steps run only when `hasFailure`
- Pipeline template variables (`{{pipeline.summary}}`, `{{pipeline.steps.<label>.result}}`) are interpolated in action messages/prompts before execution
- Built-in pipeline templates include `github-digest-discord`, `audit-and-improve`, `review-and-report`, `daily-digest-discord`, `release-announcement`, `cross-channel-summary`
- `execDiscordPost` requires `action.channelId` and `DISCORD_BOT_TOKEN`; supports plain text or rich embed format
- `execFlockTesting` skips testing the schedule's own agent (self-test prevention)
- Health gate timing: gates are evaluated AFTER `last_run_at` and `next_run_at` are committed, preventing rapid re-execution

## Constraints

- Day-of-week in cron supports 0-7 where both 0 and 7 represent Sunday
- System state CI and P0 checks require `GH_TOKEN` environment variable; checks silently return null if unset
- Disk pressure checks use `df -P .` against a configurable threshold (default 90%)
- Default system state config targets `CorvidLabs/corvid-agent` repository
- Notifications to `notifyAddress` are fire-and-forget; failures do not affect execution status
- AlgoChat broadcast is only sent for action types in `BROADCAST_ACTION_TYPES`
- Event callback isolation: errors in one callback do not halt subsequent callbacks
- Multi-tenant support: handlers resolve tenant ID via `resolveScheduleTenantId`

## Out of Scope

- Real-time schedule editing during active execution (config snapshot isolation protects in-flight runs)
- Distributed scheduler across multiple server instances
- Custom priority rules beyond the built-in system state rules
- Visual schedule builder or calendar UI
- Webhook-triggered schedules (handled by the workflow module's webhook_wait node)
