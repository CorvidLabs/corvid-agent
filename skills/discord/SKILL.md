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
- Join voice channels

## Bridge Architecture

The Discord bridge (`server/discord/bridge.ts`) uses a raw WebSocket gateway connection (no discord.js dependency):

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

## Message Formatting

Discord supports a subset of Markdown:
- `**bold**`, `*italic*`, `~~strikethrough~~`
- `` `inline code` `` and ` ```code blocks``` `
- `> blockquotes`
- Links: `[text](url)` or bare URLs
- **No tables** — use code blocks instead
- **2000 character limit** — messages over this are rejected by Discord API
- Keep messages concise — Discord is conversational, not document-oriented
