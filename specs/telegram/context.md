# Telegram Bridge — Context

## Why This Module Exists

Telegram is a popular messaging platform, especially for mobile. The Telegram bridge enables operators to chat with agents via Telegram, with support for text, voice messages (via the voice module's STT), and bot commands.

## Architectural Role

Telegram is a **channel bridge** — it implements the `ChannelAdapter` interface and translates between Telegram's Bot API and corvid-agent's session model.

## Key Design Decisions

- **Bot API**: Uses Telegram's Bot API with webhooks for receiving messages and REST calls for sending.
- **Voice support**: Telegram voice messages are transcribed using the voice module's speech-to-text capability, enabling hands-free interaction.
- **Session management**: Each Telegram chat maps to an agent session.

## Relationship to Other Modules

- **Channels**: Implements `ChannelAdapter`.
- **Voice**: Uses STT for voice message transcription.
- **Process Manager**: Creates agent sessions.
- **DB**: Uses sessions and session_messages tables.
