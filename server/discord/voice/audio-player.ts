/**
 * Discord voice audio player.
 *
 * Plays synthesized TTS audio (MP3 from OpenAI) into a Discord voice channel
 * using @discordjs/voice AudioPlayer and AudioResource.
 *
 * Phase 3: text-to-speech output in voice channels.
 */

import { Readable } from 'node:stream';
import {
  type AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  type VoiceConnection,
} from '@discordjs/voice';
import { createLogger } from '../../lib/logger';

const log = createLogger('AudioPlayer');

/**
 * Wraps @discordjs/voice AudioPlayer for playing TTS audio buffers.
 *
 * Usage:
 *   const player = new VoiceAudioPlayer(connection);
 *   await player.play(mp3Buffer, 'mp3');
 *   // later:
 *   player.stop();
 */
export class VoiceAudioPlayer {
  private player: AudioPlayer;
  private connection: VoiceConnection;
  private playing = false;

  constructor(connection: VoiceConnection) {
    this.connection = connection;
    this.player = createAudioPlayer();

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.playing = false;
    });

    this.player.on('error', (err) => {
      this.playing = false;
      log.error('Audio player error', { error: err.message });
    });

    // Subscribe the connection to this player
    this.connection.subscribe(this.player);
  }

  /**
   * Play an audio buffer into the voice channel.
   *
   * Resolves when playback finishes or is stopped.
   */
  async play(audio: Buffer, _format: 'mp3'): Promise<void> {
    const stream = Readable.from(audio);
    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary,
    });

    this.playing = true;
    this.player.play(resource);

    // Wait for playback to finish
    return new Promise<void>((resolve) => {
      const onIdle = () => {
        this.player.off(AudioPlayerStatus.Idle, onIdle);
        this.player.off('error', onError);
        this.playing = false;
        resolve();
      };
      const onError = () => {
        this.player.off(AudioPlayerStatus.Idle, onIdle);
        this.player.off('error', onError);
        this.playing = false;
        resolve();
      };

      // If already idle (e.g. empty buffer), resolve immediately
      if (this.player.state.status === AudioPlayerStatus.Idle) {
        this.playing = false;
        resolve();
        return;
      }

      this.player.on(AudioPlayerStatus.Idle, onIdle);
      this.player.on('error', onError);
    });
  }

  /** Stop current playback immediately. */
  stop(): void {
    this.player.stop(true);
    this.playing = false;
  }

  /** Whether audio is currently playing. */
  get isPlaying(): boolean {
    return this.playing;
  }

  /** Clean up the player. */
  destroy(): void {
    this.stop();
  }
}
