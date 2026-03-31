# Voice — Context

## Why This Module Exists

Some operators prefer voice interaction — speaking commands rather than typing, or having agent responses read aloud. The voice module provides speech-to-text (STT) and text-to-speech (TTS) capabilities using OpenAI's Whisper and Speech APIs.

## Architectural Role

Voice is a **media processing service** — it converts between audio and text, enabling voice-based interaction through channels that support audio (Telegram, potentially future voice assistants).

## Key Design Decisions

- **OpenAI APIs**: Uses Whisper for STT and Speech API for TTS. This provides high-quality voice processing without running local models.
- **TTS caching**: TTS results are cached using SHA-256 content hashing with LRU eviction. This avoids re-synthesizing the same text and reduces API costs.
- **SQLite cache**: Cache is stored in a `voice_cache` database table rather than filesystem, keeping it managed and evictable.

## Relationship to Other Modules

- **Telegram**: Voice messages from Telegram are transcribed using STT.
- **DB**: TTS cache stored in `voice_cache` table.
- **Config**: Requires `OPENAI_API_KEY` configuration.
