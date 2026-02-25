---
module: notification-service
version: 1
status: active
files:
  - server/notifications/service.ts
  - server/notifications/types.ts
  - server/notifications/channels/websocket.ts
  - server/notifications/channels/discord.ts
  - server/notifications/channels/telegram.ts
  - server/notifications/channels/github.ts
  - server/notifications/channels/algochat.ts
  - server/notifications/channels/whatsapp.ts
  - server/notifications/channels/signal.ts
  - server/notifications/channels/slack.ts
db_tables:
  - owner_notifications
  - notification_deliveries
  - notification_channels
depends_on:
  - specs/db/schema.spec.md
---

# Notification Service

## Purpose

Multi-channel notification service that persists notifications to the database and dispatches them to configured channels. Supports 8 channel types, per-agent channel configuration, delivery tracking, and automatic retry of failed deliveries. Ensures notifications are never lost — they are always persisted before dispatch is attempted.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `NotificationService` | Manages notification persistence, multi-channel dispatch, and retry of failed deliveries |

#### NotificationService Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database handle |

#### NotificationService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start` | `()` | `void` | Start the retry timer (60s interval); idempotent |
| `stop` | `()` | `void` | Stop the retry timer |
| `setAgentMessenger` | `(messenger: AgentMessenger)` | `void` | Set the messenger for AlgoChat channel dispatch |
| `setBroadcast` | `(fn: (message: unknown) => void)` | `void` | Set the WebSocket broadcast function |
| `notify` | `(params: { agentId, sessionId?, title?, message, level })` | `Promise<{ notificationId, channels }>` | Create and dispatch a notification |

### Exported Types (from types.ts)

| Type | Description |
|------|-------------|
| `NotificationPayload` | `{ notificationId, agentId, sessionId, title, message, level, timestamp }` |
| `ChannelSendResult` | `{ success: boolean; error?: string; externalRef?: string }` |

## Invariants

1. **Persist-first guarantee**: Notifications are always persisted to `owner_notifications` before any dispatch attempt. Even if all channel sends fail, the notification record exists
2. **WebSocket always dispatched**: If a broadcast function is set, every notification is sent via WebSocket regardless of channel configuration
3. **Per-agent channel configuration**: Each agent has independently configured channels via `notification_channels`. Only enabled channels are dispatched to
4. **Delivery tracking**: Each channel dispatch creates a `notification_deliveries` record that tracks status (`pending` → `sent` or `failed`), attempts, errors, and external references
5. **Async dispatch**: Channel dispatches are fire-and-forget (`.then()/.catch()`) to avoid blocking the notification creation response
6. **Retry mechanism**: Failed deliveries are retried every 60 seconds, up to 3 attempts maximum. The retry query joins `notification_deliveries`, `owner_notifications`, and `notification_channels` to reconstruct the full dispatch context
7. **Idempotent start**: Calling `start()` when the retry timer is already running is a no-op
8. **Channel-specific configuration**: Each channel type reads config from its `notification_channels.config` JSON, with fallback to environment variables

## Behavioral Examples

### Scenario: Notification dispatched to multiple channels

- **Given** agent "A1" has Discord and Telegram channels configured and enabled
- **When** `notify({ agentId: "A1", message: "Build passed", level: "info" })` is called
- **Then** the notification is persisted, sent via WebSocket, and dispatched to both Discord and Telegram

### Scenario: Channel dispatch failure

- **Given** agent "A1" has a Telegram channel configured but the bot token is invalid
- **When** a notification is dispatched to Telegram
- **Then** the delivery record is updated to `failed` with the error message, and the retry timer will attempt redelivery

### Scenario: Retry of failed delivery

- **Given** a Telegram delivery failed with 1 attempt
- **When** the retry timer fires (60 seconds)
- **Then** the service queries for failed deliveries with `attempts < 3`, reconstructs the payload, and retries the dispatch

### Scenario: Max retries exhausted

- **Given** a delivery has failed 3 times
- **When** the retry timer fires
- **Then** the delivery is not retried (filtered out by `attempts < 3` query)

### Scenario: No channels configured

- **Given** agent "A1" has no notification channels configured
- **When** a notification is created
- **Then** the notification is persisted and sent via WebSocket only

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Discord webhook URL missing | Delivery fails with `"No Discord webhook URL configured"` |
| Telegram bot token or chat ID missing | Delivery fails with `"Telegram botToken and chatId required"` |
| GitHub repo not configured | Delivery fails with `"No GitHub repo configured"` |
| AlgoChat address missing | Delivery fails with `"No AlgoChat toAddress configured"` |
| AlgoChat messenger not available | Delivery fails with `"AgentMessenger not available"` |
| WhatsApp credentials missing | Delivery fails with `"WhatsApp phoneNumberId and accessToken required"` |
| WhatsApp recipient missing | Delivery fails with `"WhatsApp recipientPhone required"` |
| Signal credentials missing | Delivery fails with `"Signal senderNumber and recipientNumber required"` |
| Slack credentials missing | Delivery fails with `"Slack botToken and channel required"` |
| Unknown channel type | Delivery fails with `"Unknown channel type: {type}"` |
| Channel dispatch throws | Error caught, delivery updated to `failed`, logged as warning |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/notifications.ts` | `createNotification`, `createDelivery`, `updateDeliveryStatus`, `listChannelsForAgent`, `listFailedDeliveries` |
| `server/notifications/channels/*.ts` | `sendWebSocket`, `sendDiscord`, `sendTelegram`, `sendGitHub`, `sendAlgoChat`, `sendWhatsApp`, `sendSignal`, `sendSlack` |
| `server/algochat/agent-messenger.ts` | `AgentMessenger` for AlgoChat channel |
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | Lifecycle: construction, `start()`, `stop()`, `setAgentMessenger()`, `setBroadcast()` |
| `server/routes/notifications.ts` | `notify()` via API endpoints |
| `server/mcp/tool-handlers/notifications.ts` | `notify()` via MCP tools |

## Database Tables

### owner_notifications

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| agent_id | TEXT | NOT NULL, FK → agents | The agent that triggered the notification |
| session_id | TEXT | | Optional session context |
| title | TEXT | | Optional notification title |
| message | TEXT | NOT NULL | Notification message body |
| level | TEXT | NOT NULL | Severity: info, warn, error, success |
| created_at | TEXT | DEFAULT datetime('now') | When the notification was created |

### notification_deliveries

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Delivery ID |
| notification_id | TEXT | NOT NULL, FK → owner_notifications | Parent notification |
| channel_type | TEXT | NOT NULL | Channel type (discord, telegram, etc.) |
| status | TEXT | DEFAULT 'pending' | pending, sent, or failed |
| attempts | INTEGER | DEFAULT 0 | Number of delivery attempts |
| last_attempt_at | TEXT | | Timestamp of last attempt |
| error | TEXT | | Error message if failed |
| external_ref | TEXT | | External reference (message ID, etc.) |
| created_at | TEXT | DEFAULT datetime('now') | When the delivery was created |

### notification_channels

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| agent_id | TEXT | NOT NULL, FK → agents | The agent this channel belongs to |
| channel_type | TEXT | NOT NULL | Channel type |
| config | TEXT | NOT NULL | JSON configuration for the channel |
| enabled | INTEGER | DEFAULT 1 | Whether the channel is active |
| created_at | TEXT | DEFAULT datetime('now') | When created |
| updated_at | TEXT | DEFAULT datetime('now') | Last modified |
| | | UNIQUE(agent_id, channel_type) | One channel per type per agent |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `DISCORD_WEBHOOK_URL` | (optional) | Fallback Discord webhook URL if not in channel config |
| `TELEGRAM_BOT_TOKEN` | (optional) | Fallback Telegram bot token |
| `TELEGRAM_CHAT_ID` | (optional) | Fallback Telegram chat ID |
| `NOTIFICATION_GITHUB_REPO` | (optional) | Fallback GitHub repo for issue notifications |
| `WHATSAPP_ACCESS_TOKEN` | (optional) | Fallback WhatsApp access token |
| `SIGNAL_API_URL` | `http://localhost:8080` | Signal API URL |
| `SIGNAL_SENDER_NUMBER` | (optional) | Fallback Signal sender number |
| `SLACK_BOT_TOKEN` | (optional) | Fallback Slack bot token |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-21 | corvid-agent | Initial spec |
