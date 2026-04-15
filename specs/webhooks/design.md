---
spec: webhooks-service.spec.md
sources:
  - server/webhooks/service.ts
---

## Module Structure

`server/webhooks/` contains a single file:

- `service.ts` — `WebhookService` class: validates HMAC signatures, routes events to registrations, enforces rate limits and injection scanning, and triggers agent sessions or work tasks

The HTTP route layer (`server/routes/webhooks.ts`) calls into `WebhookService.validateSignature` and `processEvent`. The service is instantiated in `server/index.ts` and receives optional `WorkTaskService` and `SchedulerService` dependencies.

## Key Classes and Functions

### `WebhookService`

**`validateSignature(payload, signature)`** — computes HMAC-SHA256 of the payload using `GITHUB_WEBHOOK_SECRET` via Web Crypto API (`crypto.subtle.importKey` + `crypto.subtle.sign`). Performs byte-by-byte timing-safe comparison against the provided `sha256=` prefixed hex. Returns false on any mismatch, missing secret, or wrong prefix.

**`processEvent(event, payload)`** — full pipeline per event:
1. Look up registrations for `payload.repository.full_name`
2. For each registration: check event type match, extract comment body, detect `@mentionUsername` mention
3. Rate-limit check: compare `last_triggered_at` against current time; skip if < 60 seconds
4. Allowlist check: if GitHub allowlist is non-empty, verify sender is allowed
5. Self-mention guard: skip if `sender.login === mentionUsername`
6. Prompt injection scan via `scanGitHubContent`; skip if HIGH or CRITICAL confidence
7. Work task keyword detection: if the mention body contains fix/implement/create PR keywords and `WorkTaskService` is available, route to `WorkTaskService.create`; otherwise create a session via `createSession` + `processManager.startProcess`
8. Create/update `webhook_deliveries` record throughout, recording status
9. After registration processing, trigger matching event-based schedules via `schedulerService.triggerNow`
10. Wrap all processing in `createEventContext('webhook')` + `runWithEventContext` for observability tracing

**`onEvent(callback)`** — event emitter for WebSocket broadcast; called with each delivery record update.

## Configuration Values / Constants

| Constant / Env Var | Description |
|--------------------|-------------|
| `GITHUB_WEBHOOK_SECRET` | HMAC secret; if unset, all signature validations return false |
| Rate limit interval | 60 seconds per registration |
| Injection scan threshold | HIGH or CRITICAL confidence triggers block |

## Related Resources

**DB tables consumed:**
- `webhook_registrations` — matched by repo full name; contains `mentionUsername`, `events[]`, `last_triggered_at`
- `webhook_deliveries` — created per-event, updated with processing/completed/failed status

**External services / modules:**
- Web Crypto API — HMAC-SHA256 signature validation
- `server/lib/prompt-injection` — `scanGitHubContent` for injection detection
- `server/observability/event-context` — event tracing wrapper
- `server/db/github-allowlist` — `isGitHubUserAllowed` sender check

**Event types mapped:**
- `issue_comment` (on issue) → `'issue_comment'`
- `issue_comment` (on PR) → `'issue_comment_pr'`
- `issues` → `'issues'`
- `pull_request_review_comment` → `'pull_request_review_comment'`
