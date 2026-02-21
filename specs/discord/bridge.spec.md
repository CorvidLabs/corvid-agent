---
module: discord-bridge
version: 1
status: draft
files:
  - server/discord/bridge.ts
  - server/discord/types.ts
db_tables:
  - sessions
  - session_messages
depends_on:
  - specs/process/process-manager.spec.md
  - specs/db/sessions.spec.md
---

# Discord Bridge

## Purpose

Bidirectional Discord bridge using the raw Discord Gateway WebSocket API (v10). No external Discord library dependencies. Connects to the Discord gateway, handles heartbeating, identifies/resumes sessions, and routes channel messages to agent sessions. Includes per-user rate limiting, user authorization, session management, and automatic reconnection with exponential backoff.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `DiscordBridge` | Manages the Discord gateway WebSocket connection, heartbeating, and message routing |

#### DiscordBridge Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database handle |
| `processManager` | `ProcessManager` | For starting sessions and subscribing to events |
| `config` | `DiscordBridgeConfig` | Bot token, channel ID, allowed user IDs |

#### DiscordBridge Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start` | `()` | `void` | Open the gateway WebSocket connection; idempotent (no-op if already running) |
| `stop` | `()` | `void` | Close the WebSocket with code 1000, clear heartbeat timer |
| `sendMessage` | `(channelId: string, content: string)` | `Promise<void>` | Send a message to a Discord channel via REST API; auto-chunks at 2000 characters |

### Exported Types (from types.ts)

| Type | Description |
|------|-------------|
| `DiscordBridgeConfig` | `{ botToken, channelId, allowedUserIds: string[] }` |
| `DiscordGatewayPayload` | `{ op, d, s, t }` — standard gateway payload |
| `DiscordHelloData` | `{ heartbeat_interval }` |
| `DiscordReadyData` | `{ session_id, resume_gateway_url }` |
| `DiscordMessageData` | `{ id, channel_id, author, content, timestamp }` |
| `DiscordAuthor` | `{ id, username, bot? }` |
| `GatewayOp` | Constants for gateway opcodes (DISPATCH=0, HEARTBEAT=1, IDENTIFY=2, RESUME=6, RECONNECT=7, INVALID_SESSION=9, HELLO=10, HEARTBEAT_ACK=11) |
| `GatewayIntent` | Bit flags: `GUILD_MESSAGES` (1<<9), `MESSAGE_CONTENT` (1<<15) |

## Invariants

1. **Hardcoded gateway URL**: Always connects to `wss://gateway.discord.gg/?v=10&encoding=json`. The `resume_gateway_url` from the READY event is intentionally not stored or used to prevent SSRF attacks
2. **Fixed heartbeat interval**: Uses a constant 41.25-second heartbeat interval regardless of the server-provided value. The server value is validated (10s–120s range) but not used, to prevent resource exhaustion from malicious gateway payloads
3. **Heartbeat ACK tracking**: If a heartbeat is not acknowledged before the next one is due, the connection is closed with code 4000 and reconnection is triggered
4. **Initial heartbeat jitter**: The first heartbeat after HELLO is sent after a random delay between 0 and the heartbeat interval, per Discord documentation
5. **Sequence tracking**: The `s` field from every dispatch is tracked and sent back in heartbeats and resume payloads
6. **Session resume**: On reconnection, if a `sessionId` exists, a RESUME is sent instead of IDENTIFY. On INVALID_SESSION with `resumable=false`, the session ID is cleared and IDENTIFY is used
7. **INVALID_SESSION delay**: After receiving INVALID_SESSION, the bridge waits 1–5 seconds (random) before re-identifying, per Discord documentation
8. **Reconnection backoff**: Exponential backoff with `delay = min(1000 * 2^attempt, 60000)`. Maximum 10 reconnect attempts before giving up and setting `running = false`
9. **Channel filter**: Only messages from the configured `channelId` are processed. Messages from other channels are silently ignored
10. **Bot message ignore**: Messages from bot accounts (`author.bot === true`) are silently ignored to prevent loops
11. **User authorization**: If `config.allowedUserIds` is non-empty, only those user IDs can interact. Unauthorized users receive `"Unauthorized."` reply
12. **Per-user rate limiting**: Each user is limited to 10 messages per 60-second sliding window
13. **Session-per-user mapping**: Each Discord user ID maps to at most one active session. Stored in-memory
14. **Session reuse and restart**: Same logic as Telegram bridge — reuses active sessions, creates new ones when stopped/error, restarts process if send fails
15. **Response debouncing**: Session events are buffered for 1500ms before being sent to Discord
16. **Message chunking**: Discord has a 2000-character limit per message. Long responses are split at that boundary
17. **Agent selection**: Uses the first agent from `listAgents` with its default project, falling back to the first project
18. **Slash commands**: `/status` reports the current session ID, `/new` clears the user's session mapping
19. **Gateway intents**: Requests `GUILD_MESSAGES` and `MESSAGE_CONTENT` intents during IDENTIFY

## Behavioral Examples

### Scenario: Gateway connection lifecycle

- **Given** a configured Discord bridge
- **When** `start()` is called
- **Then** a WebSocket connects to the Discord gateway
- **When** HELLO is received with `heartbeat_interval`
- **Then** heartbeating starts at the fixed 41.25s interval, and IDENTIFY is sent with the bot token and intents
- **When** READY dispatch is received
- **Then** the `session_id` is stored (but `resume_gateway_url` is discarded)

### Scenario: Message from authorized user in configured channel

- **Given** a running Discord bridge with an agent and project configured
- **When** user "user123" (in `allowedUserIds`) sends "Hello" in the configured channel
- **Then** a new session is created with source `discord`, the process is started, and responses are forwarded back as Discord messages

### Scenario: Reconnection after disconnect

- **Given** a running Discord bridge with an established gateway session
- **When** the WebSocket disconnects unexpectedly
- **Then** the heartbeat timer is cleared
- **And** after exponential backoff delay, the bridge reconnects and sends RESUME
- **When** INVALID_SESSION (non-resumable) is received
- **Then** the session ID is cleared and a new IDENTIFY is sent after a 1–5 second delay

### Scenario: Max reconnect attempts exhausted

- **Given** a Discord bridge that has failed to reconnect 10 times
- **When** the 10th reconnect attempt fails
- **Then** `running` is set to false and no more reconnect attempts are made

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Bot message received | Silently ignored |
| Message from wrong channel | Silently ignored |
| Unauthorized user | Replies `"Unauthorized."` |
| Rate limit exceeded | Replies with rate limit message |
| No agents configured | Replies `"No agents configured. Create an agent first."` |
| No projects configured | Replies `"No projects configured."` |
| Session expired and send fails | Replies `"Session expired. Send another message to start a new one."` |
| Failed to parse gateway message | Logs error, continues |
| Discord REST API send fails | Logs error with status and truncated response body |
| Heartbeat not acknowledged | Closes connection with code 4000, triggers reconnect |
| Max reconnect attempts reached | Stops bridge (`running = false`), logs error |
| Heartbeat interval out of 10s–120s range | Logs warning, uses default 41.25s |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `ProcessManager` — startProcess, sendMessage, subscribe |
| `server/db/agents.ts` | `listAgents` |
| `server/db/sessions.ts` | `createSession`, `getSession` |
| `server/db/projects.ts` | `listProjects` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | Lifecycle: construction, `start()`, `stop()` |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `DISCORD_BOT_TOKEN` | (required) | Discord bot token |
| `DISCORD_CHANNEL_ID` | (required) | Discord channel ID to listen on |
| `DISCORD_ALLOWED_USERS` | `""` | Comma-separated list of allowed Discord user IDs; empty = allow all |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
