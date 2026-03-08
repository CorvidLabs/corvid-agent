---
module: discord-bridge
version: 4
status: active
files:
  - server/discord/bridge.ts
  - server/discord/types.ts
db_tables:
  - sessions
  - session_messages
depends_on:
  - specs/process/process-manager.spec.md
  - specs/db/sessions.spec.md
  - specs/councils/councils.spec.md
---

# Discord Bridge

## Purpose

Bidirectional Discord bridge using the raw Discord Gateway WebSocket API (v10). No external Discord library dependencies. Connects to the Discord gateway, handles heartbeating, identifies/resumes sessions, and routes channel messages to agent sessions. The bot operates in **passive channel mode**: it does not auto-respond to regular channel messages. It only responds when @mentioned or when a slash command is used. Agent conversations happen exclusively in threads created via the `/session` command, where the user selects an agent and topic. Includes per-user rate limiting, user authorization, prompt injection scanning, session management, automatic reconnection with exponential backoff, slash command registration, and bot presence management.

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
| `config` | `DiscordBridgeConfig` | Bot token, channel ID, allowed user IDs, app ID, etc. |
| `workTaskService?` | `WorkTaskService` | Optional work task service for `work_intake` mode |

#### DiscordBridge Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start` | `()` | `void` | Open the gateway WebSocket connection; idempotent. Also registers slash commands if `appId` is configured |
| `stop` | `()` | `void` | Close the WebSocket with code 1000, clear heartbeat timer |
| `sendMessage` | `(channelId: string, content: string)` | `Promise<void>` | Send a message to a Discord channel via REST API; auto-chunks at 2000 characters |
| `updatePresence` | `(statusText?: string, activityType?: number)` | `void` | Update the bot's presence/status on the live gateway connection |

### Exported Types (from types.ts)

| Type | Description |
|------|-------------|
| `DiscordBridgeMode` | `'chat' \| 'work_intake'` — operational mode for the bridge |
| `DiscordBridgeConfig` | `{ botToken, channelId, allowedUserIds, mode?, defaultAgentId?, appId?, guildId? }` |
| `DiscordGatewayPayload` | `{ op: number; d: unknown; s: number \| null; t: string \| null }` |
| `DiscordHelloData` | `{ heartbeat_interval: number }` |
| `DiscordReadyData` | `{ session_id: string; resume_gateway_url: string }` |
| `DiscordMessageData` | `{ id, channel_id, author, content, timestamp, mentions?: DiscordAuthor[] }` |
| `DiscordAuthor` | `{ id: string; username: string; bot?: boolean }` |
| `DiscordInteractionData` | Slash command interaction payload from gateway |
| `GatewayOp` | Constants for gateway opcodes (DISPATCH=0, HEARTBEAT=1, IDENTIFY=2, PRESENCE_UPDATE=3, RESUME=6, RECONNECT=7, INVALID_SESSION=9, HELLO=10, HEARTBEAT_ACK=11) |
| `GatewayIntent` | Bit flags: `GUILD_MESSAGES` (1<<9), `MESSAGE_CONTENT` (1<<15) |
| `InteractionType` | `PING=1, APPLICATION_COMMAND=2` |
| `InteractionCallbackType` | `PONG=1, CHANNEL_MESSAGE=4, DEFERRED_CHANNEL_MESSAGE=5` |

## Invariants

### Gateway & Connection

1. **Hardcoded gateway URL**: Always connects to `wss://gateway.discord.gg/?v=10&encoding=json`. The `resume_gateway_url` from the READY event is intentionally not stored or used to prevent SSRF attacks
2. **Fixed heartbeat interval**: Uses a constant 41.25-second heartbeat interval regardless of the server-provided value. The server value is validated (10s-120s range) but not used, to prevent resource exhaustion from malicious gateway payloads
3. **Heartbeat ACK tracking**: If a heartbeat is not acknowledged before the next one is due, the connection is closed with code 4000 and reconnection is triggered
4. **Initial heartbeat jitter**: The first heartbeat after HELLO is sent after a random delay between 0 and the heartbeat interval, per Discord documentation
5. **Sequence tracking**: The `s` field from every dispatch is tracked and sent back in heartbeats and resume payloads
6. **Session resume**: On reconnection, if a `sessionId` exists, a RESUME is sent instead of IDENTIFY. On INVALID_SESSION with `resumable=false`, the session ID is cleared and IDENTIFY is used
7. **INVALID_SESSION delay**: After receiving INVALID_SESSION, the bridge waits 1-5 seconds (random) before re-identifying, per Discord documentation
8. **Reconnection backoff**: Exponential backoff with `delay = min(1000 * 2^attempt, 60000)`. Maximum 10 reconnect attempts before giving up and setting `running = false`
9. **Gateway intents**: Requests `GUILD_MESSAGES` and `MESSAGE_CONTENT` intents during IDENTIFY
10. **Bot presence**: Set via the `presence` field in IDENTIFY payload. Configurable via `DISCORD_STATUS` and `DISCORD_ACTIVITY_TYPE` env vars. Can be updated at runtime via `updatePresence()`

### Channel Message Handling (Passive Mode)

11. **Passive channel mode**: The bot does NOT auto-respond to regular messages in the configured channel. Regular channel messages are silently ignored unless the bot is @mentioned
12. **@mention response**: When the bot is @mentioned in the configured channel, it responds inline (not in a thread) as a one-off reply. The response uses the `defaultAgentId` agent (or first available agent). No session or thread is created
13. **Channel filter**: Only messages from the configured `channelId` and from threads created by the bridge are processed. Messages from other channels are silently ignored
14. **Bot message ignore**: Messages from bot accounts (`author.bot === true`) are silently ignored to prevent loops

### Thread & Session Management

15. **Explicit thread creation only**: Threads are ONLY created via the `/session` (or `/thread`) slash command. Regular channel messages never auto-create threads
16. **Agent selection at session start**: The `/session` command requires the user to select an agent (from a dropdown) and provide a topic. The thread is created with the selected agent and named `AgentName — topic` (truncated to 100 chars)
17. **Thread auto-archive**: Threads auto-archive after 24 hours of inactivity
18. **Shared thread sessions**: Any user can reply in a thread to participate in the conversation. Thread sessions are tracked by thread ID, not user ID
19. **Thread-scoped agent**: Each thread is bound to the agent selected at creation time. The agent cannot be changed mid-thread — start a new session for a different agent
20. **Thread message routing**: All messages in a bridge-created thread are routed to the thread's agent session. The bot responds automatically within threads it owns (no @mention required)

### Security & Rate Limiting

21. **User authorization**: If `config.allowedUserIds` is non-empty, only those user IDs can interact. Unauthorized users receive `"Unauthorized."` reply
22. **Per-user rate limiting**: Each user is limited to 10 messages per 60-second sliding window
23. **Prompt injection scanning**: All incoming messages (channel @mentions and thread messages) are scanned via `scanForInjection()`. Blocked messages are audited and rejected

### Response Formatting

24. **Rich embed responses**: Agent responses are sent as Discord embeds with the message content in the description, agent name and model in the footer, and a consistent per-agent color derived from name hashing
25. **Response debouncing**: Session events are buffered for 1500ms before being sent as embeds to the thread
26. **Message chunking**: Discord has a 4096-character embed description limit. Long responses are truncated. Plain messages are chunked at 2000 characters
27. **Content extraction**: Assistant responses use `extractContentText()` to properly handle both string and `ContentBlock[]` formats

### Commands

28. **Slash commands**: If `appId` is configured, commands are registered as Discord Application Commands via `PUT /applications/{appId}/commands` (or guild-scoped if `guildId` is set). Interactions are handled via gateway `INTERACTION_CREATE` events. Commands: `/session`, `/agents`, `/status`, `/council`, `/help`
29. **`/session` command**: Creates a new thread with an agent session. Required options: `agent` (dropdown of available agents, capped at 25), `topic` (string, used as thread name). The thread is created in the configured channel with the selected agent bound to it
30. **`/agents` command**: Lists all available agents with their models. Does not create a session
31. **`/status` command**: Shows the bot's current status and active sessions
32. **`/council` command**: Launches a council discussion on a given topic
33. **`/help` command**: Shows available commands and usage
34. **Text commands deprecated**: Text commands (messages starting with `/`) are no longer parsed from regular channel messages. All commands use Discord's slash command system (requires `appId`)
35. **Work intake mode**: When `mode='work_intake'`, @mentions and thread messages create async work tasks via `WorkTaskService` instead of chat sessions. Embeds are used for task status feedback

## Behavioral Examples

### Scenario: Gateway connection lifecycle

- **Given** a configured Discord bridge
- **When** `start()` is called
- **Then** a WebSocket connects to the Discord gateway
- **When** HELLO is received with `heartbeat_interval`
- **Then** heartbeating starts at the fixed 41.25s interval, and IDENTIFY is sent with the bot token, intents, and presence
- **When** READY dispatch is received
- **Then** the `session_id` is stored (but `resume_gateway_url` is discarded)

### Scenario: Slash command registration

- **Given** a Discord bridge with `appId` configured
- **When** `start()` is called
- **Then** slash commands (`session`, `agents`, `status`, `council`, `help`) are registered via PUT to the Discord API
- **When** a guild ID is also configured
- **Then** commands are registered as guild-scoped (instant availability) instead of global (up to 1 hour propagation)

### Scenario: Regular channel message (ignored)

- **Given** a running Discord bridge
- **When** a user sends "Hello everyone" in the configured channel without @mentioning the bot
- **Then** the message is silently ignored — no thread, no response, no session

### Scenario: @mention in channel (one-off reply)

- **Given** a running Discord bridge with a default agent configured
- **When** a user sends "@CorvidBot what time is it?" in the configured channel
- **Then** the bot replies inline in the channel using the default agent
- **And** no thread is created, no session is persisted

### Scenario: /session creates a threaded conversation

- **Given** a running Discord bridge with agents "CorvidAgent" and "ResearchBot"
- **When** a user invokes `/session` and selects agent "ResearchBot" with topic "Algorand governance"
- **Then** a Discord thread is created named `ResearchBot — Algorand governance`
- **And** a new session is created with source `discord`, bound to "ResearchBot"
- **And** the bot posts an initial embed in the thread confirming the session is active
- **And** subsequent messages in the thread are handled by "ResearchBot" automatically (no @mention needed)

### Scenario: Multiple users in a thread

- **Given** user A started a session thread with CorvidAgent
- **When** user B sends a message in that same thread
- **Then** user B's message is routed to the same agent session
- **And** the agent responds in the thread, visible to both users

### Scenario: User wants a different agent

- **Given** user A has a thread with CorvidAgent
- **When** user A wants to talk to ResearchBot instead
- **Then** user A uses `/session` with agent "ResearchBot" and a new topic
- **And** a new thread is created with ResearchBot — the old thread remains but is independent

### Scenario: Reconnection after disconnect

- **Given** a running Discord bridge with an established gateway session
- **When** the WebSocket disconnects unexpectedly
- **Then** the heartbeat timer is cleared
- **And** after exponential backoff delay, the bridge reconnects and sends RESUME
- **When** INVALID_SESSION (non-resumable) is received
- **Then** the session ID is cleared and a new IDENTIFY is sent after a 1-5 second delay

### Scenario: Max reconnect attempts exhausted

- **Given** a Discord bridge that has failed to reconnect 10 times
- **When** the 10th reconnect attempt fails
- **Then** `running` is set to false and no more reconnect attempts are made

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
| Bot message received | Silently ignored |
| Regular channel message (no @mention) | Silently ignored |
| Message from unknown channel/thread | Silently ignored |
| Unauthorized user | Replies `"Unauthorized."` |
| Rate limit exceeded | Replies with rate limit message |
| Prompt injection detected | Replies `"Message blocked: content policy violation."`, logs audit record |
| No agents configured | `/session` responds `"No agents configured. Create an agent first."` |
| No projects configured | `/session` responds `"No projects configured."` |
| Session expired and send fails | Replies in thread: `"Session expired. Use /session to start a new one."` |
| Failed to parse gateway message | Logs error, continues |
| Discord REST API send fails | Logs error with status and truncated response body |
| Heartbeat not acknowledged | Closes connection with code 4000, triggers reconnect |
| Max reconnect attempts reached | Stops bridge (`running = false`), logs error |
| Heartbeat interval out of 10s-120s range | Logs warning, uses default 41.25s |
| Slash command registration fails | Logs error, continues |
| Interaction response fails | Logs error |
| Thread creation fails | Responds to `/session` interaction: `"Failed to create conversation thread."` |
| Thread session ended | Replies in thread: `"This conversation has ended. Use /session to start a new one."` |
| `/session` without `appId` | Not available — slash commands require `appId` to be configured |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `ProcessManager` — startProcess, sendMessage, subscribe |
| `server/process/types.ts` | `extractContentText` — ContentBlock text extraction |
| `server/db/agents.ts` | `listAgents` |
| `server/db/sessions.ts` | `createSession`, `getSession` |
| `server/db/projects.ts` | `listProjects` |
| `server/db/councils.ts` | `listCouncils` |
| `server/db/audit.ts` | `recordAudit` |
| `server/councils/discussion.ts` | `launchCouncil` |
| `server/lib/logger.ts` | `createLogger` |
| `server/lib/prompt-injection.ts` | `scanForInjection` |
| `server/work/service.ts` | `WorkTaskService` (optional, for work_intake mode) |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/bootstrap.ts` | Lifecycle: construction, `start()`, registered with ShutdownCoordinator |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `DISCORD_BOT_TOKEN` | (required) | Discord bot token |
| `DISCORD_CHANNEL_ID` | (required) | Discord channel ID to listen on |
| `DISCORD_ALLOWED_USER_IDS` | `""` | Comma-separated list of allowed Discord user IDs; empty = allow all |
| `DISCORD_BRIDGE_MODE` | `"chat"` | `chat` or `work_intake` |
| `DISCORD_DEFAULT_AGENT_ID` | (none) | Default agent UUID for new sessions |
| `DISCORD_APP_ID` | (none) | Discord application ID; enables slash command registration |
| `DISCORD_GUILD_ID` | (none) | Discord guild ID; if set, slash commands are guild-scoped (instant) |
| `DISCORD_STATUS` | `"corvid-agent"` | Bot presence status text |
| `DISCORD_ACTIVITY_TYPE` | `3` | Activity type: 0=Playing, 1=Streaming, 2=Listening, 3=Watching, 5=Competing |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
| 2026-03-07 | corvid-agent | v2: Slash commands (with agent dropdown), interaction handling, bot presence, prompt injection scanning, council launching, work intake mode, agent resolution priority, ContentBlock extraction |
| 2026-03-07 | corvid-agent | v3: Thread-based conversations (shared sessions), rich embed responses with agent name/model, removed @AgentName routing (conflicts with Discord @), agent choices dropdown in /switch |
| 2026-03-07 | corvid-agent | v4: Passive channel mode — bot no longer auto-responds to channel messages. Only responds to @mentions (one-off) and slash commands. Threads created exclusively via `/session` command with agent selection and topic. Removed `/switch` and `/new` commands (replaced by `/session`). Removed text command parsing (slash-only). Added `mentions` field to `DiscordMessageData` |
