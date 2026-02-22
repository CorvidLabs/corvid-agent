---
module: slack-bridge
version: 1
status: active
files:
  - server/slack/bridge.ts
  - server/slack/types.ts
db_tables:
  - sessions
  - session_messages
depends_on:
  - specs/process/process-manager.spec.md
  - specs/db/sessions.spec.md
---

# Slack Bridge

## Purpose

Bidirectional Slack bridge using the Events API (webhook-based). Receives messages via POST `/api/slack/events`, verifies request signatures, routes messages to agent sessions, and responds via the Slack Web API (`chat.postMessage`). Supports per-user rate limiting, user authorization, session management, event deduplication, thread-based conversations, and message chunking.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `SlackBridge` | Manages Slack Events API webhook handling, signature verification, and message routing |

#### SlackBridge Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database handle |
| `processManager` | `ProcessManager` | For starting sessions and subscribing to events |
| `config` | `SlackBridgeConfig` | Bot token, signing secret, channel ID, allowed user IDs |

#### SlackBridge Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start` | `()` | `void` | Mark bridge as running, start event cleanup timer; idempotent |
| `stop` | `()` | `void` | Mark bridge as stopped, clear cleanup timer |
| `handleEventRequest` | `(req: Request)` | `Promise<Response>` | Handle an incoming Slack Events API HTTP request |
| `sendMessage` | `(channelId: string, content: string, threadTs?: string)` | `Promise<void>` | Send a message to a Slack channel via Web API; auto-chunks at 4000 characters |

### Exported Types (from types.ts)

| Type | Description |
|------|-------------|
| `SlackBridgeConfig` | `{ botToken: string; signingSecret: string; channelId: string; allowedUserIds: string[] }` |
| `SlackEventPayload` | `{ token: string; type: 'url_verification' \| 'event_callback'; challenge?: string; event?: SlackEvent }` |
| `SlackEvent` | Base event with optional `type`, `user`, `text`, `channel`, `ts`, `thread_ts`, `bot_id`, `subtype` |
| `SlackMessageEvent` | Extends `SlackEvent` with required `type: 'message' \| 'app_mention'`, `user`, `text`, `channel`, `ts` |

## Invariants

1. **Signature verification**: Every incoming request is verified using HMAC SHA-256 with the signing secret. The signature base string is `v0:{timestamp}:{rawBody}`. Requests with missing or invalid signatures receive HTTP 401
2. **Replay protection**: Requests with timestamps more than 5 minutes (300 seconds) from current time are rejected
3. **Timing-safe comparison**: Signature comparison uses a constant-time byte-by-byte XOR to prevent timing attacks
4. **URL verification**: Requests with `type: 'url_verification'` are responded to with the `challenge` value (required for Slack Events API setup)
5. **Async event processing**: Event callbacks are processed asynchronously to respond within Slack's 3-second requirement. The HTTP response is sent immediately with `{ ok: true }`
6. **Bot message filtering**: Messages with a `bot_id` field or any `subtype` are silently ignored to prevent echo loops
7. **Event deduplication**: Events are tracked by `{channel}:{ts}` key. Duplicate events (Slack retries) are silently ignored. The dedup set is cleared every 5 minutes to prevent memory growth
8. **Channel filter**: If `config.channelId` is set, only messages from that channel are processed. Messages from other channels are silently ignored
9. **User authorization**: If `config.allowedUserIds` is non-empty, only those user IDs can interact. Unauthorized users receive `"Unauthorized."` reply in thread
10. **Per-user rate limiting**: Each user is limited to 10 messages per 60-second sliding window. Rate-limited users receive an explicit message
11. **Session-per-user mapping**: Each Slack user ID maps to at most one active session. Stored in-memory (`userSessions` Map)
12. **Session reuse and restart**: Reuses active sessions; creates new ones when stopped/error; restarts process if `sendMessage` returns false (process not running)
13. **Response debouncing**: Session events are buffered for 1500ms before being sent to Slack, to coalesce streamed output into a single message
14. **Message chunking**: Slack has a 4000-character block text limit. Long responses are split at that boundary
15. **Thread support**: Responses are sent in threads using `thread_ts` (either the message's `thread_ts` or its `ts`)
16. **Agent selection**: Uses the first agent from `listAgents` with its default project, falling back to the first project
17. **Slash commands**: `/status` reports the current session ID, `/new` clears the user's session mapping
18. **Event types**: Only `message` and `app_mention` events are processed; all others are silently ignored
19. **Idempotent start**: Calling `start()` when already running is a no-op

## Behavioral Examples

### Scenario: URL verification handshake

- **Given** a Slack app configured with the Events API URL
- **When** Slack sends a `url_verification` request with a challenge token
- **Then** the bridge responds with HTTP 200 and `{ challenge: "<token>" }`

### Scenario: First message from authorized user

- **Given** a running Slack bridge with an agent and project configured
- **When** user "U123" (in `allowedUserIds`) sends "Hello" in the configured channel
- **Then** a new session is created with source `slack`, the process is started, and responses are forwarded back as threaded Slack messages

### Scenario: app_mention triggers session

- **Given** a running Slack bridge
- **When** a user mentions the bot with `<@BOT_ID> what is the weather?`
- **Then** the `app_mention` event is handled identically to a `message` event, routing to an agent session

### Scenario: Duplicate event from Slack retry

- **Given** event with `channel: "C12345"` and `ts: "1234567890.000100"` was already processed
- **When** Slack retries the same event
- **Then** the event is silently ignored (dedup key matches)

### Scenario: Rate limit exceeded

- **Given** user "U123" has sent 10 messages in the last 60 seconds
- **When** the 11th message arrives
- **Then** the bridge replies with a rate limit message in the thread and does not route to the agent

### Scenario: Long response chunked

- **Given** an agent produces a 5000-character response
- **When** the response is flushed
- **Then** two Slack messages are sent: one with 4000 characters and one with 1000 characters

### Scenario: Replay attack rejected

- **Given** a valid Slack request signature
- **When** the timestamp is more than 5 minutes old
- **Then** the request is rejected with HTTP 401

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Missing signature headers | Returns HTTP 401 `{ error: 'Invalid signature' }` |
| Invalid signature | Returns HTTP 401 `{ error: 'Invalid signature' }` |
| Timestamp > 5 minutes old | Returns HTTP 401 (replay protection) |
| Invalid JSON body | Returns HTTP 400 `{ error: 'Invalid JSON' }` |
| Bot message received | Silently ignored |
| Message with subtype | Silently ignored |
| Message from wrong channel | Silently ignored |
| Unauthorized user | Replies `"Unauthorized."` in thread |
| Rate limit exceeded | Replies with rate limit message in thread |
| No agents configured | Replies `"No agents configured. Create an agent first."` in thread |
| No projects configured | Replies `"No projects configured."` in thread |
| Session expired and send fails | Replies `"Session expired. Send another message to start a new one."` in thread |
| Slack Web API send fails | Logs error with status and truncated response body |
| Slack API returns `ok: false` | Logs error with Slack error code |
| Bridge not running | Events are silently ignored (early return in `handleEvent`) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `ProcessManager` -- startProcess, sendMessage, subscribe |
| `server/db/agents.ts` | `listAgents` |
| `server/db/sessions.ts` | `createSession`, `getSession` |
| `server/db/projects.ts` | `listProjects` |
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | Lifecycle: construction, `start()`, `stop()`, route registration |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `SLACK_BOT_TOKEN` | (required) | Slack bot OAuth token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | (required) | Slack app signing secret for request verification |
| `SLACK_CHANNEL_ID` | (required) | Slack channel ID to listen on |
| `SLACK_ALLOWED_USERS` | `""` | Comma-separated list of allowed Slack user IDs; empty = allow all |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-21 | corvid-agent | Initial spec |
