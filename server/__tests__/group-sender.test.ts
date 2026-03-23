/**
 * Tests for AlgoChat group sender — message splitting, prefix parsing,
 * and reassembly of multi-chunk group transactions.
 */
import { test, expect, describe } from 'bun:test';
import {
    splitMessage,
    parseGroupPrefix,
    reassembleGroupMessage,
} from '../algochat/group-sender';

// ─── splitMessage ───────────────────────────────────────────────────────────

describe('splitMessage', () => {
    test('single short message returns one chunk with no prefix', () => {
        const chunks = splitMessage('Hello world', 100);
        expect(chunks).toEqual(['Hello world']);
    });

    test('empty string returns single chunk', () => {
        const chunks = splitMessage('', 100);
        expect(chunks).toEqual(['']);
    });

    test('message exactly at max returns single chunk', () => {
        const msg = 'a'.repeat(100);
        const chunks = splitMessage(msg, 100);
        expect(chunks).toEqual([msg]);
    });

    test('message exceeding max is split into multiple chunks with [GRP:N/M] prefix', () => {
        const msg = 'a'.repeat(200);
        const chunks = splitMessage(msg, 100);
        expect(chunks.length).toBeGreaterThan(1);

        // Each chunk should have [GRP:N/M] prefix
        for (const chunk of chunks) {
            expect(chunk).toMatch(/^\[GRP:\d+\/\d+\]/);
        }

        // First chunk prefix should be [GRP:1/N]
        expect(chunks[0]).toMatch(/^\[GRP:1\//);
    });

    test('chunks reassemble to original message', () => {
        const msg = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
        const chunks = splitMessage(msg, 100);
        expect(chunks.length).toBeGreaterThan(1);

        const reassembled = reassembleGroupMessage(chunks);
        expect(reassembled).toBe(msg);
    });

    test('handles UTF-8 multi-byte characters correctly', () => {
        // Each emoji is 4 bytes in UTF-8
        const msg = '🎉'.repeat(50);
        const chunks = splitMessage(msg, 100);
        expect(chunks.length).toBeGreaterThan(1);

        const reassembled = reassembleGroupMessage(chunks);
        expect(reassembled).toBe(msg);
    });

    test('throws on non-positive maxPayload', () => {
        expect(() => splitMessage('hello', 0)).toThrow('maxPayload must be positive');
        expect(() => splitMessage('hello', -1)).toThrow('maxPayload must be positive');
    });

    test('uses protocol override when provided', () => {
        const proto = { MAX_PAYLOAD_SIZE: 50, TAG_SIZE: 10 };
        const msg = 'a'.repeat(100);
        const chunks = splitMessage(msg, undefined, proto);
        // Max per chunk = 50 - 10 = 40 single, 40 - 13 = 27 multi
        expect(chunks.length).toBeGreaterThan(1);
    });
});

// ─── parseGroupPrefix ───────────────────────────────────────────────────────

describe('parseGroupPrefix', () => {
    test('parses valid [GRP:1/3] prefix', () => {
        const result = parseGroupPrefix('[GRP:1/3]Hello world');
        expect(result).not.toBeNull();
        expect(result!.index).toBe(1);
        expect(result!.total).toBe(3);
        expect(result!.body).toBe('Hello world');
    });

    test('parses double-digit indices', () => {
        const result = parseGroupPrefix('[GRP:12/99]data');
        expect(result).not.toBeNull();
        expect(result!.index).toBe(12);
        expect(result!.total).toBe(99);
        expect(result!.body).toBe('data');
    });

    test('returns null for non-group message', () => {
        expect(parseGroupPrefix('Hello world')).toBeNull();
    });

    test('returns null for empty string', () => {
        expect(parseGroupPrefix('')).toBeNull();
    });

    test('returns null for malformed prefix', () => {
        expect(parseGroupPrefix('[GRP:a/b]data')).toBeNull();
        expect(parseGroupPrefix('[GRP:1]data')).toBeNull();
        expect(parseGroupPrefix('GRP:1/3]data')).toBeNull();
    });

    test('body can be empty', () => {
        const result = parseGroupPrefix('[GRP:1/1]');
        expect(result).not.toBeNull();
        expect(result!.body).toBe('');
    });
});

// ─── reassembleGroupMessage ─────────────────────────────────────────────────

describe('reassembleGroupMessage', () => {
    test('reassembles chunks in correct order', () => {
        const chunks = ['[GRP:3/3]world', '[GRP:1/3]Hello ', '[GRP:2/3]cruel '];
        const result = reassembleGroupMessage(chunks);
        expect(result).toBe('Hello cruel world');
    });

    test('returns null for empty array', () => {
        expect(reassembleGroupMessage([])).toBeNull();
    });

    test('returns null for incomplete set', () => {
        const chunks = ['[GRP:1/3]Hello', '[GRP:3/3]world'];
        // Missing chunk 2/3
        expect(reassembleGroupMessage(chunks)).toBeNull();
    });

    test('returns null for non-group messages', () => {
        expect(reassembleGroupMessage(['Hello', 'world'])).toBeNull();
    });

    test('returns null when indices are not sequential', () => {
        const chunks = ['[GRP:1/3]a', '[GRP:2/3]b', '[GRP:4/3]c'];
        expect(reassembleGroupMessage(chunks)).toBeNull();
    });

    test('handles single-chunk group', () => {
        const result = reassembleGroupMessage(['[GRP:1/1]Hello world']);
        expect(result).toBe('Hello world');
    });

    test('handles large number of chunks', () => {
        const chunks: string[] = [];
        const total = 20;
        for (let i = 1; i <= total; i++) {
            chunks.push(`[GRP:${i}/${total}]chunk${i}`);
        }
        // Shuffle to test ordering
        chunks.reverse();
        const result = reassembleGroupMessage(chunks);
        expect(result).toBeTruthy();
        for (let i = 1; i <= total; i++) {
            expect(result).toContain(`chunk${i}`);
        }
    });
});
