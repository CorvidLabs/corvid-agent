---
module: channels
version: 1
status: draft
files:
  - server/channels/types.ts
  - server/channels/index.ts
db_tables: []
depends_on: []
---

# Channels

## Purpose

Multi-channel messaging abstraction layer. Defines the `ChannelAdapter` interface that all messaging integrations (AlgoChat, Slack, Discord, Telegram, WebSocket, WhatsApp, Signal) implement. Provides a unified `SessionMessage` format for inbound and outbound messages, allowing the rest of the system to be channel-agnostic.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `SessionMessage` | Unified message format: id, channelType, participant, content, direction, timestamp, optional metadata |
| `ChannelStatus` | Channel health info: channelType, enabled, connected, optional details |
| `ChannelAdapter` | Interface that all channel implementations must satisfy |

### Exported Classes

| Class | Description |
|-------|-------------|
| `ChannelAdapter` | Interface (not a class) defining the contract for all channel adapters |

#### ChannelAdapter Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `sendMessage` | `(participant: string, content: string)` | `Promise<void>` | Send an outbound message to a participant |
| `onMessage` | `(handler: (msg: SessionMessage) => void)` | `void` | Register a handler for inbound messages |
| `start` | `()` | `void` | Begin listening for messages and accepting connections |
| `stop` | `()` | `void` | Cease listening and clean up resources |
| `getStatus` | `()` | `Promise<ChannelStatus>` | Report current health and connectivity of the channel |

## Invariants

1. **Unified message format**: All channel adapters normalize inbound messages to `SessionMessage` before passing them to handlers. No channel-specific types leak beyond the adapter boundary.
2. **Direction is strictly binary**: `SessionMessage.direction` is either `'inbound'` (from external participant to agent) or `'outbound'` (from agent to external participant). No other values are valid.
3. **Message ID is channel-unique**: Each `SessionMessage.id` must be unique within its channel type. The adapter is responsible for generating or propagating unique IDs.
4. **Handler registration before start**: `onMessage()` handlers should be registered before calling `start()` to ensure no inbound messages are dropped during initialization.
5. **start() is idempotent**: Calling `start()` on an already-running adapter has no effect and does not create duplicate listeners.
6. **stop() is idempotent**: Calling `stop()` on an already-stopped adapter has no effect and does not throw.
7. **getStatus() is side-effect-free**: Calling `getStatus()` does not alter adapter state or connectivity — it is a pure observation.
8. **channelType is immutable**: The `channelType` property on both `ChannelAdapter` and `SessionMessage` is readonly and never changes after construction.
9. **Metadata is optional and unstructured**: The `metadata` field on `SessionMessage` is a passthrough for channel-specific data; consumers must not depend on its contents being present.
10. **Async safety on sendMessage**: `sendMessage()` returns a `Promise<void>` — adapters must handle their own retries and error propagation.
11. **Graceful null handling**: Adapters must handle null or missing fields in external payloads without throwing — degrade gracefully by omitting optional fields.

## Behavioral Examples

### Scenario: Inbound message normalization

- **Given** a Discord adapter receives a message from user `corvid#1234` with content "Hello"
- **When** the adapter processes the message
- **Then** the registered `onMessage` handler receives a `SessionMessage` with `channelType: 'discord'`, `participant: 'corvid#1234'`, `content: 'Hello'`, `direction: 'inbound'`

### Scenario: Outbound message delivery

- **Given** an AlgoChat adapter is connected and running
- **When** `sendMessage('ALGO_WALLET_ADDR', 'Task completed')` is called
- **Then** the message is encoded in the AlgoChat on-chain format and submitted
- **When** the Algorand transaction fails
- **Then** the promise rejects with an appropriate error

### Scenario: Channel status check

- **Given** a Telegram adapter with a valid bot token and connected chat
- **When** `getStatus()` is called
- **Then** returns `{ channelType: 'telegram', enabled: true, connected: true }`
- **Given** the bot token is invalid
- **When** `getStatus()` is called
- **Then** returns `{ channelType: 'telegram', enabled: true, connected: false, details: { error: '...' } }`

### Scenario: Adapter lifecycle

- **Given** a WebSocket adapter with registered message handlers
- **When** `start()` is called
- **Then** the adapter begins accepting connections and routing inbound messages to handlers
- **When** `stop()` is called
- **Then** all connections are closed and resources are released
- **When** `stop()` is called again
- **Then** no error occurs (idempotent)

### Scenario: Null field handling in Discord

- **Given** a Discord webhook notification with a null title field
- **When** the adapter processes the notification
- **Then** the notification is sent without a title — no error is thrown

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Invalid webhook URL (Discord) | `sendMessage` rejects with error; channel remains operational |
| Invalid bot token (Telegram) | `sendMessage` rejects; `getStatus` returns `connected: false` |
| Non-2xx response from external API | `sendMessage` rejects with channel-specific error |
| WebSocket connection dropped | Adapter handles reconnection internally; messages during disconnect are lost |
| Null content in external message | Adapter normalizes to empty string or omits message |
| Missing session/participant ID | Adapter logs warning and drops the message |
| Channel not started | `sendMessage` may reject or queue depending on implementation |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| (none) | Types-only module with no runtime dependencies |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/algochat/bridge.ts` | `ChannelAdapter`, `SessionMessage`, `ChannelStatus` interfaces |
| `server/algochat/message-router.ts` | `SessionMessage` type |
| `server/notifications/service.ts` | Individual channel send functions (Discord, Telegram, etc.) |
| `server/notifications/question-dispatcher.ts` | Channel-specific question delivery functions |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| (varies by adapter) | -- | Each adapter reads its own config (e.g. `DISCORD_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN`, `SLACK_BOT_TOKEN`) |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-26 | corvid-agent | Initial spec |
