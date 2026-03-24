---
module: discord-bridge
version: 19
status: active
files:
  - server/discord/bridge.ts
  - server/discord/commands.ts
  - server/discord/admin-commands.ts
  - server/discord/command-handlers/session-commands.ts
  - server/discord/command-handlers/info-commands.ts
  - server/discord/command-handlers/moderation-commands.ts
  - server/discord/command-handlers/component-handlers.ts
  - server/discord/command-handlers/autocomplete-handler.ts
  - server/discord/command-handlers/message-commands.ts
  - server/discord/embeds.ts
  - server/discord/message-handler.ts
  - server/discord/permissions.ts
  - server/discord/thread-manager.ts
  - server/discord/types.ts
  - server/discord/message-formatter.ts
  - server/discord/gateway.ts
  - server/discord/reaction-handler.ts
  - server/discord/contact-linker.ts
  - server/discord/image-attachments.ts
  - server/discord/command-handlers/message-commands.ts
db_tables:
  - sessions
  - session_messages
  - discord_config
depends_on:
  - specs/process/process-manager.spec.md
  - specs/db/sessions.spec.md
  - specs/councils/councils.spec.md
  - specs/lib/worktree.spec.md
---

# Discord Bridge

## Purpose

Bidirectional Discord bridge using the raw Discord Gateway WebSocket API (v10). No external Discord library dependencies. Connects to the Discord gateway, handles heartbeating, identifies/resumes sessions, and routes channel messages to agent sessions. The bot operates in **passive channel mode**: it does not auto-respond to regular channel messages. It only responds when @mentioned or when a slash command is used. Agent conversations happen exclusively in threads created via the `/session` command, where the user selects an agent and topic. Includes per-user rate limiting (with tiered limits by permission level), role-based access control, public channel mode, multi-channel support, prompt injection scanning, session management, automatic reconnection with exponential backoff, slash command registration, typing indicators, message reactions, smart message splitting (code block preservation), stale thread auto-archiving, and bot presence management.

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
| `start` | `()` | `void` | Open the gateway WebSocket connection; idempotent. Also registers slash commands if `appId` is configured. Starts stale thread checker (10-minute interval) |
| `stop` | `()` | `void` | Close the WebSocket with code 1000, clear heartbeat timer and stale thread checker |
| `sendMessage` | `(channelId: string, content: string)` | `Promise<void>` | Send a message to a Discord channel via REST API; smart-splits at paragraph/sentence/word boundaries, preserves code blocks |
| `updatePresence` | `(statusText?: string, activityType?: number)` | `void` | Update the bot's presence/status on the live gateway connection |
| `sendTypingIndicator` | `(channelId: string)` | `Promise<void>` | Send a typing indicator to a channel (lasts ~10s). Best-effort |
| `addReaction` | `(channelId, messageId, emoji: string)` | `Promise<void>` | Add a reaction to a message. Emoji must be URL-encoded. Best-effort |
| `removeReaction` | `(channelId, messageId, emoji: string)` | `Promise<void>` | Remove a bot reaction from a message. Best-effort |
| `muteUser` | `(userId: string)` | `void` | Mute a user from bot interactions (admin action) |
| `unmuteUser` | `(userId: string)` | `void` | Unmute a previously muted user (admin action) |
| `setReputationScorer` | `(scorer: ReputationScorer)` | `void` | Wire up the reputation scorer for reaction-based feedback |

### Exported Functions (from commands.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `registerSlashCommands` | `(db, config)` | `Promise<void>` | Register all slash commands with the Discord API |
| `handleInteraction` | `(ctx, interaction)` | `Promise<void>` | Dispatch an interaction event to the appropriate command handler |

### Exported Functions (from admin-commands.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleAdminCommand` | `(db, config, mutedUsers, threadSessionCount, interaction, options)` | `Promise<void>` | Dispatch `/admin` subcommands |

### Exported Functions (from command-handlers/session-commands.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleSessionCommand` | `(ctx, interaction, permLevel, getOption, userId)` | `Promise<void>` | Handle the `/session` slash command — creates a threaded conversation with a selected agent |
| `handleWorkCommand` | `(ctx, interaction, permLevel, getOption, userId)` | `Promise<void>` | Handle the `/work` slash command — creates an autonomous work task |

### Exported Functions (from command-handlers/message-commands.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleMessageCommand` | `(ctx, interaction, permLevel, getOption, userId)` | `Promise<void>` | Handle the `/message` slash command — starts a pure conversation session (no tools, no code execution) with a selected agent. Available at BASIC permission level for untrusted users. Persists the mention session to both the in-memory map and the database for follow-up replies. |

### Exported Functions (from command-handlers/info-commands.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleAgentsCommand` | `(ctx, interaction)` | `Promise<void>` | Handle the `/agents` command — lists available agents with their models |
| `handleStatusCommand` | `(ctx, interaction)` | `Promise<void>` | Handle the `/status` command — shows bot status and active sessions |
| `handleTasksCommand` | `(ctx, interaction)` | `Promise<void>` | Handle the `/tasks` command — shows active work tasks and queue status |
| `handleScheduleCommand` | `(ctx, interaction)` | `Promise<void>` | Handle the `/schedule` command — shows active schedules with next/last run times |
| `handleConfigCommand` | `(ctx, interaction, permLevel)` | `Promise<void>` | Handle the `/config` command — shows bot configuration (admin-only) |
| `handleQuickstartCommand` | `(ctx, interaction)` | `Promise<void>` | Handle the `/quickstart` command — shows Discord onboarding flow |
| `handleHelpCommand` | `(interaction)` | `Promise<void>` | Handle the `/help` command — shows available commands and usage |
| `handleDashboardCommand` | `(ctx, interaction)` | `Promise<void>` | Handle the `/dashboard` command — shows multi-embed server overview with agents, work, and schedules |
| `formatUptime` | `(seconds)` | `string` | Format seconds into human-readable uptime string (e.g. "2d 5h 30m") |
| `measureDbLatency` | `(db)` | `number` | Measure database latency with a trivial query, returns milliseconds |

### Exported Functions (from command-handlers/moderation-commands.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleCouncilCommand` | `(ctx, interaction, permLevel, getOption)` | `Promise<void>` | Handle the `/council` command — launches a council discussion on a topic |
| `handleMuteCommand` | `(ctx, interaction, permLevel, getOption)` | `Promise<void>` | Handle the `/mute` command — mutes a user from bot interactions |
| `handleUnmuteCommand` | `(ctx, interaction, permLevel, getOption)` | `Promise<void>` | Handle the `/unmute` command — unmutes a previously muted user |

### Exported Functions (from command-handlers/component-handlers.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleComponentInteraction` | `(ctx, interaction)` | `Promise<void>` | Handle button/component interactions (resume_thread, new_session, archive_thread, stop_session) |

### Exported Functions (from command-handlers/autocomplete-handler.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleAutocomplete` | `(ctx, interaction)` | `Promise<void>` | Handle autocomplete interactions — provides live results for agent and project name fields |

### Exported Functions (from command-handlers/message-commands.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleMessageCommand` | `(ctx, interaction, permLevel, getOption, userId)` | `Promise<void>` | Handle the `/message` slash command — pure conversation mode with no tools, for untrusted users at BASIC permission level |

### Exported Functions (from embeds.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getRateLimitWaitMs` | `()` | `number` | Returns milliseconds to wait before next Discord API call (0 if not rate-limited) |
| `discordFetch` | `(url, init)` | `Promise<Response>` | Rate-limit-aware fetch wrapper for Discord API that queues requests during 429 cooldowns |
| `respondToInteraction` | `(interaction, content)` | `Promise<void>` | Send a text response to an interaction callback |
| `respondToInteractionEmbed` | `(interaction, embed, ephemeral?)` | `Promise<void>` | Send an embed response to an interaction callback |
| `respondToInteractionEmbeds` | `(interaction, embeds, ephemeral?)` | `Promise<void>` | Send multiple embeds in a single interaction response |
| `acknowledgeButton` | `(interaction, message)` | `Promise<void>` | Acknowledge a button press with an ephemeral message |
| `sendEmbed` | `(delivery, botToken, channelId, embed)` | `Promise<void>` | Send an embed to a channel |
| `sendMessageWithEmbed` | `(delivery, botToken, channelId, content?, embed)` | `Promise<void>` | Send text content + embed to a channel |
| `sendEmbedWithButtons` | `(delivery, botToken, channelId, embed, components)` | `Promise<void>` | Send an embed with action row buttons |
| `sendReplyEmbed` | `(delivery, botToken, channelId, replyToId, embed)` | `Promise<void>` | Send an embed as a reply to a specific message |
| `buildActionRow` | `(...buttons)` | `DiscordActionRow` | Construct an ACTION_ROW component with buttons |
| `sendDiscordMessage` | `(delivery, botToken, channelId, content)` | `Promise<void>` | Send a text message with smart splitting |
| `sendTypingIndicator` | `(botToken, channelId)` | `Promise<void>` | Send a typing indicator (best-effort) |
| `addReaction` | `(botToken, channelId, messageId, emoji)` | `Promise<void>` | Add a reaction to a message (best-effort) |
| `removeReaction` | `(botToken, channelId, messageId, emoji)` | `Promise<void>` | Remove a reaction from a message (best-effort) |
| `editEmbed` | `(delivery, botToken, channelId, messageId, embed)` | `Promise<void>` | Edit an existing embed message in-place via PATCH |
| `agentColor` | `(name: string)` | `number` | Generate a consistent embed color for an agent name |
| `buildFooterText` | `(ctx: FooterContext)` | `string` | Build a clean footer: `agentName` or `agentName · status` |
| `buildFooterWithStats` | `(ctx: FooterContext, stats?: FooterStats)` | `string` | Build footer with session context AND run stats (files, turns, tools, commits) |
| `hexColorToInt` | `(hex: string)` | `number \| null` | Convert a hex color string (e.g. '#ff00aa') to a Discord embed color integer |
| `assertSnowflake` | `(value, label)` | `void` | Validate a Discord snowflake ID |
| `extractContentFromEmbed` | `(embed)` | `string \| undefined` | Extract Discord mentions from embed description for top-level content field (pings) |
| `extractUrlsFromEmbed` | `(embed)` | `string[] \| undefined` | Extract standalone URLs from embed description (deduplicated) |
| `stripUrlsFromEmbed` | `(embed)` | `DiscordEmbed` | Return shallow copy of embed with standalone URLs removed from description |
| `extractMentionsFromEmbed` | `(embed)` | `string \| undefined` | Deprecated alias for `extractContentFromEmbed` |
| `sendEmbedWithFiles` | `(delivery, botToken, channelId, embed, files)` | `Promise<string \| null>` | Send an embed with file attachments via multipart/form-data |
| `sendMessageWithFiles` | `(delivery, botToken, channelId, content, files)` | `Promise<string \| null>` | Send a text message with file attachments via multipart/form-data |
| `getRateLimitWaitMs` | `()` | `number` | Check if globally rate-limited; returns remaining wait ms or 0 |
| `discordFetch` | `(url: string, init: RequestInit)` | `Promise<Response>` | Wrapper for Discord API fetch that handles 429 rate limits globally, preventing Cloudflare IP bans |

### Exported Functions (from message-handler.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleMessage` | `(ctx, data)` | `Promise<void>` | Dispatch an incoming Discord message to the appropriate handler |
| `sendTaskResult` | `(ctx, channelId, task, mentionUserId?)` | `Promise<void>` | Send a task completion/failure embed |
| `withAuthorContext` | `(text, authorId?, authorUsername?, channelId?)` | `string` | Prefix message text with Discord author context and channel ID for agent identification |

### Exported Functions (from permissions.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `resolvePermissionLevel` | `(config, mutedUsers, userId, memberRoles?)` | `number` | Resolve a user's permission level based on roles and config |
| `checkRateLimit` | `(config, timestamps, userId, windowMs, maxMsg, permLevel?)` | `boolean` | Check if a user is within their rate limit |
| `isMonitoredChannel` | `(config, channelId)` | `boolean` | Check if a channel is being monitored |
| `muteUser` | `(mutedUsers, userId)` | `void` | Mute a user from bot interactions |
| `unmuteUser` | `(mutedUsers, userId)` | `void` | Unmute a user |

### Exported Functions (from thread-manager.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `subscribeForResponseWithEmbed` | `(pm, delivery, botToken, db, threadCallbacks, sessionId, threadId, agentName, agentModel, projectName?, displayColor?)` | `void` | Subscribe to agent events and stream responses as embeds |
| `subscribeForInlineResponse` | `(pm, delivery, botToken, sessionId, channelId, replyToId, agentName, agentModel, displayColor?)` | `void` | Subscribe for inline reply responses (one-off @mention) |
| `subscribeForAdaptiveInlineResponse` | `(pm, delivery, botToken, sessionId, channelId, replyToId, agentName, agentModel, onBotMessage?, projectName?, displayColor?)` | `void` | Adaptive UX subscriber: starts lightweight (typing only), upgrades to progress embed on tool use |
| `subscribeForInlineProgressResponse` | `(pm, delivery, botToken, sessionId, channelId, replyToId, agentName, agentModel, onBotMessage?, projectName?, displayColor?)` | `void` | Edit-in-place progress subscriber: posts progress embed immediately, edits with tool status |
| `tryRecoverThread` | `(db, threadSessions, threadId)` | `ThreadSessionInfo \| null` | Try to recover a thread-session mapping from the DB |
| `recoverActiveThreadSubscriptions` | `(db, pm, delivery, botToken, threadSessions, threadCallbacks)` | `void` | Re-subscribe to all active Discord sessions on startup |
| `archiveStaleThreads` | `(pm, delivery, botToken, lastActivity, sessions, callbacks, thresholdMs)` | `Promise<void>` | Archive threads idle beyond threshold |
| `archiveThread` | `(botToken, threadId)` | `Promise<void>` | Archive a single thread via the Discord API |
| `createStandaloneThread` | `(botToken, channelId, name)` | `Promise<string \| null>` | Create a standalone Discord thread |
| `resolveDefaultAgent` | `(db, config)` | `Agent \| null` | Resolve the default agent from config or first available |
| `normalizeTimestamp` | `(ts: string)` | `string` | Append 'Z' to SQLite UTC timestamps lacking timezone indicator |
| `formatDuration` | `(ms: number)` | `string` | Format milliseconds as human-readable "Xm Ys" or "Xs" string |

### Exported Functions (from message-formatter.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `splitMessage` | `(text: string, maxLen?: number)` | `string[]` | Split text into chunks respecting natural boundaries (paragraphs, sentences, words) and preserving code blocks. Default limit is 2000 chars |
| `splitEmbedDescription` | `(text: string)` | `string[]` | Split text for Discord embed descriptions (4096-char limit). Delegates to `splitMessage` with embed limit |
| `collapseCodeBlocks` | `(text: string, lineThreshold?: number)` | `string` | Collapse fenced code blocks exceeding `lineThreshold` lines (default 12) into a brief inline summary. Prevents tool output (e.g. Write tool file contents) from flooding Discord channels |

### Exported Interfaces & Classes (from gateway.ts)

| Export | Kind | Description |
|--------|------|-------------|
| `GatewayDispatchHandlers` | Interface | Callbacks for gateway dispatch events: `onMessage`, `onInteraction`, `onReady`, `onReactionAdd?` |
| `DiscordGateway` | Class | Manages the Discord Gateway WebSocket connection, heartbeat, identify/resume lifecycle, and reconnection. Dispatch events are forwarded to the bridge via `GatewayDispatchHandlers` |

#### DiscordGateway Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `DiscordBridgeConfig` | Bot token, channel ID, etc. |
| `handlers` | `GatewayDispatchHandlers` | Callbacks for dispatch events |

#### DiscordGateway Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start` | `()` | `void` | Open the gateway WebSocket connection |
| `stop` | `()` | `void` | Close the WebSocket and clear heartbeat timer |
| `updatePresence` | `(statusText?: string, activityType?: number)` | `void` | Update bot presence on the live gateway connection |

### Exported Functions (from reaction-handler.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleReaction` | `(ctx: ReactionHandlerContext, data: DiscordReactionData)` | `void` | Handle a MESSAGE_REACTION_ADD event — maps emoji reactions to reputation feedback |
| `checkReactionRateLimit` | `(userId: string)` | `boolean` | Check per-user reaction rate limit (5 per 60s window). Returns true if allowed |
| `resolveSession` | `(ctx: ReactionHandlerContext, data: DiscordReactionData)` | `{ sessionId, agentId } \| null` | Resolve the session and agent ID for a reacted-to message from mentionSessions or threadSessions |

### Exported Constants (from reaction-handler.ts)

| Constant | Type | Description |
|----------|------|-------------|
| `FEEDBACK_EMOJIS` | `Record<string, 'positive' \| 'negative'>` | Maps emoji characters to sentiment values (👍→positive, 👎→negative) |
| `reactionRateLimit` | `Map<string, number[]>` | Per-user reaction rate limit state — maps userId to timestamps of recent reactions |
| `RATE_LIMIT_MAX` | `number` | Maximum feedback reactions per rate limit window (5) |
| `RATE_LIMIT_WINDOW_MS` | `number` | Rate limit sliding window duration in milliseconds (60000) |

### Exported Functions (from contact-linker.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `resolveDiscordContact` | `(db: Database, authorId: string, username: string)` | `string \| null` | Resolve or create a contact for a Discord user. Checks cache first, then DB lookup by platform ID, then creates a new contact with Discord link. Returns contact ID or null on error |

### Exported Constants (from contact-linker.ts)

| Constant | Type | Description |
|----------|------|-------------|
| `CONTACT_CACHE_TTL` | `number` | Cache TTL in milliseconds (5 minutes) for in-memory contact resolution cache |
| `contactCache` | `Map<string, CachedContact>` | In-memory cache mapping Discord author IDs to resolved contact IDs, avoiding DB lookups on every message |

### Exported Functions (from image-attachments.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `isImageAttachment` | `(attachment: DiscordAttachment)` | `boolean` | Check whether an attachment is a supported image (PNG, JPEG, GIF, WebP) by content_type or file extension |
| `extractImageBlocks` | `(attachments: DiscordAttachment[] \| undefined)` | `ExtractedImages` | Extract image attachments and convert to Claude API content blocks. Enforces 20 MB size limit and 5-image-per-message cap |
| `appendAttachmentUrls` | `(text: string, attachments: DiscordAttachment[] \| undefined)` | `string` | Append `[attachment: <url>]` lines for each attachment to the text. Uses `proxy_url` with `url` fallback. Returns text unchanged when no attachments. Ensures the agent always sees attachment links even if multimodal content blocks are not supported |
| `buildMultimodalContent` | `(text: string, attachments: DiscordAttachment[] \| undefined)` | `string \| ContentBlockParam[]` | Build multimodal content from text and image attachments. Always includes attachment URLs in the text portion as a fallback. Returns plain string when no images (backward compatible), or content block array when images are present |

### Exported Types (from image-attachments.ts)

| Type | Description |
|------|-------------|
| `ExtractedImages` | `{ blocks: ContentBlockParam[]; skipped: number }` — result of image extraction with skip count |

### Exported Types (from extracted modules)

| Type | Source | Description |
|------|--------|-------------|
| `InteractionContext` | `commands.ts` | Context object for interaction handler delegation |
| `DiscordEmbed` | `embeds.ts` | Embed object shape (title, description, color, fields, footer, timestamp, image?, thumbnail?) |
| `FooterContext` | `embeds.ts` | Metadata for building rich embed footers (agentName, agentModel?, status?) |
| `FooterStats` | `embeds.ts` | Optional run statistics for embed footers (filesChanged?, turns?, tools?, commits?) |
| `DiscordFileAttachment` | `embeds.ts` | File attachment for Discord uploads (name, data, contentType?) |
| `MessageHandlerContext` | `message-handler.ts` | Context object for message handler delegation |
| `ThreadSessionInfo` | `thread-manager.ts` | Thread-to-session mapping info (sessionId, agentName, agentModel, ownerUserId, topic?, projectName?) |
| `MentionSessionInfo` | `message-handler.ts` | Session info for mention-reply context in channels (sessionId, agentName, agentModel, projectName?) |
| `ThreadCallbackInfo` | `thread-manager.ts` | Active subscription info per thread (sessionId, callback) |
| `ReactionHandlerContext` | `reaction-handler.ts` | Context object for reaction handler (db, botUserId, scorer, mentionSessions, threadSessions) |
| `assertInteractionToken` | `embeds.ts` | Validate a Discord interaction token |

### Exported Types (from types.ts)

| Type | Description |
|------|-------------|
| `DiscordBridgeMode` | `'chat' \| 'work_intake'` — operational mode for the bridge |
| `DiscordBridgeConfig` | `{ botToken, channelId, additionalChannelIds?, allowedUserIds, mode?, defaultAgentId?, appId?, guildId?, botRoleId?, publicMode?, rolePermissions?, defaultPermissionLevel?, rateLimitByLevel? }` |
| `DiscordGatewayPayload` | `{ op: number; d: unknown; s: number \| null; t: string \| null }` |
| `DiscordHelloData` | `{ heartbeat_interval: number }` |
| `DiscordReadyData` | `{ session_id: string; resume_gateway_url: string }` |
| `DiscordMessageData` | `{ id, channel_id, author, content, timestamp, mentions?: DiscordAuthor[], mention_roles?: string[], member?: { roles: string[] }, message_reference?, referenced_message?, attachments?: DiscordAttachment[] }` |
| `DiscordAttachment` | `{ id, filename, content_type?, size, url, proxy_url, width?, height? }` — file attached to a Discord message |
| `DiscordAuthor` | `{ id: string; username: string; bot?: boolean }` |
| `DiscordInteractionOption` | `{ name, type, value?, options?: DiscordInteractionOption[] }` — recursive option type for subcommands and subcommand groups |
| `DiscordInteractionData` | Slash command interaction payload from gateway |
| `GatewayOp` | Constants for gateway opcodes (DISPATCH=0, HEARTBEAT=1, IDENTIFY=2, PRESENCE_UPDATE=3, RESUME=6, RECONNECT=7, INVALID_SESSION=9, HELLO=10, HEARTBEAT_ACK=11) |
| `GatewayIntent` | Bit flags: `GUILDS` (1<<0), `GUILD_MEMBERS` (1<<1), `GUILD_MESSAGES` (1<<9), `GUILD_MESSAGE_REACTIONS` (1<<10), `MESSAGE_CONTENT` (1<<15) |
| `DiscordReactionData` | `{ user_id, channel_id, message_id, guild_id?, emoji: { id, name } }` — payload from MESSAGE_REACTION_ADD |
| `PermissionLevel` | Constants: `BLOCKED=0, BASIC=1, STANDARD=2, ADMIN=3` |
| `ComponentType` | Constants for Discord component types: `ACTION_ROW=1, BUTTON=2` |
| `ButtonStyle` | Constants for Discord button styles: `PRIMARY=1, SECONDARY=2, SUCCESS=3, DANGER=4` |
| `DiscordButton` | `{ type, style, label, custom_id, emoji?, disabled? }` — a Discord button component |
| `DiscordActionRow` | `{ type, components: DiscordButton[] }` — a row of button components |
| `InteractionType` | `PING=1, APPLICATION_COMMAND=2, MESSAGE_COMPONENT=3` |
| `InteractionCallbackType` | `PONG=1, CHANNEL_MESSAGE=4, DEFERRED_CHANNEL_MESSAGE=5, UPDATE_MESSAGE=7` |

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
9. **Gateway intents**: Requests `GUILD_MESSAGES`, `GUILD_MESSAGE_REACTIONS`, and `MESSAGE_CONTENT` intents during IDENTIFY. When `publicMode` is enabled, also requests `GUILDS` and `GUILD_MEMBERS` for role data
10. **Bot presence**: Set via the `presence` field in IDENTIFY payload. Configurable via `DISCORD_STATUS` and `DISCORD_ACTIVITY_TYPE` env vars. Can be updated at runtime via `updatePresence()`

### Channel Message Handling (Passive Mode)

11. **Passive channel mode**: The bot does NOT auto-respond to regular messages in the configured channel. Regular channel messages are silently ignored unless the bot is @mentioned
12. **@mention response**: When the bot is @mentioned in the configured channel, it responds inline (not in a thread) as a one-off reply. The response uses the `defaultAgentId` agent (or first available agent). No session or thread is created
13. **Multi-channel support**: Messages from the primary `channelId` and any `additionalChannelIds` are processed, plus threads created by the bridge. Messages from other channels are silently ignored
14. **Bot message ignore**: Messages from bot accounts (`author.bot === true`) are silently ignored to prevent loops

### Thread & Session Management

15. **Explicit thread creation only**: Threads are ONLY created via the `/session` (or `/thread`) slash command. Regular channel messages never auto-create threads
16. **Agent selection at session start**: The `/session` command requires the user to select an agent (from a dropdown) and provide a topic. The thread is created with the selected agent and named `AgentName — topic` (truncated to 100 chars)
17. **Thread auto-archive**: Threads auto-archive after 24 hours of inactivity
18. **Shared thread sessions**: Any user can reply in a thread to participate in the conversation. Thread sessions are tracked by thread ID, not user ID
19. **Thread-scoped agent**: Each thread is bound to the agent selected at creation time. The agent cannot be changed mid-thread — start a new session for a different agent
20. **Thread message routing**: All messages in a bridge-created thread are routed to the thread's agent session. The bot responds automatically within threads it owns (no @mention required)

### Security & Rate Limiting

21. **Role-based access control**: Permission levels (BLOCKED=0, BASIC=1, STANDARD=2, ADMIN=3). In legacy mode, `allowedUserIds` grants ADMIN level. In `publicMode`, permissions are resolved from Discord roles via `rolePermissions` config. Highest matching role wins. Muted users are always BLOCKED
22. **Tiered rate limiting**: Each user is limited per 60-second sliding window. Default is 10 messages. Can be customized per permission level via `rateLimitByLevel` config (e.g., BASIC=3, STANDARD=10, ADMIN=50)
23. **Prompt injection scanning**: All incoming messages (channel @mentions and thread messages) are scanned via `scanForInjection()`. Blocked messages are audited and rejected
24. **Permission-gated commands**: `/session` requires STANDARD or higher. `/council`, `/mute`, `/unmute`, `/admin`, `/config` require ADMIN. `/agents`, `/status`, `/tasks`, `/schedule`, `/help` require BASIC
25. **User muting**: Admins can mute/unmute users via `/mute` and `/unmute` slash commands. Muted users cannot interact with the bot regardless of their role permissions. Mutes are persisted in the `discord_muted_users` DB table and restored on bridge start

### Response Formatting

24. **Rich embed responses**: Agent responses are sent as Discord embeds with the message content in the description, agent name and model in the footer, and a consistent per-agent color derived from name hashing
25. **Response debouncing**: Session events are buffered for 1500ms before being sent as embeds to the thread
26. **Subscription deduplication**: Each thread maintains at most one active event subscription. When a new message is routed to a thread, the previous subscription callback is unsubscribed before a new one is created, preventing duplicate responses
27. **Smart message splitting**: Messages are split at natural boundaries (paragraphs, then sentences, then words). Code blocks are never split mid-block — oversized code blocks get their own opening/closing fences per chunk. Embed descriptions use 4096-char limit, plain messages use 2000-char limit. Implemented in `message-formatter.ts`
28. **Content extraction**: Assistant responses use `extractContentText()` to properly handle both string and `ContentBlock[]` formats. Large code blocks (>12 lines) are collapsed via `collapseCodeBlocks()` before buffering for Discord, preventing tool output (e.g. Write tool file contents) from flooding channels
29. **Typing indicators**: A typing indicator is sent when a message is received and periodically refreshed (every 8s) while the agent is responding, since Discord typing indicators expire after ~10 seconds
30. **Message reactions**: Thread titles are updated with a ✓ prefix when the session completes
31. **Stale thread auto-archive**: Threads inactive for 2 hours are automatically archived with a closing message. The stale check runs every 10 minutes. Thread sessions and subscriptions are cleaned up on archive

### Reaction Feedback

32. **Reaction-based reputation feedback**: When a user reacts with a feedback emoji (👍 or 👎) on a bot message, the reaction is mapped to a `response_feedback` record with source `discord`. The session is resolved from `mentionSessions` (for channel replies) or `threadSessions` (for thread messages). Bot self-reactions are ignored. Non-feedback emojis are silently ignored
33. **Reaction rate limiting**: Each user is limited to 5 feedback reactions per 60-second sliding window. Rate limits are per-user, independent of each other. Rate-limited reactions are silently dropped
34. **Reputation event recording**: Each feedback reaction also records a reputation event via `ReputationScorer.recordEvent()` with `eventType: 'feedback_received'` and `scoreImpact: +2` (positive) or `-2` (negative)

### Commands

32. **Slash commands**: If `appId` is configured, commands are registered as Discord Application Commands via `PUT /applications/{appId}/commands` (or guild-scoped if `guildId` is set). Interactions are handled via gateway `INTERACTION_CREATE` events. Commands: `/session`, `/work`, `/agents`, `/status`, `/tasks`, `/schedule`, `/config`, `/council`, `/mute`, `/unmute`, `/help`, `/admin`
33. **`/session` command** (interactive chat): Creates a new Discord thread with a live agent session. The user can go back and forth with the agent in real-time. Required options: `agent` (dropdown, capped at 25), `topic` (string, thread name). Optional: `project` (dropdown). The thread is created in the configured channel with the selected agent bound to it. Use `/session` when you want to **discuss, explore, or guide** the agent interactively
34. **`/work` command** (autonomous task): Creates an async work task — the agent works autonomously (clones repo, makes changes, creates a PR) without further interaction. Required: `description` (what to do). Optional: `agent` (dropdown), `project` (dropdown). Responds with a rich confirmation embed showing task ID, agent, and status. Sends a completion notification with PR link (or error details) when done, mentioning the requester. Use `/work` when you want to **assign a task** and get notified with a PR
35. **`/agents` command**: Lists all available agents with their models. Does not create a session
36. **`/status` command**: Shows the bot's current status and active sessions
37. **`/tasks` command**: Shows active work tasks and queue status as a rich embed with task descriptions, statuses, and counts
38. **`/schedule` command**: Shows all active schedules with next/last run times (using Discord relative timestamps) and execution counts
39. **`/config` command** (admin-only): Shows current bot configuration (mode, public mode, channels, default permission level) as an ephemeral embed. Does not expose sensitive values (tokens, secrets)
40. **`/council` command**: Launches a council discussion on a given topic
38. **`/help` command**: Shows available commands and usage
39. **Text commands deprecated**: Text commands (messages starting with `/`) are no longer parsed from regular channel messages. All commands use Discord's slash command system (requires `appId`)
40. **Work intake mode**: When `mode='work_intake'`, @mentions and thread messages create async work tasks via `WorkTaskService` instead of chat sessions. Embeds are used for task status feedback
41. **`/admin` command**: Admin-only configuration management with subcommand groups. All changes persist to `discord_config` DB table and hot-reload within 30s. Subcommands: `channels add/remove/list` (manage monitored channels via #channel mentions), `users add/remove/list` (manage allowed users via @user mentions), `roles set/remove/list` (manage role→permission mappings via @role mentions with level dropdown), `mode` (set bridge mode), `public` (toggle public mode), `show` (display full config summary). Every mutation is audit-logged. Responses use rich embeds with clear confirmation/status

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
- **Then** slash commands (`session`, `work`, `agents`, `status`, `tasks`, `schedule`, `config`, `council`, `help`, `mute`, `unmute`) are registered via PUT to the Discord API
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

### Scenario: /work creates an autonomous task

- **Given** a running Discord bridge with agents and a WorkTaskService
- **When** a user invokes `/work` with description "Fix the login page CSS", agent "CorvidAgent", and project "corvid-agent"
- **Then** the bot responds with "Creating work task for **CorvidAgent**..."
- **And** a rich embed is posted showing task ID, agent name, status "In Progress", and the description
- **And** the embed footer says "You'll be notified when it completes"
- **When** the agent finishes working (creates a PR)
- **Then** a completion embed is posted in the same channel with the PR link, summary, branch, and iteration count
- **And** the original requester is @mentioned so they receive a Discord notification

### Scenario: /session vs /work — when to use which

- **`/session`** is for **interactive conversations**: the user wants to discuss, explore, or iteratively guide the agent. Creates a Discord thread where both sides can exchange messages in real-time. Think of it as "chat with an agent."
- **`/work`** is for **fire-and-forget tasks**: the user has a clear task description and wants the agent to work autonomously. No thread is created — the agent clones the repo, works, creates a PR, and posts a completion notification. Think of it as "assign a task to an agent."

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
| Thread session ended (deleted) | Replies in thread: `"This session has expired and can no longer be resumed. Start a new /session to continue working."` with Archive Thread button |
| `/work` without WorkTaskService | Responds "Work task service not available." |
| `/work` without description | Responds "Please provide a task description." |
| `/work` with unknown agent | Responds with available agent names |
| `/work` with unknown project | Responds with available project names |
| `/work` task creation fails | Error embed posted in channel with failure details |
| `/session` without `appId` | Not available — slash commands require `appId` to be configured |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `ProcessManager` — startProcess, sendMessage, subscribe, unsubscribe |
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
| `server/reputation/scorer.ts` | `ReputationScorer` (optional, for reaction feedback) |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/bootstrap.ts` | Lifecycle: construction, `start()`, registered with ShutdownCoordinator |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `DISCORD_BOT_TOKEN` | (required) | Discord bot token |
| `DISCORD_CHANNEL_ID` | (required) | Primary Discord channel ID to listen on |
| `DISCORD_ADDITIONAL_CHANNEL_IDS` | `""` | Comma-separated additional channel IDs to monitor |
| `DISCORD_ALLOWED_USER_IDS` | `""` | Comma-separated list of allowed Discord user IDs; empty = allow all (legacy mode) |
| `DISCORD_PUBLIC_MODE` | `"false"` | Enable public channel mode with role-based access |
| `DISCORD_ROLE_PERMISSIONS` | (none) | JSON object mapping Discord role IDs to permission levels (0-3) |
| `DISCORD_DEFAULT_PERMISSION_LEVEL` | `1` | Default permission level for users with no matching role in public mode |
| `DISCORD_RATE_LIMIT_BY_LEVEL` | (none) | JSON object mapping permission levels to max messages per window |
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
| 2026-03-08 | corvid-agent | v5: Fix duplicate message bug — track active subscription per thread, unsubscribe previous callback before re-subscribing on each message. Added invariant #26 (subscription deduplication) |
| 2026-03-10 | corvid-agent | v6: Public channel mode with role-based access control (BLOCKED/BASIC/STANDARD/ADMIN). Multi-channel support. Tiered rate limiting by permission level. Smart message splitting at natural boundaries with code block preservation. Typing indicators with periodic refresh. Message reactions for acknowledgment. Stale thread auto-archiving (2h). Thread title updates on session completion. `/mute` and `/unmute` admin commands. Added `message-formatter.ts`. Refs #891, #893 |
| 2026-03-10 | corvid-agent | v7: DB-backed dynamic configuration with 30s hot-reload. Discord onboarding flow (`/quickstart`). First-interaction welcome tips. Persisted interacted users. `discord_config` table. Settings API endpoints |
| 2026-03-10 | corvid-agent | v8: Added `/work` slash command for autonomous task creation (agent works independently, creates PR, notifies on completion). Added optional `project` dropdown to `/session`. Rich embed confirmations for `/work` with task status, agent, branch. Completion notifications @mention the requester. Added `sendMessageWithEmbed` for content+embed messages. AlgoChat `/work` now supports `--project <name>` flag. Clear documentation differentiating `/session` (interactive chat) vs `/work` (fire-and-forget task) |
| 2026-03-10 | corvid-agent | v9: `/admin` slash command with subcommand groups for managing channels (add/remove/list), users (add/remove/list), roles (set/remove/list), bridge mode, and public mode — all from within Discord using native mentions. `DiscordInteractionOption` recursive type for nested subcommands. Audit logging on every config mutation. `/help` updated with Admin Configuration section. 20 new tests |
| 2026-03-11 | corvid-agent | v10: Decomposed bridge.ts (2688→367 lines) into 6 extracted modules: `commands.ts` (slash command registration & handling), `admin-commands.ts` (/admin subcommands), `embeds.ts` (Discord API helpers & embed builders), `message-handler.ts` (message routing & dispatch), `permissions.ts` (RBAC & rate limiting), `thread-manager.ts` (thread lifecycle & streaming). Bridge.ts retained as thin orchestration layer. No behavioral changes — pure refactoring. Closes #932 |
| 2026-03-14 | corvid-agent | v11: Added `/tasks`, `/schedule`, `/config` slash commands. `/tasks` shows active work tasks with status emojis and queue counts. `/schedule` shows active schedules with Discord relative timestamps for next/last runs. `/config` is admin-only ephemeral embed showing mode, channels, and permission settings. Updated `/help` embed. 6 new tests. Closes #894 |
| 2026-03-16 | corvid-agent | v12: Discord reaction listener for reputation feedback. Added `GUILD_MESSAGE_REACTIONS` intent, `MESSAGE_REACTION_ADD` dispatch handler, `reaction-handler.ts` module with emoji-to-sentiment mapping, per-user rate limiting (5/min), session resolution from mentionSessions and threadSessions, `response_feedback` insertion, and reputation event recording. `setReputationScorer()` setter on DiscordBridge. 11 new tests. Closes #1161 |
| 2026-03-17 | corvid-agent | v13: Adaptive inline response UX. Added `subscribeForAdaptiveInlineResponse` (starts lightweight, upgrades to progress embed on tool use), `subscribeForInlineProgressResponse` (always-on progress embed), and `editEmbed` helper for PATCH-ing embeds in-place. @mention replies now use adaptive subscriber for cleaner conversational UX |
| 2026-03-18 | corvid-agent | v14: Improved expired-session UX — thread message for deleted sessions now says "This session has expired and can no longer be resumed" with actionable guidance instead of vague "This conversation has ended". Fixes #1222 |
| 2026-03-18 | corvid-agent | v15: Added `extractMentionsFromEmbed` — extracts Discord mentions from embed descriptions into top-level `content` field so mentions trigger notifications. Applied to `sendEmbed`, `sendReplyEmbed`, and `editEmbed` |
| 2026-03-20 | corvid-agent | v16: File attachment support via `sendEmbedWithFiles` and `sendMessageWithFiles` (multipart/form-data, 25MB limit). Simplified embed footer to `agentName · status`. Added `image` and `thumbnail` fields to `DiscordEmbed`. `DiscordFileAttachment` interface |
| 2026-03-23 | corvid-agent | v17: Renamed `extractMentionsFromEmbed` → `extractContentFromEmbed`. v18: Discord won't auto-unfurl URLs in `content` when rich embeds are present — URLs are now stripped from embed description via `stripUrlsFromEmbed` and sent as a separate follow-up message (no embeds) so Discord renders link previews. Added `extractUrlsFromEmbed` and `stripUrlsFromEmbed` helpers |
