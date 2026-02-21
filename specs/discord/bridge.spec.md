---
module: discord-bridge
version: 1
status: active
files:
  - server/discord/bridge.ts
  - server/discord/types.ts
db_tables: []
depends_on: []
---

# Discord Bridge

## Purpose

Bidirectional Discord bridge using a raw WebSocket connection to the Discord Gateway (no discord.js dependency). Handles gateway lifecycle (identify, heartbeat, resume, reconnect), routes Discord messages to agent sessions, and sends responses back with 2000-character chunking.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `DiscordBridge` | Raw WebSocket Discord gateway client that routes messages to agent sessions |

#### DiscordBridge Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database handle |
| `processManager` | `ProcessManager` | For starting sessions and subscribing to events |
| `config` | `DiscordBridgeConfig` | Bot token, channel ID, allowed user IDs |

#### DiscordBridge Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start` | `()` | `void` | Connect to Discord gateway and begin processing |
| `stop` | `()` | `void` | Close WebSocket, stop heartbeat, set running=false |
| `sendMessage` | `(channelId: string, content: string)` | `Promise<void>` | Send a message via Discord REST API, chunking at 2000 chars |

### Exported Types

| Type | Description |
|------|-------------|
| `DiscordBridgeConfig` | `{ botToken: string; channelId: string; allowedUserIds: string[] }` |
| `DiscordGatewayPayload` | `{ op: number; d: unknown; s: number \| null; t: string \| null }` |
| `DiscordHelloData` | `{ heartbeat_interval: number }` |
| `DiscordReadyData` | `{ session_id: string; resume_gateway_url: string }` |
| `DiscordMessageData` | `{ id: string; channel_id: string; author: DiscordAuthor; content: string; timestamp: string }` |
| `DiscordAuthor` | `{ id: string; username: string; bot?: boolean }` |
| `GatewayOp` | Gateway opcode constants (DISPATCH=0, HEARTBEAT=1, IDENTIFY=2, RESUME=6, RECONNECT=7, INVALID_SESSION=9, HELLO=10, HEARTBEAT_ACK=11) |
| `GatewayIntent` | Intent bit flags (GUILD_MESSAGES=1<<9, MESSAGE_CONTENT=1<<15) |

## Invariants

1. **Raw WebSocket (no discord.js)**: Uses the native `WebSocket` API directly against `wss://gateway.discord.gg/?v=10&encoding=json`
2. **Hardcoded gateway URL (SSRF prevention)**: The `resume_gateway_url` from Discord's READY event is intentionally not stored or used. All connections go through the hardcoded gateway URL to prevent SSRF
3. **Fixed heartbeat 41.25s**: The heartbeat interval is hardcoded at 41,250ms regardless of the server-provided value. Out-of-range values (< 10s or > 120s) are logged as warnings
4. **Heartbeat ACK tracking**: If a heartbeat is not acknowledged before the next heartbeat interval, the connection is closed with code 4000 and a reconnect is scheduled
5. **Exponential backoff reconnect (max 10 attempts)**: Reconnect delay is `min(1000 * 2^attempt, 60000)` ms. After 10 failed attempts, `running` is set to false and the bridge gives up
6. **2000-character chunking**: Outbound messages are split into 2000-character chunks to respect Discord's message size limit
7. **Per-user sessions**: Each Discord user maps to one active agent session. Sessions are reused across messages and cleared with `/new`
8. **Response debounce 1500ms**: Agent responses are buffered and flushed after 1500ms of inactivity (or on session result)
9. **Bot messages ignored**: Messages from bot users (`author.bot === true`) are silently ignored
10. **Channel filtering**: Only messages in the configured `channelId` are processed
11. **User auth via allowedUserIds**: If `config.allowedUserIds` is non-empty, only listed users may interact
12. **Per-user rate limit 10/60s**: Each user is limited to 10 messages per 60-second window
13. **Gateway session resume**: On reconnect, if a `sessionId` exists, the bridge sends a RESUME opcode; otherwise it re-IDENTIFYs
14. **Invalid session handling**: Non-resumable invalid sessions clear the stored sessionId and wait 1-5s (random jitter) before re-identifying

## Behavioral Examples

### Scenario: Initial gateway connection

- **Given** the bridge is started
- **When** the WebSocket connects and receives HELLO (op 10)
- **Then** heartbeating starts at 41.25s interval and an IDENTIFY payload is sent with bot token and intents

### Scenario: Message from authorized user

- **Given** user "123" sends "Hello" in the configured channel
- **When** the MESSAGE_CREATE dispatch is received
- **Then** a new agent session is created, the message is sent as initial prompt, and the bridge subscribes for responses

### Scenario: Reconnect with exponential backoff

- **Given** the WebSocket disconnects unexpectedly on attempt 3
- **When** `scheduleReconnect` is called
- **Then** reconnect is scheduled after `min(1000 * 2^3, 60000)` = 8000ms

### Scenario: Max reconnect attempts exceeded

- **Given** 10 reconnect attempts have been made
- **When** the 11th disconnect occurs
- **Then** `running` is set to false and no further reconnect is attempted

### Scenario: Heartbeat timeout

- **Given** a heartbeat was sent but not acknowledged
- **When** the next heartbeat interval fires
- **Then** the WebSocket is closed with code 4000 and reconnect is triggered

### Scenario: Long response chunked

- **Given** an agent produces a 3500-character response
- **When** the response is flushed
- **Then** two Discord messages are sent: one with 2000 characters and one with 1500 characters

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unauthorized user | Sends "Unauthorized." in the channel |
| Rate limit exceeded | Sends "Rate limit exceeded. Please wait before sending more messages." |
| No agents configured | Sends "No agents configured. Create an agent first." |
| No projects configured | Sends "No projects configured." |
| Bot message received | Silently ignored |
| Wrong channel | Silently ignored |
| Gateway parse error | Logged, message ignored |
| Discord REST API error | Logged (status + first 200 chars of error body) |
| Max reconnect attempts | `running` set to false, bridge stops |
| Heartbeat not ACKed | Connection closed (code 4000), reconnect scheduled |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `ProcessManager` (startProcess, sendMessage, subscribe) |
| `server/db/agents.ts` | `listAgents` |
| `server/db/sessions.ts` | `createSession`, `getSession` |
| `server/db/projects.ts` | `listProjects` |
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `DiscordBridge` (initialized when `DISCORD_BOT_TOKEN` is set) |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `DISCORD_BOT_TOKEN` | (required) | Discord bot token |
| `DISCORD_CHANNEL_ID` | (required) | Discord channel ID to operate in |
| `DISCORD_ALLOWED_USERS` | `""` | Comma-separated Discord user IDs allowed to interact |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
