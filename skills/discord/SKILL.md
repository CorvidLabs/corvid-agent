---
name: discord
description: Discord messaging — sending replies, bridge architecture, user identity, message formatting. Trigger keywords: discord, discord message, discord reply, discord user, discord bridge.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Discord — Messaging & Bridge

How to handle Discord messages, respond to users, and understand the Discord bridge architecture.

## Bridge Architecture

The Discord bridge (`server/discord/bridge.ts`) uses a raw WebSocket gateway connection (no discord.js dependency):

- Connects to Discord Gateway via WebSocket
- Handles heartbeat, identify, reconnect lifecycle
- Routes incoming messages to corvid-agent sessions (find-or-create per user)
- Subscribes to session responses and sends them back to Discord
- Enabled when `DISCORD_TOKEN` is set in `.env`

## Responding to Discord Messages

When a message arrives from Discord, it is tagged:

```
[This message came from Discord. Reply directly in this conversation — do NOT use corvid_send_message or other cross-channel tools to respond.]
```

### Rules

1. **Reply directly as text** — your response is automatically routed back to Discord
2. **Do NOT use `corvid_send_message`** to reply — that's for proactive outreach only
3. **Maintain channel affinity** — if it came from Discord, reply goes to Discord
4. **Never bridge replies** to a different channel than the conversation started on

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
- No tables (use code blocks instead)
- Keep messages concise — Discord is conversational, not document-oriented

## Limitations

- Messages over 2000 characters are rejected by Discord API
- No file attachments from agent responses (text only)
- No reactions or embeds from agent responses
- Voice channels are not supported through the bridge
