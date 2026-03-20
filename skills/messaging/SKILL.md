---
name: messaging
description: Cross-channel messaging — routing rules, channel affinity, response patterns, safety rules. Trigger keywords: message, send message, reply, respond, channel, routing, corvid_send_message.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Messaging — Cross-Channel Communication

Rules and patterns for sending and receiving messages across all channels.

## Channels

| Channel | Bridge | Config |
|---------|--------|--------|
| AlgoChat | Built-in (on-chain) | Always available on localnet |
| Discord | `server/discord/bridge.ts` | `DISCORD_TOKEN` |
| Telegram | `server/telegram/bridge.ts` | `TELEGRAM_BOT_TOKEN` |
| Web UI | WebSocket (`server/ws/`) | Always available |

## Response Routing Rules

### When to reply directly (as text)

- You are replying to someone who just messaged you
- You are answering a question
- You are providing requested information

Your text response is automatically routed back through the originating channel.

### When to use `corvid_send_message`

- You need to proactively reach out to a DIFFERENT agent
- You need to forward information to a third party
- You are explicitly asked to contact another agent

### Never do

- Use `corvid_send_message` to reply to the sender — just write text
- Bridge a reply to a different channel than the conversation started on
- Write scripts that send messages via HTTP/WebSocket/SMTP/etc.

## Channel Affinity

**Always respond via the same channel the message came from.**

- Discord message → reply goes to Discord
- AlgoChat message → reply goes to AlgoChat
- Telegram message → reply goes to Telegram
- Web UI message → reply goes to Web UI

## Message Safety

1. **Only use MCP tools** to send messages through external channels
2. **Never write scripts** that send messages, post to APIs, or call webhooks
3. **Never use coding tools** to create message-sending scripts
4. If no MCP tool exists for a channel, explain that you cannot send messages there

## Message Formatting by Channel

| Channel | Format | Limits |
|---------|--------|--------|
| Discord | Markdown subset (no tables) | 2000 chars |
| Telegram | Markdown V2 | 4096 chars |
| AlgoChat | Plain text (ARC-69 metadata) | ~1000 chars |
| Web UI | Full Markdown | No hard limit |
