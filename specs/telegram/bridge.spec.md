---
module: telegram-bridge
version: 1
status: active
files:
  - server/telegram/bridge.ts
  - server/telegram/types.ts
db_tables:
  - sessions
  - session_messages
  - telegram_config
depends_on:
  - specs/process/process-manager.spec.md
  - specs/db/sessions/sessions.spec.md
  - specs/voice/voice.spec.md
---

# Telegram Bridge

## Purpose

Bidirectional Telegram bot bridge that routes Telegram messages to agent sessions and sends responses back. Supports text messages, voice notes (via OpenAI Whisper STT), voice responses (via OpenAI TTS), slash commands (`/start`, `/status`, `/new`, `/compact`), per-user rate limiting, and user authorization. Uses long-polling against the Telegram Bot API — no webhook server required.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `TelegramBridge` | Manages Telegram Bot API polling, message routing, and session lifecycle |

#### TelegramBridge Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database handle |
| `processManager` | `ProcessManager` | For starting sessions and subscribing to events |
| `config` | `TelegramBridgeConfig` | Bot token, chat ID, allowed user IDs |

#### TelegramBridge Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start` | `()` | `void` | Begin long-polling loop; idempotent (no-op if already running) |
| `stop` | `()` | `void` | Stop polling and clear the poll timer |
| `sendText` | `(chatId: number, text: string, replyTo?: number)` | `Promise<void>` | Send a text message; auto-chunks at 4096 characters |

### Exported Types (from types.ts)

| Type | Description |
|------|-------------|
| `TelegramBridgeMode` | Union type `'chat' \| 'work_intake'` — controls whether the bridge routes messages to chat sessions or work task intake |
| `TelegramBridgeConfig` | `{ botToken: string; chatId: string; allowedUserIds: string[]; mode?: TelegramBridgeMode }` |
| `TelegramUpdate` | Telegram update object with optional `message` and `callback_query` |
| `TelegramMessage` | Message with `from`, `chat`, optional `text`, optional `voice` |
| `TelegramUser` | `{ id: number; is_bot: boolean; first_name: string; username?: string }` |
| `TelegramChat` | `{ id: number; type: string }` |
| `TelegramVoice` | `{ file_id: string; file_unique_id: string; duration: number; mime_type?: string; file_size?: number }` |
| `TelegramCallbackQuery` | Callback query from inline keyboard |
| `TelegramFile` | `{ file_id: string; file_unique_id: string; file_size?: number; file_path?: string }` |

## Invariants

1. **Long-polling loop**: Uses `getUpdates` with a 30-second timeout. After processing all updates in a batch, the next poll starts after a 500ms delay. The loop stops when `running` is set to false
2. **Offset tracking**: After processing each update, the offset is set to `update_id + 1` to prevent reprocessing
3. **User authorization**: If `config.allowedUserIds` is non-empty, only those user IDs can interact. Unauthorized users receive `"Unauthorized."` reply
4. **Per-user rate limiting**: Each user is limited to 10 messages per 60-second sliding window. Rate-limited users receive an explicit message
5. **Voice note transcription**: Voice messages are downloaded via `getFile` + file download, then transcribed using `transcribe()` from `server/voice/stt.ts`. The transcription is echoed back to the user with a microphone emoji before being routed to the agent
6. **Voice file size cap**: Voice messages larger than 10 MB are rejected with an error message before download
7. **Session-per-user mapping**: Each Telegram user ID maps to at most one active session. The mapping is stored in-memory (`userSessions` Map)
8. **Session reuse**: If a user's existing session is still active (not stopped/error), new messages are sent to it. If the session is stopped/error, a new session is created
9. **Session restart on send failure**: If `processManager.sendMessage` returns false (process not running), the session is restarted with `startProcess`
10. **Response debouncing**: Session events are buffered for 1500ms before being sent to Telegram, to coalesce streamed output into a single message
11. **Voice responses**: If the agent has `voiceEnabled` and `OPENAI_API_KEY` is set, responses are sent as voice notes via `synthesizeWithCache`, with text sent alongside for accessibility. Falls back to text-only on voice synthesis failure
12. **Message chunking**: Telegram has a 4096-character limit per message. Long responses are split into chunks at that boundary
13. **Agent selection**: When creating a new session, the bridge uses the first agent from `listAgents`. If the agent has a `defaultProjectId`, that project is used; otherwise the first project from `listProjects`
14. **Slash commands**: `/start` sends a welcome message, `/status` reports the current session ID, `/new` clears the user's session mapping, `/compact` compacts the current session's context
15. **Idempotent start**: Calling `start()` when already running is a no-op
16. **Session error handling**: `subscribeForResponse` handles `session_error` events by mapping `errorType` (context_exhausted, context_compacted, credits_exhausted, timeout, crash, spawn_error) to user-facing text messages via `sessionErrorToText()`, sent to the Telegram chat
17. **Session exit handling**: `subscribeForResponse` handles `session_exited` events by flushing any buffered text and cleaning up
18. **Subscription cleanup**: The subscription callback is unsubscribed from the ProcessManager after `result`, `session_error`, or `session_exited` events to prevent listener accumulation

## Behavioral Examples

### Scenario: First message from authorized user

- **Given** a running Telegram bridge with an agent and project configured
- **When** user 12345 (in `allowedUserIds`) sends "Hello"
- **Then** a new session is created with source `telegram`, the process is started with the message, and a subscription is registered to forward responses back to the Telegram chat

### Scenario: Voice note transcription

- **Given** a running Telegram bridge
- **When** user sends a voice note (OGG, 2 MB)
- **Then** the file is downloaded via `getFile` API, transcribed via Whisper, the transcription is echoed back as `🎤 _text_`, and the transcribed text is routed to the agent

### Scenario: Voice note too large

- **Given** a running Telegram bridge
- **When** user sends a voice note with `file_size` > 10 MB
- **Then** the bridge replies `"Voice message too large (max 10 MB)."` and does not attempt download

### Scenario: Rate limit exceeded

- **Given** user 12345 has sent 10 messages in the last 60 seconds
- **When** the 11th message arrives
- **Then** the bridge replies with a rate limit message and does not route to the agent

### Scenario: Session expired, new one created

- **Given** user 12345 has an existing session that is in `stopped` status
- **When** user sends a new message
- **Then** the old session mapping is cleared and a new session is created

### Scenario: Unauthorized user

- **Given** `allowedUserIds` is `["123", "456"]`
- **When** user with Telegram ID 789 sends a message
- **Then** the bridge replies "Unauthorized."

### Scenario: /compact command with active session

- **Given** user 12345 has an active session
- **When** user sends `/compact`
- **Then** `processManager.compactSession()` is called on their session and the user receives a confirmation message

### Scenario: /compact command with no session

- **Given** user 12345 has no active session
- **When** user sends `/compact`
- **Then** the user receives `"No active session. Send a message to start one."`

### Scenario: Session error reported to user

- **Given** user 12345 has an active session and is subscribed for responses
- **When** a `session_error` event fires with `errorType: 'context_exhausted'`
- **Then** the user receives a plain-text message explaining the error, and the subscription is cleaned up

### Scenario: Session exited cleans up subscription

- **Given** user 12345 has an active session and is subscribed for responses
- **When** a `session_exited` event fires
- **Then** any buffered text is flushed, and the subscription is cleaned up

### Scenario: Long response chunked

- **Given** an agent produces a 5000-character response
- **When** the response is flushed
- **Then** two messages are sent: one with 4096 characters and one with 904 characters

### Scenario: /compact with active session

- **Given** user 12345 has an active session
- **When** user sends `/compact`
- **Then** `processManager.compactSession(sessionId)` is called, the session mapping is cleared, and the bridge replies `"Context compacted — session condensed. Send a message to continue with fresh context."`

### Scenario: /compact with no session

- **Given** user 12345 has no active session
- **When** user sends `/compact`
- **Then** the bridge replies `"No active session. Start a conversation first."` and does not call `compactSession`

### Scenario: Session crash mid-conversation

- **Given** user 12345 is in an active conversation
- **When** the session emits a `session_error` event with `errorType: "crash"`
- **Then** the bridge sends `"Session crashed — send a message to restart."` to the Telegram chat and unsubscribes the callback

### Scenario: Context exhausted

- **Given** user 12345 is in an active conversation
- **When** the session emits a `session_error` event with `errorType: "context_exhausted"`
- **Then** the bridge sends `"Context limit reached — send a message to start a new session."` to the Telegram chat and unsubscribes the callback

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unauthorized user | Replies `"Unauthorized."` |
| Rate limit exceeded | Replies with rate limit message |
| Voice file too large (>10 MB) | Replies `"Voice message too large (max 10 MB)."` |
| STT transcription fails | Replies `"Failed to transcribe voice message. Is OPENAI_API_KEY set?"` |
| No agents configured | Replies `"No agents configured. Create an agent first."` |
| No projects configured | Replies `"No projects configured."` |
| Session expired and send fails | Replies `"Session expired. Send another message to start a new one."` |
| Telegram API call fails | Logs error, throws with `"Telegram API error ({method}): status {code}"` |
| Poll error | Logs error, continues polling on next cycle |
| Voice synthesis fails | Falls back to text message |
| Session error (context_exhausted) | Sends `"Context limit reached..."` to user, unsubscribes |
| Session error (context_compacted) | Sends `"Context compacted..."` to user, unsubscribes |
| Session error (credits_exhausted) | Sends `"Credits exhausted..."` to user, unsubscribes |
| Session error (timeout) | Sends `"Session timed out..."` to user, unsubscribes |
| Session error (crash) | Sends `"The agent session crashed..."` to user, unsubscribes |
| Session error (spawn_error) | Sends `"Failed to start agent session..."` to user, unsubscribes |
| `/compact` with no session | Replies `"No active session. Send a message to start one."` |
| `/compact` on ended session | Replies `"Could not compact session — it may have already ended."` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `ProcessManager` — startProcess, sendMessage, subscribe, unsubscribe, compactSession |
| `server/db/agents.ts` | `getAgent`, `listAgents` |
| `server/db/sessions.ts` | `createSession`, `getSession` |
| `server/db/projects.ts` | `listProjects` |
| `server/db/telegram-config.ts` | `getTelegramConfig`, `initTelegramConfigFromEnv` — hot-reload dynamic settings |
| `server/voice/stt.ts` | `transcribe` for voice note transcription |
| `server/voice/tts.ts` | `synthesizeWithCache` for voice responses |
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | Lifecycle: construction, `start()`, `stop()` |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | (required) | Telegram Bot API token (env-only, not stored in DB) |
| `TELEGRAM_CHAT_ID` | (required) | Default chat ID for the bridge (env-only, not stored in DB) |
| `TELEGRAM_ALLOWED_USER_IDS` | `""` | Comma-separated list of allowed Telegram user IDs; seeded into `telegram_config` on startup (INSERT OR IGNORE) |
| `TELEGRAM_BRIDGE_MODE` | `"chat"` | Bridge mode; seeded into `telegram_config` on startup (INSERT OR IGNORE) |
| `OPENAI_API_KEY` | (optional) | Required for STT transcription and TTS voice responses |

### Dynamic Configuration (DB-backed)

Dynamic settings are stored in the `telegram_config` table and can be updated at runtime via `PUT /api/settings/telegram` without restarting the server. Environment variables seed the DB on first startup (INSERT OR IGNORE) and are overridden by any subsequent DB writes.

| DB Key | Type | Description |
|--------|------|-------------|
| `allowed_user_ids` | comma-separated string | Telegram user IDs allowed to interact |
| `mode` | `'chat' \| 'work_intake'` | Bridge operating mode |
| `default_agent_id` | string | Default agent ID for new sessions |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
| 2026-03-08 | corvid-agent | Documented `TelegramBridgeMode` type, updated `TelegramBridgeConfig` to include optional `mode` field |
| 2026-04-30 | corvid-agent | Added `/compact` command, session error/exit handling, subscription cleanup (invariants 16-18) |
