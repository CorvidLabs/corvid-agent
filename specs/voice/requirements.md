---
spec: voice.spec.md
---

## User Stories

- As an agent operator, I want voice notes transcribed to text via OpenAI Whisper so that I can interact with agents by speaking
- As an agent operator, I want agent responses synthesized to speech via OpenAI TTS so that I can listen to responses hands-free
- As a platform administrator, I want TTS results cached with LRU eviction so that repeated phrases do not incur redundant API costs
- As an agent developer, I want a `synthesizeWithCache` function that transparently handles cache lookup and storage so that callers do not need to manage caching logic

## Acceptance Criteria

- `transcribe(options: STTOptions)` sends a multipart form to OpenAI Whisper API (`whisper-1` model) at `https://api.openai.com/v1/audio/transcriptions` and returns `{ text }`
- `transcribe` throws immediately if `OPENAI_API_KEY` is not set: `"OPENAI_API_KEY is required for speech-to-text"`
- Audio buffers larger than 25 MB are rejected before any API call with an error message including the actual size and the 25 MB limit
- STT supports `ogg`, `mp3`, `wav`, `webm` formats with correct MIME type mapping; unknown formats fall back to `audio/ogg`; default format is `ogg`
- `synthesize(options: TTSOptions)` calls OpenAI TTS API and returns `{ audio: Buffer, format: 'mp3', durationMs }`
- `synthesize` throws if `OPENAI_API_KEY` is not set, text is empty/whitespace, or text exceeds 4096 characters
- TTS model defaults to `tts-1`; speed defaults to `1.0`; output format is always MP3
- Duration is estimated from audio byte size assuming 128kbps MP3: `durationMs = (bytes / 16000) * 1000`
- `synthesizeWithCache(db, text, voice)` checks the `voice_cache` table using SHA-256 hash of the text plus voice preset; returns cached audio on hit, synthesizes and caches on miss
- Cache key is computed via `Bun.CryptoHasher('sha256')` on the input text
- LRU eviction triggers when `voice_cache` exceeds 10,000 entries; the oldest entries by `created_at` are deleted to bring it back to the limit
- Cached audio is returned via `Buffer.from()` to prevent mutation of cached data
- API errors are logged server-side with full details but thrown with a generic message that does not expose API internals: `"Speech-to-text failed (status {code})"` or `"Text-to-speech failed (status {code})"`

## Constraints

- Requires `OPENAI_API_KEY` environment variable for both STT and TTS
- OpenAI Whisper file size limit is 25 MB
- TTS text length limit is 4096 characters
- `voice_cache` table stores audio as BLOB; columns: `id`, `text_hash`, `voice_preset`, `audio_data`, `format`, `duration_ms`, `created_at`
- Cache eviction threshold is 10,000 entries
- Only the Telegram bridge currently consumes voice services (`transcribe` for voice note STT, `synthesizeWithCache` for voice responses)

## Out of Scope

- Real-time streaming STT or TTS (only batch processing is supported)
- Non-OpenAI voice providers (ElevenLabs, Google Cloud TTS, etc.)
- Voice activity detection or silence trimming
- Multi-language TTS voice selection (voice preset is passed by the caller)
- Audio format conversion (callers must provide supported formats)
- Voice cloning or custom voice training
