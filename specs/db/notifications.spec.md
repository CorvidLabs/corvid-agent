---
module: notifications-db
version: 1
status: draft
files:
  - server/db/notifications.ts
db_tables:
  - notification_channels
  - owner_notifications
  - notification_deliveries
  - owner_question_dispatches
depends_on: []
---

# Notifications DB

## Purpose

Pure data-access layer for the notification subsystem: channel configuration (where to send), notification records (what was sent), delivery tracking (did it arrive), and question dispatch tracking (outbound questions to owners via external channels). No business logic -- just SQL queries with row-to-domain mapping.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `listChannelsForAgent` | `(db: Database, agentId: string)` | `NotificationChannel[]` | List all notification channels for an agent, ordered by channel_type |
| `upsertChannel` | `(db: Database, agentId: string, channelType: string, config: Record<string, unknown>, enabled?: boolean)` | `NotificationChannel` | Insert or update a notification channel. Uses `ON CONFLICT(agent_id, channel_type)` for upsert |
| `updateChannelEnabled` | `(db: Database, id: string, enabled: boolean)` | `boolean` | Toggle a channel's enabled flag. Returns true if a row was updated |
| `deleteChannel` | `(db: Database, id: string)` | `boolean` | Delete a channel by ID. Returns true if a row was deleted |
| `getChannelByAgentAndType` | `(db: Database, agentId: string, channelType: string)` | `NotificationChannel \| null` | Look up a specific channel by agent and type |
| `createNotification` | `(db: Database, params: { agentId: string; sessionId?: string; title?: string; message: string; level: string })` | `OwnerNotification` | Insert a new notification record |
| `listNotifications` | `(db: Database, agentId?: string, limit?: number)` | `OwnerNotification[]` | List notifications, optionally filtered by agent. Default limit 50, ordered by created_at DESC |
| `createDelivery` | `(db: Database, notificationId: string, channelType: string)` | `NotificationDelivery` | Create a delivery tracking record for a notification-channel pair |
| `updateDeliveryStatus` | `(db: Database, deliveryId: number, status: 'pending' \| 'sent' \| 'failed', error?: string, externalRef?: string)` | `void` | Update delivery status, increment attempts, record error or external reference |
| `listFailedDeliveries` | `(db: Database, maxAttempts?: number, limit?: number)` | `FailedDeliveryRow[]` | List failed deliveries that have not exceeded max attempts (default 3). Joins notification and channel data |
| `createQuestionDispatch` | `(db: Database, questionId: string, channelType: string, externalRef: string \| null)` | `QuestionDispatchRow` | Create a question dispatch record for tracking outbound owner questions |
| `listActiveQuestionDispatches` | `(db: Database)` | `QuestionDispatchRow[]` | List all dispatches with status `sent`, ordered by created_at ASC |
| `updateQuestionDispatchStatus` | `(db: Database, id: number, status: 'sent' \| 'answered' \| 'expired')` | `void` | Update a dispatch's status |
| `markDispatchAnswered` | `(db: Database, id: number)` | `boolean` | Atomically mark a dispatch as answered only if status is `sent`. Returns true if the transition occurred (idempotency guard) |
| `getQuestionDispatchesByQuestionId` | `(db: Database, questionId: string)` | `QuestionDispatchRow[]` | Get all dispatches for a given question, ordered by id ASC |

### Exported Types

| Type | Description |
|------|-------------|
| `NotificationChannel` | `{ id, agentId, channelType, config, enabled, createdAt, updatedAt }` -- a configured delivery channel for an agent |
| `OwnerNotification` | `{ id, agentId, sessionId, title, message, level, createdAt }` -- a notification record sent to the agent owner |
| `NotificationDelivery` | `{ id, notificationId, channelType, status, attempts, lastAttemptAt, error, externalRef, createdAt }` -- tracks delivery of a notification through a channel |
| `FailedDeliveryRow` | Extends `NotificationDelivery` with `notification: OwnerNotification` and `channelConfig: Record<string, unknown>` -- enriched failed delivery for retry |
| `QuestionDispatchRow` | `{ id, questionId, channelType, externalRef, status, answeredAt, createdAt }` -- tracks a question dispatched to the owner via an external channel |

## Invariants

1. **Channel uniqueness**: Each (agent_id, channel_type) pair is unique, enforced by a unique index and `ON CONFLICT` upsert logic
2. **Delivery status values**: Delivery status must be one of: `pending`, `sent`, `failed`
3. **Dispatch status values**: Question dispatch status must be one of: `sent`, `answered`, `expired`
4. **Idempotent answer marking**: `markDispatchAnswered` only transitions from `sent` to `answered`; if already answered or expired, it returns false and makes no change
5. **Attempt counting**: Each call to `updateDeliveryStatus` increments the `attempts` counter by 1
6. **Failed delivery filtering**: `listFailedDeliveries` only returns deliveries where `status = 'failed'` AND `attempts < maxAttempts` AND the associated channel is enabled
7. **UUID generation**: Notification and channel IDs are generated via `crypto.randomUUID()`
8. **Config serialization**: Channel config is stored as JSON text and parsed on read
9. **Notification ordering**: `listNotifications` always returns results in reverse chronological order (`created_at DESC`)

## Behavioral Examples

### Scenario: Upsert a notification channel

- **Given** agent `agent-1` has no Discord channel configured
- **When** `upsertChannel(db, 'agent-1', 'discord', { webhookUrl: '...' })` is called
- **Then** a new row is inserted into `notification_channels` and the `NotificationChannel` is returned with `enabled: true`

### Scenario: Upsert updates existing channel

- **Given** agent `agent-1` already has a Discord channel with config `{ webhookUrl: 'old' }`
- **When** `upsertChannel(db, 'agent-1', 'discord', { webhookUrl: 'new' })` is called
- **Then** the existing row's config is updated to `{ webhookUrl: 'new' }` and `updated_at` is refreshed

### Scenario: Create notification with delivery tracking

- **Given** agent `agent-1` exists
- **When** `createNotification(db, { agentId: 'agent-1', message: 'Build failed', level: 'error' })` is called, then `createDelivery(db, notificationId, 'discord')` is called
- **Then** a notification record and a pending delivery record are created

### Scenario: Retry failed delivery

- **Given** a delivery with status `failed` and `attempts: 1`
- **When** `listFailedDeliveries(db, 3)` is called
- **Then** the delivery is included (1 < 3 max attempts), enriched with the notification body and channel config

### Scenario: Idempotent dispatch answering

- **Given** a question dispatch with status `answered`
- **When** `markDispatchAnswered(db, id)` is called
- **Then** returns `false` and makes no changes (already answered)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getChannelByAgentAndType` with no matching row | Returns `null` |
| `updateChannelEnabled` with nonexistent ID | Returns `false` |
| `deleteChannel` with nonexistent ID | Returns `false` |
| `listNotifications` with no notifications | Returns empty array |
| `listFailedDeliveries` when all deliveries succeeded or exceeded max attempts | Returns empty array |
| `markDispatchAnswered` on already-answered dispatch | Returns `false` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `shared/types` | `NotificationChannelType` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/notifications/service.ts` | Channel and notification CRUD, delivery tracking |
| `server/notifications/response-poller.ts` | Question dispatch functions |
| `server/notifications/question-dispatcher.ts` | Question dispatch CRUD |
| `server/mcp/tool-handlers/notifications.ts` | Notification listing and channel management |
| `server/routes/slack.ts` | Channel and dispatch lookups |

## Database Tables

### notification_channels

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| agent_id | TEXT | NOT NULL | Owning agent ID |
| channel_type | TEXT | NOT NULL | Channel type: websocket, discord, telegram, github, algochat, whatsapp, signal, slack |
| config | TEXT | NOT NULL DEFAULT '{}' | JSON-encoded channel configuration (e.g. webhook URL, chat ID) |
| enabled | INTEGER | NOT NULL DEFAULT 1 | Whether the channel is active (1) or disabled (0) |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | DEFAULT datetime('now') | Last modification timestamp |

**Indexes:**
- `idx_notification_channels_agent_type` UNIQUE ON (agent_id, channel_type)

### owner_notifications

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| agent_id | TEXT | NOT NULL | Agent that triggered the notification |
| session_id | TEXT | DEFAULT NULL | Optional associated session |
| title | TEXT | DEFAULT NULL | Optional notification title |
| message | TEXT | NOT NULL | Notification body |
| level | TEXT | NOT NULL DEFAULT 'info' | Severity: info, warn, error |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |

**Indexes:**
- `idx_owner_notifications_agent` ON (agent_id)
- `idx_owner_notifications_created` ON (created_at)

### notification_deliveries

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-incrementing ID |
| notification_id | TEXT | NOT NULL, FK owner_notifications(id) ON DELETE CASCADE | Parent notification |
| channel_type | TEXT | NOT NULL | Delivery channel type |
| status | TEXT | NOT NULL DEFAULT 'pending' | Delivery status: pending, sent, failed |
| attempts | INTEGER | NOT NULL DEFAULT 0 | Number of delivery attempts |
| last_attempt_at | TEXT | DEFAULT NULL | Timestamp of most recent attempt |
| error | TEXT | DEFAULT NULL | Error message from last failed attempt |
| external_ref | TEXT | DEFAULT NULL | External reference (e.g. message ID in Discord/Telegram) |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |

**Indexes:**
- `idx_notification_deliveries_notification` ON (notification_id)
- `idx_notification_deliveries_status` ON (status)

### owner_question_dispatches

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-incrementing ID |
| question_id | TEXT | NOT NULL | ID of the question being dispatched |
| channel_type | TEXT | NOT NULL | Channel through which the question was sent |
| external_ref | TEXT | nullable | External message reference for reply correlation |
| status | TEXT | NOT NULL DEFAULT 'sent' | Dispatch status: sent, answered, expired |
| answered_at | TEXT | DEFAULT NULL | Timestamp when the question was answered |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |

**Indexes:**
- `idx_question_dispatches_question` ON (question_id)
- `idx_question_dispatches_status` ON (status)

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
