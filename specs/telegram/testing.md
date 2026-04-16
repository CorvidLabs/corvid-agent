---
spec: bridge.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/telegram-bridge.test.ts` | Integration (bun:test, in-memory SQLite) | Constructor, `start`/`stop` idempotency, rate limiting, user authorization, session creation/reuse/restart, response debouncing, message chunking at 4096 chars, `/start`/`/status`/`new` slash commands, voice size cap rejection, text routing to agent, session expired recovery, work_intake mode routing |
| `server/__tests__/telegram-config.test.ts` | Unit (bun:test) | `getTelegramConfig` DB reads, `initTelegramConfigFromEnv` INSERT OR IGNORE seeding, allowed_user_ids / mode / default_agent_id fields |

Fixtures: `TelegramBridgeInternals` interface casts the bridge to expose private methods (`poll`, `handleMessage`, `checkRateLimit`, `routeToAgent`) for direct unit testing without HTTP overhead.

## Manual Testing

- [ ] Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env`, start server — verify bridge starts and poll loop begins
- [ ] Send a text message from an authorized Telegram user — verify agent session is created and response arrives
- [ ] Send a voice note under 10 MB — verify transcription echo (`🎤 _text_`) and agent routing
- [ ] Send a voice note over 10 MB — verify error reply `"Voice message too large (max 10 MB)."`
- [ ] Send 11 messages rapidly — verify 11th gets rate-limit reply
- [ ] Send from an unauthorized user ID — verify `"Unauthorized."` reply
- [ ] Use `/new` command — verify session mapping is cleared and next message creates a new session
- [ ] Use `/status` command — verify current session ID is reported
- [ ] Update `PUT /api/settings/telegram` allowed_user_ids at runtime — verify next message uses new config without restart
- [ ] Enable `voiceEnabled` on the agent and set `OPENAI_API_KEY` — verify agent responses arrive as voice notes
- [ ] Cause voice synthesis to fail — verify fallback to text response

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `start()` called when already running | No-op; single poll loop continues |
| `stop()` during active poll | `running = false`; loop exits after current `getUpdates` returns |
| Offset tracking | Each update increments offset by 1; no update reprocessed |
| Unauthorized user | Replies `"Unauthorized."` |
| 11th message in 60-second window | Rate-limit reply; agent not invoked |
| Voice note `file_size` > 10 MB | Rejected before any API call; error message sent |
| STT transcription fails (no API key) | Replies `"Failed to transcribe voice message. Is OPENAI_API_KEY set?"` |
| Session in `stopped` status | Old mapping cleared; new session created |
| `processManager.sendMessage` returns false | `startProcess` called to restart session |
| No agents in DB | Replies `"No agents configured. Create an agent first."` |
| No projects in DB | Replies `"No projects configured."` |
| Telegram API call returns non-200 | Throws `"Telegram API error ({method}): status {code}"` |
| Poll HTTP error | Error logged; loop continues after 500 ms delay |
| Voice synthesis fails | Falls back to text-only `sendText` |
| Response > 4096 chars | Split into chunks at 4096-char boundary |
| `mode: 'work_intake'` | Message routed to work task intake instead of agent session |
| Dynamic config reload | Each message reads fresh `getTelegramConfig()` from DB |
