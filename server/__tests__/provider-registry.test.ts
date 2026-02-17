import { test, expect, beforeEach, describe } from 'bun:test';
import { LlmProviderRegistry } from '../providers/registry';
import { BaseLlmProvider } from '../providers/base';
import type {
    LlmProviderType,
    ExecutionMode,
    LlmCompletionParams,
    LlmCompletionResult,
    LlmProviderInfo,
} from '../providers/types';

// ─── Mock Provider ───────────────────────────────────────────────────────────

class MockProvider extends BaseLlmProvider {
    readonly type: LlmProviderType;
    readonly executionMode: ExecutionMode;

    constructor(type: LlmProviderType, executionMode: ExecutionMode = 'managed') {
        super();
        this.type = type;
        this.executionMode = executionMode;
    }

    getInfo(): LlmProviderInfo {
        return {
            type: this.type,
            name: `Mock ${this.type}`,
            executionMode: this.executionMode,
            models: ['mock-model'],
            defaultModel: 'mock-model',
            supportsTools: true,
            supportsStreaming: true,
        };
    }

    protected async doComplete(params: LlmCompletionParams): Promise<LlmCompletionResult> {
        return {
            content: 'mock response',
            model: params.model,
            usage: { inputTokens: 10, outputTokens: 5 },
        };
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeParams(overrides: Partial<LlmCompletionParams> = {}): LlmCompletionParams {
    return {
        model: 'mock-model',
        systemPrompt: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
        ...overrides,
    };
}

/**
 * Reset the singleton so each test gets a fresh registry.
 * The private static `instance` field needs to be cleared between tests.
 */
function resetRegistrySingleton(): void {
    // Access via bracket notation to bypass private visibility
    (LlmProviderRegistry as any).instance = null;
}

// ─── LlmProviderRegistry ────────────────────────────────────────────────────

describe('LlmProviderRegistry', () => {
    beforeEach(() => {
        resetRegistrySingleton();
        delete process.env.ENABLED_PROVIDERS;
    });

    // ── Singleton ────────────────────────────────────────────────────────

    describe('getInstance', () => {
        test('returns the same instance on repeated calls', () => {
            const a = LlmProviderRegistry.getInstance();
            const b = LlmProviderRegistry.getInstance();
            expect(a).toBe(b);
        });

        test('returns a new instance after singleton reset', () => {
            const a = LlmProviderRegistry.getInstance();
            resetRegistrySingleton();
            const b = LlmProviderRegistry.getInstance();
            expect(a).not.toBe(b);
        });
    });

    // ── register / get ───────────────────────────────────────────────────

    describe('register', () => {
        test('registers a provider that can be retrieved by type', () => {
            const registry = LlmProviderRegistry.getInstance();
            const provider = new MockProvider('anthropic');
            registry.register(provider);
            expect(registry.get('anthropic')).toBe(provider);
        });

        test('overwrites a provider of the same type', () => {
            const registry = LlmProviderRegistry.getInstance();
            const first = new MockProvider('openai');
            const second = new MockProvider('openai', 'direct');
            registry.register(first);
            registry.register(second);
            expect(registry.get('openai')).toBe(second);
        });

        test('registers multiple providers of different types', () => {
            const registry = LlmProviderRegistry.getInstance();
            const anthropic = new MockProvider('anthropic');
            const openai = new MockProvider('openai');
            const ollama = new MockProvider('ollama', 'direct');
            registry.register(anthropic);
            registry.register(openai);
            registry.register(ollama);
            expect(registry.get('anthropic')).toBe(anthropic);
            expect(registry.get('openai')).toBe(openai);
            expect(registry.get('ollama')).toBe(ollama);
        });
    });

    // ── get ──────────────────────────────────────────────────────────────

    describe('get', () => {
        test('returns undefined for unregistered provider type', () => {
            const registry = LlmProviderRegistry.getInstance();
            expect(registry.get('ollama')).toBeUndefined();
        });
    });

    // ── getAll ───────────────────────────────────────────────────────────

    describe('getAll', () => {
        test('returns empty array when no providers registered', () => {
            const registry = LlmProviderRegistry.getInstance();
            expect(registry.getAll()).toEqual([]);
        });

        test('returns all registered providers', () => {
            const registry = LlmProviderRegistry.getInstance();
            const anthropic = new MockProvider('anthropic');
            const openai = new MockProvider('openai');
            registry.register(anthropic);
            registry.register(openai);
            const all = registry.getAll();
            expect(all).toHaveLength(2);
            expect(all).toContain(anthropic);
            expect(all).toContain(openai);
        });
    });

    // ── getDefault ───────────────────────────────────────────────────────

    describe('getDefault', () => {
        test('returns undefined when no providers registered', () => {
            const registry = LlmProviderRegistry.getInstance();
            expect(registry.getDefault()).toBeUndefined();
        });

        test('returns the first registered provider', () => {
            const registry = LlmProviderRegistry.getInstance();
            const anthropic = new MockProvider('anthropic');
            const openai = new MockProvider('openai');
            registry.register(anthropic);
            registry.register(openai);
            expect(registry.getDefault()).toBe(anthropic);
        });
    });

    // ── ENABLED_PROVIDERS filtering ──────────────────────────────────────

    describe('ENABLED_PROVIDERS env filtering', () => {
        test('registers all providers when ENABLED_PROVIDERS is not set', () => {
            const registry = LlmProviderRegistry.getInstance();
            registry.register(new MockProvider('anthropic'));
            registry.register(new MockProvider('openai'));
            registry.register(new MockProvider('ollama'));
            expect(registry.getAll()).toHaveLength(3);
        });

        test('only registers providers listed in ENABLED_PROVIDERS', () => {
            process.env.ENABLED_PROVIDERS = 'anthropic,ollama';
            const registry = LlmProviderRegistry.getInstance();
            registry.register(new MockProvider('anthropic'));
            registry.register(new MockProvider('openai'));
            registry.register(new MockProvider('ollama'));
            expect(registry.getAll()).toHaveLength(2);
            expect(registry.get('anthropic')).toBeDefined();
            expect(registry.get('openai')).toBeUndefined();
            expect(registry.get('ollama')).toBeDefined();
        });

        test('handles whitespace in ENABLED_PROVIDERS', () => {
            process.env.ENABLED_PROVIDERS = ' anthropic , openai ';
            const registry = LlmProviderRegistry.getInstance();
            registry.register(new MockProvider('anthropic'));
            registry.register(new MockProvider('openai'));
            registry.register(new MockProvider('ollama'));
            expect(registry.getAll()).toHaveLength(2);
            expect(registry.get('anthropic')).toBeDefined();
            expect(registry.get('openai')).toBeDefined();
            expect(registry.get('ollama')).toBeUndefined();
        });

        test('is case-insensitive for ENABLED_PROVIDERS values', () => {
            process.env.ENABLED_PROVIDERS = 'Anthropic,OPENAI';
            const registry = LlmProviderRegistry.getInstance();
            registry.register(new MockProvider('anthropic'));
            registry.register(new MockProvider('openai'));
            expect(registry.getAll()).toHaveLength(2);
        });

        test('registers nothing when ENABLED_PROVIDERS is set but no types match', () => {
            process.env.ENABLED_PROVIDERS = 'ollama';
            const registry = LlmProviderRegistry.getInstance();
            registry.register(new MockProvider('anthropic'));
            registry.register(new MockProvider('openai'));
            expect(registry.getAll()).toHaveLength(0);
        });

        test('single provider in ENABLED_PROVIDERS', () => {
            process.env.ENABLED_PROVIDERS = 'openai';
            const registry = LlmProviderRegistry.getInstance();
            registry.register(new MockProvider('anthropic'));
            registry.register(new MockProvider('openai'));
            registry.register(new MockProvider('ollama'));
            expect(registry.getAll()).toHaveLength(1);
            expect(registry.get('openai')).toBeDefined();
        });
    });
});

// ─── BaseLlmProvider ─────────────────────────────────────────────────────────

describe('BaseLlmProvider', () => {
    // ── Validation ───────────────────────────────────────────────────────

    describe('complete validation', () => {
        test('throws when model is missing', async () => {
            const provider = new MockProvider('anthropic');
            const params = makeParams({ model: '' });
            await expect(provider.complete(params)).rejects.toThrow(
                '[anthropic] model is required',
            );
        });

        test('throws when messages is empty', async () => {
            const provider = new MockProvider('openai');
            const params = makeParams({ messages: [] });
            await expect(provider.complete(params)).rejects.toThrow(
                '[openai] at least one message is required',
            );
        });

        test('throws when messages is undefined', async () => {
            const provider = new MockProvider('ollama');
            const params = makeParams({ messages: undefined as any });
            await expect(provider.complete(params)).rejects.toThrow(
                '[ollama] at least one message is required',
            );
        });

        test('error message includes provider type', async () => {
            const provider = new MockProvider('anthropic');
            try {
                await provider.complete(makeParams({ model: '' }));
                expect(true).toBe(false); // should not reach
            } catch (err) {
                expect((err as Error).message).toContain('[anthropic]');
            }
        });
    });

    // ── Successful completion ────────────────────────────────────────────

    describe('complete success', () => {
        test('delegates to doComplete with valid params', async () => {
            const provider = new MockProvider('anthropic');
            const result = await provider.complete(makeParams());
            expect(result.content).toBe('mock response');
            expect(result.model).toBe('mock-model');
            expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
        });

        test('passes params through to doComplete', async () => {
            const provider = new MockProvider('openai');
            const params = makeParams({ model: 'gpt-4o' });
            const result = await provider.complete(params);
            expect(result.model).toBe('gpt-4o');
        });
    });

    // ── isAvailable ──────────────────────────────────────────────────────

    describe('isAvailable', () => {
        test('returns true by default', async () => {
            const provider = new MockProvider('anthropic');
            expect(await provider.isAvailable()).toBe(true);
        });
    });

    // ── getInfo ──────────────────────────────────────────────────────────

    describe('getInfo', () => {
        test('returns correct provider info', () => {
            const provider = new MockProvider('ollama', 'direct');
            const info = provider.getInfo();
            expect(info.type).toBe('ollama');
            expect(info.name).toBe('Mock ollama');
            expect(info.executionMode).toBe('direct');
            expect(info.models).toEqual(['mock-model']);
            expect(info.defaultModel).toBe('mock-model');
            expect(info.supportsTools).toBe(true);
            expect(info.supportsStreaming).toBe(true);
        });
    });
});
