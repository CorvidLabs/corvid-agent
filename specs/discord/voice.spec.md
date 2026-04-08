---
module: discord-voice
version: 1
status: active
files:
  - server/discord/voice/connection-manager.ts
  - server/discord/voice/audio-receiver.ts
  - server/discord/voice/audio-player.ts
  - server/discord/command-handlers/voice-commands.ts
db_tables: []
depends_on:
  - specs/voice/voice.spec.md
---

# Discord Voice

## Purpose

Provides Discord voice channel integration: join/leave voice channels, receive and transcribe user speech (STT via Whisper), and play synthesized speech (TTS via OpenAI) into voice channels. Built on `@discordjs/voice` for protocol handling, `prism-media` for Opus decoding, and the existing `server/voice/` services for STT/TTS.

## Public API

### VoiceConnectionManager (server/discord/voice/connection-manager.ts)

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `setClient` | `(client: Client)` | `void` | Wire the discord.js Client for voice adapter creation |
| `onTranscription` | `(handler: TranscriptionHandler)` | `void` | Register handler for all transcription results |
| `join` | `(guildId, channelId, channelName?)` | `Promise<VoiceChannelInfo>` | Join a voice channel (one per guild) |
| `leave` | `(guildId)` | `boolean` | Leave voice channel and clean up |
| `disconnectAll` | `()` | `void` | Leave all voice channels |
| `startListening` | `(guildId, textChannelId?)` | `boolean` | Start STT on a guild's voice connection |
| `stopListening` | `(guildId)` | `boolean` | Stop STT (stay connected) |
| `isListening` | `(guildId)` | `boolean` | Check if STT is active |
| `isConnected` | `(guildId)` | `boolean` | Check if connected to voice |
| `getConnection` | `(guildId)` | `VoiceChannelInfo \| undefined` | Get connection info |
| `getConnections` | `()` | `VoiceChannelInfo[]` | List all active connections |
| `speak` | `(guildId, text, voice?)` | `Promise<void>` | Synthesize and play TTS audio into voice channel |
| `stopSpeaking` | `(guildId)` | `boolean` | Stop current audio playback |
| `isSpeaking` | `(guildId)` | `boolean` | Check if currently playing audio |

### AudioReceiver (server/discord/voice/audio-receiver.ts)

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start` | `()` | `void` | Begin subscribing to user audio streams |
| `stop` | `()` | `void` | Stop all stream subscriptions |
| `isListening` | (getter) | `boolean` | Whether receiver is active |

### AudioPlayer (server/discord/voice/audio-player.ts)

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `play` | `(audio: Buffer, format: 'mp3')` | `Promise<void>` | Play audio buffer into voice channel |
| `stop` | `()` | `void` | Stop current playback |
| `isPlaying` | (getter) | `boolean` | Whether audio is currently playing |

### Exported Classes

| Export | File | Description |
|--------|------|-------------|
| `VoiceConnectionManager` | `connection-manager.ts` | Manages voice connections, STT receivers, TTS players per guild |
| `AudioReceiver` | `audio-receiver.ts` | Subscribes to user audio streams, decodes Opus, transcribes via Whisper |
| `VoiceAudioPlayer` | `audio-player.ts` | Plays TTS audio buffers into a voice channel |

### Exported Functions

| Export | File | Description |
|--------|------|-------------|
| `handleVoiceCommand` | `voice-commands.ts` | Dispatches `/voice` subcommands to appropriate handlers |

### Exported Types

| Type | Description |
|------|-------------|
| `VoiceChannelInfo` | `{ guildId, channelId, channelName?, joinedAt, transcriptionChannelId? }` |
| `TranscriptionResult` | `{ userId, text, durationMs, guildId, channelId }` |
| `TranscriptionHandler` | `(result: TranscriptionResult) => void` |

### Slash Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/voice join <channel>` | Join a voice channel | Admin |
| `/voice leave` | Leave current voice channel | Admin |
| `/voice status` | Show connection info, STT/TTS state | Admin |
| `/voice listen` | Start STT transcription | Admin |
| `/voice deafen` | Stop STT transcription | Admin |
| `/voice say <text>` | Speak text via TTS in voice channel | Admin |
| `/voice shutup` | Stop current TTS playback | Admin |

## Invariants

1. **One connection per guild**: Only one voice channel connection per Discord guild (Discord API limitation). Joining a different channel in the same guild first disconnects the existing one.
2. **Self-mute on join**: Bot always joins with `selfMute: true` — listen-only by default until `speak()` is called.
3. **Self-undeaf on join**: Bot joins with `selfDeaf: false` to receive audio for STT.
4. **Connection timeout**: Voice connections that don't reach Ready state within 30 seconds are destroyed with an error.
5. **Auto-reconnect**: On disconnection, the manager attempts reconnection for 5 seconds before giving up and cleaning up.
6. **STT minimum duration**: Audio segments shorter than 500ms are skipped (noise filtering).
7. **STT maximum duration**: Audio segments are force-flushed at 60 seconds to prevent unbounded buffering.
8. **STT silence detection**: A 1-second silence gap ends a user's audio segment and triggers transcription.
9. **Opus decoding**: Discord audio is Opus-encoded at 48kHz stereo — decoded to PCM via prism-media, converted to WAV for Whisper.
10. **TTS format**: OpenAI TTS outputs MP3 — converted to Opus via `createAudioResource` with `inputType: StreamType.Arbitrary` for Discord playback.
11. **TTS caching**: Uses `synthesizeWithCache()` from `server/voice/tts.ts` to avoid redundant API calls.
12. **Speak unmutes temporarily**: When `speak()` is called, the bot unmutes itself, plays audio, then re-mutes.
13. **Clean shutdown**: `disconnectAll()` stops all audio receivers and destroys all voice connections.
14. **Guild-only commands**: All `/voice` subcommands require a guild context (no DMs).
15. **OPENAI_API_KEY required**: Both STT (transcribe) and TTS (speak) require `OPENAI_API_KEY`.

## Behavioral Examples

### Scenario: Join and listen

- **Given** the bot is not in any voice channel
- **When** `/voice join #general-voice` is invoked
- **Then** the bot joins the channel with `selfMute: true`, `selfDeaf: false`
- **And** responds "Joined voice channel #general-voice. Listening silently."

### Scenario: Start STT

- **Given** the bot is connected to a voice channel
- **When** `/voice listen` is invoked in #text-channel
- **Then** the AudioReceiver starts subscribing to user audio streams
- **And** transcriptions are posted to #text-channel as `**Voice** (@user, 3s): transcribed text`

### Scenario: Speak via TTS

- **Given** the bot is connected to a voice channel
- **When** `/voice say Hello everyone` is invoked
- **Then** TTS audio is synthesized via OpenAI (cached if previously spoken)
- **And** the bot unmutes, plays the audio, then re-mutes
- **And** responds "Speaking: Hello everyone"

### Scenario: Stop playback

- **Given** the bot is currently playing TTS audio
- **When** `/voice shutup` is invoked
- **Then** playback stops immediately
- **And** the bot re-mutes itself

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Not in a guild | Ephemeral: "This command can only be used in a server." |
| Channel is not a voice channel | Ephemeral: "Not a voice channel." |
| Connection timeout (>30s) | Connection destroyed, error reported |
| Not connected (for listen/speak) | Ephemeral: "Not connected to a voice channel. Use `/voice join` first." |
| Already listening | Ephemeral: "Already listening and transcribing." |
| TTS with empty text | Ephemeral: "Please provide text to speak." |
| OPENAI_API_KEY missing (TTS) | Error logged, ephemeral error to user |
| TTS text > 4096 chars | Ephemeral: "Text too long (max 4096 characters)." |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/voice/tts.ts` | `synthesizeWithCache` for TTS synthesis with caching |
| `server/voice/stt.ts` | `transcribe` for Whisper STT |
| `server/lib/logger.ts` | `createLogger` |
| `@discordjs/voice` | `joinVoiceChannel`, `createAudioResource`, `createAudioPlayer`, `AudioPlayerStatus`, `StreamType`, `getVoiceConnection`, `entersState`, `VoiceConnectionStatus` |
| `prism-media` | `opus.Decoder` for Opus → PCM conversion |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/bridge.ts` | Creates `VoiceConnectionManager`, wires transcription handler |
| `server/discord/commands.ts` | Registers `/voice` slash command with subcommands |
| `server/discord/command-handlers/voice-commands.ts` | Dispatches subcommands to manager methods |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-08 | corvid-agent | Initial spec covering Phase 1 (join/leave), Phase 2 (STT), Phase 3 (TTS) |
