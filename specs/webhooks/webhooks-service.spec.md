---
module: webhooks-service
version: 1
status: draft
files:
  - server/webhooks/service.ts
db_tables:
  - webhook_registrations
  - webhook_deliveries
depends_on:
  - specs/process/process-manager.spec.md
  - specs/work/work-task-service.spec.md
  - specs/scheduler/scheduler-service.spec.md
  - specs/db/webhooks.spec.md
  - specs/db/agents.spec.md
  - specs/db/sessions.spec.md
  - specs/db/schedules.spec.md
  - specs/db/github-allowlist.spec.md
  - specs/lib/infra.spec.md
  - specs/lib/security.spec.md
  - specs/observability/observability.spec.md
---

# Webhooks Service

## Purpose
Processes incoming GitHub webhook events by validating HMAC SHA-256 signatures, routing events to matching registrations via @mention detection, enforcing rate limits and prompt injection scanning, and triggering agent sessions or work tasks in response.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `WebhookService` | Core webhook processing service that validates, routes, and triggers agent actions from GitHub events |

#### WebhookService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, processManager: ProcessManager, workTaskService?: WorkTaskService \| null` | `WebhookService` | Initializes with database, process manager, and optional work task service; reads `GITHUB_WEBHOOK_SECRET` from env |
| `setSchedulerService` | `service: SchedulerService` | `void` | Registers the scheduler service for triggering event-based schedules |
| `onEvent` | `callback: WebhookEventCallback` | `() => void` | Subscribes to webhook delivery events (for WebSocket broadcast); returns unsubscribe function |
| `validateSignature` | `payload: string, signature: string \| null` | `Promise<boolean>` | Validates the GitHub HMAC SHA-256 webhook signature using timing-safe comparison |
| `processEvent` | `event: string, payload: GitHubWebhookPayload` | `Promise<{ processed: number; skipped: number; details: string[] }>` | Processes an incoming webhook event through the full pipeline: registration matching, mention detection, rate limiting, injection scanning, and agent triggering |

### Exported Types

| Type | Description |
|------|-------------|
| `GitHubWebhookPayload` | Interface representing parsed GitHub webhook event data with action, sender, repository, and optional comment/issue/pull_request fields |

## Invariants
1. Webhook signature validation requires `GITHUB_WEBHOOK_SECRET` to be set; if unset, `validateSignature` always returns false and logs a warning.
2. Signature validation uses HMAC SHA-256 with timing-safe byte-by-byte comparison to prevent timing attacks.
3. The signature must have the `sha256=` prefix (GitHub's format).
4. Per-registration rate limiting enforces a minimum 60-second interval between triggers for the same registration.
5. Prompt injection scanning blocks mentions with HIGH or CRITICAL confidence; the webhook is skipped and logged.
6. Self-mentions are ignored to prevent infinite loops (when the comment author matches the registration's mentionUsername).
7. GitHub user allowlist is enforced; if the allowlist is non-empty, only allowed senders can trigger webhooks.
8. Event type mapping: `issue_comment` maps to `'issue_comment'` or `'issue_comment_pr'` (if the issue has a `pull_request` field), `issues` maps to `'issues'`, `pull_request_review_comment` maps to `'pull_request_review_comment'`.
9. Work task requests are detected by keyword patterns (fix, implement, create PR, etc.) and route to `WorkTaskService.create` instead of a plain session.
10. Regular (non-work-task) triggers create a new session via `createSession` and start it via `processManager.startProcess` with `schedulerMode: true`.
11. Delivery records are created before processing and updated with status (processing, completed, failed) as the trigger progresses.
12. After processing registrations, matching event-based schedules are also triggered via `schedulerService.triggerNow`.
13. All processing runs within an event context created by `createEventContext('webhook')` and `runWithEventContext`.

## Behavioral Examples

### Scenario: Valid @mention triggers agent session
- **Given** a webhook registration for repo "owner/repo" with mentionUsername "corvid-bot" and events ["issue_comment"]
- **When** a `issue_comment` event arrives with body "@corvid-bot please review this"
- **Then** a new agent session is created with full context prompt and the delivery is marked completed

### Scenario: Work task request via @mention
- **Given** a webhook registration with a WorkTaskService available
- **When** a comment says "@corvid-bot please fix this bug"
- **Then** a work task is created instead of a regular session (keyword "fix" matched)

### Scenario: Rate limiting
- **Given** a webhook registration was triggered 30 seconds ago
- **When** another matching event arrives for the same registration
- **Then** the event is skipped with "Rate limited" detail

### Scenario: Prompt injection blocked
- **Given** a comment contains text that matches HIGH confidence injection patterns
- **When** `processEvent` evaluates the mention body
- **Then** the event is skipped with "Blocked -- prompt injection detected" detail

### Scenario: Invalid signature
- **Given** `GITHUB_WEBHOOK_SECRET` is set to "secret123"
- **When** `validateSignature(payload, 'sha256=invalidhex')` is called
- **Then** it returns false

### Scenario: Self-mention ignored
- **Given** the registration mentionUsername is "corvid-bot"
- **When** the comment author is also "corvid-bot"
- **Then** the event is skipped with "Ignoring self-mention" detail

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `GITHUB_WEBHOOK_SECRET` not set | `validateSignature` returns false; warning logged at construction |
| Signature missing from request | Returns false; warning logged |
| Signature has wrong prefix (not `sha256=`) | Returns false; warning logged |
| Signature length mismatch | Returns false (timing-safe comparison) |
| No registrations for the repo | Returns `{ processed: 0, skipped: 0 }` with detail message |
| Event type not registered for the matching registration | Skipped with detail |
| No comment body to check for mentions | Skipped with detail |
| No @mention found in the body | Skipped with detail |
| Sender not in GitHub allowlist | Skipped with detail |
| Agent not found for registration | `triggerAgent` throws `NotFoundError`; delivery marked failed |
| Event callback throws | Error caught and logged; other callbacks continue |
| Event-based schedule trigger fails | Failure logged at debug level; does not affect main processing |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/manager` | `ProcessManager` for starting sessions and subscribing to events |
| `server/work/service` | `WorkTaskService` for creating work tasks from code-change requests |
| `server/scheduler/service` | `SchedulerService` for triggering event-based schedules |
| `server/db/webhooks` | `findRegistrationsForRepo`, `createDelivery`, `updateDeliveryStatus`, `incrementTriggerCount` |
| `server/db/agents` | `getAgent` for looking up agent details |
| `server/db/sessions` | `createSession` for creating new agent sessions |
| `server/db/schedules` | `findSchedulesForEvent` for event-based schedule matching |
| `server/db/github-allowlist` | `isGitHubUserAllowed` for sender authorization |
| `server/lib/logger` | `createLogger` for structured logging |
| `server/lib/errors` | `NotFoundError` for missing agents |
| `server/lib/prompt-injection` | `scanGitHubContent` for injection detection |
| `server/observability/event-context` | `createEventContext`, `runWithEventContext` for tracing |
| `shared/types` | `WebhookRegistration`, `WebhookEventType` |
| Web Crypto API | `crypto.subtle.importKey`, `crypto.subtle.sign` for HMAC validation |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/webhooks` | `WebhookService.validateSignature` and `processEvent` for the webhook HTTP endpoint |
| `server/index.ts` | `WebhookService` instantiation and lifecycle management |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
