---
name: owner-comms
description: Use this skill when the agent needs to notify the server owner, ask the owner a question, or configure notification channels (Discord, Telegram, GitHub, etc). Triggers include "notify owner", "ask owner", "alert the admin", "configure notifications", "set up Discord notifications", or any need to communicate with the agent's operator.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Owner Comms — Owner Notifications & Questions

Communicate with the agent's owner/operator and configure notification delivery channels.

## MCP Tools

- `corvid_notify_owner` — Send a notification to the server owner (non-blocking)
  - Parameters: `message` (notification text), `level` (optional: "info", "warning", "error")
- `corvid_ask_owner` — Ask the owner a question and wait for their response (blocking)
  - Parameters: `question` (question text), `timeout` (optional, seconds to wait)
- `corvid_configure_notifications` — Manage notification channels
  - Parameters: `action` ("list", "add", "remove", "update"), `channel` (optional: "discord", "telegram", "github", "algochat", "slack", "websocket"), `config` (optional, channel-specific settings)

## Workflow

1. Use `corvid_notify_owner` for informational updates that don't need a response
2. Use `corvid_ask_owner` when you need a decision or approval — this blocks until answered
3. Use `corvid_configure_notifications` to set up where notifications are delivered

## Examples

### Notify about completed work

```
Use corvid_notify_owner:
  message: "PR #45 has been merged and deployed successfully"
  level: "info"
```

### Ask for approval

```
Use corvid_ask_owner:
  question: "The test suite has 3 failures after the migration. Should I fix them or revert?"
```

### Add Discord notifications

```
Use corvid_configure_notifications:
  action: "add"
  channel: "discord"
  config: { "webhook_url": "https://discord.com/api/webhooks/..." }
```

## Notes

- `corvid_ask_owner` blocks execution until a response is received — use sparingly
- Notifications support multiple simultaneous channels
- Use appropriate severity levels: info for updates, warning for issues, error for failures
