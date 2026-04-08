/**
 * Discord voice connection manager.
 *
 * Handles joining/leaving voice channels, STT (Phase 2), and TTS playback (Phase 3).
 */

import type { Database } from 'bun:sqlite';
import { entersState, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import type { Client } from 'discord.js';
import type { VoicePreset } from '../../../shared/types';
import { createLogger } from '../../lib/logger';
import { synthesizeWithCache } from '../../voice/tts';
import { VoiceAudioPlayer } from './audio-player';
import { AudioReceiver, type TranscriptionResult } from './audio-receiver';

const log = createLogger('VoiceConnectionManager');

/** Timeout for voice connection to reach Ready state (ms). */
const CONNECT_TIMEOUT_MS = 30_000;

export interface VoiceChannelInfo {
  guildId: string;
  channelId: string;
  channelName?: string;
  joinedAt: number;
  /** Text channel where transcriptions should be posted. */
  transcriptionChannelId?: string;
}

/** Callback for transcription results. */
export type TranscriptionHandler = (result: TranscriptionResult) => void;

/**
 * Manages Discord voice channel connections.
 *
 * One connection per guild (Discord limitation). Tracks active connections
 * and provides join/leave operations.
 */
export class VoiceConnectionManager {
  /** Active voice connections keyed by guild ID. */
  private connections: Map<string, VoiceChannelInfo> = new Map();

  /** Audio receivers per guild. */
  private receivers: Map<string, AudioReceiver> = new Map();

  /** Audio players per guild (for TTS output). */
  private players: Map<string, VoiceAudioPlayer> = new Map();

  /** Discord.js client reference (needed for adapter creation). */
  private client: Client | null = null;

  /** Database reference (needed for TTS cache). */
  private db: Database | null = null;

  /** Transcription event handler. */
  private transcriptionHandler: TranscriptionHandler | null = null;

  /** Default voice preset for TTS. */
  private defaultVoice: VoicePreset = 'onyx';

  setClient(client: Client): void {
    this.client = client;
  }

  /** Set database reference for TTS caching. */
  setDb(db: Database): void {
    this.db = db;
  }

  /** Set default TTS voice preset. */
  setDefaultVoice(voice: VoicePreset): void {
    this.defaultVoice = voice;
  }

  /** Register a handler for transcription results from all connections. */
  onTranscription(handler: TranscriptionHandler): void {
    this.transcriptionHandler = handler;
  }

  /** Get the audio receiver for a guild (if listening). */
  getReceiver(guildId: string): AudioReceiver | undefined {
    return this.receivers.get(guildId);
  }

  /** Start listening and transcribing audio in a guild's voice channel. */
  startListening(guildId: string, textChannelId?: string): boolean {
    const connection = getVoiceConnection(guildId);
    const info = this.connections.get(guildId);
    if (!connection || !info) return false;

    // Already listening
    const existing = this.receivers.get(guildId);
    if (existing?.isListening) return true;

    // Store which text channel to post transcriptions to
    if (textChannelId) {
      info.transcriptionChannelId = textChannelId;
    }

    const receiver = new AudioReceiver(connection, guildId, info.channelId);

    if (this.transcriptionHandler) {
      receiver.on('transcription', this.transcriptionHandler);
    }

    receiver.start();
    this.receivers.set(guildId, receiver);
    log.info('Started listening in voice channel', { guildId, channelId: info.channelId });
    return true;
  }

  /** Stop listening in a guild's voice channel (stays connected). */
  stopListening(guildId: string): boolean {
    const receiver = this.receivers.get(guildId);
    if (!receiver) return false;

    receiver.stop();
    receiver.removeAllListeners();
    this.receivers.delete(guildId);
    log.info('Stopped listening in voice channel', { guildId });
    return true;
  }

  /** Check if currently listening in a guild. */
  isListening(guildId: string): boolean {
    return this.receivers.get(guildId)?.isListening ?? false;
  }

  /** Get all active voice connections. */
  getConnections(): VoiceChannelInfo[] {
    return [...this.connections.values()];
  }

  /** Check if connected to a voice channel in a guild. */
  isConnected(guildId: string): boolean {
    return this.connections.has(guildId);
  }

  /** Get connection info for a guild. */
  getConnection(guildId: string): VoiceChannelInfo | undefined {
    return this.connections.get(guildId);
  }

  /**
   * Join a voice channel.
   *
   * @returns The channel info on success.
   * @throws If the client is not available, guild/channel are invalid, or connection fails.
   */
  async join(guildId: string, channelId: string, channelName?: string): Promise<VoiceChannelInfo> {
    if (!this.client) {
      throw new Error('Discord client not available — gateway may not be ready');
    }

    // Check if already in this channel
    const existing = this.connections.get(guildId);
    if (existing?.channelId === channelId) {
      log.info('Already connected to voice channel', { guildId, channelId });
      return existing;
    }

    log.info('Joining voice channel', { guildId, channelId, channelName });

    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error(`Guild ${guildId} not found in cache`);
    }

    const connection = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false, // We want to receive audio (for future STT)
      selfMute: true, // Muted — Phase 1 is listen-only
    });

    try {
      // Wait for the connection to become ready
      await entersState(connection, VoiceConnectionStatus.Ready, CONNECT_TIMEOUT_MS);
    } catch {
      // Clean up on failure
      connection.destroy();
      throw new Error(`Voice connection to ${channelId} timed out after ${CONNECT_TIMEOUT_MS}ms`);
    }

    // Track connection lifecycle
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      log.warn('Voice connection disconnected', { guildId, channelId });
      try {
        // Try to reconnect — discord.js/voice handles most reconnection automatically
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Reconnecting...
      } catch {
        // Failed to reconnect — clean up
        log.warn('Voice reconnection failed, destroying connection', { guildId, channelId });
        connection.destroy();
        this.connections.delete(guildId);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      log.info('Voice connection destroyed', { guildId, channelId });
      this.connections.delete(guildId);
    });

    const info: VoiceChannelInfo = {
      guildId,
      channelId,
      channelName,
      joinedAt: Date.now(),
    };
    this.connections.set(guildId, info);

    log.info('Joined voice channel', { guildId, channelId, channelName });
    return info;
  }

  /**
   * Synthesize text and play it as audio in the voice channel.
   *
   * Temporarily unmutes the bot during playback, then re-mutes.
   */
  async speak(guildId: string, text: string, voice?: VoicePreset): Promise<void> {
    if (!this.db) {
      throw new Error('Database not available — call setDb() first');
    }

    const connection = getVoiceConnection(guildId);
    if (!connection) {
      throw new Error('Not connected to a voice channel');
    }

    const preset = voice ?? this.defaultVoice;
    log.info('Synthesizing TTS for voice channel', { guildId, voice: preset, textLength: text.length });

    // Synthesize (with cache)
    const result = await synthesizeWithCache(this.db, text, preset);

    // Get or create audio player for this guild
    let player = this.players.get(guildId);
    if (!player) {
      player = new VoiceAudioPlayer(connection);
      this.players.set(guildId, player);
    }

    // Unmute for playback
    connection.rejoin({
      ...connection.joinConfig,
      selfMute: false,
    });

    try {
      await player.play(result.audio, 'mp3');
    } finally {
      // Re-mute after playback
      connection.rejoin({
        ...connection.joinConfig,
        selfMute: true,
      });
    }

    log.info('TTS playback complete', { guildId, durationMs: result.durationMs });
  }

  /** Stop current TTS playback in a guild. */
  stopSpeaking(guildId: string): boolean {
    const player = this.players.get(guildId);
    if (!player?.isPlaying) return false;

    player.stop();

    // Re-mute
    const connection = getVoiceConnection(guildId);
    if (connection) {
      connection.rejoin({
        ...connection.joinConfig,
        selfMute: true,
      });
    }

    log.info('Stopped TTS playback', { guildId });
    return true;
  }

  /** Check if currently speaking (playing TTS) in a guild. */
  isSpeaking(guildId: string): boolean {
    return this.players.get(guildId)?.isPlaying ?? false;
  }

  /**
   * Leave the voice channel in a guild.
   *
   * @returns true if a connection was destroyed, false if not connected.
   */
  leave(guildId: string): boolean {
    // Stop audio player and receiver first
    this.stopSpeaking(guildId);
    this.players.get(guildId)?.destroy();
    this.players.delete(guildId);
    this.stopListening(guildId);

    const connection = getVoiceConnection(guildId);
    if (!connection) {
      this.connections.delete(guildId);
      return false;
    }

    log.info('Leaving voice channel', { guildId, channelId: this.connections.get(guildId)?.channelId });
    connection.destroy();
    this.connections.delete(guildId);
    return true;
  }

  /** Disconnect from all voice channels. */
  disconnectAll(): void {
    for (const [guildId] of this.connections) {
      this.leave(guildId);
    }
  }
}
