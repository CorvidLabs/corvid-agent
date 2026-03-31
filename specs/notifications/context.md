# Notifications — Context

## Why This Module Exists

Agents need to reach operators across multiple channels — WebSocket for the dashboard, Discord for team chat, Telegram for mobile, AlgoChat for on-chain, GitHub for PR-related items, and more. The notification service provides a unified dispatch layer that routes notifications to the right channel(s) based on operator preferences.

## Architectural Role

Notifications is a **multi-channel dispatch service** — it takes a notification intent and delivers it through one or more channels. It also handles the question/response pattern (agent asks operator, operator responds).

## Key Design Decisions

- **Channel-agnostic dispatch**: Notifications are created without specifying a channel; the service routes based on configuration and availability.
- **Question dispatcher**: Supports structured questions (yes/no, multiple choice) that can be answered via any channel.
- **Response poller**: For channels that don't support real-time responses, a poller checks for answers.
- **Per-channel implementations**: Each channel (WebSocket, Discord, Telegram, GitHub, AlgoChat, WhatsApp, Signal, Slack) has its own delivery adapter.

## Relationship to Other Modules

- **Channels**: Uses channel adapters for delivery.
- **Health**: Receives health degradation alerts.
- **Process Manager**: Agent sessions can trigger notifications.
- **Approval Manager**: Owner approval questions route through notifications.
