---
module: mention-polling-service
version: 1
status: active
files:
  - server/polling/service.ts
db_tables:
  - mention_polling_configs
  - sessions
depends_on:
  - specs/db/sessions.spec.md
---

# Mention Polling Service

## Purpose

Polls GitHub for @mentions, PR reviews, issue assignments, and review comments without requiring a public webhook URL. Uses the `gh` CLI to search configured repos on a per-config interval, detecting actionable events and triggering agent sessions. This is the local-first alternative to webhooks — works entirely on the user's device with no public URL needed.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `MentionPollingService` | Core polling engine that manages the poll loop and triggers agent sessions |

#### MentionPollingService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `onEvent` | `(callback: PollingEventCallback)` | `() => void` | Subscribe to polling events (e.g. for WebSocket broadcast). Returns unsubscribe function |
| `start` | `()` | `void` | Start the polling loop. Runs immediately then on POLL_LOOP_INTERVAL_MS (15s) |
| `stop` | `()` | `void` | Stop the polling loop and clear the interval timer |
| `getStats` | `()` | `{ isRunning, activeConfigs, totalConfigs, totalTriggers }` | Get polling stats for the dashboard |

## Invariants

1. **Self-mentions are never processed**: Comments/reviews authored by the `mentionUsername` itself are skipped to prevent infinite loops
2. **processedIds set prevents duplicate triggers**: Each processed mention ID is persisted immediately; the set is capped at 200 entries (oldest trimmed on overflow)
3. **Issue-number dedup**: Multiple mentions for the same issue/PR number (e.g. `comment-123`, `issue-8`, `assigned-8` all for #8) collapse to one session. The first (newest) is kept
4. **Session guard**: No concurrent sessions for the same issue — a `name LIKE` query checks for existing running/idle sessions. Completed sessions do NOT block new mentions (follow-up comments are legitimate new work; dedup of the same comment is handled by processedIds)
5. **Rate limiting**: 60s minimum gap between triggers for the same mention ID (keyed by `configId:mentionId`)
6. **allowedUsers filter applies to all mention types**: Including review authors, comment authors, and issue creators
7. **Review feedback prompt uses checkout-and-push**: Mentions with `review-` or `reviewcomment-` prefix ID use the review feedback prompt which checks out the existing PR branch and pushes fixes, rather than creating a new PR
8. **Max 3 concurrent polls**: At most `MAX_CONCURRENT_POLLS` (3) configs are polled simultaneously to avoid GitHub API rate limits
9. **Poll date is padded by 1 day**: The `sinceDate` is padded back 24 hours from `lastPollAt` because GitHub search only supports date precision. Dedup relies on processedIds, not date filtering

## Behavioral Examples

### Scenario: @mention in issue comment triggers session

- **Given** a polling config for `owner/repo` watching for `@agent-user`
- **When** a new comment mentioning `@agent-user` is found on issue #42
- **Then** a session named `Poll: repo #42: <title>` is created with source `agent`, and the comment ID is added to processedIds

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

### Scenario: Multiple mentions for same issue collapse

- **Given** issue #8 appears in both `searchIssueMentions` (as `comment-100`) and `searchAssignedIssues` (as `assigned-8`)
- **When** mentions are deduplicated by issue number
- **Then** only one session is created for #8, and both `comment-100` and `assigned-8` are added to processedIds

### Scenario: Stampede — 100 mentions arrive in one poll cycle

- **Given** a polling config for `org/repo` watching `@agent-user`
- **When** 100 different issues all mention `@agent-user` between two poll cycles
- **Then** issue-number dedup collapses duplicates per issue, and the per-cycle trigger cap (`MAX_TRIGGERS_PER_CYCLE`, default 5) limits how many sessions are created in a single cycle. Remaining unprocessed mentions stay unprocessed and will be picked up in the next cycle (they are not yet in processedIds). Combined with the 1-hour session guard, this prevents runaway session spawning

### Scenario: PR/session accumulation over time

- **Given** a high-traffic repo generating many mention-triggered sessions over weeks
- **When** sessions accumulate (some completed, some errored, some with open PRs from work tasks)
- **Then** the system relies on existing guards (active-session guard, processedIds dedup, one active work task per project) to bound concurrent work. There is no automatic PR cleanup — stale PRs on poorly maintained repos remain open until manually closed or the project owner acts. This is by design: the agent should not unilaterally close PRs that may still be reviewed

## Throttling Gaps and Known Limits

| Area | Current Behavior | Risk |
|------|-----------------|------|
| Global session concurrency | No hard cap — ProcessManager spawns all qualifying sessions | Memory/CPU exhaustion under stampede conditions |
| Per-cycle trigger cap | `MAX_TRIGGERS_PER_CYCLE` (5) limits sessions per config per poll | Remaining mentions deferred to next cycle |
| PR accumulation | No automatic cleanup of stale PRs created by work tasks | Repos with low review throughput accumulate open PRs |
| processedIds cap | Capped at 200 entries; oldest trimmed on overflow | Very old mentions can theoretically re-trigger after 200+ newer ones |

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `GH_TOKEN` not configured | `runGh` returns `{ ok: false }`, mentions array stays empty |
| `gh` CLI command fails | Returns empty array for that search path, logs error, continues |
| Agent not found for config | Logs error, returns false from `processMention` |
| Session creation fails | Logs error, returns false from `processMention` |
| Poll errors (any exception) | `lastPollAt` still updated to avoid hammering on persistent errors |

## Search Paths

The service uses 5 search paths to detect actionable events:

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
| `server/db/sessions.ts` | `createSession` |
| `server/lib/logger.ts` | `createLogger` |
| `server/lib/env.ts` | `buildSafeGhEnv` |
| `server/process/manager.ts` | `ProcessManager.startProcess` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `MentionPollingService` instantiation and `start()`/`stop()` |
| `server/routes/mention-polling.ts` | `getStats()` for dashboard stats endpoint |

## Configuration

| Constant | Value | Description |
|----------|-------|-------------|
| `POLL_LOOP_INTERVAL_MS` | `15000` | How often the main loop checks for due configs (15s) |
| `MAX_CONCURRENT_POLLS` | `3` | Max configs polled simultaneously |
| `MIN_TRIGGER_GAP_MS` | `60000` | Minimum gap between triggers for the same mention ID |
| `MAX_TRIGGERS_PER_CYCLE` | `5` | Max sessions spawned per config per poll cycle — prevents stampede |

| Env Var | Description |
|---------|-------------|
| `GH_TOKEN` | Required for GitHub API access via `gh` CLI |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
| 2026-02-20 | corvid-agent | Add MAX_TRIGGERS_PER_CYCLE (5), stampede scenario, throttling gaps table, PR accumulation notes |
| 2026-02-20 | claude | Session guard now only blocks on running/idle sessions, not completed. Follow-up comments on the same issue trigger new sessions correctly |
