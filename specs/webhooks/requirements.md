---
spec: webhooks-service.spec.md
---

## User Stories

- As an agent operator, I want agents to respond to GitHub @mentions in issues and PRs so that the agent can participate in code review and issue triage automatically
- As a platform administrator, I want incoming GitHub webhooks validated with HMAC SHA-256 signatures so that only authentic GitHub events trigger agent actions
- As a platform administrator, I want prompt injection scanning on mention bodies so that malicious users cannot manipulate agent behavior via crafted comments
- As an agent operator, I want work task requests detected by keyword patterns (fix, implement, create PR) so that code-change requests route to `WorkTaskService` instead of plain sessions
- As a platform administrator, I want a GitHub user allowlist so that only approved users can trigger agent actions via webhooks
- As an agent operator, I want rate limiting per webhook registration so that rapid-fire events do not overwhelm the agent with duplicate sessions

## Acceptance Criteria

- `WebhookService.validateSignature()` verifies HMAC SHA-256 using `GITHUB_WEBHOOK_SECRET`; if the secret is unset, validation always returns false with a warning log
- Signature must have the `sha256=` prefix and uses timing-safe byte-by-byte comparison
- `processEvent()` routes events through: registration matching, mention detection, rate limiting, injection scanning, and agent triggering
- Event type mapping: `issue_comment` maps to `'issue_comment'` or `'issue_comment_pr'` (if the issue has a `pull_request` field); `issues` maps to `'issues'`; `pull_request_review_comment` maps to `'pull_request_review_comment'`
- Self-mentions are ignored (comment author matches the registration's `mentionUsername`) to prevent infinite loops
- Per-registration rate limiting enforces a minimum 60-second interval between triggers for the same registration
- Prompt injection scanning blocks mentions with HIGH or CRITICAL confidence; the webhook is skipped and logged
- GitHub user allowlist is enforced via `isGitHubUserAllowed`; if the allowlist is non-empty, only allowed senders trigger webhooks
- Work task requests are detected by keyword patterns and route to `WorkTaskService.create` instead of a plain session
- Regular triggers create a new session via `createSession` and start it via `processManager.startProcess` with `schedulerMode: true`
- Delivery records are created in `webhook_deliveries` before processing and updated with status (`processing`, `completed`, `failed`)
- After processing registrations, matching event-based schedules are triggered via `schedulerService.triggerNow`
- `onEvent(callback)` returns an unsubscribe function; event callbacks that throw are caught and logged without affecting other callbacks
- All processing runs within an event context created by `createEventContext('webhook')` and `runWithEventContext`

## Constraints

- Requires `GITHUB_WEBHOOK_SECRET` environment variable for signature validation
- Rate limit minimum interval is 60 seconds per registration
- Prompt injection confidence thresholds: HIGH and CRITICAL are blocked; MEDIUM and LOW are allowed
- Webhook registrations are matched by repository (`findRegistrationsForRepo`)
- The service depends on `ProcessManager`, optionally `WorkTaskService`, and optionally `SchedulerService` (injected via `setSchedulerService`)

## Out of Scope

- Non-GitHub webhook sources (GitLab, Bitbucket, etc.)
- Webhook registration CRUD (handled by the routes/API layer)
- Outgoing webhooks (this module only processes incoming GitHub events)
- GitHub App installation or OAuth flows
- Webhook event replay or manual re-triggering
