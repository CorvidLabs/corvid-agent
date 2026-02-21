---
module: telegram-bridge
version: 1
status: active
files:
  - server/telegram/bridge.ts
  - server/telegram/types.ts
db_tables: []
depends_on:
  - specs/voice/voice.spec.md
---

# Telegram Bridge

## Purpose

Bidirectional Telegram bridge that routes Telegram messages to agent sessions and sends responses back. Supports voice messages via STT (Whisper), voice responses via TTS, per-user sessions, user authorization, rate limiting, and message chunking for Telegram's 4096-character limit.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `TelegramBridge` | Long-polling Telegram bot that routes messages to agent sessions |

#### TelegramBridge Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database handle |
| `processManager` | `ProcessManager` | For starting sessions and subscribing to events |
| `config` | `TelegramBridgeConfig` | Bot token, chat ID, allowed user IDs |

#### TelegramBridge Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start` | `()` | `void` | Begin long-polling for Telegram updates |
| `stop` | `()` | `void` | Stop polling and clear timers |
| `sendText` | `(chatId: number, text: string, replyTo?: number)` | `Promise<void>` | Send a text message, chunking at 4096 chars |

### Exported Types

| Type | Description |
|------|-------------|
| `TelegramBridgeConfig` | `{ botToken: string; chatId: string; allowedUserIds: string[] }` |
| `TelegramUpdate` | Telegram update object with optional `message` and `callback_query` |
| `TelegramMessage` | Message with `from`, `chat`, `text`, `voice` fields |
| `TelegramUser` | `{ id: number; is_bot: boolean; first_name: string; username?: string }` |
| `TelegramChat` | `{ id: number; type: string }` |
| `TelegramVoice` | `{ file_id: string; file_unique_id: string; duration: number; mime_type?: string; file_size?: number }` |
| `TelegramCallbackQuery` | Callback query from inline keyboard |
| `TelegramFile` | `{ file_id: string; file_unique_id: string; file_size?: number; file_path?: string }` |

## Invariants

1. **Long-polling with 30s timeout**: `getUpdates` uses `timeout: 30` for Telegram long-polling. Next poll is scheduled 500ms after the previous completes
2. **User auth via allowedUserIds**: If `config.allowedUserIds` is non-empty, only users whose Telegram ID appears in the list may interact. Others receive "Unauthorized."
3. **Per-user rate limit 10/60s**: Each user is limited to 10 messages per 60-second window. Exceeding the limit returns a rate-limit message
4. **Voice STT via Whisper (10 MB limit)**: Voice messages are downloaded, transcribed via `transcribe()`, and the transcription is echoed back before routing to the agent. Files over 10 MB are rejected
5. **4096-character chunking**: Outbound messages are split into 4096-character chunks to respect Telegram's message size limit
6. **Per-user sessions**: Each Telegram user maps to one active agent session. Sessions are reused across messages and cleared with `/new`
7. **Response debounce 1500ms**: Agent responses are buffered and flushed after 1500ms of inactivity (or on session result), preventing message spam during streaming
8. **Voice responses when enabled**: If the agent has `voiceEnabled` and `OPENAI_API_KEY` is set, responses are sent as Telegram voice notes (via `synthesizeWithCache`) in addition to text
9. **Bot commands**: `/start` sends welcome, `/status` shows current session, `/new` clears session
10. **Session lifecycle**: If a session is stopped/errored, it is discarded and a new one is created on the next message. If `sendMessage` fails (process not running), the session is restarted

## Behavioral Examples

### Scenario: New user sends first message

- **Given** a Telegram user with no active session
- **When** the user sends "Hello"
- **Then** a new agent session is created, the message is sent as the initial prompt, and the bridge subscribes for responses

### Scenario: Voice message transcription

- **Given** a Telegram user sends a voice note (3 MB OGG)
- **When** the bridge processes the message
- **Then** the voice file is downloaded, transcribed via Whisper, the transcription is echoed back, and the text is routed to the agent session

### Scenario: Rate limit exceeded

- **Given** a Telegram user has sent 10 messages in the last 60 seconds
- **When** the user sends an 11th message
- **Then** the bridge replies "Rate limit exceeded. Please wait before sending more messages."

### Scenario: Unauthorized user

- **Given** `allowedUserIds` is `["123", "456"]`
- **When** user with Telegram ID 789 sends a message
- **Then** the bridge replies "Unauthorized."

### Scenario: Long response chunked

- **Given** an agent produces a 5000-character response
- **When** the response is flushed
- **Then** two messages are sent: one with 4096 characters and one with 904 characters

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unauthorized user | Replies "Unauthorized." |
| Rate limit exceeded | Replies "Rate limit exceeded. Please wait before sending more messages." |
| Voice file > 10 MB | Replies "Voice message too large (max 10 MB)." |
| STT transcription fails | Replies "Failed to transcribe voice message. Is OPENAI_API_KEY set?" |
| No agents configured | Replies "No agents configured. Create an agent first." |
| No projects configured | Replies "No projects configured." |
| Telegram API error | Throws `"Telegram API error ({method}): status {N}"` (logged, not sent to user) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `ProcessManager` (startProcess, sendMessage, subscribe) |
| `server/voice/stt.ts` | `transcribe` |
| `server/voice/tts.ts` | `synthesizeWithCache` |
| `server/db/agents.ts` | `getAgent`, `listAgents` |
| `server/db/sessions.ts` | `createSession`, `getSession` |
| `server/db/projects.ts` | `listProjects` |
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `TelegramBridge` (initialized when `TELEGRAM_BOT_TOKEN` is set) |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | (required) | Telegram Bot API token |
| `TELEGRAM_CHAT_ID` | (required) | Target chat ID |
| `TELEGRAM_ALLOWED_USERS` | `""` | Comma-separated Telegram user IDs allowed to interact |
| `OPENAI_API_KEY` | (optional) | Required for voice notes (STT/TTS) |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
