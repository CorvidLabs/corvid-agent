import { describe, test, expect } from 'bun:test';
import { splitMessage, parseGroupPrefix, reassembleGroupMessage } from '../algochat/group-sender';

describe('splitMessage', () => {
    test('returns single chunk for short messages', () => {
        const result = splitMessage('Hello world');
        expect(result).toEqual(['Hello world']);
    });

    test('does not add prefix for single-chunk messages', () => {
        const result = splitMessage('Short message');
        expect(result.length).toBe(1);
        expect(result[0]).not.toContain('[GRP:');
    });

    test('splits long messages into multiple chunks with group prefixes', () => {
        // Create a message that exceeds the single-chunk limit
        const longMessage = 'A'.repeat(2000);
        const result = splitMessage(longMessage);
        expect(result.length).toBeGreaterThan(1);
        // Each chunk should have a group prefix
        for (const chunk of result) {
            expect(chunk).toMatch(/^\[GRP:\d+\/\d+\]/);
        }
    });

    test('group prefix indices are sequential starting from 1', () => {
        const longMessage = 'B'.repeat(2000);
        const result = splitMessage(longMessage);
        for (let i = 0; i < result.length; i++) {
            const parsed = parseGroupPrefix(result[i]);
            expect(parsed).not.toBeNull();
            expect(parsed!.index).toBe(i + 1);
            expect(parsed!.total).toBe(result.length);
        }
    });

    test('respects custom maxPayload parameter', () => {
        const message = 'Hello World! This is a test message.';
        // Use a very small payload to force splitting
        const result = splitMessage(message, 15);
        expect(result.length).toBeGreaterThan(1);
    });

    test('throws on non-positive maxPayload', () => {
        expect(() => splitMessage('hello', 0)).toThrow('maxPayload must be positive');
        expect(() => splitMessage('hello', -1)).toThrow('maxPayload must be positive');
    });

    test('split messages can be reassembled to original content', () => {
        const original = 'X'.repeat(2000);
        const chunks = splitMessage(original);
        const reassembled = reassembleGroupMessage(chunks);
        expect(reassembled).toBe(original);
    });

    test('handles multi-byte UTF-8 characters without corrupting', () => {
        // Each emoji is 4 bytes; create string that must be split
        const message = '🚀'.repeat(500);
        const result = splitMessage(message);
        // Reassemble and verify no corruption
        const reassembled = reassembleGroupMessage(result);
        expect(reassembled).toBe(message);
    });

    test('handles empty string', () => {
        const result = splitMessage('');
        expect(result).toEqual(['']);
    });
});

describe('parseGroupPrefix', () => {
    test('parses valid group prefix', () => {
        const result = parseGroupPrefix('[GRP:1/3]Hello world');
        expect(result).toEqual({ index: 1, total: 3, body: 'Hello world' });
    });

    test('parses two-digit indices', () => {
        const result = parseGroupPrefix('[GRP:12/99]content');
        expect(result).toEqual({ index: 12, total: 99, body: 'content' });
    });

    test('returns null for non-group message', () => {
        expect(parseGroupPrefix('Hello world')).toBeNull();
    });

    test('returns null for malformed prefix', () => {
        expect(parseGroupPrefix('[GRP:a/b]content')).toBeNull();
        expect(parseGroupPrefix('[GRP:]content')).toBeNull();
        expect(parseGroupPrefix('GRP:1/3]content')).toBeNull();
    });

    test('returns body correctly with empty body', () => {
        const result = parseGroupPrefix('[GRP:1/1]');
        expect(result).toEqual({ index: 1, total: 1, body: '' });
    });

    test('prefix must be at start of string', () => {
        expect(parseGroupPrefix('xxx[GRP:1/3]body')).toBeNull();
    });
});

describe('reassembleGroupMessage', () => {
    test('reassembles chunks in order', () => {
        const chunks = [
            '[GRP:1/3]Hello ',
            '[GRP:2/3]beautiful ',
            '[GRP:3/3]world',
        ];
        expect(reassembleGroupMessage(chunks)).toBe('Hello beautiful world');
    });

    test('reassembles chunks regardless of input order', () => {
        const chunks = [
            '[GRP:3/3]world',
            '[GRP:1/3]Hello ',
            '[GRP:2/3]beautiful ',
        ];
        expect(reassembleGroupMessage(chunks)).toBe('Hello beautiful world');
    });

    test('returns null for empty array', () => {
        expect(reassembleGroupMessage([])).toBeNull();
    });

    test('returns null for non-group messages', () => {
        expect(reassembleGroupMessage(['Hello', 'World'])).toBeNull();
    });

    test('returns null for incomplete set', () => {
        const chunks = [
            '[GRP:1/3]Hello ',
            '[GRP:3/3]world',
            // Missing chunk 2
        ];
        expect(reassembleGroupMessage(chunks)).toBeNull();
    });

    test('returns null when total does not match count', () => {
        const chunks = [
            '[GRP:1/5]Hello ',
            '[GRP:2/5]World',
        ];
        expect(reassembleGroupMessage(chunks)).toBeNull();
    });

    test('returns null for duplicate indices', () => {
        const chunks = [
            '[GRP:1/2]Hello ',
            '[GRP:1/2]World',
        ];
        // Two chunks claim to be 1/2 — after sort, indices are [1,1] not [1,2]
        expect(reassembleGroupMessage(chunks)).toBeNull();
    });

    test('handles single-chunk group message', () => {
        const chunks = ['[GRP:1/1]Complete message'];
        expect(reassembleGroupMessage(chunks)).toBe('Complete message');
    });
});
