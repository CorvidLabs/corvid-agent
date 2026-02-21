---
module: voice
version: 1
status: active
files:
  - server/voice/tts.ts
  - server/voice/stt.ts
  - server/voice/types.ts
db_tables:
  - voice_cache
depends_on: []
---

# Voice (TTS / STT)

## Purpose

Text-to-speech synthesis via OpenAI TTS API and speech-to-text transcription via OpenAI Whisper API. TTS results are cached in a SQLite table using SHA-256 content hashing with LRU eviction. Both services require `OPENAI_API_KEY`.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `synthesize` | `(options: TTSOptions)` | `Promise<TTSResult>` | Calls OpenAI TTS API to convert text to MP3 audio |
| `synthesizeWithCache` | `(db: Database, text: string, voice: VoicePreset)` | `Promise<TTSResult>` | Cache-aware TTS: checks `voice_cache` table first, synthesizes and caches on miss |
| `transcribe` | `(options: STTOptions)` | `Promise<STTResult>` | Calls OpenAI Whisper API to convert audio to text |

### Exported Types

| Type | Description |
|------|-------------|
| `TTSOptions` | `{ text: string; voice: VoicePreset; model?: string; speed?: number }` |
| `TTSResult` | `{ audio: Buffer; format: 'mp3'; durationMs: number }` |
| `STTOptions` | `{ audio: Buffer; format?: 'ogg' \| 'mp3' \| 'wav' \| 'webm'; language?: string }` |
| `STTResult` | `{ text: string }` |

## Invariants

1. **OPENAI_API_KEY required**: Both `synthesize` and `transcribe` throw if `OPENAI_API_KEY` is not set
2. **TTS 4096 char limit**: `synthesize` throws if `options.text.length > 4096`
3. **TTS empty text rejected**: `synthesize` throws if text is empty or whitespace-only
4. **SHA-256 cache key**: `synthesizeWithCache` hashes text with `Bun.CryptoHasher('sha256')` and looks up by `(text_hash, voice_preset)` pair
5. **LRU eviction at 10,000 entries**: After inserting a new cache entry, if `voice_cache` exceeds 10,000 rows, the oldest entries (by `created_at ASC`) are deleted
6. **STT 25 MB limit**: `transcribe` throws if `options.audio.length > 25 * 1024 * 1024`
7. **STT format support**: Supports `ogg`, `mp3`, `wav`, `webm` formats with corresponding MIME types. Defaults to `ogg`
8. **TTS output format**: Always returns MP3 (`response_format: 'mp3'`)
9. **TTS default model**: Uses `tts-1` model by default, configurable via `options.model`

## Behavioral Examples

### Scenario: TTS cache hit

- **Given** text "Hello world" with voice "alloy" was previously synthesized
- **When** `synthesizeWithCache(db, "Hello world", "alloy")` is called
- **Then** the cached audio is returned without calling OpenAI API

### Scenario: TTS cache miss

- **Given** text "New text" has never been synthesized
- **When** `synthesizeWithCache(db, "New text", "alloy")` is called
- **Then** OpenAI TTS API is called, the result is stored in `voice_cache`, and the audio is returned

### Scenario: Cache eviction

- **Given** the `voice_cache` table has 10,001 entries after a new insert
- **When** eviction runs
- **Then** the oldest entry (by `created_at`) is deleted, bringing the count to 10,000

### Scenario: Voice transcription

- **Given** a valid OGG audio buffer under 25 MB
- **When** `transcribe({ audio, format: 'ogg' })` is called
- **Then** OpenAI Whisper API is called and the transcribed text is returned

## Error Cases

| Condition | Behavior |
|-----------|----------|
| No `OPENAI_API_KEY` (TTS) | Throws `"OPENAI_API_KEY is required for text-to-speech"` |
| No `OPENAI_API_KEY` (STT) | Throws `"OPENAI_API_KEY is required for speech-to-text"` |
| TTS text > 4096 chars | Throws `"TTS text exceeds maximum length of 4096 characters"` |
| TTS empty text | Throws `"TTS text must not be empty"` |
| STT audio > 25 MB | Throws `"Audio file too large (X MB). Maximum is 25 MB."` |
| OpenAI TTS API error | Throws `"Text-to-speech failed (status N)"` |
| OpenAI Whisper API error | Throws `"Speech-to-text failed (status N)"` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/telegram/bridge.ts` | `transcribe` (STT for voice notes), `synthesizeWithCache` (TTS for voice responses) |

## Database Tables

### voice_cache

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| text_hash | TEXT | NOT NULL | SHA-256 hex hash of the input text |
| voice_preset | TEXT | NOT NULL | Voice preset used for synthesis |
| audio_data | BLOB | NOT NULL | Cached MP3 audio bytes |
| format | TEXT | NOT NULL | Audio format (always 'mp3') |
| duration_ms | INTEGER | NOT NULL | Estimated audio duration |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp (used for LRU eviction) |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `OPENAI_API_KEY` | (required) | OpenAI API key for TTS and STT services |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
