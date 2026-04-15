---
spec: bridge.spec.md
sources:
  - server/discord/bridge.ts
  - server/discord/gateway.ts
  - server/discord/commands.ts
  - server/discord/thread-manager.ts
  - server/discord/thread-session-manager.ts
  - server/discord/message-handler.ts
  - server/discord/rest-client.ts
  - server/discord/permissions.ts
  - server/discord/contact-linker.ts
---

## Layout

Large multi-file module (~35 source files). Organized into subsystems:

```
server/discord/
  bridge.ts                    — DiscordBridge class (main entry point, gateway + routing)
  gateway.ts                   — Raw WebSocket gateway (heartbeat, identify/resume, dispatch)
  commands.ts                  — Slash command registration and interaction dispatch
  admin-commands.ts            — /admin subcommand handler
  embeds.ts                    — Discord embed builders
  message-handler.ts           — Inbound message routing (mention detection, @mention sessions)
  message-formatter.ts         — Smart message splitting (code block preservation)
  permissions.ts               — Role-based permission level assignment
  thread-manager.ts            — Thread lifecycle (create, archive, stale cleanup)
  thread-session-manager.ts    — In-memory thread/session/mention Maps + TTL cleanup
  thread-lifecycle.ts          — Thread state machine
  thread-session-map.ts        — DB-backed thread→session mapping
  rest-client.ts               — Discord REST API client (no discord.js)
  guild-api.ts                 — Guild member/role lookup utilities
  contact-linker.ts            — Discord user ↔ contact record linking
  image-attachments.ts         — Image attachment handling
  reaction-handler.ts          — Reaction-based feedback (thumbs up/down)
  command-handlers/            — One file per slash command family
    session-commands.ts        — /session, /work
    message-commands.ts        — /message (sandboxed read-only sessions)
    info-commands.ts           — /agents, /status, /tasks, /config, /help, /tools, /dashboard
    moderation-commands.ts     — /council, /mute, /unmute
    schedule-commands.ts       — /schedule (list, create, pause, resume, delete, templates)
    agent-config-commands.ts   — /agent-skill, /agent-persona
    component-handlers.ts      — Button interactions (resume, new_session, archive, stop)
    autocomplete-handler.ts    — Live autocomplete for agent/project fields
  thread-response/             — Adaptive response strategies
    adaptive-response.ts       — Strategy selector
    embed-response.ts          — Embed-based long responses
    inline-response.ts         — Short inline responses
    progress-response.ts       — Streaming progress updates
    recovery.ts                — Error recovery strategies
    utils.ts                   — Shared response utilities
  voice/                       — Discord voice channel integration
    connection-manager.ts
    voice-session.ts
    audio-player.ts
    audio-receiver.ts
```

## Components

### `DiscordBridge` Class

Central coordinator. Owns the `DiscordGateway` WebSocket connection, dispatches incoming events to handlers, and exposes methods for outbound operations (`sendMessage`, `updatePresence`, `addReaction`, etc.).

Key behaviors:
- **Passive channel mode**: does not auto-respond to non-mention channel messages
- **Thread-only conversations**: `/session` creates threads; conversations happen there
- **Per-user rate limiting**: tiered by permission level (admin/operator/basic)
- **Prompt injection scanning**: inbound messages scanned before forwarding to agents
- **Automatic reconnection**: exponential backoff on WS disconnect
- **Stale thread archiving**: 10-minute interval checker archives inactive threads

### `DiscordGateway`

Raw Discord Gateway v10 WebSocket handler. No `discord.js` dependency. Manages:
- Heartbeat loop (interval from `HELLO` opcode)
- Identify/Resume sequence (ETF format not used; JSON)
- Session ID + sequence tracking for resume
- Exponential backoff reconnection

### Permission System (`permissions.ts`)

Maps Discord guild roles to permission levels: `ADMIN`, `OPERATOR`, `BASIC`, `NONE`. Used to gate slash commands and rate limit tiers.

### Thread Response Strategies (`thread-response/`)

Adaptive response selection based on content length and type:
- Short responses → inline
- Long responses → embed
- Streaming in-progress → progress updates
- Error states → recovery strategies

### Contact Linker (`contact-linker.ts`)

Links Discord user IDs to `contacts` DB records. Creates or updates contact records with Discord platform links when users interact with the bot.

## Tokens

| Env Var / Config | Description |
|-----------------|-------------|
| `DISCORD_BOT_TOKEN` | Gateway auth token |
| `DISCORD_APP_ID` | Application ID for slash command registration |
| `DISCORD_CHANNEL_ID` | Primary monitored channel |
| `DISCORD_ALLOWED_USER_IDS` | Comma-separated allowlist of Discord user IDs |
| Discord API Version | v10 (Gateway and REST) |

## Assets

| Resource | Description |
|----------|-------------|
| `discord_config` table | Runtime Discord bridge configuration (token, channel, etc.) |
| `discord_muted_users` table | Persisted mutes across restarts (migration 103) |
| `discord_mention_sessions` table | @mention auto-session tracking |
| `discord_processed_messages` table | Deduplication for processed messages (migration 109) |
| `discord_thread_sessions` table | Thread↔session mapping (migration 112) |
| `discord_channel_project` table | Last-used project per channel (migration 117) |
| `@discordjs/builders` | Slash command definition helpers (no gateway/REST from this lib) |
