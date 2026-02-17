import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

describe('TTS', () => {
    test('synthesize throws without OPENAI_API_KEY', async () => {
        const originalKey = process.env.OPENAI_API_KEY;
        delete process.env.OPENAI_API_KEY;

        try {
            const { synthesize } = await import('../voice/tts');
            await expect(synthesize({ text: 'hello', voice: 'alloy' })).rejects.toThrow('OPENAI_API_KEY');
        } finally {
            if (originalKey) process.env.OPENAI_API_KEY = originalKey;
        }
    });

    test('synthesizeWithCache caches results', async () => {
        const { synthesizeWithCache } = await import('../voice/tts');

        // Mock the synthesize function by mocking fetch
        const audioData = Buffer.from('fake-audio-data');
        const originalFetch = globalThis.fetch;
        process.env.OPENAI_API_KEY = 'test-key';

        globalThis.fetch = mock(async () => {
            return new Response(audioData, { status: 200 });
        }) as unknown as typeof fetch;

        try {
            // First call — should call API
            const result1 = await synthesizeWithCache(db, 'hello world', 'alloy');
            expect(result1.audio).toBeDefined();
            expect(result1.format).toBe('mp3');

            // Second call with same text/voice — should use cache
            const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
            const callCountBefore = fetchMock.mock.calls.length;

            const result2 = await synthesizeWithCache(db, 'hello world', 'alloy');
            expect(result2.audio).toBeDefined();

            // fetch should not have been called again
            expect(fetchMock.mock.calls.length).toBe(callCountBefore);

            // Different text — should call API
            const result3 = await synthesizeWithCache(db, 'different text', 'alloy');
            expect(result3.audio).toBeDefined();
            expect(fetchMock.mock.calls.length).toBe(callCountBefore + 1);
        } finally {
            globalThis.fetch = originalFetch;
            delete process.env.OPENAI_API_KEY;
        }
    });

    test('voice_cache table stores entries correctly', () => {
        // Directly insert and verify cache entries
        const id = crypto.randomUUID();
        db.query(
            `INSERT INTO voice_cache (id, text_hash, voice_preset, audio_data, format, duration_ms)
             VALUES (?, ?, ?, ?, ?, ?)`
        ).run(id, 'testhash123', 'alloy', Buffer.from('audio'), 'mp3', 1000);

        const row = db.query('SELECT * FROM voice_cache WHERE id = ?').get(id) as {
            text_hash: string;
            voice_preset: string;
            format: string;
            duration_ms: number;
        };
        expect(row.text_hash).toBe('testhash123');
        expect(row.voice_preset).toBe('alloy');
        expect(row.format).toBe('mp3');
        expect(row.duration_ms).toBe(1000);
    });

    test('voice_cache unique index on text_hash + voice_preset', () => {
        const id1 = crypto.randomUUID();
        const id2 = crypto.randomUUID();
        db.query(
            `INSERT INTO voice_cache (id, text_hash, voice_preset, audio_data, format) VALUES (?, ?, ?, ?, ?)`
        ).run(id1, 'hash1', 'alloy', Buffer.from('a'), 'mp3');

        // Same hash + same voice → should fail (UNIQUE constraint)
        expect(() => {
            db.query(
                `INSERT INTO voice_cache (id, text_hash, voice_preset, audio_data, format) VALUES (?, ?, ?, ?, ?)`
            ).run(id2, 'hash1', 'alloy', Buffer.from('b'), 'mp3');
        }).toThrow();

        // Same hash + different voice → should succeed
        const id3 = crypto.randomUUID();
        db.query(
            `INSERT INTO voice_cache (id, text_hash, voice_preset, audio_data, format) VALUES (?, ?, ?, ?, ?)`
        ).run(id3, 'hash1', 'echo', Buffer.from('c'), 'mp3');
    });
});
