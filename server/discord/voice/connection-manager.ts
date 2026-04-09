/**
 * Discord voice connection manager.
 *
 * Handles joining/leaving voice channels, STT (Phase 2), and TTS playback (Phase 3).
 */

import type { Database } from 'bun:sqlite';
import {
  type DiscordGatewayAdapterCreator,
  type DiscordGatewayAdapterLibraryMethods,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { ChannelType, type Client, PermissionFlagsBits } from 'discord.js';
import type { VoicePreset } from '../../../shared/types';
import { createLogger } from '../../lib/logger';
import { synthesizeWithCache } from '../../voice/tts';
import { VoiceAudioPlayer } from './audio-player';
import { AudioReceiver, type TranscriptionResult } from './audio-receiver';

const log = createLogger('VoiceConnectionManager');

/** Timeout for voice connection to reach Ready state (ms). */
const CONNECT_TIMEOUT_MS = 45_000;

/** Whether to use DAVE (Discord Audio Visual Encryption). Enabled by default — Discord requires DAVE for voice connections since 2025. Disable with DISCORD_VOICE_DAVE=false. */
const DAVE_ENCRYPTION = process.env.DISCORD_VOICE_DAVE !== 'false';

/** Maximum number of signalling retry attempts before giving up. */
const MAX_SIGNALLING_RETRIES = 2;

export interface VoiceChannelInfo {
  guildId: string;
  channelId: string;
  channelName?: string;
  joinedAt: number;
  /** Text channel where transcriptions should be posted. */
  transcriptionChannelId?: string;
  /** Whether the bot is currently deafened (not receiving audio). */
  selfDeaf: boolean;
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
  private defaultVoice: VoicePreset = (process.env.CORVID_VOICE as VoicePreset) || 'nova';

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

  /**
   * Set the bot's deafened state on Discord.
   *
   * When deafened, the bot icon shows as deafened to all users in the channel
   * and STT listening is stopped. When undeafened, listening resumes if a
   * transcription channel was previously set.
   */
  setDeafen(guildId: string, deaf: boolean): boolean {
    const connection = getVoiceConnection(guildId);
    const info = this.connections.get(guildId);
    if (!connection || !info) return false;

    if (info.selfDeaf === deaf) return true; // already in desired state

    info.selfDeaf = deaf;

    connection.rejoin({
      ...connection.joinConfig,
      selfDeaf: deaf,
    });

    if (deaf) {
      // Stop STT when deafened
      this.stopListening(guildId);
    }

    log.info('Set voice deafen', { guildId, selfDeaf: deaf });
    return true;
  }

  /** Check if currently deafened in a guild. */
  isDeafened(guildId: string): boolean {
    return this.connections.get(guildId)?.selfDeaf ?? false;
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

    if (!this.client.isReady()) {
      throw new Error('Discord client is not ready — wait for gateway ready event');
    }

    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error(`Guild ${guildId} not found in cache`);
    }

    // Pre-flight: verify the channel exists, is a voice channel, and the bot has Connect permission
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      throw new Error(
        `Channel ${channelId} not found in guild cache. The bot may not have access to this channel. ` +
          `Cached channels: ${[...guild.channels.cache.values()].map((c) => `${c.name}(${c.id})`).join(', ')}`,
      );
    }
    if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) {
      throw new Error(`Channel ${channelId} (${channel.name}) is type ${channel.type}, not a voice channel`);
    }
    const botMember = guild.members.me;
    if (!botMember) {
      throw new Error('Bot member not found in guild — GuildMembers intent may be required');
    }
    const permissions = channel.permissionsFor(botMember);
    if (!permissions) {
      throw new Error(`Cannot resolve permissions for bot in channel ${channel.name}`);
    }
    const missingPerms: string[] = [];
    if (!permissions.has(PermissionFlagsBits.Connect)) missingPerms.push('Connect');
    if (!permissions.has(PermissionFlagsBits.ViewChannel)) missingPerms.push('ViewChannel');
    if (missingPerms.length > 0) {
      throw new Error(
        `Bot is missing permissions in voice channel "${channel.name}": ${missingPerms.join(', ')}. ` +
          `Update the bot's role or re-invite with correct permissions.`,
      );
    }

    log.info('Creating voice connection (pre-flight passed)', {
      guildId,
      channelId,
      channelName: channel.name,
      daveEncryption: DAVE_ENCRYPTION,
      shardStatus: guild.shard.status,
      botPermissions: permissions.bitfield.toString(),
    });

    // Wrap the adapter to log opcode 4 sends and callback invocations
    const debugAdapterCreator: DiscordGatewayAdapterCreator = (methods: DiscordGatewayAdapterLibraryMethods) => {
      const wrappedMethods: DiscordGatewayAdapterLibraryMethods = {
        onVoiceServerUpdate(data: unknown) {
          log.info('[VoiceAdapter] onVoiceServerUpdate received', { guildId, data });
          methods.onVoiceServerUpdate(data as Parameters<typeof methods.onVoiceServerUpdate>[0]);
        },
        onVoiceStateUpdate(data: unknown) {
          log.info('[VoiceAdapter] onVoiceStateUpdate received', { guildId, data });
          methods.onVoiceStateUpdate(data as Parameters<typeof methods.onVoiceStateUpdate>[0]);
        },
        destroy() {
          log.info('[VoiceAdapter] adapter destroy called', { guildId });
          methods.destroy();
        },
      };

      const adapter = guild.voiceAdapterCreator(wrappedMethods);
      const originalSendPayload = adapter.sendPayload.bind(adapter);
      adapter.sendPayload = (payload: { op: number; d: Record<string, unknown> }) => {
        const result = originalSendPayload(payload);
        log.info('[VoiceAdapter] sendPayload', {
          guildId,
          opcode: payload.op,
          channelId: payload.d?.channel_id,
          selfDeaf: payload.d?.self_deaf,
          selfMute: payload.d?.self_mute,
          sent: result, // false means shard wasn't ready — opcode 4 was NOT actually sent
        });
        if (!result) {
          log.error('[VoiceAdapter] sendPayload FAILED — shard is not in Ready state. Opcode 4 was NOT sent to Discord.', {
            guildId,
            shardStatus: guild.shard.status,
          });
        }
        return result;
      };
      return adapter;
    };

    const connection = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator: debugAdapterCreator,
      selfDeaf: false, // We want to receive audio (for future STT)
      selfMute: true, // Muted — Phase 1 is listen-only
      debug: true,
      daveEncryption: DAVE_ENCRYPTION,
    });

    // Log all state transitions for diagnostics
    connection.on('stateChange', (oldState, newState) => {
      const extra: Record<string, unknown> = {
        guildId,
        channelId,
        from: oldState.status,
        to: newState.status,
      };
      // Capture close code when networking closes and connection falls back to signalling
      if (
        newState.status === VoiceConnectionStatus.Signalling &&
        oldState.status === VoiceConnectionStatus.Connecting
      ) {
        extra.reason = 'Voice WebSocket closed — falling back to signalling (check debug messages for close code)';
      }
      // Capture networking state info when available
      if ('networking' in newState && newState.networking) {
        const ns = (newState.networking as { state?: { code?: number; ws?: unknown } }).state;
        if (ns) extra.networkingState = ns.code;
      }
      log.info('Voice connection state change', extra);
    });

    // Log debug messages at INFO level during connection (critical for diagnosing handshake failures)
    connection.on('debug', (message) => {
      log.info('Voice connection debug', { guildId, channelId, message });
    });

    // Catch errors on the connection
    connection.on('error', (error) => {
      log.error('Voice connection error', { guildId, channelId, error: error.message, stack: error.stack });
    });

    // Wait for the connection to become ready, with retry on signalling stall
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= MAX_SIGNALLING_RETRIES; attempt++) {
      try {
        await entersState(connection, VoiceConnectionStatus.Ready, CONNECT_TIMEOUT_MS);
        lastError = undefined;
        break;
      } catch {
        const currentStatus = connection.state.status;
        log.warn('Voice connection attempt failed', {
          guildId,
          channelId,
          stuckInState: currentStatus,
          attempt: attempt + 1,
          maxAttempts: MAX_SIGNALLING_RETRIES + 1,
        });

        if (attempt < MAX_SIGNALLING_RETRIES && currentStatus === VoiceConnectionStatus.Signalling) {
          // Stuck in signalling — try rejoin which re-sends opcode 4
          log.info('Retrying voice connection via rejoin', { guildId, channelId, attempt: attempt + 1 });
          connection.rejoin({ channelId, selfDeaf: false, selfMute: true });
        } else {
          lastError = new Error(
            `Voice connection to ${channelId} timed out after ${CONNECT_TIMEOUT_MS}ms (stuck in state: ${currentStatus})`,
          );
        }
      }
    }

    if (lastError) {
      log.error('Voice connection failed after all attempts', {
        guildId,
        channelId,
        channelName,
        attempts: MAX_SIGNALLING_RETRIES + 1,
      });
      connection.destroy();
      throw lastError;
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
      selfDeaf: false,
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
