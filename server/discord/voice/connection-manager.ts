/**
 * Discord voice connection manager.
 *
 * Handles joining/leaving voice channels using @discordjs/voice.
 * Phase 1: join/leave only (listen silently, no audio output).
 */

import { entersState, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import type { Client } from 'discord.js';
import { createLogger } from '../../lib/logger';

const log = createLogger('VoiceConnectionManager');

/** Timeout for voice connection to reach Ready state (ms). */
const CONNECT_TIMEOUT_MS = 30_000;

export interface VoiceChannelInfo {
  guildId: string;
  channelId: string;
  channelName?: string;
  joinedAt: number;
}

/**
 * Manages Discord voice channel connections.
 *
 * One connection per guild (Discord limitation). Tracks active connections
 * and provides join/leave operations.
 */
export class VoiceConnectionManager {
  /** Active voice connections keyed by guild ID. */
  private connections: Map<string, VoiceChannelInfo> = new Map();

  /** Discord.js client reference (needed for adapter creation). */
  private client: Client | null = null;

  setClient(client: Client): void {
    this.client = client;
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
   * Leave the voice channel in a guild.
   *
   * @returns true if a connection was destroyed, false if not connected.
   */
  leave(guildId: string): boolean {
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
