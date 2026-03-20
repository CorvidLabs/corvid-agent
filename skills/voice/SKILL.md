---
name: voice
description: Voice integration — TTS via OpenAI tts-1, STT via Whisper, audio caching. Trigger keywords: voice, tts, stt, text to speech, speech to text, whisper, audio.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Voice — TTS & STT Integration

Text-to-speech and speech-to-text capabilities using OpenAI APIs.

## Architecture

- **TTS:** `server/voice/tts.ts` — OpenAI `tts-1` model
- **STT:** `server/voice/stt.ts` — OpenAI Whisper API
- **Gated behind:** `OPENAI_API_KEY` env var
- **Cache:** `voice_cache` database table (hashes text, avoids re-synthesis)

## Text-to-Speech (TTS)

```typescript
import { synthesize, synthesizeWithCache } from '../voice/tts';

// Direct synthesis (no caching)
const audioBuffer = await synthesize(text, voice);

// Cached synthesis (checks voice_cache table first)
const audioBuffer = await synthesizeWithCache(text, voice);
```

### Available Voices

OpenAI tts-1 voices: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

### Caching

`synthesizeWithCache()` hashes the input text and voice, checks the `voice_cache` table, and only calls the API if the audio isn't cached. This saves API costs for repeated phrases.

## Speech-to-Text (STT)

```typescript
import { transcribe } from '../voice/stt';

const text = await transcribe(audioBuffer, 'audio/webm');
```

Calls the OpenAI Whisper API to convert audio to text.

## Telegram Voice Notes

The Telegram bridge automatically:
1. Receives voice messages from users
2. Transcribes them via STT
3. Processes the transcribed text as a normal message
4. Can optionally respond with a voice message via TTS
