---
module: scheduler-handlers
version: 1
status: active
files:
  - server/scheduler/handlers/types.ts
  - server/scheduler/handlers/index.ts
  - server/scheduler/handlers/council.ts
  - server/scheduler/handlers/github.ts
  - server/scheduler/handlers/improvement.ts
  - server/scheduler/handlers/maintenance.ts
  - server/scheduler/handlers/blog.ts
  - server/scheduler/handlers/review.ts
  - server/scheduler/handlers/work-task.ts
db_tables:
  - schedule_executions
depends_on:
  - specs/scheduler/scheduler-service.spec.md
  - specs/work/work-task-service.spec.md
  - specs/process/process-manager.spec.md
---

# Scheduler Action Handlers

## Purpose

Individual action handler functions for each schedule action type. Each handler receives a `HandlerContext` with shared dependencies (db, process manager, services) and an execution ID, then performs the action-specific logic and updates the execution status. The `index.ts` barrel re-exports all handlers for consumption by the execution dispatcher. The `types.ts` file defines the shared `HandlerContext` interface.

## Public API

### Exported Types

#### types.ts

| Type | Description |
|------|-------------|
| `HandlerContext` | Interface providing shared dependencies to all handlers: `db`, `processManager`, `workTaskService`, `agentMessenger`, `improvementLoopService`, `reputationScorer`, `reputationAttestation`, `outcomeTrackerService`, `dailyReviewService`, `systemStateDetector`, `runningExecutions`, `resolveScheduleTenantId` |

### Exported Functions

#### index.ts (barrel re-exports)

All functions and the `HandlerContext` type listed below are re-exported from `index.ts`.

#### github.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `execStarRepos` | `(ctx: HandlerContext, executionId: string, action: ScheduleAction)` | `Promise<void>` | Stars each repo in `action.repos`; marks completed with results |
| `execForkRepos` | `(ctx: HandlerContext, executionId: string, action: ScheduleAction)` | `Promise<void>` | Forks each repo in `action.repos`; marks completed with results |
| `execReviewPrs` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule, action: ScheduleAction)` | `Promise<void>` | Lists open PRs for each repo (up to `maxPrs`, default 5), creates an agent session with a review prompt, starts the process |
| `execGithubSuggest` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule, action: ScheduleAction)` | `Promise<void>` | Creates an agent session to analyze repos and suggest improvements; optionally auto-creates work tasks if `autoCreatePr` is set |

#### work-task.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `execWorkTask` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule, action: ScheduleAction)` | `Promise<void>` | Creates a work task via `WorkTaskService.create` with the action's description and project |

#### council.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `execCouncilLaunch` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule, action: ScheduleAction)` | `Promise<void>` | Launches a council deliberation with the specified `councilId`, `projectId`, and `description` |
| `execSendMessage` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule, action: ScheduleAction)` | `Promise<void>` | Sends an agent-to-agent message via `agentMessenger.invokeAndWait` and captures the response |

#### review.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `execCodebaseReview` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule, action: ScheduleAction)` | `Promise<void>` | Creates an agent session that runs tsc, tests, finds TODOs, identifies large files, and creates work tasks for fixes |
| `execDependencyAudit` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule, action: ScheduleAction)` | `Promise<void>` | Creates an agent session that checks outdated/vulnerable dependencies and creates work tasks for critical updates |

#### improvement.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `execImprovementLoop` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule, action: ScheduleAction)` | `Promise<void>` | Runs the autonomous improvement loop via `AutonomousLoopService.run` with optional `maxTasks` and `focusArea` |

#### blog.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `execBlogWrite` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule, action: ScheduleAction)` | `Promise<void>` | Creates an agent session that researches recent project activity and writes a blog post, committing to the corvid-pages repo |

#### marketplace-billing.ts (re-exported via index.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `execMarketplaceBilling` | `(ctx: HandlerContext, executionId: string)` | `void` | Processes marketplace subscription renewals, past-due expiries, and cancelled subscription expiries via `SubscriptionService.processRenewals` |

#### maintenance.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `execMemoryMaintenance` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule)` | `Promise<void>` | Archives and summarizes old memories via `summarizeOldMemories` (30-day threshold) |
| `execReputationAttestation` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule)` | `Promise<void>` | Computes reputation score, creates attestation hash, optionally publishes on-chain via AlgoChat |
| `execOutcomeAnalysis` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule)` | `Promise<void>` | Checks open PRs, runs weekly analysis, saves insights to memory |
| `execDailyReview` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule)` | `void` | Generates daily activity summary (executions, PRs, health, observations) |
| `execStatusCheckin` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule)` | `Promise<void>` | Evaluates system state, broadcasts `[STATUS_CHECKIN]` summary to AlgoChat |
| `execCustom` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule, action: ScheduleAction)` | `Promise<void>` | Creates an agent session with the freeform `action.prompt` and starts the process |

## Invariants

1. Every handler updates the execution status to either `completed` or `failed` before returning (or on error).
2. Handlers that require an agent (`execReviewPrs`, `execGithubSuggest`, `execCodebaseReview`, `execDependencyAudit`, `execBlogWrite`, `execCustom`, `execStatusCheckin`) fail with "Agent not found" if `getAgent` returns null.
3. Handlers that create sessions (`execReviewPrs`, `execGithubSuggest`, `execCodebaseReview`, `execDependencyAudit`, `execBlogWrite`, `execCustom`) require a project ID (from action or agent default) and fail with "No project configured" if unavailable.
4. Session-based handlers set execution status to `running` with a `sessionId` before starting the process, then immediately mark `completed` (the session runs asynchronously).
5. `execWorkTask` requires `ctx.workTaskService` to be non-null; fails with "Work task service not available" otherwise.
6. `execImprovementLoop` requires `ctx.improvementLoopService` to be non-null; fails with "Improvement loop service not configured" otherwise.
7. `execReputationAttestation` requires both `ctx.reputationScorer` and `ctx.reputationAttestation` to be non-null.
8. `execOutcomeAnalysis` requires `ctx.outcomeTrackerService` to be non-null.
9. `execDailyReview` requires `ctx.dailyReviewService` to be non-null.
10. `execSendMessage` requires `ctx.agentMessenger` to be non-null.
11. `execCouncilLaunch` requires `councilId`, `projectId`, and `description` in the action; fails if any is missing.
12. `execStarRepos` and `execForkRepos` require `action.repos` to be non-empty.
13. `execSendMessage` requires `toAgentId` and `message` in the action.
14. `execCustom` requires `action.prompt` to be non-empty.
15. On-chain publishing in `execReputationAttestation` is best-effort; failures are silently caught.
16. `execReviewPrs` instructs the agent to skip PRs it has already reviewed (deduplication via comment check).
17. Multi-tenant support: handlers that need an agent use `ctx.resolveScheduleTenantId` to resolve the tenant.

## Behavioral Examples

### Scenario: Star repos action

- **Given** an action with `type: 'star_repo'` and `repos: ['owner/repo1', 'owner/repo2']`
- **When** `execStarRepos` is called
- **Then** each repo is starred via `github.starRepo`, and execution is marked `completed` with results

### Scenario: Work task creation

- **Given** an action with `type: 'work_task'` and `description: 'Fix lint errors'`
- **When** `execWorkTask` is called with a non-null `workTaskService`
- **Then** a work task is created, and execution is marked `completed` with the task ID and branch name

### Scenario: PR review with deduplication

- **Given** a `review_prs` action targeting a repo with 3 open PRs
- **When** `execReviewPrs` is called
- **Then** a session is created with a prompt instructing the agent to check for existing reviews before commenting

### Scenario: Reputation attestation with on-chain publish

- **Given** `reputationScorer`, `reputationAttestation`, and `agentMessenger` are all available
- **When** `execReputationAttestation` is called
- **Then** score is computed, attestation hash is created, the hash is published on-chain via AlgoChat, and execution is marked `completed` with score and txid

### Scenario: Missing required service

- **Given** `ctx.workTaskService` is null
- **When** `execWorkTask` is called
- **Then** execution is immediately marked as `failed` with "Work task service not available"

### Scenario: Daily review summary

- **Given** `ctx.dailyReviewService` is available and returns execution/PR/health stats
- **When** `execDailyReview` is called
- **Then** execution is marked `completed` with a summary of completed/failed executions, opened/merged/closed PRs, uptime, and observations

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `action.repos` is empty (star/fork/review/suggest) | Execution marked `failed` with "No repos specified" |
| Agent not found | Execution marked `failed` with "Agent not found" |
| No project configured | Execution marked `failed` with "No project configured for agent" |
| Required service is null | Execution marked `failed` with service-specific message |
| Missing required action fields | Execution marked `failed` with field-specific message |
| Handler throws an exception | Caught internally, execution marked `failed` with error message |
| On-chain publish fails (reputation) | Silently caught; attestation still created off-chain |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/schedules` | `updateExecutionStatus` for status updates |
| `server/db/agents` | `getAgent` for agent lookup |
| `server/db/sessions` | `createSession` for session-based handlers |
| `server/github/operations` | `starRepo`, `forkRepo`, `listOpenPrs` |
| `server/routes/councils` | `launchCouncil` for council_launch action |
| `server/memory/summarizer` | `summarizeOldMemories` for memory_maintenance |
| `server/process/manager` | `ProcessManager.startProcess` for session-based handlers |
| `server/work/service` | `WorkTaskService.create` for work_task action |
| `server/improvement/service` | `AutonomousLoopService.run` for improvement_loop action |
| `server/algochat/agent-messenger` | `AgentMessenger` for messaging and on-chain operations |
| `server/reputation/scorer` | `ReputationScorer` for reputation_attestation |
| `server/reputation/attestation` | `ReputationAttestation` for attestation creation and publishing |
| `server/feedback/outcome-tracker` | `OutcomeTrackerService` for outcome_analysis |
| `server/improvement/daily-review` | `DailyReviewService` for daily_review |
| `server/scheduler/system-state` | `SystemStateDetector` for status_checkin |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/scheduler/execution.ts` | All `exec*` functions via barrel import from `index.ts` |
| `server/scheduler/handlers/index.ts` | Re-exports all handler functions and `HandlerContext` type |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | corvid-agent | Initial spec |
