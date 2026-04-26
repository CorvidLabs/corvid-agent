---
module: scheduler-handlers
version: 2
status: active
files:
  - server/scheduler/handlers/types.ts
  - server/scheduler/handlers/utils.ts
  - server/scheduler/handlers/index.ts
  - server/scheduler/handlers/council.ts
  - server/scheduler/handlers/github.ts
  - server/scheduler/handlers/github-comment-monitor.ts
  - server/scheduler/handlers/improvement.ts
  - server/scheduler/handlers/maintenance.ts
  - server/scheduler/handlers/review.ts
  - server/scheduler/handlers/flock-testing.ts
  - server/scheduler/handlers/discord-post.ts
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

#### utils.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `resolveProjectId` | `(db: Database, tenantId: string, agent: Agent, actionProjectId?: string \| null)` | `string \| null` | Three-tier project resolution: `actionProjectId` → `agent.defaultProjectId` → first project for tenant (fallback). Returns `null` only if no projects exist for the tenant. Logs a warning when the tenant fallback is used. |

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

#### flock-testing.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `execFlockTesting` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule)` | `Promise<void>` | Runs the full Flock Directory test suite against all active agents via AlgoChat, records scores, and reports results |

#### marketplace-billing.ts (re-exported via index.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `execMarketplaceBilling` | `(ctx: HandlerContext, executionId: string)` | `void` | Processes marketplace subscription renewals, past-due expiries, and cancelled subscription expiries via `SubscriptionService.processRenewals` |

#### discord-post.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `execDiscordPost` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule, action: ScheduleAction)` | `Promise<void>` | Sends a message or embed to a Discord channel via the bot API. Requires `action.channelId` and `DISCORD_BOT_TOKEN`. Supports plain text (`message` only) or rich embeds (`embedTitle` + `message`). |

#### github-comment-monitor.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `execGitHubCommentMonitor` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule, action: ScheduleAction)` | `Promise<void>` | Monitors external GitHub comments on a repo. Fetches issue and PR comments since the last check (or 4h fallback), filters out team members (via `github_allowlist` DB table) and bot accounts, posts a Discord digest embed if external comments are found. Uses only 2 GitHub API calls per check. |

#### maintenance.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `execMemoryMaintenance` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule)` | `Promise<void>` | Archives and summarizes old memories via `summarizeOldMemories` (30-day threshold) |
| `execReputationAttestation` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule)` | `Promise<void>` | Computes reputation score, creates attestation hash, optionally publishes on-chain via AlgoChat |
| `execFlockReputationRefresh` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule)` | `Promise<void>` | Recomputes flock directory reputation scores for all non-deregistered agents |
| `execOutcomeAnalysis` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule)` | `Promise<void>` | Checks open PRs, runs weekly analysis, saves insights to memory, publishes on-chain attestation |
| `execDailyReview` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule)` | `void` | Generates daily activity summary (executions, PRs, health, observations) |
| `execStatusCheckin` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule)` | `Promise<void>` | Evaluates system state, broadcasts `[STATUS_CHECKIN]` summary to AlgoChat |
| `execActivitySummary` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule)` | `Promise<void>` | Builds daily or weekly activity metrics, stores in `activity_summaries` table, publishes on-chain attestation |
| `execCustom` | `(ctx: HandlerContext, executionId: string, schedule: AgentSchedule, action: ScheduleAction)` | `Promise<void>` | Creates an agent session with the freeform `action.prompt` and starts the process |

## Invariants

1. Every handler updates the execution status to either `completed` or `failed` before returning (or on error).
2. Handlers that require an agent (`execReviewPrs`, `execGithubSuggest`, `execCodebaseReview`, `execDependencyAudit`, `execCustom`, `execStatusCheckin`) fail with "Agent not found" if `getAgent` returns null.
3. Handlers that create sessions (`execReviewPrs`, `execGithubSuggest`, `execCodebaseReview`, `execDependencyAudit`, `execCustom`, `execImprovementLoop`) resolve the project ID via `resolveProjectId` (three-tier: action → agent default → first tenant project) and fail with "No project configured for agent" only if no projects exist at all for the tenant.
4. Session-based handlers set execution status to `running` with a `sessionId` before starting the process, then immediately mark `completed` (the session runs asynchronously — "early completion" pattern). All sessions are started with `{ schedulerMode: true, schedulerActionType: action.type }`.
5. `execWorkTask` requires `ctx.workTaskService` to be non-null; fails with "Work task service not available" otherwise.
6. `execImprovementLoop` requires `ctx.improvementLoopService` to be non-null; fails with "Improvement loop service not configured" otherwise.
7. `execReputationAttestation` requires both `ctx.reputationScorer` and `ctx.reputationAttestation` to be non-null. On-chain publishing is two-phase: compute score → create hash → attempt publish via `sendOnChainToSelf` with format `corvid-reputation:{agentId}:{hash}`. Publish is best-effort; failures are silently caught.
8. `execOutcomeAnalysis` requires `ctx.outcomeTrackerService` to be non-null. Calls three methods in sequence: `checkOpenPrs()`, `analyzeWeekly()`, `saveAnalysisToMemory()`. After building the summary, publishes a best-effort on-chain attestation via `sendOnChainToSelf` with format `corvid-weekly-summary:{agentId}:{YYYY-Www}:{sha256hex}`. Failures are silently caught; completion is not blocked.
9. `execDailyReview` requires `ctx.dailyReviewService` to be non-null.
10. `execSendMessage` requires `ctx.agentMessenger` to be non-null.
11. `execFlockTesting` requires `ctx.agentMessenger` to be non-null; fails with "Agent messenger not configured" otherwise. Tests use hardcoded config `{ mode: 'full', decayPerDay: 0.02 }`.
12. `execFlockTesting` skips testing the schedule's own agent (self-test prevention via wallet address comparison).
12a. `execFlockReputationRefresh` instantiates `FlockDirectoryService` directly (no context dependency) and calls `recomputeAllReputations()`. No service null-check needed.
13. `execCouncilLaunch` requires `councilId`, `projectId`, and `description` in the action; fails if any is missing.
14. `execStarRepos` and `execForkRepos` require `action.repos` to be non-empty. Repos are starred/forked sequentially, not in parallel.
15. `execSendMessage` requires `toAgentId` and `message` in the action.
16. `execCustom` requires `action.prompt` to be non-empty.
16a. `execDiscordPost` requires `action.channelId` to be non-empty and `DISCORD_BOT_TOKEN` env var to be set. If `embedTitle` is provided, sends an embed; otherwise sends plain text. Both `message` and `embedTitle` being absent is an error.
17. `execGitHubCommentMonitor` requires `GITHUB_TOKEN` env var; fails if not set. Default repo is `CorvidLabs/corvid-agent`. Team members are loaded from `github_allowlist` DB table; bot accounts (logins ending in `[bot]`) are also excluded. The `since` timestamp is stored in `action.description` for continuity between runs; defaults to 4 hours ago on first run. Discord notification requires both `DISCORD_BOT_TOKEN` and `action.channelId`; skipped silently if either is missing. Embed descriptions are capped at 4000 characters; comment body previews at 120 characters.
18. `execReviewPrs` creates a separate session per repo (not one session for all repos) and instructs the agent to skip PRs it has already reviewed (deduplication via comment check). Default `maxPrs` is 5 per repo.
18. Multi-tenant support: handlers that need an agent use `ctx.resolveScheduleTenantId` to resolve the tenant.
19. `execStatusCheckin` evaluates system state via `SystemStateDetector`, resolves agent name (or first 8 chars of ID as fallback), and broadcasts via `sendOnChainToSelf` with format `[STATUS_CHECKIN] Agent: {name} | System: {states} | Schedules running: {count}`.

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

### Scenario: Discord post with embed

- **Given** an action with `type: 'discord_post'`, `channelId: '123'`, `embedTitle: 'Daily Digest'`, and `message: 'Summary text'`
- **When** `execDiscordPost` is called with `DISCORD_BOT_TOKEN` set
- **Then** a Discord embed is sent to channel 123 with title "Daily Digest" and description "Summary text", and execution is marked `completed`

### Scenario: Discord post plain text

- **Given** an action with `type: 'discord_post'`, `channelId: '123'`, and `message: 'Hello'` (no `embedTitle`)
- **When** `execDiscordPost` is called
- **Then** a plain text message "Hello" is sent to channel 123

### Scenario: GitHub comment monitor with external comments

- **Given** an action with `type: 'github_comment_monitor'`, `repos: ['CorvidLabs/corvid-agent']`, and `channelId: '123'`
- **When** `execGitHubCommentMonitor` is called and 2 external issue comments are found
- **Then** a Discord embed is sent to channel 123 with title "2 External Comments on CorvidLabs/corvid-agent", and execution is marked `completed` with the comment details and updated `since` timestamp

### Scenario: GitHub comment monitor with no external comments

- **Given** an action targeting a repo with only team-member and bot comments since the last check
- **When** `execGitHubCommentMonitor` is called
- **Then** no Discord notification is sent, and execution is marked `completed` with "No external comments since ..."

### Scenario: Weekly outcome analysis with on-chain attestation

- **Given** `ctx.outcomeTrackerService` is available and `ctx.agentMessenger` is available
- **When** `execOutcomeAnalysis` is called
- **Then** open PRs are checked, weekly analysis is run and saved to memory, summary is built, SHA-256 hash is computed, note is published on-chain with format `corvid-weekly-summary:{agentId}:{YYYY-Www}:{hash}`, and execution is marked `completed` with summary including `attestation=` and `txid=`

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
| No `channelId` for discord_post | Execution marked `failed` with "No channelId provided" |
| No `DISCORD_BOT_TOKEN` env var (discord_post) | Execution marked `failed` with "DISCORD_BOT_TOKEN not configured" |
| No `GITHUB_TOKEN` env var (github_comment_monitor) | Execution marked `failed` with "GITHUB_TOKEN not configured" |
| Invalid repo format (github_comment_monitor) | Execution marked `failed` with "Invalid repo format: ..." |
| No message or embedTitle | Execution marked `failed` with "No message or embedTitle provided" |
| Discord API returns non-OK | Execution marked `failed` with status code and error body |
| Handler throws an exception | Caught internally, execution marked `failed` with error message |
| On-chain publish fails (reputation) | Silently caught; attestation still created off-chain |
| On-chain publish fails (weekly outcome) | Silently caught; execution still marked `completed` without attestation note |

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
| `server/flock-directory/service` | `FlockDirectoryService` for flock_testing agent listing |
| `server/flock-directory/testing/runner` | `FlockTestRunner` for flock_testing challenge execution |
| `server/db/github-allowlist` | `listGitHubAllowlist` for github_comment_monitor team filtering |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/scheduler/execution.ts` | All `exec*` functions via barrel import from `index.ts` |
| `server/scheduler/handlers/index.ts` | Re-exports all handler functions and `HandlerContext` type |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | corvid-agent | Initial spec |
| 2026-03-17 | corvid-agent | Added `execFlockTesting` handler for automated Flock Directory agent testing |
| 2026-03-23 | corvid-agent | Added `execDiscordPost` handler for direct Discord channel posting |
| 2026-03-31 | corvid-agent | Added `execFlockReputationRefresh` handler for automatic flock reputation refresh |
| 2026-04-09 | corvid-agent | Added `execGitHubCommentMonitor` handler for external GitHub comment monitoring |
