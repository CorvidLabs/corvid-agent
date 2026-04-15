---
spec: bridge.spec.md
sources:
  - server/slack/bridge.ts
  - server/slack/types.ts
---

## Layout

Two-file server module. No routes file — the bridge registers its single webhook endpoint inline during initialization in `server/index.ts`.

```
server/slack/
  bridge.ts   — SlackBridge class (event handling, routing, rate limiting, dedup)
  types.ts    — SlackBridgeConfig, SlackEventPayload, SlackEvent, SlackMessageEvent, SlackChallenge
```

## Components

### `SlackBridge` class
Instantiated with `db`, `processManager`, and a `SlackBridgeConfig`. In-memory state:
- `userSessions: Map<string, string>` — Slack user ID → session ID
- `userMessageTimestamps: Map<string, number[]>` — sliding-window rate limit
- `processedEvents: Set<string>` — dedup set keyed by `{channel}:{ts}`
- `running: boolean`, `cleanupTimer` — lifecycle control

**Request pipeline for `handleEventRequest`:**
1. Read raw body bytes for HMAC verification
2. Verify `x-slack-signature` (timing-safe HMAC SHA-256 with `v0:{ts}:{body}` base string)
3. Reject stale timestamps (> 300 s)
4. Parse JSON; handle `url_verification` synchronously
5. Respond HTTP 200 immediately; process `event_callback` asynchronously
6. Filter: bot messages, subtype, wrong channel, unauthorized user, rate limit, dedup
7. Route to agent session (create or reuse); subscribe debounced response handler

**Outbound `sendMessage`:**
- POST to `chat.postMessage` Slack Web API
- Auto-chunks at 4000 characters
- Replies in thread via `thread_ts`

### `types.ts`
Pure type declarations — `SlackBridgeConfig`, `SlackEventPayload`, `SlackEvent`, `SlackMessageEvent`, `SlackChallenge`. No runtime code.

## Tokens

| Config / Env Var | Default | Notes |
|------------------|---------|-------|
| `SLACK_BOT_TOKEN` | (required) | `xoxb-...` prefix |
| `SLACK_SIGNING_SECRET` | (required) | HMAC key for request verification |
| `SLACK_CHANNEL_ID` | (required) | Restricts processing to one channel |
| `SLACK_ALLOWED_USERS` | `""` | Comma-separated; empty = allow all |
| Rate limit window | 60 s / 10 messages | Per user ID |
| Dedup cleanup interval | 5 minutes | Clears `processedEvents` set |
| Response debounce | 1500 ms | Coalesces streamed agent output |
| Message chunk limit | 4000 chars | Slack block text limit |
| Replay protection window | 300 s | Timestamp staleness threshold |

## Assets

### External Services
- **Slack Events API** — incoming webhooks via POST `/api/slack/events`
- **Slack Web API** — `chat.postMessage` for outbound messages

### Database Tables
- `sessions` — created per user on first message; reused if still active
- `session_messages` — written by `ProcessManager` event stream

### Key Dependencies
- `server/process/manager.ts` — `startProcess`, `sendMessage`, `subscribe`
- `server/db/agents.ts` — `listAgents` for agent selection
- `server/db/sessions.ts` — `createSession`, `getSession`
- `server/db/projects.ts` — `listProjects` for project selection
