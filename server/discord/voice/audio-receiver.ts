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
const MIN_AUDIO_DURATION_MS = 800;

/**
 * Minimum RMS energy threshold for audio to be worth transcribing.
 * PCM s16le range is -32768..32767; typical speech RMS is 1000-8000+.
 * Below this threshold the audio is near-silence and Whisper will hallucinate.
 */
const MIN_RMS_ENERGY = 200;

/**
 * Common Whisper hallucination phrases produced from short/silent audio.
 * These are checked case-insensitively against the transcription result.
 * If the entire transcription matches one of these, it's discarded.
 */
const WHISPER_HALLUCINATIONS = new Set([
  'thank you for watching',
  'thanks for watching',
  'thank you for listening',
  'thanks for listening',
  'this is a conversation in english',
  'the conversation is in english',
  'this is in english',
  'subtitle',
  'subtitles',
  'subtítulos',
  'sous-titres',
  'you',
  'bye',
  'bye bye',
  'bye-bye',
  'goodbye',
  'thank you',
  'thanks',
  'the end',
  'silence',
  'mhm',
  'hmm',
  'uh',
  'um',
  'oh',
  'ah',
  'okay',
  'so',
  'yeah',
  'yes',
  'no',
  'right',
  'like',
  'subscribe',
  'like and subscribe',
  'please subscribe',
  'see you next time',
  'see you in the next video',
  'transcribed by',
  'translated by',
  'copyright',
  '...',
  '…',
]);

/** Maximum audio duration (ms) — flush buffer if someone talks too long. */
const MAX_AUDIO_DURATION_MS = 180_000;

/** Silence duration (ms) before ending a user's audio stream. */
const SILENCE_DURATION_MS = 1200;

/** Pre-speech ring buffer duration (ms). Captures audio before VAD fires. */
const PRE_SPEECH_BUFFER_MS = 500;

/** Discord Opus: 48kHz, stereo, 20ms frames → 960 samples/frame. */
const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const FRAME_SIZE = 960;
const BYTES_PER_SAMPLE = 2; // s16le
/** Bytes per decoded PCM frame (unused but documents the math). */
// const BYTES_PER_FRAME = FRAME_SIZE * CHANNELS * BYTES_PER_SAMPLE;

/** Size of ring buffer in bytes: PRE_SPEECH_BUFFER_MS at 48kHz stereo s16le. */
const RING_BUFFER_BYTES = Math.ceil((PRE_SPEECH_BUFFER_MS / 1000) * SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE);

/**
 * Circular buffer for pre-speech audio capture.
 *
 * Stores a rolling window of PCM data so the first syllable isn't clipped
 * when Discord's VAD fires the speaking event slightly late.
 */
class RingBuffer {
  private buffer: Buffer;
  private writePos = 0;
  private filled = 0;

  constructor(capacity: number) {
    this.buffer = Buffer.alloc(capacity);
  }

  /** Write PCM data into the ring buffer, overwriting oldest data. */
  write(data: Buffer): void {
    const capacity = this.buffer.length;
    if (data.length >= capacity) {
      // Data exceeds buffer — just keep the tail
      data.copy(this.buffer, 0, data.length - capacity);
      this.writePos = 0;
      this.filled = capacity;
      return;
    }

    const spaceAtEnd = capacity - this.writePos;
    if (data.length <= spaceAtEnd) {
      data.copy(this.buffer, this.writePos);
    } else {
      // Wrap around
      data.copy(this.buffer, this.writePos, 0, spaceAtEnd);
      data.copy(this.buffer, 0, spaceAtEnd);
    }
    this.writePos = (this.writePos + data.length) % capacity;
    this.filled = Math.min(this.filled + data.length, capacity);
  }

  /** Read all buffered data in order (oldest first) and reset. */
  drain(): Buffer {
    if (this.filled === 0) return Buffer.alloc(0);

    const capacity = this.buffer.length;
    const result = Buffer.alloc(this.filled);

    if (this.filled < capacity) {
      // Haven't wrapped yet — data starts at 0
      this.buffer.copy(result, 0, 0, this.filled);
    } else {
      // Full buffer — read from writePos (oldest) to end, then 0 to writePos
      const tailLen = capacity - this.writePos;
      this.buffer.copy(result, 0, this.writePos, capacity);
      this.buffer.copy(result, tailLen, 0, this.writePos);
    }

    this.writePos = 0;
    this.filled = 0;
    return result;
  }
}

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

  /** Per-user ring buffers that capture audio before the speaking event fires. */
  private ringBuffers: Map<string, RingBuffer> = new Map();

  /** Pre-listen subscriptions: always-on streams that feed ring buffers between speech captures. */
  private preListenStreams: Map<string, { stream: NodeJS.ReadableStream; decoder: opus.Decoder }> = new Map();

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
      if (this.activeStreams.has(userId)) return; // Already capturing
      this.subscribeToUser(userId);
    });

    log.info('Audio receiver started', { guildId: this.guildId, channelId: this.channelId });
  }

  /** Stop listening and clean up all streams. */
  stop(): void {
    this.listening = false;
    this.activeStreams.clear();

    // Clean up all pre-listen subscriptions
    for (const [userId, preListen] of this.preListenStreams) {
      preListen.decoder.destroy();
      if ('destroy' in preListen.stream) (preListen.stream as { destroy(): void }).destroy();
      log.debug('Cleaned up pre-listen stream', { userId });
    }
    this.preListenStreams.clear();
    this.ringBuffers.clear();

    log.info('Audio receiver stopped', { guildId: this.guildId, channelId: this.channelId });
  }

  /** Whether the receiver is currently listening. */
  get isListening(): boolean {
    return this.listening;
  }

  /**
   * Start a pre-listen subscription for a user.
   *
   * This creates an always-on audio stream that feeds a ring buffer,
   * capturing audio BEFORE the next speaking event fires. This way,
   * the first syllable of speech isn't clipped.
   */
  private startPreListen(userId: string): void {
    if (!this.listening) return;
    if (this.preListenStreams.has(userId)) return; // Already pre-listening

    // Ensure ring buffer exists
    if (!this.ringBuffers.has(userId)) {
      this.ringBuffers.set(userId, new RingBuffer(RING_BUFFER_BYTES));
    }
    const ringBuffer = this.ringBuffers.get(userId)!;

    const opusStream = this.connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.Manual },
    });

    const decoder = new opus.Decoder({
      rate: SAMPLE_RATE,
      channels: CHANNELS,
      frameSize: FRAME_SIZE,
    });

    opusStream.pipe(decoder);

    decoder.on('data', (pcm: Buffer) => {
      ringBuffer.write(pcm);
    });

    // If the stream errors or ends unexpectedly, clean up
    const cleanup = () => {
      this.preListenStreams.delete(userId);
    };
    decoder.on('error', cleanup);
    decoder.on('end', cleanup);
    opusStream.on('error', cleanup);

    this.preListenStreams.set(userId, { stream: opusStream, decoder });
    log.debug('Started pre-listen for user', { userId, ringBufferBytes: RING_BUFFER_BYTES });
  }

  /** Tear down a user's pre-listen subscription (before starting a capture). */
  private stopPreListen(userId: string): void {
    const preListen = this.preListenStreams.get(userId);
    if (!preListen) return;

    preListen.decoder.destroy();
    if ('destroy' in preListen.stream) (preListen.stream as { destroy(): void }).destroy();
    this.preListenStreams.delete(userId);
    log.debug('Stopped pre-listen for user', { userId });
  }

  private subscribeToUser(userId: string): void {
    if (!this.listening) return;

    this.activeStreams.add(userId);

    // Drain the ring buffer (pre-speech audio) before tearing down the pre-listen stream
    const ringBuffer = this.ringBuffers.get(userId);
    const preSpeechPcm = ringBuffer?.drain();
    const hasPreSpeech = preSpeechPcm && preSpeechPcm.length > 0;

    // Tear down pre-listen subscription — receiver.subscribe() replaces existing subscriptions
    this.stopPreListen(userId);

    if (hasPreSpeech) {
      log.debug('Prepending pre-speech buffer', {
        userId,
        preSpeechBytes: preSpeechPcm.length,
        preSpeechMs: Math.round((preSpeechPcm.length / (SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE)) * 1000),
      });
    } else {
      log.debug('Subscribing to user audio (no pre-speech buffer)', { userId, guildId: this.guildId });
    }

    const opusStream = this.connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: SILENCE_DURATION_MS,
      },
    });

    const pcmChunks: Buffer[] = [];
    let totalPcmBytes = 0;

    // Prepend pre-speech audio if we have it
    if (hasPreSpeech) {
      pcmChunks.push(preSpeechPcm);
      totalPcmBytes += preSpeechPcm.length;
    }

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

      // Start pre-listen for next speech (ring buffer captures audio before VAD fires)
      this.startPreListen(userId);

      if (durationMs < MIN_AUDIO_DURATION_MS) {
        log.debug('Audio too short, skipping transcription', { userId, durationMs });
        return;
      }

      // Convert PCM to WAV and transcribe
      const pcm = Buffer.concat(pcmChunks);

      // Check audio energy — skip near-silence to avoid Whisper hallucinations
      const rms = computeRms(pcm);
      if (rms < MIN_RMS_ENERGY) {
        log.debug('Audio energy too low, skipping transcription', { userId, rms: Math.round(rms), durationMs });
        return;
      }

      log.info('Audio stream ended, transcribing', { userId, durationMs: Math.round(durationMs), rms: Math.round(rms) });

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
      // Use a natural conversational prompt that Whisper won't echo back.
      // Avoid phrases like "This is in English" — Whisper hallucinates those on short clips.
      const result = await transcribe({ audio: wav, format: 'wav', prompt: 'Discord voice chat between friends discussing software projects.' });

      const trimmed = result.text.trim();
      if (!trimmed) {
        log.debug('Empty transcription', { userId });
        return;
      }

      // Filter known Whisper hallucination phrases
      const normalized = trimmed.toLowerCase().replace(/[.!?,;:\s]+$/g, '').trim();
      if (WHISPER_HALLUCINATIONS.has(normalized)) {
        log.debug('Filtered Whisper hallucination', { userId, text: trimmed });
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

/**
 * Compute RMS (root mean square) energy of PCM s16le audio.
 * Returns a value roughly in 0-32768 range; typical speech is 1000-8000+.
 */
function computeRms(pcm: Buffer): number {
  const samples = pcm.length / BYTES_PER_SAMPLE;
  if (samples === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < pcm.length; i += BYTES_PER_SAMPLE) {
    const sample = pcm.readInt16LE(i);
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / samples);
}
