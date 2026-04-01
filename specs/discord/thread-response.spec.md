---
module: thread-response
version: 1
status: draft
files:
  - server/discord/thread-response/embed-response.ts
  - server/discord/thread-response/inline-response.ts
  - server/discord/thread-response/progress-response.ts
  - server/discord/thread-response/adaptive-response.ts
  - server/discord/thread-response/recovery.ts
  - server/discord/thread-response/utils.ts
db_tables: []
depends_on:
  - specs/discord/thread-session-map.spec.md
  - specs/discord/thread-lifecycle.spec.md
---

# Discord Thread Response

## Purpose

Provides response subscription strategies for Discord conversations. Each strategy subscribes to agent process events and delivers responses to Discord channels/threads using different UX patterns (rich embeds, inline replies, edit-in-place progress, or adaptive). Also includes recovery logic for reconnecting subscriptions after server restart and shared utility functions.

## Public API

### Exported Functions (embed-response.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `subscribeForResponseWithEmbed` | `(processManager, delivery, botToken, db, threadCallbacks, sessionId, threadId, agentName, agentModel, projectName?, displayColor?, displayIcon?, avatarUrl?)` | `void` | Subscribes to agent events and delivers responses as rich embeds in a Discord thread. Shows acknowledgment, progress, tool status, completion stats, and error embeds. |

### Exported Functions (inline-response.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `subscribeForInlineResponse` | `(processManager, delivery, botToken, sessionId, channelId, replyToMessageId, agentName, agentModel, onBotMessage?, projectName?, displayColor?, displayIcon?, avatarUrl?)` | `void` | Subscribes to agent events and sends responses as inline replies in a channel. Used for one-off @mention responses. |

### Exported Functions (progress-response.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `subscribeForInlineProgressResponse` | `(processManager, delivery, botToken, sessionId, channelId, replyToMessageId, agentName, agentModel, onBotMessage?, projectName?, displayColor?, displayIcon?, avatarUrl?)` | `void` | Subscribes to agent events with an edit-in-place progress message. Posts one progress embed, edits it with tool status updates, then posts the final response as a reply. |

### Exported Functions (adaptive-response.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `subscribeForAdaptiveInlineResponse` | `(processManager, delivery, botToken, sessionId, channelId, replyToMessageId, agentName, agentModel, onBotMessage?, projectName?, displayColor?, displayIcon?, avatarUrl?)` | `void` | Adaptive UX strategy: starts lightweight with typing indicator only, upgrades to an edit-in-place progress embed if tool_status events fire. Quick conversational replies never see a progress embed. |

### Exported Functions (recovery.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `recoverActiveThreadSubscriptions` | `(db, processManager, delivery, botToken, threadSessions, threadCallbacks)` | `void` | Recovers event subscriptions for active Discord thread sessions after server restart. |
| `recoverActiveMentionSessions` | `(db, mentionSessions, trackFn?)` | `void` | Recovers mention sessions from DB after server restart, populating the in-memory map. |
| `recoverActiveThreadSessions` | `(db, threadSessions, threadLastActivity)` | `number` | Bulk-recovers thread sessions from the discord_thread_sessions table on startup. Returns count of recovered sessions. |
| `resolveDefaultAgent` | `(db, config)` | `Agent \| null` | Resolves the default agent from config or falls back to the first available agent. |

### Exported Functions (utils.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `visibleEmbedParts` | `(text: string)` | `string[]` | Splits text into embed-safe chunks, dropping whitespace-only parts so Discord never receives empty embed bodies. |
| `sessionErrorEmbed` | `(errorType: string, fallbackMessage?: string)` | `{ title, description, color }` | Maps an error type to a user-facing embed title, description, and color. Handles context_exhausted, credits_exhausted, timeout, crash, spawn_error, and unknown. |

## Invariants

1. All response strategies maintain a typing indicator until a terminal event (result, session_error, session_exited) is received.
2. The typing indicator has a safety timeout (4 minutes) to prevent infinite typing on stalled sessions.
3. Embed response sends an acknowledgment if no content arrives within 5 seconds.
4. Buffer flushing is debounced at 1500ms to batch rapid content chunks.
5. visibleEmbedParts never returns empty or whitespace-only strings.
6. sessionErrorEmbed always returns a valid title, description, and color for any input.
7. Recovery functions are idempotent — they skip threads/sessions already present in memory.

## Behavioral Examples

### Scenario: Agent produces a quick text reply (inline)

- **Given** subscribeForInlineResponse is active
- **When** the agent emits an assistant event with text content
- **Then** the text is buffered, debounced, and sent as an inline reply embed

### Scenario: Agent uses tools before replying (adaptive)

- **Given** subscribeForAdaptiveInlineResponse is active
- **When** a tool_status event fires before any content
- **Then** a progress embed is posted and edited in-place with status updates
- **When** the result arrives
- **Then** the progress embed is marked done and the final response is sent as a reply

### Scenario: Agent session crashes

- **Given** any response strategy is active
- **When** the process dies (isRunning returns false)
- **Then** typing is cleared and an error embed is sent

### Scenario: Server restarts with active threads

- **Given** recoverActiveThreadSubscriptions is called on startup
- **When** DB contains running Discord thread sessions
- **Then** embed response subscriptions are re-established for each

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Process dies mid-response | Typing cleared, crash embed sent, callback removed |
| Discord API failure on embed send | Logged at debug/warn level, does not throw |
| Typing indicator safety timeout | Typing cleared, warning embed sent if no activity detected |
| Session error (context_exhausted, credits_exhausted, etc.) | Error embed with contextual message and Resume button |
| Recovery DB query fails | Logged as warning, returns gracefully |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/discord/embeds.ts` | sendEmbed, sendReplyEmbed, editEmbed, sendEmbedWithFiles, sendEmbedWithButtons, sendTypingIndicator, splitEmbedDescription, agentColor, hexColorToInt, collapseCodeBlocks, buildFooterText, buildFooterWithStats, buildAgentAuthor, buildActionRow |
| `server/discord/thread-session-map.ts` | ThreadSessionInfo, ThreadCallbackInfo, normalizeTimestamp, formatDuration |
| `server/discord/types.ts` | ButtonStyle, DiscordBridgeConfig |
| `server/process/manager.ts` | ProcessManager |
| `server/process/interfaces.ts` | EventCallback |
| `server/process/types.ts` | extractContentText, extractContentImageUrls, ContentBlock |
| `server/lib/delivery-tracker.ts` | DeliveryTracker |
| `server/lib/logger.ts` | createLogger |
| `server/db/agents.ts` | listAgents |
| `server/db/discord-thread-sessions.ts` | saveThreadSession, getRecentThreadSessions |
| `server/db/discord-mention-sessions.ts` | getRecentMentionSessions |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/thread-manager.ts` | All exported functions (re-exported or called from the main thread manager) |

## Change Log

| Version | Change |
|---------|--------|
| 1 | Initial spec — extracted from thread-manager.ts monolith into focused modules |
