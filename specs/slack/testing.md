---
spec: bridge.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/slack-bridge.test.ts` | Integration (bun:test, in-memory SQLite) | Constructor, URL verification challenge, HMAC signature verification (valid/missing/invalid), replay attack rejection (stale timestamp), bot message filtering, subtype filtering, channel filter, user authorization, rate limiting, event deduplication, session creation and reuse, session restart on send failure, `/status` and `/new` slash commands, message chunking at 4000 chars, response debouncing |

Fixtures: `buildSignedRequest` helper computes a real HMAC-SHA-256 signature so the bridge's crypto path is fully exercised in tests.

## Manual Testing

- [ ] Configure `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_CHANNEL_ID` in `.env` and verify bridge starts without error
- [ ] Send a valid Slack event from the configured channel — verify a session is created and agent responds in thread
- [ ] Send the same event twice (simulate Slack retry) — verify the second event is silently dropped (dedup)
- [ ] Send 11 messages rapidly from one user — verify the 11th gets a rate-limit reply
- [ ] Send a message from an unauthorized user (when `SLACK_ALLOWED_USERS` is set) — verify `"Unauthorized."` reply
- [ ] Send a bot message (with `bot_id`) — verify no response and no session created
- [ ] Trigger a long agent response (>4000 chars) — verify message is split into two Slack replies
- [ ] Use `/new` command — verify existing session mapping is cleared
- [ ] Use `/status` command — verify session ID is reported in thread
- [ ] Send a message from a different channel — verify it is silently ignored

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Missing `x-slack-signature` header | Returns HTTP 401 `{ error: 'Invalid signature' }` |
| Valid signature but timestamp > 300 s old | Returns HTTP 401 (replay protection) |
| Invalid JSON body | Returns HTTP 400 `{ error: 'Invalid JSON' }` |
| `type: 'url_verification'` | Responds synchronously with `{ challenge }` |
| Bot message (`bot_id` present) | Silently ignored; no session created |
| Message with any `subtype` | Silently ignored |
| Message from channel not in `channelId` | Silently ignored |
| Unauthorized user + non-empty `allowedUserIds` | Replies `"Unauthorized."` in thread |
| 11th message within 60-second window | Rate-limit reply; agent not invoked |
| Duplicate event (same `channel:ts`) | Second event silently dropped |
| No agents in DB | Replies `"No agents configured. Create an agent first."` |
| No projects in DB | Replies `"No projects configured."` |
| `processManager.sendMessage` returns false | Session restart attempted; reply sent in thread |
| Response > 4000 chars | Split into multiple messages at chunk boundary |
| `start()` called twice | No-op on second call (idempotent) |
| `stop()` clears cleanup timer | Timer cleared; subsequent events ignored |
