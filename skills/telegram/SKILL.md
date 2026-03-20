---
name: telegram
description: Telegram messaging — bot bridge, voice notes, message handling, STT/TTS integration. Trigger keywords: telegram, telegram bot, telegram message, telegram voice.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Telegram — Bot Bridge

How the Telegram bridge works and how to handle Telegram messages.

## Architecture

- **Bridge:** `server/telegram/bridge.ts`
- **Method:** Long-polling (no webhooks needed)
- **Config:** `TELEGRAM_BOT_TOKEN` env var
- **Features:** Text messages, voice notes (STT), voice responses (TTS)

## Message Flow

1. Bridge polls Telegram for new updates via `getUpdates`
2. Incoming text messages are routed to a session (find-or-create per user)
3. Voice messages are automatically transcribed via Whisper STT
4. Session responses are sent back to the Telegram chat
5. Voice responses can optionally be synthesized via TTS

## Responding to Telegram Messages

Same rules as Discord — reply directly as text. Your response is automatically routed back through the Telegram bridge.

Messages from Telegram are tagged:

```
[This message came from Telegram. Reply directly...]
```

## Voice Notes

The Telegram bridge handles voice notes automatically:

1. User sends a voice message in Telegram
2. Bridge downloads the audio file
3. Audio is transcribed via `server/voice/stt.ts` (Whisper)
4. Transcribed text is processed as a normal message
5. Response can optionally include a TTS audio reply

## Telegram Markdown V2

Telegram uses its own Markdown variant:
- `*bold*`, `_italic_`, `~strikethrough~`, `||spoiler||`
- `` `inline code` `` and ` ```code blocks``` `
- Special characters must be escaped: `_`, `*`, `[`, `]`, `(`, `)`, `~`, `` ` ``, `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!`

## Limitations

- Long-polling adds slight latency vs webhooks
- No inline keyboards or custom buttons from agent responses
- File attachments limited to what the bot API supports
- 4096 character limit per message
