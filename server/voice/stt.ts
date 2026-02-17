import type { STTOptions, STTResult } from './types';
import { createLogger } from '../lib/logger';

const log = createLogger('STT');

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB — OpenAI Whisper limit

const FORMAT_MIME: Record<string, string> = {
    ogg: 'audio/ogg',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    webm: 'audio/webm',
};

/**
 * Transcribe audio to text using OpenAI Whisper API.
 * Requires OPENAI_API_KEY environment variable.
 */
export async function transcribe(options: STTOptions): Promise<STTResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required for speech-to-text');
    }

    if (options.audio.length > MAX_AUDIO_SIZE) {
        throw new Error(`Audio file too large (${Math.round(options.audio.length / 1024 / 1024)} MB). Maximum is 25 MB.`);
    }

    const format = options.format ?? 'ogg';
    const mimeType = FORMAT_MIME[format] ?? 'audio/ogg';
    const filename = `audio.${format}`;

    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(options.audio)], { type: mimeType }), filename);
    formData.append('model', 'whisper-1');
    if (options.language) {
        formData.append('language', options.language);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const error = await response.text();
        log.error('OpenAI Whisper API error', { status: response.status, error });
        throw new Error(`Speech-to-text failed (status ${response.status})`);
    }

    const result = await response.json() as { text: string };
    log.info('STT transcription complete', { textLength: result.text.length, format });

    return { text: result.text };
}
