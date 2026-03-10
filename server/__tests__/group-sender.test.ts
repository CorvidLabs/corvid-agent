import { describe, it, expect } from 'bun:test';
import { splitMessage, parseGroupPrefix, reassembleGroupMessage } from '../algochat/group-sender';

describe('splitMessage', () => {
    it('returns a single chunk for short messages', () => {
        const result = splitMessage('Hello');
        expect(result).toEqual(['Hello']);
    });

    it('does not add group prefix for single-chunk messages', () => {
        const result = splitMessage('Short message');
        expect(result.length).toBe(1);
        expect(result[0]).not.toContain('[GRP:');
    });

    it('splits long messages into multiple chunks with group prefixes', () => {
        // Force small payload to test splitting
        const content = 'A'.repeat(100);
        const result = splitMessage(content, 30);
        expect(result.length).toBeGreaterThan(1);
        // Each chunk should have a group prefix
        for (const chunk of result) {
            expect(chunk).toMatch(/^\[GRP:\d+\/\d+\]/);
        }
    });

    it('prefixes chunks with [GRP:N/M] format', () => {
        const content = 'A'.repeat(100);
        const result = splitMessage(content, 30);
        const total = result.length;
        for (let i = 0; i < result.length; i++) {
            expect(result[i]).toContain(`[GRP:${i + 1}/${total}]`);
        }
    });

    it('round-trips via reassembleGroupMessage', () => {
        const original = 'Hello, this is a moderately long message that should be split into multiple chunks for transmission.';
        const chunks = splitMessage(original, 30);
        expect(chunks.length).toBeGreaterThan(1);
        const reassembled = reassembleGroupMessage(chunks);
        expect(reassembled).toBe(original);
    });

    it('handles UTF-8 multi-byte characters without corruption', () => {
        const content = '🎉'.repeat(50); // Each emoji is 4 bytes
        const chunks = splitMessage(content, 30);
        const reassembled = reassembleGroupMessage(chunks);
        expect(reassembled).toBe(content);
    });

    it('handles mixed ASCII and multi-byte characters', () => {
        const content = 'Hello 世界! '.repeat(20);
        const chunks = splitMessage(content, 40);
        const reassembled = reassembleGroupMessage(chunks);
        expect(reassembled).toBe(content);
    });

    it('throws on non-positive maxPayload', () => {
        expect(() => splitMessage('test', 0)).toThrow('maxPayload must be positive');
        expect(() => splitMessage('test', -1)).toThrow('maxPayload must be positive');
    });

    it('handles empty string', () => {
        const result = splitMessage('');
        expect(result).toEqual(['']);
    });
});

describe('parseGroupPrefix', () => {
    it('parses a valid group prefix', () => {
        const result = parseGroupPrefix('[GRP:1/3]Hello world');
        expect(result).toEqual({ index: 1, total: 3, body: 'Hello world' });
    });

    it('parses two-digit indices', () => {
        const result = parseGroupPrefix('[GRP:12/99]Body text');
        expect(result).toEqual({ index: 12, total: 99, body: 'Body text' });
    });

    it('returns null for messages without group prefix', () => {
        expect(parseGroupPrefix('Hello world')).toBeNull();
        expect(parseGroupPrefix('')).toBeNull();
    });

    it('returns null for prefix not at start of string', () => {
        expect(parseGroupPrefix('Some text [GRP:1/3]Hello')).toBeNull();
    });

    it('handles empty body after prefix', () => {
        const result = parseGroupPrefix('[GRP:1/1]');
        expect(result).toEqual({ index: 1, total: 1, body: '' });
    });

    it('preserves body content exactly', () => {
        const body = '  spaces and [brackets] and 日本語  ';
        const result = parseGroupPrefix(`[GRP:2/5]${body}`);
        expect(result).toEqual({ index: 2, total: 5, body });
    });
});

describe('reassembleGroupMessage', () => {
    it('reassembles chunks in order', () => {
        const chunks = [
            '[GRP:1/3]Hello ',
            '[GRP:2/3]world ',
            '[GRP:3/3]!!!',
        ];
        expect(reassembleGroupMessage(chunks)).toBe('Hello world !!!');
    });

    it('reassembles chunks regardless of input order', () => {
        const chunks = [
            '[GRP:3/3]!!!',
            '[GRP:1/3]Hello ',
            '[GRP:2/3]world ',
        ];
        expect(reassembleGroupMessage(chunks)).toBe('Hello world !!!');
    });

    it('returns null for empty array', () => {
        expect(reassembleGroupMessage([])).toBeNull();
    });

    it('returns null for incomplete set of chunks', () => {
        const chunks = [
            '[GRP:1/3]Hello ',
            '[GRP:3/3]!!!',
            // Missing chunk 2
        ];
        expect(reassembleGroupMessage(chunks)).toBeNull();
    });

    it('returns null if chunk indices have gaps', () => {
        const chunks = [
            '[GRP:1/3]Hello ',
            '[GRP:2/3]world ',
            '[GRP:4/3]!!!', // Invalid: index > total
        ];
        // total = 3 but index 4 present — gap at position 3
        expect(reassembleGroupMessage(chunks)).toBeNull();
    });

    it('returns null for non-group messages', () => {
        const chunks = ['Hello', 'world'];
        expect(reassembleGroupMessage(chunks)).toBeNull();
    });

    it('handles single-chunk group message', () => {
        const chunks = ['[GRP:1/1]Complete message'];
        expect(reassembleGroupMessage(chunks)).toBe('Complete message');
    });

    it('returns null when total count does not match actual chunks', () => {
        const chunks = [
            '[GRP:1/2]Hello ',
            '[GRP:2/2]world',
            '[GRP:1/2]duplicate',
        ];
        // 3 chunks but total says 2 — the filter passes all 3 parsed, but length != total
        expect(reassembleGroupMessage(chunks)).toBeNull();
    });
});
