---
spec: channels.spec.md
sources:
  - server/channels/types.ts
  - server/channels/index.ts
---

## Layout

The channels module is a types-only abstraction layer with two small files:

```
server/channels/
  types.ts    — SessionMessage, ChannelStatus, ChannelAdapter interface
  index.ts    — Re-exports from types.ts
```

This module has zero runtime dependencies. It exists purely to define the contract that all messaging integrations must implement.

## Components

### ChannelAdapter Interface (types.ts)
The central contract:
```typescript
interface ChannelAdapter {
  readonly channelType: string;
  sendMessage(participant: string, content: string): Promise<void>;
  onMessage(handler: (msg: SessionMessage) => void): void;
  start(): void;
  stop(): void;
  getStatus(): Promise<ChannelStatus>;
}
```

Implementations across the codebase:
- `AlgoChatBridge` (algochat) — on-chain Algorand messaging
- `DiscordBridge` (discord) — Discord bot messaging
- `TelegramBridge` (telegram) — Telegram bot messaging
- `SlackBridge` (slack) — Slack app messaging
- WebSocket handler (ws) — local web UI
- (Future: WhatsApp, Signal)

### SessionMessage (types.ts)
Unified inbound/outbound message format. All channel-specific message shapes are normalized to this before being passed to handlers:
```typescript
interface SessionMessage {
  id: string;           // channel-unique message ID
  channelType: string;  // e.g., 'discord', 'algochat', 'telegram'
  participant: string;  // sender/recipient identifier
  content: string;      // message body
  direction: 'inbound' | 'outbound';
  timestamp: number;    // Unix epoch ms
  metadata?: Record<string, unknown>;  // channel-specific passthrough data
}
```

### ChannelStatus (types.ts)
Health report from a channel adapter:
```typescript
interface ChannelStatus {
  channelType: string;
  enabled: boolean;
  connected: boolean;
  details?: Record<string, unknown>;
}
```

## Tokens

This module has no configuration constants — all channel-specific configuration (bot tokens, webhook URLs, API keys) is managed by the individual adapter implementations.

| Channel | Primary Env Var |
|---------|----------------|
| Discord | `DISCORD_BOT_TOKEN` |
| Telegram | `TELEGRAM_BOT_TOKEN` |
| Slack | `SLACK_BOT_TOKEN` |
| AlgoChat | `ALGORAND_MNEMONIC` |

## Assets

### Adapter Implementations
All live outside this module. The `ChannelAdapter` interface is imported wherever multi-channel routing logic is needed:
- `server/algochat/bridge.ts` — implements `ChannelAdapter`
- `server/notifications/service.ts` — uses channel send functions for notification delivery
- `server/notifications/question-dispatcher.ts` — uses channel-specific question delivery
