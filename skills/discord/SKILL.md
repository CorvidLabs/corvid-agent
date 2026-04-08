---
name: discord
description: Discord messaging — how to send and receive messages, bridge architecture, user identity, formatting. Trigger keywords: discord, discord message, discord reply, discord user, discord bridge, send discord.
metadata:
  author: CorvidLabs
  version: "2.0"
---

# Discord — Messaging & Bridge

How to handle Discord messages — sending, receiving, and understanding the bridge.

## How You Send Discord Messages

**You send Discord messages by writing text directly.** When a Discord message arrives, your text response is automatically routed back through the Discord bridge. There is no MCP tool for Discord messaging — you ARE the Discord interface.

### Sending a reply
Just write your response as text. The bridge handles delivery.

### Sending to a different channel
Use `corvid_send_message` only when you need to proactively reach out to a DIFFERENT agent (not to reply to the current conversation).

### Sending Images
You CAN send images to Discord! Use the `POST /api/discord/send-image` endpoint:
- Supports local file paths or base64 image data
- Use this whenever you generate, render, or have a screenshot/image to share
- **Never claim you can't send images** — this endpoint exists and works

### What you CANNOT do
- Send reactions or rich embeds
- Post to specific Discord channels by ID
- Manage Discord server settings, roles, or permissions

## Voice Channels

The bot supports Discord voice channels via `/voice` slash commands (admin-only):

- `/voice join <channel>` — Join a voice channel (listen-only by default)
- `/voice leave` — Disconnect from voice
- `/voice status` — Show connection info, STT/TTS state
- `/voice listen` — Start transcribing speech (STT via Whisper)
- `/voice deafen` — Stop STT
- `/voice say <text>` — Speak text via TTS (OpenAI) in the voice channel
- `/voice shutup` — Stop current TTS playback

Voice uses `@discordjs/voice` for protocol handling, with the existing `server/voice/` services for STT (Whisper) and TTS (OpenAI tts-1). See `specs/discord/voice.spec.md` for full details.

## Bridge Architecture

The Discord bridge (`server/discord/bridge.ts`) uses discord.js Client for gateway and REST:

- Connects to Discord Gateway via WebSocket
- Handles heartbeat, identify, reconnect lifecycle
- Routes incoming messages to corvid-agent sessions (find-or-create per user)
- Subscribes to session responses and sends them back to Discord
- Enabled when `DISCORD_TOKEN` is set in `.env`

## Receiving Discord Messages

When a message arrives from Discord, it is tagged:

```
[This message came from Discord. Reply directly in this conversation — do NOT use corvid_send_message or other cross-channel tools to respond.]
```

The message also includes the sender's username and Discord ID.

## User Identity

Discord messages include:
- **Username**: e.g., `leif.algo`
- **Discord ID**: e.g., `181969874455756800`

Use `corvid_lookup_contact` to resolve Discord users to their other identities (GitHub, AlgoChat, etc.).

## User Mentions & Pings

To mention/ping a Discord user, you MUST use the Discord mention syntax with their numeric ID:

```
<@DISCORD_ID>
```

**Example:** `<@181969874455756800>` pings Leif. Writing `@Leif` or `@leif.algo` does NOT ping anyone — it renders as plain text.

### Rules

- **Always use `<@id>` format** — this is the only way to actually notify someone on Discord
- **Never use `@DisplayName`** — it looks like a mention but does not ping or notify
- Get the Discord ID from the incoming message metadata or via `corvid_lookup_contact`
- Role mentions use `<@&ROLE_ID>` format
- Channel mentions use `<#CHANNEL_ID>` format

## Message Formatting

Discord supports a subset of Markdown:
- `**bold**`, `*italic*`, `~~strikethrough~~`
- `` `inline code` `` and ` ```code blocks``` `
- `> blockquotes`
- Links: `[text](url)` or bare URLs
- **No tables** — use code blocks instead
- **2000 character limit** — messages over this are rejected by Discord API
- Keep messages concise — Discord is conversational, not document-oriented
