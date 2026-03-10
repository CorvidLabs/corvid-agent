import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { condenseMessage } from '../algochat/condenser';
import { LlmProviderRegistry } from '../providers/registry';
import type { LlmProvider, LlmProviderInfo, LlmCompletionParams, LlmCompletionResult } from '../providers/types';

// Save and restore the singleton so we don't pollute other tests
let savedInstance: LlmProviderRegistry | null = null;
let mockCompleteFn: (params: LlmCompletionParams) => Promise<LlmCompletionResult>;

function resetRegistry() {
    savedInstance = (LlmProviderRegistry as unknown as { instance: LlmProviderRegistry | null }).instance;
    (LlmProviderRegistry as unknown as { instance: null }).instance = null;
}

function restoreRegistry() {
    if (savedInstance !== null) {
        (LlmProviderRegistry as unknown as { instance: LlmProviderRegistry | null }).instance = savedInstance;
        savedInstance = null;
    }
}

function registerMockProvider() {
    // Set API keys so registry doesn't auto-restrict to ollama
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-dummy';

    const registry = LlmProviderRegistry.getInstance();
    const mockProvider: LlmProvider = {
        type: 'anthropic',
        executionMode: 'managed' as const,
        getInfo: () => ({
            type: 'anthropic' as const,
            name: 'Mock',
            executionMode: 'managed' as const,
            models: ['test-model'],
            defaultModel: 'test-model',
            supportsTools: true,
            supportsStreaming: true,
        }) as LlmProviderInfo,
        complete: (params: LlmCompletionParams) => mockCompleteFn(params),
        isAvailable: async () => true,
    };
    registry.register(mockProvider);
}

describe('condenseMessage', () => {
    beforeEach(() => {
        resetRegistry();
        mockCompleteFn = async () => ({ content: 'condensed summary', model: 'test-model' });
        registerMockProvider();
    });

    afterAll(() => {
        restoreRegistry();
        delete process.env.ANTHROPIC_API_KEY;
    });

    it('returns original content when within byte limit', async () => {
        const result = await condenseMessage('Short message', 800);
        expect(result.wasCondensed).toBe(false);
        expect(result.content).toBe('Short message');
        expect(result.originalBytes).toBe(new TextEncoder().encode('Short message').byteLength);
        expect(result.condensedBytes).toBe(result.originalBytes);
    });

    it('condenses content that exceeds the byte limit', async () => {
        const longContent = 'A'.repeat(1000);
        const result = await condenseMessage(longContent, 100);
        expect(result.wasCondensed).toBe(true);
        expect(result.content).toContain('[condensed]');
        expect(result.content).toContain('condensed summary');
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
        mockCompleteFn = async () => ({ content: 'A'.repeat(500), model: 'test-model' });
        const longContent = 'B'.repeat(1000);
        const result = await condenseMessage(longContent, 50);
        expect(result.wasCondensed).toBe(true);
        expect(result.content).toContain('[condensed]');
        expect(result.content).toContain('...');
    });

    it('falls back to truncation when all providers fail', async () => {
        mockCompleteFn = async () => { throw new Error('Provider unavailable'); };
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
