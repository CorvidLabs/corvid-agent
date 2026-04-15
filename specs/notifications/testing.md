---
spec: service.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/notification-service.test.ts` | Unit | `notify()` persist-first, WebSocket always dispatched, delivery record creation, fire-and-forget dispatch |
| `server/__tests__/notification-channels.test.ts` | Unit | Per-channel `send*()` functions: config from JSON blob, env var fallback, missing credentials error |
| `server/__tests__/notifications.test.ts` | Integration | End-to-end: notify → persist → dispatch → delivery tracking → retry |

## Manual Testing

- [ ] Configure a Telegram channel for an agent and call `notify()` — verify notification is persisted in `owner_notifications` and delivery record created in `notification_deliveries`
- [ ] Trigger a notification with no channels configured — verify it is persisted and dispatched via WebSocket only
- [ ] Simulate a failed Telegram dispatch — verify delivery status becomes `failed` with error message
- [ ] Wait for the retry timer (60s) — verify failed delivery is retried (attempts incremented)
- [ ] After 3 failed attempts, verify retry timer no longer retries the delivery
- [ ] Call `notify()` twice concurrently — verify both notifications are persisted independently
- [ ] Dispatch a question to GitHub channel — verify an issue is created and `owner_question_dispatches` record appears
- [ ] Comment on the GitHub issue with an answer — verify the response poller resolves the question, marks dispatches as `answered`, and closes the issue
- [ ] Dispatch a question to both GitHub and Telegram — verify first responder resolution: when one is answered, the other is also marked `answered`
- [ ] Dispatch a question with Discord channel configured — verify Discord is skipped (no question-dispatch record created)
- [ ] Call `start()` twice — verify second call is a no-op (no duplicate retry timers)

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Discord webhook URL missing from config and env | Delivery fails with `"No Discord webhook URL configured"` |
| AlgoChat messenger not set (null) | Delivery fails with `"AgentMessenger not available"` |
| WhatsApp recipient phone not configured | Delivery fails with `"WhatsApp recipientPhone required"` |
| Unknown channel type in `notification_channels` | Delivery fails with `"Unknown channel type: {type}"` |
| Channel dispatch function throws an exception | Error caught; delivery updated to `failed`; logged as warning |
| Discord channel included in question dispatch | Returns `{ success: false, error: 'Discord does not support question responses' }`; channel skipped |
| Question channel dispatch function throws | Error caught; logged as warning; channel skipped; other channels still dispatched |
| Two pollers receive the same response simultaneously | `markDispatchAnswered` atomic `WHERE status = 'sent'` guard ensures only one processes it |
| Telegram inline keyboard button tapped | Response poller detects callback query; resolves question; sends confirmation callback answer |
| AlgoChat response received | Bridge inbound routing handles it directly; no polling needed |
| Retry timer fires when all deliveries have `attempts >= 3` | Query returns empty set; no retries attempted |
| `notify()` called before `setBroadcast()` is called | Notification persisted; no WebSocket dispatch; no error |
