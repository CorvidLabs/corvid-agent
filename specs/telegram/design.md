---
spec: bridge.spec.md
sources:
  - server/telegram/bridge.ts
  - server/telegram/types.ts
---

## Layout

Two-file server module. No HTTP routes — the bridge uses outbound long-polling and is lifecycle-managed by `server/index.ts`.

```
server/telegram/
  bridge.ts   — TelegramBridge class (polling loop, message routing, voice, rate limiting)
  types.ts    — TelegramBridgeConfig, TelegramUpdate, TelegramMessage, TelegramUser, etc.
```

## Components

### `TelegramBridge` class
Instantiated with `db`, `processManager`, and `TelegramBridgeConfig`. In-memory state:
- `running: boolean`, `offset: number` — poll loop control
- `userSessions: Map<number, string>` — Telegram user ID → session ID
- `userMessageTimestamps: Map<number, number[]>` — sliding-window rate limit
- `dedup: DedupService` — event deduplication

**Long-poll loop** (`start` → `poll`):
1. Call `getUpdates` with 30-second timeout; 500 ms delay between batches
2. For each update, advance `offset` to `update_id + 1`
3. Dispatch to `handleMessage` for text/voice; slash commands handled inline

**Message handling pipeline:**
1. Authorization check against `allowedUserIds`
2. Rate limit check (10 msgs / 60 s per user)
3. Voice note: size cap → `getFile` download → `transcribe()` → echo transcription → route as text
4. Slash commands: `/start`, `/status`, `/new`
5. Route to agent session (reuse or create); subscribe debounced response handler

**Voice response path:**
- Check `agent.voiceEnabled` and `OPENAI_API_KEY`
- Call `synthesizeWithCache`; send as voice note + text for accessibility
- Fall back to text-only on synthesis failure

**Dynamic config** — reloads `getTelegramConfig()` from DB on each message to pick up live `PUT /api/settings/telegram` updates without restart.

### `types.ts`
Pure type declarations — all Telegram Bot API shapes (`TelegramUpdate`, `TelegramMessage`, `TelegramVoice`, `TelegramUser`, `TelegramChat`, `TelegramFile`, `TelegramCallbackQuery`) plus `TelegramBridgeConfig` and `TelegramBridgeMode`.

## Tokens

| Config / Env Var | Default | Notes |
|------------------|---------|-------|
| `TELEGRAM_BOT_TOKEN` | (required) | Env-only; not stored in DB |
| `TELEGRAM_CHAT_ID` | (required) | Default chat ID; env-only |
| `TELEGRAM_ALLOWED_USER_IDS` | `""` | Seeded to `telegram_config` on first start (INSERT OR IGNORE) |
| `TELEGRAM_BRIDGE_MODE` | `"chat"` | `"chat"` or `"work_intake"`; seeded on first start |
| `OPENAI_API_KEY` | (optional) | Required for voice STT/TTS |
| Rate limit | 10 msgs / 60 s | Per Telegram user ID |
| Response debounce | 1500 ms | Coalesces streamed agent output |
| Message chunk limit | 4096 chars | Telegram per-message limit |
| Voice file size cap | 10 MB | Reject before download |
| Poll timeout | 30 s | `getUpdates` long-poll |
| Inter-batch delay | 500 ms | After processing each update batch |

## Assets

### External Services
- **Telegram Bot API** — `getUpdates` (long-polling), `sendMessage`, `sendVoice`, `getFile`, file download
- **OpenAI Whisper** — `transcribe()` via `server/voice/stt.ts`
- **OpenAI TTS** — `synthesizeWithCache()` via `server/voice/tts.ts`

### Database Tables
- `sessions` — created per user; reused while active
- `session_messages` — written by ProcessManager
- `telegram_config` — dynamic config (allowed_user_ids, mode, default_agent_id)

### Key Dependencies
- `server/process/manager.ts` — `startProcess`, `sendMessage`, `subscribe`
- `server/db/agents.ts` — `getAgent`, `listAgents`
- `server/db/sessions.ts` — `createSession`, `getSession`
- `server/db/projects.ts` — `listProjects`
- `server/db/telegram-config.ts` — `getTelegramConfig`, `initTelegramConfigFromEnv`
