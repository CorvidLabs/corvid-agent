---
spec: github-polling.spec.md
---

## User Stories

- As an agent operator, I want the platform to automatically detect GitHub @mentions, assignments, and PR review requests so that agents respond to GitHub activity without manual intervention
- As a platform administrator, I want open PRs authored by the agent auto-merged when all CI checks pass so that approved work lands without human merge clicks
- As an agent operator, I want failed CI on agent-authored PRs to automatically spawn fix sessions so that CI failures are resolved without manual debugging
- As a platform administrator, I want the server to auto-update from origin/main, install dependencies if needed, and restart so that deployments require no manual SSH
- As a platform administrator, I want per-repo polling configurations so that I can control which repositories are monitored and at what intervals
- As an agent operator, I want PR diffs validated for security issues (protected files, external fetches, malicious patterns) before auto-merge so that dangerous changes are flagged for human review

## Acceptance Criteria

- `GitHubSearcher.fetchMentions()` orchestrates issue mention search, PR review requests, and assignment detection for a polling config; results are filtered by global and per-config allowlists and sorted newest-first
- `MentionPollingService` runs on a configurable interval (default `MENTION_POLL_INTERVAL_MS`), processes active polling configs, deduplicates mentions by `mention_id`, and creates sessions or work tasks for new mentions
- Mention deduplication uses `mention_id` stored in `mention_events`; already-processed mentions are skipped
- Work task detection: mentions containing work-task keywords (fix, implement, create PR, etc.) route to `WorkTaskService.create` instead of plain sessions
- `AutoMergeService` runs on a 2-minute interval (`AUTO_MERGE_INTERVAL_MS`), checks all active polling configs, and squash-merges qualifying PRs
- Before auto-merge, `validateDiff()` checks for: protected file modifications (CI configs, lockfiles, secrets), unapproved external fetches (`curl`, `wget`, `fetch`), and malicious code patterns; flagged PRs receive a comment and are left for human review
- Blocklisted repos (via `isRepoBlocked`) are never merged or polled
- `CIRetryService` runs on a 10-minute interval (`CI_RETRY_INTERVAL_MS`) and spawns fix sessions for PRs with failed CI; a 30-minute cooldown (`CI_RETRY_COOLDOWN_MS`) prevents redundant fix sessions per PR
- CI retry sessions clone the repo, check out the PR branch, diagnose failures, and push fixes to the existing branch
- `AutoUpdateService` checks origin/main for new commits, waits for active sessions to finish, runs `git pull` and `bun install` if `bun.lock` changed, and exits with code 75 to trigger restart
- If `bun install` fails during auto-update, the service reverts to the previous commit via `git reset --hard` and does not restart
- If `git pull` does not advance HEAD, the service logs a warning and skips restart to avoid an infinite loop
- All services (`AutoMergeService`, `CIRetryService`, `AutoUpdateService`, `MentionPollingService`) have idempotent `start()` and `stop()` methods

## Constraints

- `AUTO_MERGE_INTERVAL_MS` is 120,000ms (2 minutes); `CI_RETRY_INTERVAL_MS` is 600,000ms (10 minutes); `CI_RETRY_COOLDOWN_MS` is 1,800,000ms (30 minutes)
- All services depend on `RunGhFn` (injected `gh` CLI runner) for GitHub API interaction
- Polling configs are stored in `mention_polling_configs` and must be active to be processed
- `AutoMergeService` only merges PRs authored by the configured GitHub username
- `CIRetryService` tracks last fix attempt per PR and enforces the cooldown via in-memory `lastFixAttempt` map
- `AutoUpdateService` waits up to a configurable timeout for active sessions before forcing update

## Out of Scope

- GitHub App-based event delivery (this module uses polling, not webhooks, for mention/assignment detection)
- Non-GitHub repository hosting platforms (GitLab, Bitbucket)
- Custom merge strategies (only squash-merge is supported)
- PR approval workflows or required reviewers enforcement
- Automatic PR creation (handled by work task service)
- Branch protection rule management
