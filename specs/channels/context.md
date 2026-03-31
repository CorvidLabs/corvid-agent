# Channels — Context

## Why This Module Exists

corvid-agent communicates through many platforms — AlgoChat, Discord, Slack, Telegram, WebSocket, and more. The channels module defines a unified interface so the rest of the system doesn't need to know which platform a message came from. This is the abstraction layer that makes the system channel-agnostic.

## Architectural Role

Channels is an **interface layer** — it defines the contract (`ChannelAdapter`, `SessionMessage`) that all messaging integrations implement. It contains no business logic itself, just types and the adapter pattern.

## Key Design Decisions

- **Adapter pattern**: Each platform implements `ChannelAdapter`, normalizing platform-specific quirks (threads, reactions, file uploads) into a common format.
- **SessionMessage as lingua franca**: All inbound messages are converted to `SessionMessage` before reaching the agent. All outbound responses are `SessionMessage` objects that adapters render for their platform.
- **No platform dependencies**: The channels module itself has zero external dependencies. Platform-specific SDKs live in the bridge modules.

## Relationship to Other Modules

- **AlgoChat, Discord, Slack, Telegram, WebSocket**: Each implements the `ChannelAdapter` interface.
- **Process Manager**: Receives normalized `SessionMessage` objects regardless of source channel.
- **Notifications**: Uses channel adapters for multi-channel notification delivery.
