---
module: discord-voice
version: 1
status: active
files:
  - server/discord/voice/connection-manager.ts
  - server/discord/voice/audio-receiver.ts
  - server/discord/voice/audio-player.ts
  - server/discord/voice/voice-session.ts
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
| `setDb` | `(db: Database)` | `void` | Set database reference for TTS caching |
| `setDefaultVoice` | `(voice: VoicePreset)` | `void` | Set default TTS voice preset |
| `onTranscription` | `(handler: TranscriptionHandler)` | `void` | Register handler for all transcription results |
| `getReceiver` | `(guildId)` | `AudioReceiver \| undefined` | Get the audio receiver for a guild (if listening) |
| `join` | `(guildId, channelId, channelName?)` | `Promise<VoiceChannelInfo>` | Join a voice channel (one per guild). Validates channel type, bot permissions (Connect, ViewChannel). Supports GuildVoice and GuildStageVoice channels. |
| `leave` | `(guildId)` | `boolean` | Leave voice channel, stop audio player/receiver, and clean up |
| `disconnectAll` | `()` | `void` | Leave all voice channels |
| `startListening` | `(guildId, textChannelId?)` | `boolean` | Start STT on a guild's voice connection |
| `stopListening` | `(guildId)` | `boolean` | Stop STT (stay connected) |
| `isListening` | `(guildId)` | `boolean` | Check if STT is active |
| `isConnected` | `(guildId)` | `boolean` | Check if connected to voice |
| `getConnection` | `(guildId)` | `VoiceChannelInfo \| undefined` | Get connection info |
| `getConnections` | `()` | `VoiceChannelInfo[]` | List all active connections |
| `speak` | `(guildId, text, voice?)` | `Promise<void>` | Synthesize and play TTS audio into voice channel. Restarts listening after playback if STT was active. |
| `stopSpeaking` | `(guildId)` | `boolean` | Stop current audio playback |
| `isSpeaking` | `(guildId)` | `boolean` | Check if currently playing audio |
| `setDeafen` | `(guildId, deaf: boolean)` | `boolean` | Set the bot's deafened state on Discord. When deafened, STT listening is stopped. |
| `isDeafened` | `(guildId)` | `boolean` | Check if currently deafened in a guild |

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

### VoiceSessionRouter (server/discord/voice/voice-session.ts)

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| constructor | `(db, processManager, voiceManager, config, sendTextMessage?)` | | Creates the router with required dependencies |
| `handleTranscription` | `(result: TranscriptionResult)` | `Promise<void>` | Buffer transcription, then route through agent session and play response via TTS. Queues transcriptions while bot is speaking or responding. |
| `cleanup` | `(guildId)` | `void` | Clean up voice session for a guild |
| `cleanupAll` | `()` | `void` | Clean up all voice sessions |
| `hasSession` | `(guildId)` | `boolean` | Check if guild has an active voice session |

### Exported Classes

| Export | File | Description |
|--------|------|-------------|
| `VoiceConnectionManager` | `connection-manager.ts` | Manages voice connections, STT receivers, TTS players per guild |
| `AudioReceiver` | `audio-receiver.ts` | Subscribes to user audio streams, decodes Opus, transcribes via Whisper |
| `VoiceAudioPlayer` | `audio-player.ts` | Plays TTS audio buffers into a voice channel |
| `VoiceSessionRouter` | `voice-session.ts` | Routes STT→agent→TTS conversation loop per guild |

### Exported Functions

| Export | File | Description |
|--------|------|-------------|
| `handleVoiceCommand` | `voice-commands.ts` | Dispatches `/voice` subcommands to appropriate handlers. Takes `(ctx, interaction, voiceManager, voiceSessionRouter?)`. |

### Exported Types

| Type | Description |
|------|-------------|
| `VoiceChannelInfo` | `{ guildId, channelId, channelName?, joinedAt, transcriptionChannelId?, selfDeaf }` |
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
| `/voice shutup` | Stop current TTS playback | Admin |

## Invariants

1. **One connection per guild**: Only one voice channel connection per Discord guild (Discord API limitation). Joining a different channel in the same guild first disconnects the existing one.
2. **Self-mute on join**: Bot always joins with `selfMute: true` — listen-only by default until `speak()` is called.
3. **Self-undeaf on join**: Bot joins with `selfDeaf: false` to receive audio for STT.
4. **Connection timeout with retry**: Voice connections that don't reach Ready state within 45 seconds per attempt are retried. Up to 3 total attempts (MAX_SIGNALLING_RETRIES = 2 retries) when stuck in Signalling state. Connection is destroyed after all attempts fail.
5. **DAVE encryption**: Discord Audio Visual Encryption is enabled by default (required by Discord since 2025). Can be disabled with `DISCORD_VOICE_DAVE=false` env var.
6. **Auto-reconnect**: On disconnection, the manager stops listening (receiver invalidated) and attempts reconnection for 5 seconds before giving up and cleaning up. User must run `/voice listen` to resume STT after reconnection.
7. **STT minimum duration**: Audio segments shorter than 800ms are skipped (noise filtering).
8. **STT maximum duration**: Audio segments are force-flushed at 180 seconds (3 minutes) to prevent unbounded buffering.
9. **STT silence detection**: A 1.2-second silence gap ends a user's audio segment and triggers transcription.
10. **Pre-speech ring buffer**: A 500ms circular buffer captures audio before Discord's VAD fires the speaking event, preventing first-syllable clipping.
11. **RMS energy check**: Audio with RMS energy below 200 (near-silence) is skipped to avoid Whisper hallucinations.
12. **Whisper hallucination filtering**: Known hallucination phrases (e.g., "thank you for watching", "subscribe") are discarded if they match the entire transcription.
13. **Opus decoding**: Discord audio is Opus-encoded at 48kHz stereo — decoded to PCM via prism-media, converted to WAV for Whisper.
14. **TTS format**: OpenAI TTS outputs MP3 — converted to Opus via `createAudioResource` with `inputType: StreamType.Arbitrary` for Discord playback.
15. **TTS caching**: Uses `synthesizeWithCache()` from `server/voice/tts.ts` to avoid redundant API calls.
16. **Speak unmutes temporarily**: When `speak()` is called, the bot unmutes itself, plays audio, then re-mutes. If STT was active, listening is restarted with a fresh receiver after playback (since `rejoin()` invalidates the old receiver's subscriptions).
17. **Clean shutdown**: `disconnectAll()` stops all audio players, receivers, and destroys all voice connections.
18. **Guild-only commands**: All `/voice` subcommands require a guild context (no DMs).
19. **OPENAI_API_KEY required**: Both STT (transcribe) and TTS (speak) require `OPENAI_API_KEY`.
20. **Voice conversation loop**: When STT is active, transcriptions are routed through an agent session via VoiceSessionRouter and the response is played back via TTS.
21. **One session per guild**: VoiceSessionRouter maintains one persistent agent session per guild. The session is reused across transcriptions.
22. **No feedback loop**: Transcriptions are queued while the bot is speaking (TTS playback) and processed after playback finishes, preventing the bot from responding to itself.
23. **Transcription buffering**: Transcriptions are buffered for 2 seconds (TRANSCRIPTION_BUFFER_MS) before being sent to the agent, allowing multiple speakers or continued speech to accumulate into a single prompt.
24. **Response cleanup for TTS**: Agent responses are stripped of markdown, code blocks, URLs, and Discord mentions before being sent to TTS. Max TTS length is 4000 characters.
25. **Session cleanup on leave**: When `/voice leave` is invoked, the voice session is cleaned up (unsubscribed, removed from map).
26. **Re-subscribe after process exit**: When the SDK process exits (e.g., after responding), `cleanupSessionState` removes all event subscribers. VoiceSessionRouter re-subscribes its callback before resuming or reusing a session whose process has exited.
27. **Channel type validation**: `join` validates the target is a GuildVoice or GuildStageVoice channel and checks bot permissions (Connect, ViewChannel) before attempting connection.
28. **Deafen state**: `setDeafen` toggles the bot's Discord deafen state via `rejoin()`. When deafened, STT listening is stopped. `/voice listen` auto-undeafens before starting STT.
29. **Speaker identity resolution**: Transcriptions resolve Discord user IDs to display names via the contacts database for the agent prompt.

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

### Scenario: Stop playback

- **Given** the bot is currently playing TTS audio
- **When** `/voice shutup` is invoked
- **Then** playback stops immediately
- **And** the bot re-mutes itself

### Scenario: Voice conversation loop

- **Given** the bot is connected to a voice channel and STT is active
- **When** a user speaks and the transcription completes
- **Then** the transcription is posted to the text channel for visibility
- **And** the transcription is sent to a persistent agent session for the guild
- **When** the agent responds
- **Then** the response text is cleaned (markdown/code stripped) and sent to TTS
- **And** the bot unmutes, plays the TTS audio, then re-mutes

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Not in a guild | Ephemeral: "This command can only be used in a server." |
| Channel is not a voice/stage channel | Error: "Channel ... is type ..., not a voice channel" |
| Guild not in cache | Error: "Guild ... not found in cache" |
| Channel not in guild cache | Error with list of cached channels for debugging |
| Bot missing Connect/ViewChannel permission | Error listing missing permissions |
| Discord client not ready | Error: "Discord client is not ready" |
| Connection timeout (>45s per attempt, up to 3 attempts) | Connection destroyed after all retries, error reported |
| Not connected (for listen/speak) | Ephemeral: "Not connected to a voice channel. Use `/voice join` first." |
| Already listening | Ephemeral: "Already listening and transcribing." |
| Already deafened | Ephemeral: "Already deafened. Use `/voice listen` to undeafen." |
| Database not set for TTS | Error: "Database not available — call setDb() first" |
| OPENAI_API_KEY missing (TTS) | Error logged, TTS response skipped |
| Audio energy too low (RMS < 200) | Transcription skipped (debug logged) |
| Whisper hallucination detected | Transcription discarded (debug logged) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/voice/tts.ts` | `synthesizeWithCache` for TTS synthesis with caching |
| `server/voice/stt.ts` | `transcribe` for Whisper STT |
| `server/lib/logger.ts` | `createLogger` |
| `server/db/contacts.ts` | `findContactByPlatformId` for resolving Discord user IDs to display names |
| `server/db/sessions.ts` | `createSession`, `getSession` for voice session management |
| `server/db/projects.ts` | `listProjects` for resolving default project |
| `server/lib/worktree.ts` | `resolveAndCreateWorktree` for session working directory |
| `server/process/manager.ts` | `ProcessManager` for running agent sessions |
| `server/process/types.ts` | `ClaudeStreamEvent`, `extractContentText` for parsing agent responses |
| `server/discord/thread-response/recovery.ts` | `resolveDefaultAgent` for finding agent to use |
| `@discordjs/voice` | `joinVoiceChannel`, `createAudioResource`, `createAudioPlayer`, `AudioPlayerStatus`, `StreamType`, `getVoiceConnection`, `entersState`, `VoiceConnectionStatus`, `EndBehaviorType`, `DiscordGatewayAdapterCreator` |
| `discord.js` | `Client`, `ChannelType`, `PermissionFlagsBits` for channel validation |
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
| 2026-04-09 | corvid-agent | Update to match code: 45s timeout with signalling retries, DAVE encryption, 800ms min/180s max audio, 1.2s silence, pre-speech ring buffer, RMS energy check, hallucination filtering, deafen/undeafen, transcription buffering, permission checks, speaker identity resolution, stage voice channel support |
