---
spec: webhooks-service.spec.md
---

## Automated Testing

No test files currently exist for this module. Recommended test file:

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/webhooks/service.test.ts` | Unit | Signature validation (valid, invalid, wrong prefix, missing secret, length mismatch), rate limiting, self-mention guard, injection block, work-task keyword routing, event type mapping |

Key fixtures: mock `GITHUB_WEBHOOK_SECRET` env var; stub `db` with pre-seeded registrations; stub `ProcessManager` and `WorkTaskService`; mock `scanGitHubContent` returning configurable confidence levels.

## Manual Testing

- [ ] Register a webhook in the UI for a GitHub repo with a mention username; send a real `issue_comment` event via `gh api` or the GitHub UI and confirm the agent session starts.
- [ ] Comment "@botname fix this bug" on an issue; verify a work task is created instead of a plain session.
- [ ] Trigger the same webhook twice within 60 seconds; confirm the second trigger is skipped with a "Rate limited" log.
- [ ] Comment as the bot's own GitHub username; confirm the self-mention is ignored.
- [ ] Send a webhook with an invalid or missing `X-Hub-Signature-256` header; confirm `validateSignature` returns false and the event is rejected by the route handler.
- [ ] Add a user to the GitHub allowlist, then trigger from an unlisted account; confirm the event is skipped.

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `GITHUB_WEBHOOK_SECRET` not set | `validateSignature` returns false; warning logged at construction |
| Signature missing from request | Returns false; warning logged |
| Signature does not start with `sha256=` | Returns false |
| Signature length differs from expected | Returns false (timing-safe: no short-circuit) |
| Payload correct but signature wrong | Returns false |
| No registrations for the repo | Returns `{ processed: 0, skipped: 0 }` |
| Registration found but event type not in registered events | Skipped |
| Comment body is empty | Skipped with "no body" detail |
| Comment body has no @mention | Skipped |
| Mention is HIGH-confidence injection | Skipped with injection detail |
| Mention is MEDIUM-confidence injection | Allowed through (only HIGH/CRITICAL blocked) |
| Self-mention (author == mentionUsername) | Skipped with "Ignoring self-mention" detail |
| Sender not in allowlist (allowlist non-empty) | Skipped |
| Sender in allowlist | Allowed |
| Agent not found for registration | Delivery marked failed; `NotFoundError` thrown inside `triggerAgent` |
| Event callback throws | Error caught and logged; other callbacks still fire |
| Event-based schedule trigger fails | Logged at debug; does not affect processed/skipped counts |
| `issue_comment` on a PR (issue has `pull_request` field) | Mapped to `'issue_comment_pr'` event type |
| Rate limit window expires (> 60 seconds since last trigger) | Next trigger proceeds normally |
