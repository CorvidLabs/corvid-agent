import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { condenseMessage } from '../algochat/condenser';

// Mock the provider registry
const mockComplete = mock(() => Promise.resolve({ content: 'condensed summary' }));

mock.module('../providers/registry', () => ({
    LlmProviderRegistry: {
        getInstance: () => ({
            getDefault: () => ({
                type: 'mock',
                complete: mockComplete,
                getInfo: () => ({ defaultModel: 'test-model' }),
            }),
            getAll: () => [{
                type: 'mock',
                complete: mockComplete,
                getInfo: () => ({ defaultModel: 'test-model' }),
            }],
        }),
    },
}));

describe('condenseMessage', () => {
    beforeEach(() => {
        mockComplete.mockClear();
        mockComplete.mockResolvedValue({ content: 'condensed summary' });
    });

    it('returns original content when within byte limit', async () => {
        const result = await condenseMessage('Short message', 800);
        expect(result.wasCondensed).toBe(false);
        expect(result.content).toBe('Short message');
        expect(result.originalBytes).toBe(new TextEncoder().encode('Short message').byteLength);
        expect(result.condensedBytes).toBe(result.originalBytes);
        expect(mockComplete).not.toHaveBeenCalled();
    });

    it('condenses content that exceeds the byte limit', async () => {
        const longContent = 'A'.repeat(1000);
        const result = await condenseMessage(longContent, 100);
        expect(result.wasCondensed).toBe(true);
        expect(result.content).toContain('[condensed]');
        expect(result.content).toContain('condensed summary');
        expect(mockComplete).toHaveBeenCalledTimes(1);
    });

    it('appends message ID reference when provided', async () => {
        const longContent = 'A'.repeat(1000);
        const result = await condenseMessage(longContent, 100, 'msg-abcdef1234567890');
        expect(result.wasCondensed).toBe(true);
        expect(result.content).toContain('[full:');
        expect(result.content).toContain('id:msg-abcd');
    });

    it('uses default maxBytes of 800', async () => {
        const shortContent = 'A'.repeat(100);
        const result = await condenseMessage(shortContent);
        expect(result.wasCondensed).toBe(false);
    });

    it('truncates when LLM output still exceeds limit', async () => {
        mockComplete.mockResolvedValue({ content: 'A'.repeat(500) });
        const longContent = 'B'.repeat(1000);
        const result = await condenseMessage(longContent, 50);
        expect(result.wasCondensed).toBe(true);
        expect(result.content).toContain('[condensed]');
        expect(result.content).toContain('...');
    });

    it('falls back to truncation when all providers fail', async () => {
        mockComplete.mockRejectedValue(new Error('Provider unavailable'));
        const longContent = 'A'.repeat(1000);
        const result = await condenseMessage(longContent, 100);
        expect(result.wasCondensed).toBe(true);
        expect(result.content).toContain('...');
        expect(result.originalBytes).toBe(1000);
    });

    it('handles UTF-8 multi-byte content correctly', async () => {
        const emoji = '🎉'.repeat(300); // ~1200 bytes
        const result = await condenseMessage(emoji, 800);
        expect(result.wasCondensed).toBe(true);
        expect(result.originalBytes).toBe(new TextEncoder().encode(emoji).byteLength);
    });

    it('returns correct byte counts', async () => {
        const result = await condenseMessage('Hello world', 800);
        expect(result.originalBytes).toBe(11);
        expect(result.condensedBytes).toBe(11);
    });
});
