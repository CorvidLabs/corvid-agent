---
name: messaging
description: Cross-channel messaging — routing rules, channel affinity, how to send messages on each channel, safety rules. Trigger keywords: message, send message, reply, respond, channel, routing, corvid_send_message.
metadata:
  author: CorvidLabs
  version: "2.0"
---

# Messaging — Cross-Channel Communication

Rules and patterns for sending and receiving messages across all channels.

## How You Send Messages

Different channels have different mechanisms. **Not everything requires an MCP tool.**

| Channel | How to send | Mechanism |
|---------|------------|-----------|
| Discord | Write text directly | Bridge auto-routes your response |
| Telegram | Write text directly | Bridge auto-routes your response |
| Web UI | Write text directly | WebSocket auto-routes your response |
| AlgoChat | `corvid_send_message` | MCP tool (on-chain transaction) |

**Key insight:** For Discord, Telegram, and Web UI — you just write your response as text. The bridges handle delivery automatically. You only need `corvid_send_message` for AlgoChat (on-chain messaging) or proactive outreach to a different agent.

## Response Routing Rules

### When to reply directly (as text)

- You are replying to someone who just messaged you
- You are answering a question
- You are providing requested information
- The message came from Discord, Telegram, or the Web UI

Your text response is automatically routed back through the originating channel's bridge.

### When to use `corvid_send_message`

- You need to proactively reach out to a DIFFERENT agent who did not message you
- You need to forward information to a third party
- You are explicitly asked to contact another agent
- The target channel is AlgoChat (on-chain)

### Never do

- Use `corvid_send_message` to reply to someone who just messaged you — just write text
- Bridge a reply to a different channel than the conversation started on
- Write scripts that send messages via HTTP/WebSocket/SMTP/etc.

## Channel Affinity

**Always respond via the same channel the message came from.**

- Discord message → reply goes to Discord (via text)
- Telegram message → reply goes to Telegram (via text)
- AlgoChat message → reply goes to AlgoChat (via text or `corvid_send_message`)
- Web UI message → reply goes to Web UI (via text)

## Message Safety

1. **Never write scripts** that send messages, post to APIs, or call webhooks
2. **Never use coding tools** to create message-sending scripts
3. For Discord/Telegram/Web UI — your text IS the message delivery mechanism
4. For AlgoChat — use `corvid_send_message`
5. If you have no way to reach a channel, explain that you cannot

## User Mentions by Channel

When mentioning/pinging users, each channel has its own syntax:

| Channel | Mention syntax | Example |
|---------|---------------|---------|
| Discord | `<@DISCORD_ID>` | `<@181969874455756800>` |
| Telegram | `@username` | `@leif_algo` |
| AlgoChat | Algorand address | `ALGO...` |

**Critical:** On Discord, `@DisplayName` does NOT work — only `<@numeric_id>` actually pings/notifies the user. Get the Discord ID from the incoming message metadata or via `corvid_lookup_contact`.

## Message Formatting by Channel

| Channel | Format | Limits |
|---------|--------|--------|
| Discord | Markdown subset (no tables) | 2000 chars |
| Telegram | Markdown V2 | 4096 chars |
| AlgoChat | Plain text (ARC-69 metadata) | ~1000 chars |
| Web UI | Full Markdown | No hard limit |
