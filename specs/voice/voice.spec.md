---
module: voice
version: 1
status: draft
files:
  - server/voice/stt.ts
  - server/voice/tts.ts
  - server/voice/types.ts
db_tables:
  - voice_cache
depends_on: []
---

# Voice Services

## Purpose

Provides speech-to-text (STT) and text-to-speech (TTS) capabilities using OpenAI APIs. STT uses the Whisper API (`whisper-1`) for transcription. TTS uses the Speech API (`tts-1`) for synthesis. TTS results are cached in SQLite to avoid redundant API calls for repeated text.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `transcribe` | `(options: STTOptions)` | `Promise<STTResult>` | Transcribe audio to text via OpenAI Whisper |
| `synthesize` | `(options: TTSOptions)` | `Promise<TTSResult>` | Convert text to speech via OpenAI TTS API |
| `synthesizeWithCache` | `(db: Database, text: string, voice: VoicePreset)` | `Promise<TTSResult>` | Synthesize with SQLite cache lookup/store |

### Exported Types

| Type | Description |
|------|-------------|
| `TTSOptions` | `{ text, voice: VoicePreset, model?, speed? }` |
| `TTSResult` | `{ audio: Buffer, format: 'mp3', durationMs: number }` |
| `STTOptions` | `{ audio: Buffer, format?: 'ogg' \| 'mp3' \| 'wav' \| 'webm', language?: string }` |
| `STTResult` | `{ text: string }` |

## Invariants

1. **OPENAI_API_KEY required**: Both `transcribe` and `synthesize` throw immediately if `OPENAI_API_KEY` is not set in the environment
2. **STT audio size limit**: Audio buffers larger than 25 MB (OpenAI Whisper limit) are rejected with a descriptive error before any API call
3. **TTS text length limit**: Text longer than 4096 characters is rejected by `synthesize`
4. **TTS empty text rejection**: Empty or whitespace-only text is rejected by `synthesize`
5. **Audio format mapping**: STT supports `ogg`, `mp3`, `wav`, `webm` formats with correct MIME type mapping. Unknown formats fall back to `audio/ogg`
6. **Default STT format**: If no format is specified, defaults to `ogg`
7. **TTS model default**: If no model is specified, defaults to `tts-1`
8. **TTS speed default**: If no speed is specified, defaults to `1.0`
9. **TTS output format**: Always outputs MP3 (`response_format: 'mp3'`)
10. **Duration estimation**: TTS duration is estimated from audio byte size assuming 128kbps MP3: `durationMs = (bytes / 16000) * 1000`
11. **Cache keying**: TTS cache uses SHA-256 hash of the text plus the voice preset as the lookup key
12. **Cache eviction**: When the `voice_cache` table exceeds 10,000 entries, the oldest entries (by `created_at`) are deleted to bring it back to the limit
13. **Cache returns copy**: Cached audio is wrapped in a new `Buffer.from()` to prevent mutation of cached data
14. **API error handling**: Both STT and TTS log the full API error server-side but throw a generic error message that does not expose API details

## Behavioral Examples

### Scenario: Transcribe a voice note

- **Given** `OPENAI_API_KEY` is set and a 2 MB OGG audio buffer
- **When** `transcribe({ audio, format: 'ogg' })` is called
- **Then** a multipart form is sent to `https://api.openai.com/v1/audio/transcriptions` with model `whisper-1`
- **And** the returned `{ text }` is the transcription result

### Scenario: Synthesize speech with cache miss

- **Given** `OPENAI_API_KEY` is set and no cached entry for the text/voice combination
- **When** `synthesizeWithCache(db, "Hello world", "alloy")` is called
- **Then** `synthesize` is called, the MP3 audio is returned
- **And** the result is stored in `voice_cache` with the SHA-256 hash of the text

### Scenario: Synthesize speech with cache hit

- **Given** a cached entry exists for text hash + voice preset
- **When** `synthesizeWithCache(db, "Hello world", "alloy")` is called
- **Then** the cached audio is returned without making an API call

### Scenario: Cache eviction

- **Given** `voice_cache` contains 10,005 entries
- **When** a new entry is cached via `synthesizeWithCache`
- **Then** the 6 oldest entries are deleted (bringing count to 10,000)

### Scenario: Oversized audio rejected

- **Given** a 30 MB audio buffer
- **When** `transcribe({ audio })` is called
- **Then** an error is thrown: `"Audio file too large (30 MB). Maximum is 25 MB."`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `OPENAI_API_KEY` not set (STT) | Throws `"OPENAI_API_KEY is required for speech-to-text"` |
| `OPENAI_API_KEY` not set (TTS) | Throws `"OPENAI_API_KEY is required for text-to-speech"` |
| Audio too large (>25 MB) | Throws with size in MB and 25 MB limit |
| TTS text too long (>4096 chars) | Throws `"TTS text exceeds maximum length of 4096 characters"` |
| TTS text empty/whitespace | Throws `"TTS text must not be empty"` |
| Whisper API returns non-OK | Logs full error, throws `"Speech-to-text failed (status {code})"` |
| TTS API returns non-OK | Logs full error, throws `"Text-to-speech failed (status {code})"` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger.ts` | `createLogger` for STT/TTS logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/telegram/bridge.ts` | `transcribe` for voice note STT, `synthesizeWithCache` for voice responses |

## Database Tables

### voice_cache

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| text_hash | TEXT | NOT NULL | SHA-256 hex hash of the input text |
| voice_preset | TEXT | NOT NULL | Voice name (e.g. `alloy`, `nova`) |
| audio_data | BLOB | NOT NULL | Cached MP3 audio bytes |
| format | TEXT | NOT NULL | Audio format (always `mp3`) |
| duration_ms | INTEGER | NOT NULL | Estimated duration in milliseconds |
| created_at | TEXT | DEFAULT datetime('now') | Cache entry creation time |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `OPENAI_API_KEY` | (required) | OpenAI API key for Whisper and TTS endpoints |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
