---
spec: voice.spec.md
---

## Automated Testing

No test files currently exist for this module. Recommended test file:

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/voice/tts.test.ts` | Unit | Input validation (empty text, >4096 chars, missing API key), cache hit/miss, LRU eviction at 10,000 entries, duration estimation formula |
| `server/voice/stt.test.ts` | Unit | Input validation (>25 MB audio, missing API key), MIME type mapping for all formats, fallback MIME for unknown format |

Key fixtures: mock `fetch` to simulate OpenAI responses; in-memory SQLite with `voice_cache` table; `Bun.env.OPENAI_API_KEY` set/unset between test cases.

## Manual Testing

- [ ] Send a Telegram voice note to an agent; verify the transcription appears as the input message.
- [ ] Send a text message and confirm the agent replies with a synthesized voice note (check for `.ogg` attachment in Telegram).
- [ ] Send the same text message twice to the same agent; verify the second TTS call is served from cache (check server logs for cache hit).
- [ ] Try sending a very long message (>4096 chars) to trigger TTS; confirm the request is rejected before hitting the OpenAI API.
- [ ] Unset `OPENAI_API_KEY` and attempt a voice note; confirm a descriptive error is returned rather than a crash.

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `OPENAI_API_KEY` not set (STT) | Throws `"OPENAI_API_KEY is required for speech-to-text"` before any API call |
| `OPENAI_API_KEY` not set (TTS) | Throws `"OPENAI_API_KEY is required for text-to-speech"` before any API call |
| Audio buffer exactly 25 MB | Accepted (limit is strictly greater than 25 MB) |
| Audio buffer 25 MB + 1 byte | Rejected with size-in-MB message |
| Text exactly 4096 chars | Accepted by `synthesize` |
| Text 4097 chars | Rejected with max-length error |
| Empty string text | Rejected with "TTS text must not be empty" |
| Whitespace-only text | Rejected with "TTS text must not be empty" |
| Unknown audio format | Falls back to `audio/ogg` MIME type |
| Cache hit returns same audio | Returns a `Buffer.from()` copy, not original reference |
| `voice_cache` has exactly 10,000 entries | No eviction after insertion (count at 10,001 triggers delete) |
| `voice_cache` has 10,005 entries after insert | 6 oldest rows deleted (brings count to 10,000) |
| OpenAI Whisper returns non-2xx | Full error body logged; throws `"Speech-to-text failed (status N)"` |
| OpenAI TTS returns non-2xx | Full error body logged; throws `"Text-to-speech failed (status N)"` |
