# Slack Bridge — Context

## Why This Module Exists

Teams using Slack can interact with corvid-agent directly from their Slack workspace. The Slack bridge receives messages via webhook (Events API), routes them to agent sessions, and responds via the Slack Web API. This brings agent capabilities into an existing team communication workflow.

## Architectural Role

Slack is a **channel bridge** — it implements the `ChannelAdapter` interface and translates between Slack's Events API and corvid-agent's session model.

## Key Design Decisions

- **Webhook-based (Events API)**: Uses Slack's Events API rather than the older RTM API. This works behind firewalls and doesn't require a persistent WebSocket connection.
- **Request signature verification**: All incoming webhooks are verified using Slack's signing secret to prevent spoofing.
- **Thread-based conversations**: Slack threads map to agent sessions, keeping conversations organized.
- **Per-user rate limiting**: Prevents abuse by rate-limiting requests per Slack user.
- **Message chunking**: Long responses are split into multiple Slack messages to respect the 4000-character limit.

## Relationship to Other Modules

- **Channels**: Implements `ChannelAdapter`.
- **Process Manager**: Creates agent sessions for Slack interactions.
- **DB**: Uses sessions and session_messages tables.
