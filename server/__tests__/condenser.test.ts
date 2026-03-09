import { describe, test, expect } from 'bun:test';
import { condenseMessage } from '../algochat/condenser';

describe('condenseMessage', () => {
    test('returns original content when within byte limit', async () => {
        const result = await condenseMessage('Hello world', 800);
        expect(result).toEqual({
            content: 'Hello world',
            wasCondensed: false,
            originalBytes: new TextEncoder().encode('Hello world').byteLength,
            condensedBytes: new TextEncoder().encode('Hello world').byteLength,
        });
    });

    test('marks wasCondensed as false for short content', async () => {
        const result = await condenseMessage('Short');
        expect(result.wasCondensed).toBe(false);
    });

    test('returns original content when exactly at limit', async () => {
        const content = 'A'.repeat(800);
        const result = await condenseMessage(content, 800);
        expect(result.wasCondensed).toBe(false);
        expect(result.content).toBe(content);
    });

    test('records correct originalBytes for multi-byte UTF-8', async () => {
        // Each emoji is 4 bytes in UTF-8
        const content = '🚀🚀'; // 8 bytes
        const result = await condenseMessage(content, 800);
        expect(result.originalBytes).toBe(8);
        expect(result.wasCondensed).toBe(false);
    });

    test('uses default maxBytes of 800 when not specified', async () => {
        // Content within 800 bytes should not be condensed
        const content = 'A'.repeat(799);
        const result = await condenseMessage(content);
        expect(result.wasCondensed).toBe(false);
    });

    test('content exceeding limit is condensed (falls back to truncation)', async () => {
        // With no LLM providers registered, it should fall back to truncation
        const longContent = 'A'.repeat(1000);
        const result = await condenseMessage(longContent, 200);
        expect(result.wasCondensed).toBe(true);
        expect(result.originalBytes).toBe(1000);
        // Condensed output should fit within a reasonable range
        expect(result.condensedBytes).toBeLessThanOrEqual(250); // some overhead from reference suffix
    });

    test('condensed output ends with ... when truncated', async () => {
        const longContent = 'B'.repeat(1000);
        const result = await condenseMessage(longContent, 200);
        expect(result.content).toContain('...');
    });

    test('includes message ID reference in condensed output', async () => {
        const longContent = 'C'.repeat(1000);
        const result = await condenseMessage(longContent, 200, 'abcdef1234567890');
        expect(result.content).toContain('id:abcdef12');
    });

    test('includes original byte count reference in condensed output', async () => {
        const longContent = 'D'.repeat(1000);
        const result = await condenseMessage(longContent, 200, 'abcdef1234567890');
        expect(result.content).toContain('full: 1000B');
    });

    test('handles empty content', async () => {
        const result = await condenseMessage('', 800);
        expect(result.wasCondensed).toBe(false);
        expect(result.content).toBe('');
        expect(result.originalBytes).toBe(0);
    });
});
