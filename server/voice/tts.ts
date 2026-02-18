import type { Database } from 'bun:sqlite';
import type { VoicePreset } from '../../shared/types';
import type { TTSOptions, TTSResult } from './types';
import { createLogger } from '../lib/logger';

const log = createLogger('TTS');

const MAX_TTS_TEXT_LENGTH = 4096;
const MAX_VOICE_CACHE_ENTRIES = 10_000;

/**
 * Synthesize text to speech using OpenAI TTS API.
 * Requires OPENAI_API_KEY environment variable.
 */
export async function synthesize(options: TTSOptions): Promise<TTSResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required for text-to-speech');
    }

    if (options.text.length > MAX_TTS_TEXT_LENGTH) {
        throw new Error(`TTS text exceeds maximum length of ${MAX_TTS_TEXT_LENGTH} characters`);
    }

    if (!options.text.trim()) {
        throw new Error('TTS text must not be empty');
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: options.model ?? 'tts-1',
            input: options.text,
            voice: options.voice,
            response_format: 'mp3',
            speed: options.speed ?? 1.0,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        log.error('OpenAI TTS API error', { status: response.status, error });
        throw new Error(`Text-to-speech failed (status ${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audio = Buffer.from(arrayBuffer);

    // Rough estimate: MP3 at 128kbps → 16KB/sec → durationMs = bytes / 16 * 1000
    const estimatedDurationMs = Math.round((audio.length / 16000) * 1000);

    return {
        audio,
        format: 'mp3',
        durationMs: estimatedDurationMs,
    };
}

/**
 * Hash text for cache lookup.
 */
function hashText(text: string): string {
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(text);
    return hasher.digest('hex');
}

/**
 * Synthesize text with caching — checks voice_cache table first.
 */
export async function synthesizeWithCache(
    db: Database,
    text: string,
    voice: VoicePreset,
): Promise<TTSResult> {
    const textHash = hashText(text);

    // Check cache
    const cached = db.query(
        'SELECT audio_data, format, duration_ms FROM voice_cache WHERE text_hash = ? AND voice_preset = ?'
    ).get(textHash, voice) as { audio_data: Buffer; format: string; duration_ms: number } | null;

    if (cached) {
        log.info('TTS cache hit', { textHash: textHash.slice(0, 8), voice });
        return {
            audio: Buffer.from(cached.audio_data),
            format: cached.format as 'mp3',
            durationMs: cached.duration_ms,
        };
    }

    // Synthesize
    const result = await synthesize({ text, voice });

    // Cache result
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO voice_cache (id, text_hash, voice_preset, audio_data, format, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, textHash, voice, result.audio, result.format, result.durationMs);

    // Evict oldest entries if cache exceeds max size
    const countRow = db.query('SELECT COUNT(*) as cnt FROM voice_cache').get() as { cnt: number };
    if (countRow.cnt > MAX_VOICE_CACHE_ENTRIES) {
        const excess = countRow.cnt - MAX_VOICE_CACHE_ENTRIES;
        db.query('DELETE FROM voice_cache WHERE id IN (SELECT id FROM voice_cache ORDER BY created_at ASC LIMIT ?)').run(excess);
        log.info('Voice cache evicted old entries', { evicted: excess });
    }

    log.info('TTS synthesized and cached', { textHash: textHash.slice(0, 8), voice, bytes: result.audio.length });
    return result;
}
