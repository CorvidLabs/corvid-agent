---
spec: voice.spec.md
sources:
  - server/voice/stt.ts
  - server/voice/tts.ts
  - server/voice/types.ts
---

## Module Structure

`server/voice/` contains three files:

- `types.ts` — shared type definitions: `TTSOptions`, `TTSResult`, `STTOptions`, `STTResult`, `VoicePreset`
- `stt.ts` — `transcribe()` function: validates input, builds a multipart form, POST to OpenAI Whisper API, returns `{ text }`
- `tts.ts` — `synthesize()` and `synthesizeWithCache()` functions: validates input, calls OpenAI Speech API, caches results in `voice_cache` SQLite table with SHA-256 keying and LRU eviction

The module has no class; all functions are pure exports. Callers import individual functions from `stt.ts` or `tts.ts`.

## Key Functions

### `transcribe` (stt.ts)

Input validation order: API key presence, audio size (≤ 25 MB). Builds a `FormData` with a `Blob` for the audio buffer using correct MIME type (mapped from format string; unknown formats fall back to `audio/ogg`). Sends `POST https://api.openai.com/v1/audio/transcriptions` with `model=whisper-1`. On non-OK response, logs full error body and throws a sanitized status-code message.

### `synthesize` (tts.ts)

Input validation order: API key presence, empty/whitespace text, text length (≤ 4096 chars). Sends `POST https://api.openai.com/v1/audio/speech` with `model`, `voice`, `input`, `response_format: 'mp3'`, and `speed`. Reads the response as `ArrayBuffer`, wraps it in `Buffer`. Duration is estimated as `(bytes / 16000) * 1000` ms.

### `synthesizeWithCache` (tts.ts)

Cache lookup: SHA-256 hash of `text` (via `Bun.CryptoHasher('sha256')`) combined with `voice` preset as the cache key. On hit, returns `Buffer.from(cached.audio_data)` (copy, not reference). On miss, calls `synthesize`, INSERTs the result into `voice_cache`, then performs LRU eviction: if row count exceeds 10,000, DELETE oldest rows (by `created_at ASC`) to bring count back to 10,000.

## Configuration Values / Constants

| Constant / Env Var | Value | Description |
|--------------------|-------|-------------|
| `OPENAI_API_KEY` | (required) | Shared key for both STT and TTS endpoints |
| TTS default model | `tts-1` | Used when `options.model` is omitted |
| TTS default speed | `1.0` | Used when `options.speed` is omitted |
| TTS output format | `mp3` | Always fixed; no option to change |
| STT default format | `ogg` | Used when `options.format` is omitted |
| STT max size | 25 MB | Hard limit matching OpenAI Whisper's limit |
| TTS max text | 4096 chars | Hard limit matching OpenAI TTS's limit |
| Cache max size | 10,000 rows | LRU eviction threshold in `voice_cache` |
| Duration estimate | `bytes / 16000 * 1000` ms | Assumes 128kbps MP3 |

## Related Resources

**DB tables:**
- `voice_cache` — stores `text_hash`, `voice_preset`, `audio_data` (BLOB), `format`, `duration_ms`, `created_at`

**External services:**
- OpenAI `v1/audio/transcriptions` (Whisper) — STT
- OpenAI `v1/audio/speech` (TTS-1) — TTS

**Consumers:**
- `server/telegram/bridge.ts` — transcribes incoming voice notes, synthesizes TTS replies
- `server/discord/voice/audio-receiver.ts` — transcribes Discord voice channel audio
- `server/discord/voice/connection-manager.ts` — synthesizes TTS for Discord voice channels
