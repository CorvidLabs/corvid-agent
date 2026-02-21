---
module: telegram-bridge
version: 1
status: draft
files:
  - server/telegram/bridge.ts
  - server/telegram/types.ts
db_tables:
  - sessions
  - session_messages
depends_on:
  - specs/process/process-manager.spec.md
  - specs/db/sessions.spec.md
---

# Telegram Bridge

## Purpose

Bidirectional Telegram bot bridge that routes Telegram messages to agent sessions and sends responses back. Supports text messages, voice notes (via OpenAI Whisper STT), voice responses (via OpenAI TTS), slash commands (`/start`, `/status`, `/new`), per-user rate limiting, and user authorization. Uses long-polling against the Telegram Bot API — no webhook server required.

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
| `TelegramBridgeConfig` | `{ botToken, chatId, allowedUserIds: string[] }` |
| `TelegramUpdate` | Telegram update object with optional `message` and `callback_query` |
| `TelegramMessage` | Message with `from`, `chat`, optional `text`, optional `voice` |
| `TelegramUser` | `{ id, is_bot, first_name, username? }` |
| `TelegramChat` | `{ id, type }` |
| `TelegramVoice` | `{ file_id, file_unique_id, duration, mime_type?, file_size? }` |
| `TelegramCallbackQuery` | `{ id, from, message?, data? }` |
| `TelegramFile` | `{ file_id, file_unique_id, file_size?, file_path? }` |

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
14. **Slash commands**: `/start` sends a welcome message, `/status` reports the current session ID, `/new` clears the user's session mapping
15. **Idempotent start**: Calling `start()` when already running is a no-op

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

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `ProcessManager` — startProcess, sendMessage, subscribe |
| `server/db/agents.ts` | `getAgent`, `listAgents` |
| `server/db/sessions.ts` | `createSession`, `getSession` |
| `server/db/projects.ts` | `listProjects` |
| `server/voice/stt.ts` | `transcribe` for voice note transcription |
| `server/voice/tts.ts` | `synthesizeWithCache` for voice responses |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | Lifecycle: construction, `start()`, `stop()` |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | (required) | Telegram Bot API token |
| `TELEGRAM_CHAT_ID` | (required) | Default chat ID for the bridge |
| `TELEGRAM_ALLOWED_USERS` | `""` | Comma-separated list of allowed Telegram user IDs; empty = allow all |
| `OPENAI_API_KEY` | (none) | Required for STT transcription and TTS voice responses |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
