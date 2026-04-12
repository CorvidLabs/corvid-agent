---
module: mention-polling-service
version: 2
status: active
files:
  - server/polling/service.ts
db_tables:
  - mention_polling_configs
  - sessions
depends_on:
  - specs/db/sessions/sessions.spec.md
---

# Mention Polling Service

## Purpose

Polls GitHub for @mentions, PR reviews, issue assignments, and review comments without requiring a public webhook URL. Uses the `gh` CLI to search configured repos on a per-config interval, detecting actionable events and triggering agent sessions. This is the local-first alternative to webhooks — works entirely on the user's device with no public URL needed. Delegates auto-merge, CI retry, and auto-update concerns to companion sub-services (`AutoMergeService`, `CIRetryService`, `AutoUpdateService`).

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `MentionPollingService` | Core polling engine that manages the poll loop, sub-services, and triggers agent sessions |

#### MentionPollingService Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | bun:sqlite database handle |
| `processManager` | `ProcessManager` | Session process manager for spawning agent sessions |
| `_workTaskService` | `unknown` (optional) | Unused legacy parameter, kept for API compat |

Initializes `DedupService` (namespace `polling:triggers`, maxSize 500, TTL 60s), `GitHubSearcher`, and three sub-services: `AutoMergeService`, `CIRetryService`, `AutoUpdateService`.

#### MentionPollingService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `setSchedulerService` | `(service: SchedulerService)` | `void` | Set scheduler service for triggering event-based schedules on mention triggers |
| `onEvent` | `(callback: PollingEventCallback)` | `() => void` | Subscribe to polling events (e.g. for WebSocket broadcast). Returns unsubscribe function |
| `start` | `()` | `void` | Start the polling loop and all sub-services. Runs immediately then on POLL_LOOP_INTERVAL_MS (15s). No-op if already running |
| `stop` | `()` | `void` | Stop the polling loop, all sub-services, and clear the interval timer |
| `getStats` | `()` | `{ isRunning, activeConfigs, totalConfigs, totalTriggers }` | Get polling stats for the dashboard |

## Invariants

1. **Self-mentions are never processed**: Comments/reviews authored by the `mentionUsername` itself are skipped to prevent infinite loops (enforced in `GitHubSearcher`)
2. **processedIds set prevents duplicate triggers**: Each processed mention ID is persisted immediately; the set is capped at 200 entries in the DB layer (oldest trimmed on overflow via `updateProcessedIds`)
3. **Issue-number dedup**: Multiple mentions for the same issue/PR number (e.g. `comment-123`, `issue-8`, `assigned-8` all for #8) collapse to one session. The first (newest) is kept. All related IDs are added to processedIds together
4. **Session guard**: No concurrent sessions for the same issue — a `name LIKE` query checks for existing `running` sessions only. Completed and idle sessions do NOT block new mentions (follow-up comments are legitimate new work; dedup of the same comment is handled by processedIds)
5. **Rate limiting via DedupService**: 60s minimum gap between triggers for the same mention ID (keyed by `configId:mentionId`), managed by a global `DedupService` instance with namespace `polling:triggers` (maxSize 500, TTL matching `MIN_TRIGGER_GAP_MS`)
6. **GitHub user allowlist**: Mention senders are checked against the GitHub allowlist via `isGitHubUserAllowed` (delegated to `GitHubSearcher`)
7. **Review feedback prompt uses checkout-and-push**: Mentions with `review-` or `reviewcomment-` prefix ID use the review feedback prompt which checks out the existing PR branch and pushes fixes, rather than creating a new PR
8. **Max 3 concurrent polls**: At most `MAX_CONCURRENT_POLLS` (3) configs are polled simultaneously to avoid GitHub API rate limits
9. **Poll date is padded by 1 day**: The `sinceDate` is padded back 24 hours from `lastPollAt` because GitHub search only supports date precision. Dedup relies on processedIds, not date filtering (enforced in `GitHubSearcher`)
10. **Repo blocklist and off-limits guard**: Mentions from repos on the blocklist (`isRepoBlocked`) or off-limits list (`isRepoOffLimits`) are silently skipped
11. **Dependency checking**: Issues with `<!-- blocked-by: #N -->` markers are skipped while any blocker issue is still open. Issue state is cached for 5 minutes (`ISSUE_STATE_TTL_MS`)
12. **Human-assignment guard**: Non-assignment mentions on issues assigned exclusively to humans (not the bot) are skipped to respect human ownership
13. **Prompt injection scanning**: Mention bodies from non-bot senders are scanned via `scanGitHubContent`; HIGH/CRITICAL confidence matches are blocked (mention marked as processed to prevent retry loops)
14. **Acknowledgment comment**: On successful trigger, an immediate acknowledgment comment is posted to the GitHub issue/PR
15. **Completion tracking**: The service subscribes to session end events; on error or manual stop, a follow-up comment is posted to ensure the issue does not go silent after acknowledgment
16. **Event-based schedule triggering**: After successful triggers, matching event-based schedules (type `github_poll`, action `mention`) are fired via the `SchedulerService`
17. **Observability context**: Each poll config execution runs inside an event context via `runWithEventContext` for tracing
18. **Cross-config session dedup**: When multiple polling configs detect the same repo#number, only the first config triggers a session. Managed by `DedupService` namespace `polling:session-dedup` (maxSize 500, TTL 5 minutes). Prevents duplicate agent responses when multiple configs overlap on the same repository

## Behavioral Examples

### Scenario: @mention in issue comment triggers session

- **Given** a polling config for `owner/repo` watching for `@agent-user`
- **When** a new comment mentioning `@agent-user` is found on issue #42
- **Then** a session named `Poll: owner/repo #42: <title>` is created with source `agent`, the comment ID is added to processedIds, an acknowledgment comment is posted on the issue, and the service subscribes for session completion events

### Scenario: PR review with changes_requested triggers session

- **Given** a polling config watching for PR reviews on PRs authored by `agent-user`
- **When** a reviewer submits a `changes_requested` review on PR #10
- **Then** a session is created with a review feedback prompt that instructs the agent to clone, checkout the PR branch, make fixes, and push (not create a new PR)

### Scenario: Duplicate mention is skipped

- **Given** a mention with ID `comment-456` that is already in the config's `processedIds`
- **When** the next poll cycle finds the same mention
- **Then** the mention is filtered out by `filterNewMentions` and no session is created

### Scenario: Self-review is skipped

- **Given** a PR authored by `agent-user` with a review also by `agent-user`
- **When** the poll fetches PR reviews
- **Then** the self-review is skipped (reviewer username matches mentionUsername)

### Scenario: Cross-config session dedup prevents duplicate responses

- **Given** two polling configs (A and B) both covering `owner/repo`
- **When** a reviewer approves PR #226, detected by both configs
- **Then** config A triggers a session; config B is skipped because `polling:session-dedup` already has the key `owner/repo#226`

### Scenario: Multiple mentions for same issue collapse

- **Given** issue #8 appears in both `searchIssueMentions` (as `comment-100`) and `searchAssignedIssues` (as `assigned-8`)
- **When** mentions are deduplicated by issue number
- **Then** only one session is created for #8, and both `comment-100` and `assigned-8` are added to processedIds

### Scenario: Stampede — 100 mentions arrive in one poll cycle

- **Given** a polling config for `org/repo` watching `@agent-user`
- **When** 100 different issues all mention `@agent-user` between two poll cycles
- **Then** issue-number dedup collapses duplicates per issue, and the per-cycle trigger cap (`MAX_TRIGGERS_PER_CYCLE`, default 5) limits how many sessions are created in a single cycle. Remaining unprocessed mentions stay unprocessed and will be picked up in the next cycle (they are not yet in processedIds). Combined with the running-session guard, this prevents runaway session spawning

### Scenario: Blocked issue is deferred

- **Given** issue #15 has `<!-- blocked-by: #10 -->` in its body, and issue #10 is still open
- **When** a mention is detected on issue #15
- **Then** the mention is skipped (returns false), leaving it unprocessed so it retries next cycle when #10 may be closed

### Scenario: Prompt injection is blocked

- **Given** a mention from an external user containing high-confidence prompt injection patterns
- **When** `scanGitHubContent` returns `blocked: true`
- **Then** the mention is marked as processed (to prevent retry loops) but no session is created

### Scenario: Issue assigned to human is skipped

- **Given** issue #20 is assigned to `human-dev` (not the bot), and a comment mentions `@agent-user`
- **When** the human-assignment guard runs
- **Then** the mention is skipped because the issue is assigned exclusively to humans

### Scenario: PR/session accumulation over time

- **Given** a high-traffic repo generating many mention-triggered sessions over weeks
- **When** sessions accumulate (some completed, some errored, some with open PRs from work tasks)
- **Then** the system relies on existing guards (running-session guard, processedIds dedup, one active work task per project) to bound concurrent work. There is no automatic PR cleanup — stale PRs on poorly maintained repos remain open until manually closed or the project owner acts. This is by design: the agent should not unilaterally close PRs that may still be reviewed

## Throttling Gaps and Known Limits

| Area | Current Behavior | Risk |
|------|-----------------|------|
| Global session concurrency | No hard cap — ProcessManager spawns all qualifying sessions | Memory/CPU exhaustion under stampede conditions |
| Per-cycle trigger cap | `MAX_TRIGGERS_PER_CYCLE` (5) limits sessions per config per poll | Remaining mentions deferred to next cycle |
| PR accumulation | No automatic cleanup of stale PRs created by work tasks | Repos with low review throughput accumulate open PRs |
| processedIds cap | Capped at 200 entries in DB layer; oldest trimmed on overflow | Very old mentions can theoretically re-trigger after 200+ newer ones |
| DedupService trigger cache | Capped at 500 entries with 60s TTL | Extremely high-volume configs could evict entries before TTL |

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `GH_TOKEN` not configured | `runGh` returns `{ ok: false }`, mentions array stays empty |
| `gh` CLI command fails | Returns empty array for that search path, logs error, continues |
| Agent not found for config | Logs error, returns false from `processMention` |
| Session creation fails | Logs error, returns false from `processMention` |
| Poll errors (any exception) | `lastPollAt` still updated to avoid hammering on persistent errors |
| Acknowledgment comment fails | Logged as warning, does not block session creation |
| Completion comment fails | Logged as warning, session still considered complete |
| Event-based schedule trigger fails | Logged as debug, does not affect polling |

## Search Paths

The search paths are delegated to `GitHubSearcher` (in `server/polling/github-searcher.ts`). The service uses 5 search paths to detect actionable events:

| # | Method | Event Type | Description |
|---|--------|-----------|-------------|
| 1 | `searchIssueMentions` | `issue_comment` | Issue/PR comments mentioning user. Uses GitHub search API, then fetches individual comment threads |
| 2 | `searchNewIssueMentions` | `issues` | Newly created issues mentioning user in the body |
| 3 | `searchAssignedIssues` | (always runs) | Issues/PRs assigned to user. Not filtered by event type — always checked |
| 4 | `searchAuthoredPRReviews` → `fetchPRReviews` | `pull_request_review_comment` | Review submissions (approve/changes_requested/comment) on PRs authored by user |
| 5 | `searchAuthoredPRReviews` → `fetchPRReviewComments` | `pull_request_review_comment` | Inline code review comments on PRs authored by user |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/mention-polling.ts` | `findDuePollingConfigs`, `updatePollState`, `incrementPollingTriggerCount`, `updateProcessedIds` |
| `server/db/agents.ts` | `getAgent` |
| `server/db/github-allowlist.ts` | `isGitHubUserAllowed` |
| `server/db/repo-blocklist.ts` | `isRepoBlocked` |
| `server/db/schedules.ts` | `findSchedulesForEvent` |
| `server/db/sessions.ts` | `createSession` |
| `server/github/off-limits.ts` | `isRepoOffLimits` |
| `server/github/operations.ts` | `addIssueComment` |
| `server/lib/dedup.ts` | `DedupService` |
| `server/lib/env.ts` | `buildSafeGhEnv` |
| `server/lib/logger.ts` | `createLogger` |
| `server/lib/prompt-injection.ts` | `scanGitHubContent` |
| `server/observability/event-context.ts` | `createEventContext`, `runWithEventContext` |
| `server/polling/auto-merge.ts` | `AutoMergeService` |
| `server/polling/auto-update.ts` | `AutoUpdateService` |
| `server/polling/ci-retry.ts` | `CIRetryService` |
| `server/polling/github-searcher.ts` | `GitHubSearcher`, `filterNewMentions`, `resolveFullRepo`, `DetectedMention` |
| `server/process/manager.ts` | `ProcessManager.startProcess`, `ProcessManager.subscribe` |
| `server/scheduler/service.ts` | `SchedulerService` (set via `setSchedulerService`) |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/bootstrap.ts` | `MentionPollingService` instantiation, `setSchedulerService()`, `start()`/`stop()` |
| `server/routes/mention-polling.ts` | `getStats()` for dashboard stats endpoint |
| `server/events/broadcasting.ts` | Type import for event broadcasting |

## Configuration

| Constant | Value | Description |
|----------|-------|-------------|
| `POLL_LOOP_INTERVAL_MS` | `15000` | How often the main loop checks for due configs (15s) |
| `MAX_CONCURRENT_POLLS` | `3` | Max configs polled simultaneously |
| `MIN_TRIGGER_GAP_MS` | `60000` | Minimum gap between triggers for the same mention ID |
| `MAX_TRIGGERS_PER_CYCLE` | `5` | Max sessions spawned per config per poll cycle — prevents stampede |
| `ISSUE_STATE_TTL_MS` | `300000` | Cache TTL for issue open/closed state checks (5 min, static on class) |

| Env Var | Description |
|---------|-------------|
| `GH_TOKEN` | Required for GitHub API access via `gh` CLI |
| `GITHUB_OWNER` | Used with `GITHUB_REPO` to detect home repo for work task routing |
| `GITHUB_REPO` | Used with `GITHUB_OWNER` to detect home repo for work task routing |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
| 2026-02-20 | corvid-agent | Add MAX_TRIGGERS_PER_CYCLE (5), stampede scenario, throttling gaps table, PR accumulation notes |
| 2026-02-20 | claude | Session guard now only blocks on running/idle sessions, not completed. Follow-up comments on the same issue trigger new sessions correctly |
| 2026-04-09 | claude | Spec v2: session guard checks only `running` (not idle). Add sub-services (AutoMerge, CIRetry, AutoUpdate), DedupService, GitHubSearcher delegation, dependency checking, human-assignment guard, repo blocklist, prompt injection scanning, acknowledgment/completion comments, event-based schedule triggering, observability context. Update all dependency tables to match actual imports. Add setSchedulerService method, constructor details, new invariants (10-17), new scenarios, new error cases, new config entries |
