---
spec: bridge.spec.md
---

## User Stories

- As an agent operator, I want to interact with agents via Discord threads so that I can manage agent sessions from a familiar chat interface
- As a platform administrator, I want to configure agent skills and personas via `/agent-skill` and `/agent-persona` slash commands so that I can hot-swap agent capabilities without restarting
- As an agent operator, I want to send messages to agents via `/message` and receive responses in Discord embeds so that conversations are well-formatted and easy to follow
- As a team agent, I want my session responses forwarded to Discord threads so that operators can observe my work in real time
- As a platform administrator, I want a permission system (OWNER > ADMIN > MEMBER) so that sensitive commands are restricted to authorized Discord users
- As an agent operator, I want to link Discord users to agent contacts via the contact linker so that the system knows which Discord user corresponds to which agent contact
- As an agent developer, I want guild-level API access for listing channels and members so that Discord integrations can discover server structure programmatically
- As an agent operator, I want buddy session rounds posted as colored Discord embeds so that I can see the lead-buddy review conversation in real time

## Acceptance Criteria

- `DiscordBridge` connects to the Discord gateway, registers slash commands, and handles interactions via HTTP webhook endpoint
- Thread-based session lifecycle: each `/message` or `/session` command creates or reuses a Discord thread; agent responses are posted as embeds in that thread
- `ThreadSessionMap` persists thread-to-session mappings across restarts using the `discord_thread_sessions` database table
- Mention sessions are persisted and recovered: `persistMentionSessions()` saves active sessions, `recoverMentionSessions()` restores them on restart
- `/agent-skill add|remove|list` and `/agent-persona add|remove|list` require `PermissionLevel.ADMIN`; agent name matching is case-insensitive and strips model suffixes
- Skill bundle and persona name matching strips autocomplete suffixes and is case-insensitive
- `ContactLinker` maps Discord user IDs to agent contact records and exposes `linkContact` and `unlinkContact` methods
- Guild API functions (`listGuildChannels`, `listGuildMembers`) use the Discord REST API with proper rate-limit handling
- Permission level is resolved per-interaction from Discord roles and the configured owner user ID
- Bot messages and messages from the bridge's own user ID are filtered to prevent echo loops
- Long responses are chunked to fit Discord's embed description limit (4096 characters)
- The bridge responds to Discord's interaction deadline (3 seconds) by deferring responses when needed

## Constraints

- Requires `DISCORD_BOT_TOKEN` and `DISCORD_APPLICATION_ID` environment variables
- Discord embed descriptions are capped at 4096 characters; messages are chunked at that boundary
- Slash command registration is global (not guild-specific) and may take up to 1 hour to propagate
- Rate limits from the Discord API must be respected; the bridge handles 429 responses with retry-after headers
- Thread names are derived from the first message content, truncated to Discord's 100-character limit

## Out of Scope

- Discord voice channel integration (voice is handled by the voice module via Telegram)
- Direct message (DM) support with Discord users
- Discord bot sharding for multiple guilds at scale
- Custom Discord activity/presence status management
- File or image attachment handling in agent responses
