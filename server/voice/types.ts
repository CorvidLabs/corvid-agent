import type { VoicePreset } from '../../shared/types';

export interface TTSOptions {
    text: string;
    voice: VoicePreset;
    model?: string;
    speed?: number;
}

export interface TTSResult {
    audio: Buffer;
    format: 'mp3';
    durationMs: number;
}

export interface STTOptions {
    audio: Buffer;
    format?: 'ogg' | 'mp3' | 'wav' | 'webm';
    language?: string;
    /** Optional prompt to guide Whisper transcription style and language detection. */
    prompt?: string;
}

export interface STTResult {
    text: string;
}
