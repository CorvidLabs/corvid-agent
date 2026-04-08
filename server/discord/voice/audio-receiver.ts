/**
 * Discord voice audio receiver.
 *
 * Subscribes to voice channel audio streams, buffers per-user Opus packets,
 * decodes to PCM, converts to WAV, and sends to Whisper for transcription.
 *
 * Phase 2: receive and transcribe — emits transcription events.
 */

import { EventEmitter } from 'node:events';
import { EndBehaviorType, type VoiceConnection } from '@discordjs/voice';
import { opus } from 'prism-media';
import { createLogger } from '../../lib/logger';
import { transcribe } from '../../voice/stt';

const log = createLogger('AudioReceiver');

/** Minimum audio duration (ms) to bother transcribing. */
const MIN_AUDIO_DURATION_MS = 500;

/** Maximum audio duration (ms) — flush buffer if someone talks too long. */
const MAX_AUDIO_DURATION_MS = 60_000;

/** Silence duration (ms) before ending a user's audio stream. */
const SILENCE_DURATION_MS = 1_000;

/** Discord Opus: 48kHz, stereo, 20ms frames → 960 samples/frame. */
const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const FRAME_SIZE = 960;
const BYTES_PER_SAMPLE = 2; // s16le
/** Bytes per decoded PCM frame (unused but documents the math). */
// const BYTES_PER_FRAME = FRAME_SIZE * CHANNELS * BYTES_PER_SAMPLE;

/** Transcription result emitted for each user utterance. */
export interface TranscriptionResult {
  userId: string;
  text: string;
  durationMs: number;
  guildId: string;
  channelId: string;
}

/**
 * Receives audio from a Discord voice connection, transcribes speech per-user.
 *
 * Usage:
 *   const receiver = new AudioReceiver(connection, guildId, channelId);
 *   receiver.on('transcription', (result: TranscriptionResult) => { ... });
 *   receiver.start();
 *   // later:
 *   receiver.stop();
 */
export class AudioReceiver extends EventEmitter {
  private connection: VoiceConnection;
  private guildId: string;
  private channelId: string;
  private activeStreams: Set<string> = new Set();
  private listening = false;

  constructor(connection: VoiceConnection, guildId: string, channelId: string) {
    super();
    this.connection = connection;
    this.guildId = guildId;
    this.channelId = channelId;
  }

  /** Start listening for audio from all users in the channel. */
  start(): void {
    if (this.listening) return;
    this.listening = true;

    const receiver = this.connection.receiver;

    receiver.speaking.on('start', (userId: string) => {
      if (this.activeStreams.has(userId)) return; // Already subscribed
      this.subscribeToUser(userId);
    });

    log.info('Audio receiver started', { guildId: this.guildId, channelId: this.channelId });
  }

  /** Stop listening and clean up all streams. */
  stop(): void {
    this.listening = false;
    this.activeStreams.clear();
    log.info('Audio receiver stopped', { guildId: this.guildId, channelId: this.channelId });
  }

  /** Whether the receiver is currently listening. */
  get isListening(): boolean {
    return this.listening;
  }

  private subscribeToUser(userId: string): void {
    if (!this.listening) return;

    this.activeStreams.add(userId);
    log.debug('Subscribing to user audio', { userId, guildId: this.guildId });

    const opusStream = this.connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: SILENCE_DURATION_MS,
      },
    });

    const pcmChunks: Buffer[] = [];
    let totalPcmBytes = 0;

    // Decode Opus → PCM using prism-media
    const decoder = new opus.Decoder({
      rate: SAMPLE_RATE,
      channels: CHANNELS,
      frameSize: FRAME_SIZE,
    });

    opusStream.pipe(decoder);

    decoder.on('data', (pcm: Buffer) => {
      pcmChunks.push(pcm);
      totalPcmBytes += pcm.length;

      // Safety: flush if too long
      const durationMs = (totalPcmBytes / (SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE)) * 1000;
      if (durationMs >= MAX_AUDIO_DURATION_MS) {
        log.warn('Max audio duration reached, flushing', { userId, durationMs });
        opusStream.destroy();
      }
    });

    decoder.on('end', () => {
      this.activeStreams.delete(userId);
      const durationMs = (totalPcmBytes / (SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE)) * 1000;

      if (durationMs < MIN_AUDIO_DURATION_MS) {
        log.debug('Audio too short, skipping transcription', { userId, durationMs });
        return;
      }

      log.info('Audio stream ended, transcribing', { userId, durationMs: Math.round(durationMs) });

      // Convert PCM to WAV and transcribe
      const pcm = Buffer.concat(pcmChunks);
      const wav = pcmToWav(pcm, SAMPLE_RATE, CHANNELS);

      this.transcribeAudio(userId, wav, durationMs).catch((err) => {
        log.error('Transcription failed', { userId, error: String(err) });
      });
    });

    decoder.on('error', (err: Error) => {
      this.activeStreams.delete(userId);
      log.error('Decoder error', { userId, error: err.message });
    });

    opusStream.on('error', (err: Error) => {
      this.activeStreams.delete(userId);
      log.error('Opus stream error', { userId, error: err.message });
    });
  }

  private async transcribeAudio(userId: string, wav: Buffer, durationMs: number): Promise<void> {
    try {
      const result = await transcribe({ audio: wav, format: 'wav', prompt: 'This is a conversation in English.' });

      if (!result.text.trim()) {
        log.debug('Empty transcription', { userId });
        return;
      }

      const transcription: TranscriptionResult = {
        userId,
        text: result.text.trim(),
        durationMs: Math.round(durationMs),
        guildId: this.guildId,
        channelId: this.channelId,
      };

      log.info('Transcription complete', {
        userId,
        text: result.text.substring(0, 100),
        durationMs: Math.round(durationMs),
      });

      this.emit('transcription', transcription);
    } catch (err) {
      log.error('Whisper transcription error', { userId, error: String(err) });
      this.emit('error', err);
    }
  }
}

/**
 * Convert raw PCM (s16le) audio to WAV format.
 *
 * WAV is a trivial container: 44-byte RIFF header + raw PCM data.
 * This avoids needing any external encoder for Whisper input.
 */
function pcmToWav(pcm: Buffer, sampleRate: number, channels: number): Buffer {
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const headerSize = 44;

  const header = Buffer.alloc(headerSize);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(dataSize + headerSize - 8, 4); // File size - 8
  header.write('WAVE', 8);

  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (PCM = 16)
  header.writeUInt16LE(1, 20); // AudioFormat (PCM = 1)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}
