---
spec: bridge.spec.md
---

## User Stories

- As an agent operator, I want to chat with agents via Telegram so that I can manage agent sessions from my mobile device
- As an agent operator, I want to send voice notes that are transcribed and forwarded to the agent so that I can interact hands-free
- As an agent operator, I want agents to respond with voice notes (when enabled) so that I can listen to responses without reading
- As a platform administrator, I want to restrict which Telegram users can access the bot so that unauthorized users cannot interact with agents
- As an agent operator, I want session continuity so that follow-up messages go to my existing agent session without starting a new one
- As an agent operator, I want `/start`, `/status`, and `/new` slash commands so that I can check session state and reset sessions from Telegram

## Acceptance Criteria

- `TelegramBridge` uses long-polling (`getUpdates` with 30-second timeout) against the Telegram Bot API; no webhook server required
- Offset tracking ensures each update is processed exactly once (`update_id + 1` after each batch)
- If `config.allowedUserIds` is non-empty, only listed user IDs can interact; unauthorized users receive `"Unauthorized."` reply
- Per-user rate limiting enforces 10 messages per 60-second sliding window; rate-limited users receive an explicit message
- Voice notes are downloaded via `getFile` API, transcribed via `transcribe()` from `server/voice/stt.ts`, and the transcription is echoed back with a microphone emoji before routing to the agent
- Voice files larger than 10 MB are rejected with `"Voice message too large (max 10 MB)."` before download
- If the agent has `voiceEnabled` and `OPENAI_API_KEY` is set, responses are sent as voice notes via `synthesizeWithCache` with text alongside for accessibility; voice synthesis failure falls back to text-only
- Session-per-user mapping: each Telegram user ID maps to at most one active session (in-memory `userSessions` Map)
- Stopped/errored sessions are replaced with new sessions on the next message; if `processManager.sendMessage` returns false, the session is restarted
- Response debouncing buffers session events for 1500ms before sending to Telegram
- Long responses are chunked at 4096 characters (Telegram's per-message limit)
- `/start` sends a welcome message, `/status` reports the current session ID, `/new` clears the user's session mapping
- `start()` is idempotent; calling it when already running is a no-op
- The bridge supports `TelegramBridgeMode` (`'chat' | 'work_intake'`) to control message routing

## Constraints

- Requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` environment variables
- `OPENAI_API_KEY` is required for STT transcription and TTS voice responses (optional feature)
- Long-polling cycle has a 500ms delay between batches to avoid hammering the Telegram API
- Agent selection uses the first agent from `listAgents` with its `defaultProjectId`, falling back to the first project from `listProjects`

## Out of Scope

- Telegram inline mode or inline query handling
- Telegram group chat support (multi-user in one chat)
- Webhook-based Telegram Bot API integration (only long-polling is used)
- Photo, document, or sticker message handling (only text and voice notes are supported)
- Telegram payments or bot commerce features
