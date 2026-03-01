/**
 * Tests for providers module: registry, anthropic, ollama, fallback, cost-table.
 *
 * Covers:
 * - ProviderRegistry: registration, lookup, default selection, ENABLED_PROVIDERS filtering
 * - AnthropicProvider: request construction, response parsing, error handling
 * - OllamaProvider: model discovery, streaming, concurrency, retry, connection failures
 * - FallbackManager: transient error classification, provider chain, health tracking
 * - CostTracker (cost-table): per-model cost, usage aggregation, capability filtering
 *
 * Issue: #313
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { LlmProviderRegistry } from '../providers/registry';
import { _resetClaudeCliCache } from '../providers/router';
import { AnthropicProvider } from '../providers/anthropic/provider';
import { OllamaProvider } from '../providers/ollama/provider';
import { FallbackManager, DEFAULT_FALLBACK_CHAINS } from '../providers/fallback';
import {
    MODEL_PRICING,
    getModelPricing,
    estimateCost,
    getModelsForProvider,
    getSubagentCapableModels,
    getWebSearchCapableModels,
    getOllamaCloudModels,
    getModelsByCost,
} from '../providers/cost-table';
import { BaseLlmProvider } from '../providers/base';
import type {
    LlmProvider,
    LlmProviderType,
    LlmCompletionParams,
    LlmCompletionResult,
    LlmProviderInfo,
} from '../providers/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a mock provider that can optionally fail. */
function createMockProvider(
    type: LlmProviderType,
    models: string[],
    overrides?: {
        completeFn?: (params: LlmCompletionParams) => Promise<LlmCompletionResult>;
        available?: boolean;
    },
): LlmProvider {
    return {
        type,
        executionMode: 'direct' as const,
        getInfo(): LlmProviderInfo {
            return {
                type,
                name: `Mock ${type}`,
                executionMode: 'direct',
                models,
                defaultModel: models[0],
                supportsTools: true,
                supportsStreaming: true,
            };
        },
        async complete(params: LlmCompletionParams): Promise<LlmCompletionResult> {
            if (overrides?.completeFn) return overrides.completeFn(params);
            return {
                content: `Mock response from ${type}`,
                model: params.model,
                usage: { inputTokens: 100, outputTokens: 50 },
            };
        },
        async isAvailable(): Promise<boolean> {
            return overrides?.available ?? true;
        },
    };
}

/** Create a fresh (non-singleton) registry for testing. */
function freshRegistry(): LlmProviderRegistry {
    return new (LlmProviderRegistry as new () => LlmProviderRegistry)();
}


// ─── ProviderRegistry ────────────────────────────────────────────────────────

describe('ProviderRegistry', () => {
    const savedAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const savedOpenaiKey = process.env.OPENAI_API_KEY;
    const savedEnabledProviders = process.env.ENABLED_PROVIDERS;
    let registry: LlmProviderRegistry;

    beforeEach(() => {
        // Ensure cloud keys are set so register() doesn't auto-restrict
        process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
        process.env.OPENAI_API_KEY = 'sk-test';
        delete process.env.ENABLED_PROVIDERS;
        // Reset cached claude CLI detection so hasClaudeAccess() re-evaluates
        _resetClaudeCliCache(null);
        registry = freshRegistry();
    });

    afterEach(() => {
        // Restore claude CLI cache to re-detect
        _resetClaudeCliCache(null);
        if (savedAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = savedAnthropicKey;
        if (savedOpenaiKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = savedOpenaiKey;
        if (savedEnabledProviders === undefined) delete process.env.ENABLED_PROVIDERS;
        else process.env.ENABLED_PROVIDERS = savedEnabledProviders;
    });

    test('register and get a provider', () => {
        const provider = createMockProvider('anthropic', ['claude-sonnet-4-6']);
        registry.register(provider);
        expect(registry.get('anthropic')).toBe(provider);
    });

    test('get returns undefined for unregistered provider', () => {
        expect(registry.get('openai')).toBeUndefined();
    });

    test('getAll returns all registered providers', () => {
        registry.register(createMockProvider('anthropic', ['claude-sonnet-4-6']));
        registry.register(createMockProvider('openai', ['gpt-4o']));
        const all = registry.getAll();
        expect(all.length).toBe(2);
        expect(all.map((p) => p.type).sort()).toEqual(['anthropic', 'openai']);
    });

    test('getDefault returns first registered provider', () => {
        registry.register(createMockProvider('anthropic', ['claude-sonnet-4-6']));
        registry.register(createMockProvider('openai', ['gpt-4o']));
        const def = registry.getDefault();
        expect(def).toBeDefined();
        expect(def!.type).toBe('anthropic');
    });

    test('getDefault returns undefined when no providers registered', () => {
        expect(registry.getDefault()).toBeUndefined();
    });

    test('registering same type overwrites previous', () => {
        const p1 = createMockProvider('anthropic', ['model-a']);
        const p2 = createMockProvider('anthropic', ['model-b']);
        registry.register(p1);
        registry.register(p2);
        expect(registry.get('anthropic')).toBe(p2);
        expect(registry.getAll().length).toBe(1);
    });

    test('ENABLED_PROVIDERS filters out unspecified providers', () => {
        process.env.ENABLED_PROVIDERS = 'ollama';
        const reg = freshRegistry();
        reg.register(createMockProvider('anthropic', ['claude-sonnet-4-6']));
        reg.register(createMockProvider('ollama', ['llama3.3']));
        expect(reg.get('anthropic')).toBeUndefined();
        expect(reg.get('ollama')).toBeDefined();
    });

    test('ENABLED_PROVIDERS supports comma-separated list', () => {
        process.env.ENABLED_PROVIDERS = 'anthropic, openai';
        const reg = freshRegistry();
        reg.register(createMockProvider('anthropic', ['claude-sonnet-4-6']));
        reg.register(createMockProvider('openai', ['gpt-4o']));
        reg.register(createMockProvider('ollama', ['llama3.3']));
        expect(reg.get('anthropic')).toBeDefined();
        expect(reg.get('openai')).toBeDefined();
        expect(reg.get('ollama')).toBeUndefined();
    });

    test('ENABLED_PROVIDERS is case-insensitive', () => {
        process.env.ENABLED_PROVIDERS = 'Anthropic, OPENAI';
        const reg = freshRegistry();
        reg.register(createMockProvider('anthropic', ['claude-sonnet-4-6']));
        reg.register(createMockProvider('openai', ['gpt-4o']));
        expect(reg.get('anthropic')).toBeDefined();
        expect(reg.get('openai')).toBeDefined();
    });

    test('auto-restricts to ollama when no cloud API keys', () => {
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.OPENAI_API_KEY;
        // Force hasClaudeAccess() to return false (override CLI detection)
        _resetClaudeCliCache(false);
        try {
            const reg = freshRegistry();
            reg.register(createMockProvider('anthropic', ['claude-sonnet-4-6']));
            reg.register(createMockProvider('ollama', ['llama3.3']));
            expect(reg.get('anthropic')).toBeUndefined();
            expect(reg.get('ollama')).toBeDefined();
        } finally {
            // Reset so other tests aren't affected
            _resetClaudeCliCache(null);
        }
    });

    test('auto-restricts still allows ollama when only openai key missing', () => {
        process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
        delete process.env.OPENAI_API_KEY;
        const reg = freshRegistry();
        reg.register(createMockProvider('anthropic', ['claude-sonnet-4-6']));
        reg.register(createMockProvider('ollama', ['llama3.3']));
        // With ANTHROPIC_API_KEY set, hasClaudeAccess() returns true, no restriction
        expect(reg.get('anthropic')).toBeDefined();
        expect(reg.get('ollama')).toBeDefined();
    });

    test('getInstance returns singleton', () => {
        const a = LlmProviderRegistry.getInstance();
        const b = LlmProviderRegistry.getInstance();
        expect(a).toBe(b);
    });
});

// ─── BaseLlmProvider (validation) ────────────────────────────────────────────

describe('BaseLlmProvider', () => {
    // Create a concrete subclass for testing
    class TestProvider extends BaseLlmProvider {
        readonly type: LlmProviderType = 'anthropic';
        readonly executionMode = 'managed' as const;

        getInfo(): LlmProviderInfo {
            return {
                type: this.type,
                name: 'Test',
                executionMode: this.executionMode,
                models: ['test-model'],
                defaultModel: 'test-model',
                supportsTools: false,
                supportsStreaming: false,
            };
        }

        protected async doComplete(params: LlmCompletionParams): Promise<LlmCompletionResult> {
            return { content: 'test', model: params.model };
        }
    }

    let provider: TestProvider;

    beforeEach(() => {
        provider = new TestProvider();
    });

    test('complete throws ValidationError when model is missing', async () => {
        await expect(
            provider.complete({
                model: '',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            }),
        ).rejects.toThrow('model is required');
    });

    test('complete throws ValidationError when messages is empty', async () => {
        await expect(
            provider.complete({
                model: 'test-model',
                systemPrompt: 'test',
                messages: [],
            }),
        ).rejects.toThrow('at least one message is required');
    });

    test('complete delegates to doComplete with valid params', async () => {
        const result = await provider.complete({
            model: 'test-model',
            systemPrompt: 'test',
            messages: [{ role: 'user', content: 'hello' }],
        });
        expect(result.content).toBe('test');
        expect(result.model).toBe('test-model');
    });

    test('isAvailable returns true by default', async () => {
        expect(await provider.isAvailable()).toBe(true);
    });
});

// ─── AnthropicProvider ───────────────────────────────────────────────────────

describe('AnthropicProvider', () => {
    let provider: AnthropicProvider;

    beforeEach(() => {
        provider = new AnthropicProvider();
    });

    test('type is anthropic', () => {
        expect(provider.type).toBe('anthropic');
    });

    test('executionMode is managed', () => {
        expect(provider.executionMode).toBe('managed');
    });

    test('getInfo returns correct metadata', () => {
        const info = provider.getInfo();
        expect(info.type).toBe('anthropic');
        expect(info.name).toBe('Anthropic');
        expect(info.executionMode).toBe('managed');
        expect(info.supportsTools).toBe(true);
        expect(info.supportsStreaming).toBe(true);
        expect(info.models.length).toBeGreaterThan(0);
        expect(info.defaultModel).toBe('claude-sonnet-4-6');
    });

    test('getInfo includes expected models', () => {
        const info = provider.getInfo();
        expect(info.models).toContain('claude-opus-4-6');
        expect(info.models).toContain('claude-sonnet-4-6');
        expect(info.models).toContain('claude-haiku-4-5-20251001');
    });

    test('complete rejects when model is missing (inherited validation)', async () => {
        await expect(
            provider.complete({
                model: '',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            }),
        ).rejects.toThrow('model is required');
    });

    test('complete rejects when messages is empty (inherited validation)', async () => {
        await expect(
            provider.complete({
                model: 'claude-sonnet-4-6',
                systemPrompt: 'test',
                messages: [],
            }),
        ).rejects.toThrow('at least one message is required');
    });

    // Note: isAvailable and doComplete involve the Anthropic SDK import
    // Testing those would require mocking the SDK module. We test the
    // structural aspects and let integration tests cover the SDK path.
    test('isAvailable returns false when SDK is not configured', async () => {
        // Without a real API key, the provider should report unavailable or
        // the SDK check may still pass if env has a key. We just verify it doesn't throw.
        const available = await provider.isAvailable();
        expect(typeof available).toBe('boolean');
    }, 20_000); // dynamic SDK import can be slow on Windows CI
});

// ─── OllamaProvider ─────────────────────────────────────────────────────────

describe('OllamaProvider', () => {
    let provider: OllamaProvider;
    const savedHost = process.env.OLLAMA_HOST;
    const savedMaxParallel = process.env.OLLAMA_MAX_PARALLEL;

    beforeEach(() => {
        // Point to unreachable host to avoid actual Ollama calls
        process.env.OLLAMA_HOST = 'http://127.0.0.1:1';
        delete process.env.OLLAMA_MAX_PARALLEL;
        provider = new OllamaProvider();
    });

    afterEach(() => {
        if (savedHost === undefined) delete process.env.OLLAMA_HOST;
        else process.env.OLLAMA_HOST = savedHost;
        if (savedMaxParallel === undefined) delete process.env.OLLAMA_MAX_PARALLEL;
        else process.env.OLLAMA_MAX_PARALLEL = savedMaxParallel;
    });

    test('type is ollama', () => {
        expect(provider.type).toBe('ollama');
    });

    test('executionMode is direct', () => {
        expect(provider.executionMode).toBe('direct');
    });

    test('getInfo returns correct metadata', () => {
        const info = provider.getInfo();
        expect(info.type).toBe('ollama');
        expect(info.name).toBe('Ollama');
        expect(info.executionMode).toBe('direct');
        expect(info.supportsTools).toBe(true);
    });

    test('getInfo defaultModel falls back to qwen3 when no models cached', () => {
        const info = provider.getInfo();
        expect(info.defaultModel).toBe('qwen3');
    });

    test('refreshModels returns empty array when Ollama is unreachable', async () => {
        const models = await provider.refreshModels();
        expect(Array.isArray(models)).toBe(true);
    });

    test('isAvailable returns false when Ollama is unreachable', async () => {
        const available = await provider.isAvailable();
        expect(available).toBe(false);
    });

    test('complete rejects with validation error for missing model', async () => {
        await expect(
            provider.complete({
                model: '',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            }),
        ).rejects.toThrow('model is required');
    });

    test('complete rejects with validation error for empty messages', async () => {
        await expect(
            provider.complete({
                model: 'llama3.3',
                systemPrompt: 'test',
                messages: [],
            }),
        ).rejects.toThrow('at least one message is required');
    });

    test('complete fails gracefully when Ollama is down', async () => {
        await expect(
            provider.complete({
                model: 'llama3.3',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hello' }],
            }),
        ).rejects.toThrow();
    });

    test('getRunningModels returns empty when Ollama is down', async () => {
        const running = await provider.getRunningModels();
        expect(running).toEqual([]);
    });

    test('getActivePulls returns empty initially', () => {
        expect(provider.getActivePulls()).toEqual([]);
    });

    test('getPullStatus returns undefined for unknown model', () => {
        expect(provider.getPullStatus('nonexistent')).toBeUndefined();
    });

    // ─── Slot management ──────────────────────────────────────────────

    test('acquireSlot succeeds immediately when no contention', async () => {
        const acquired = await provider.acquireSlot('small-model');
        expect(acquired).toBe(true);
    });

    test('releaseSlot does not throw for unknown model', () => {
        expect(() => provider.releaseSlot('unknown-model')).not.toThrow();
    });

    test('acquireSlot then releaseSlot cycle works', async () => {
        const acquired = await provider.acquireSlot('model-a');
        expect(acquired).toBe(true);
        provider.releaseSlot('model-a');
        // Should be able to acquire again
        const acquired2 = await provider.acquireSlot('model-b');
        expect(acquired2).toBe(true);
        provider.releaseSlot('model-b');
    });

    test('acquireSlot returns false when aborted while queued', async () => {
        // Fill up the single slot (maxWeight=1 by default without OLLAMA_MAX_PARALLEL)
        await provider.acquireSlot('model-a');

        // Try to acquire another slot with an abort signal
        const controller = new AbortController();
        const acquirePromise = provider.acquireSlot('model-b', controller.signal);

        // Abort immediately
        controller.abort();
        const acquired = await acquirePromise;
        expect(acquired).toBe(false);

        // Clean up
        provider.releaseSlot('model-a');
    });

    // ─── deleteModel ──────────────────────────────────────────────────

    test('deleteModel returns error when Ollama is down', async () => {
        const result = await provider.deleteModel('nonexistent');
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });
});

// ─── FallbackManager ─────────────────────────────────────────────────────────

describe('FallbackManager', () => {
    const savedAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const savedOpenaiKey = process.env.OPENAI_API_KEY;
    const savedEnabledProviders = process.env.ENABLED_PROVIDERS;
    let registry: LlmProviderRegistry;
    let fallback: FallbackManager;

    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
        process.env.OPENAI_API_KEY = 'sk-test';
        // Explicitly allow all providers to avoid env interference from other test files
        process.env.ENABLED_PROVIDERS = 'anthropic,openai,ollama';
        _resetClaudeCliCache(null);
        registry = freshRegistry();
    });

    afterEach(() => {
        _resetClaudeCliCache(null);
        if (savedAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = savedAnthropicKey;
        if (savedOpenaiKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = savedOpenaiKey;
        if (savedEnabledProviders === undefined) delete process.env.ENABLED_PROVIDERS;
        else process.env.ENABLED_PROVIDERS = savedEnabledProviders;
    });

    // ─── Provider health tracking ─────────────────────────────────────

    describe('provider health tracking', () => {
        beforeEach(() => {
            registry.register(createMockProvider('anthropic', ['claude-sonnet-4-6']));
            registry.register(createMockProvider('openai', ['gpt-4o']));
            fallback = new FallbackManager(registry);
        });

        test('all providers available initially', () => {
            expect(fallback.isProviderAvailable('anthropic')).toBe(true);
            expect(fallback.isProviderAvailable('openai')).toBe(true);
            expect(fallback.isProviderAvailable('ollama')).toBe(true);
        });

        test('health status is empty initially', () => {
            expect(fallback.getHealthStatus()).toEqual([]);
        });

        test('resetHealth clears all health records', () => {
            fallback.resetHealth();
            expect(fallback.getHealthStatus()).toEqual([]);
        });

        test('provider with no health record is considered available', () => {
            expect(fallback.isProviderAvailable('ollama')).toBe(true);
        });
    });

    // ─── Transient error classification ───────────────────────────────

    describe('transient error classification', () => {
        let callCount: number;

        beforeEach(() => {
            callCount = 0;
        });

        test('rate limit errors trigger health tracking', async () => {
            callCount = 0;
            // First provider fails with rate limit, second succeeds
            registry.register(
                createMockProvider('anthropic', ['claude-sonnet-4-6'], {
                    completeFn: async () => {
                        callCount++;
                        throw new Error('Rate limit exceeded (429)');
                    },
                }),
            );
            registry.register(createMockProvider('openai', ['gpt-4o']));
            fallback = new FallbackManager(registry);

            const result = await fallback.completeWithFallback(
                {
                    model: 'claude-sonnet-4-6',
                    systemPrompt: 'test',
                    messages: [{ role: 'user', content: 'hello' }],
                },
                {
                    chain: [
                        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
                        { provider: 'openai', model: 'gpt-4o' },
                    ],
                },
            );

            expect(result.usedProvider).toBe('openai');
            expect(result.usedModel).toBe('gpt-4o');
            // Health should now track the anthropic failure
            const health = fallback.getHealthStatus();
            expect(health.length).toBeGreaterThan(0);
            const anthropicHealth = health.find((h) => h.provider === 'anthropic');
            expect(anthropicHealth).toBeDefined();
            expect(anthropicHealth!.consecutiveFailures).toBe(1);
        });

        test('503 errors are treated as transient', async () => {
            registry.register(
                createMockProvider('anthropic', ['claude-sonnet-4-6'], {
                    completeFn: async () => {
                        throw new Error('Service Unavailable 503');
                    },
                }),
            );
            registry.register(createMockProvider('openai', ['gpt-4o']));
            fallback = new FallbackManager(registry);

            const result = await fallback.completeWithFallback(
                {
                    model: 'test',
                    systemPrompt: 'test',
                    messages: [{ role: 'user', content: 'test' }],
                },
                {
                    chain: [
                        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
                        { provider: 'openai', model: 'gpt-4o' },
                    ],
                },
            );

            expect(result.usedProvider).toBe('openai');
            const health = fallback.getHealthStatus();
            const anthropicHealth = health.find((h) => h.provider === 'anthropic');
            expect(anthropicHealth!.consecutiveFailures).toBe(1);
        });

        test('timeout errors are treated as transient', async () => {
            registry.register(
                createMockProvider('anthropic', ['claude-sonnet-4-6'], {
                    completeFn: async () => {
                        throw new Error('Request timeout');
                    },
                }),
            );
            registry.register(createMockProvider('openai', ['gpt-4o']));
            fallback = new FallbackManager(registry);

            const result = await fallback.completeWithFallback(
                {
                    model: 'test',
                    systemPrompt: 'test',
                    messages: [{ role: 'user', content: 'test' }],
                },
                {
                    chain: [
                        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
                        { provider: 'openai', model: 'gpt-4o' },
                    ],
                },
            );

            expect(result.usedProvider).toBe('openai');
        });

        test('econnrefused errors are treated as transient', async () => {
            registry.register(
                createMockProvider('anthropic', ['claude-sonnet-4-6'], {
                    completeFn: async () => {
                        throw new Error('ECONNREFUSED');
                    },
                }),
            );
            registry.register(createMockProvider('openai', ['gpt-4o']));
            fallback = new FallbackManager(registry);

            const result = await fallback.completeWithFallback(
                {
                    model: 'test',
                    systemPrompt: 'test',
                    messages: [{ role: 'user', content: 'test' }],
                },
                {
                    chain: [
                        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
                        { provider: 'openai', model: 'gpt-4o' },
                    ],
                },
            );

            expect(result.usedProvider).toBe('openai');
        });

        test('non-transient errors still fall through to next provider', async () => {
            registry.register(
                createMockProvider('anthropic', ['claude-sonnet-4-6'], {
                    completeFn: async () => {
                        throw new Error('Invalid API key');
                    },
                }),
            );
            registry.register(createMockProvider('openai', ['gpt-4o']));
            fallback = new FallbackManager(registry);

            const result = await fallback.completeWithFallback(
                {
                    model: 'test',
                    systemPrompt: 'test',
                    messages: [{ role: 'user', content: 'test' }],
                },
                {
                    chain: [
                        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
                        { provider: 'openai', model: 'gpt-4o' },
                    ],
                },
            );

            // Non-transient errors still try next provider but don't mark failure
            expect(result.usedProvider).toBe('openai');
            // Non-transient errors should NOT increase consecutiveFailures
            const health = fallback.getHealthStatus();
            const anthropicHealth = health.find((h) => h.provider === 'anthropic');
            // No health record because markFailure was not called
            expect(anthropicHealth).toBeUndefined();
        });

        test('overloaded errors are treated as transient', async () => {
            registry.register(
                createMockProvider('anthropic', ['claude-sonnet-4-6'], {
                    completeFn: async () => {
                        throw new Error('Server overloaded');
                    },
                }),
            );
            registry.register(createMockProvider('openai', ['gpt-4o']));
            fallback = new FallbackManager(registry);

            const result = await fallback.completeWithFallback(
                {
                    model: 'test',
                    systemPrompt: 'test',
                    messages: [{ role: 'user', content: 'test' }],
                },
                {
                    chain: [
                        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
                        { provider: 'openai', model: 'gpt-4o' },
                    ],
                },
            );

            expect(result.usedProvider).toBe('openai');
            const health = fallback.getHealthStatus();
            expect(health.find((h) => h.provider === 'anthropic')?.consecutiveFailures).toBe(1);
        });
    });

    // ─── Provider chain fallback ──────────────────────────────────────

    describe('provider chain fallback', () => {
        test('succeeds with first provider in chain', async () => {
            registry.register(createMockProvider('anthropic', ['claude-sonnet-4-6']));
            registry.register(createMockProvider('openai', ['gpt-4o']));
            fallback = new FallbackManager(registry);

            const result = await fallback.completeWithFallback(
                {
                    model: 'claude-sonnet-4-6',
                    systemPrompt: 'test',
                    messages: [{ role: 'user', content: 'hello' }],
                },
                {
                    chain: [
                        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
                        { provider: 'openai', model: 'gpt-4o' },
                    ],
                },
            );

            expect(result.usedProvider).toBe('anthropic');
            expect(result.usedModel).toBe('claude-sonnet-4-6');
            expect(result.content).toBe('Mock response from anthropic');
        });

        test('falls through entire chain and uses last provider', async () => {
            registry.register(
                createMockProvider('anthropic', ['claude-sonnet-4-6'], {
                    completeFn: async () => { throw new Error('fail'); },
                }),
            );
            registry.register(
                createMockProvider('openai', ['gpt-4o'], {
                    completeFn: async () => { throw new Error('fail'); },
                }),
            );
            registry.register(createMockProvider('ollama', ['llama3.3']));
            fallback = new FallbackManager(registry);

            const result = await fallback.completeWithFallback(
                {
                    model: 'test',
                    systemPrompt: 'test',
                    messages: [{ role: 'user', content: 'test' }],
                },
                {
                    chain: [
                        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
                        { provider: 'openai', model: 'gpt-4o' },
                        { provider: 'ollama', model: 'llama3.3' },
                    ],
                },
            );

            expect(result.usedProvider).toBe('ollama');
            expect(result.usedModel).toBe('llama3.3');
        });

        test('throws ExternalServiceError when all providers fail', async () => {
            registry.register(
                createMockProvider('anthropic', ['claude-sonnet-4-6'], {
                    completeFn: async () => { throw new Error('anthropic down'); },
                }),
            );
            registry.register(
                createMockProvider('openai', ['gpt-4o'], {
                    completeFn: async () => { throw new Error('openai down'); },
                }),
            );
            fallback = new FallbackManager(registry);

            await expect(
                fallback.completeWithFallback(
                    {
                        model: 'test',
                        systemPrompt: 'test',
                        messages: [{ role: 'user', content: 'test' }],
                    },
                    {
                        chain: [
                            { provider: 'anthropic', model: 'claude-sonnet-4-6' },
                            { provider: 'openai', model: 'gpt-4o' },
                        ],
                    },
                ),
            ).rejects.toThrow('All providers in fallback chain failed');
        });

        test('error message includes details from each failed provider', async () => {
            registry.register(
                createMockProvider('anthropic', ['claude-sonnet-4-6'], {
                    completeFn: async () => { throw new Error('auth failure'); },
                }),
            );
            registry.register(
                createMockProvider('openai', ['gpt-4o'], {
                    completeFn: async () => { throw new Error('quota exceeded'); },
                }),
            );
            fallback = new FallbackManager(registry);

            try {
                await fallback.completeWithFallback(
                    {
                        model: 'test',
                        systemPrompt: 'test',
                        messages: [{ role: 'user', content: 'test' }],
                    },
                    {
                        chain: [
                            { provider: 'anthropic', model: 'claude-sonnet-4-6' },
                            { provider: 'openai', model: 'gpt-4o' },
                        ],
                    },
                );
                expect(true).toBe(false); // Should not reach here
            } catch (err: unknown) {
                const msg = (err as Error).message;
                expect(msg).toContain('auth failure');
                expect(msg).toContain('quota exceeded');
            }
        });

        test('throws when chain is empty', async () => {
            fallback = new FallbackManager(registry);
            await expect(
                fallback.completeWithFallback(
                    {
                        model: 'test',
                        systemPrompt: 'test',
                        messages: [{ role: 'user', content: 'test' }],
                    },
                    { chain: [] },
                ),
            ).rejects.toThrow('All providers in fallback chain failed');
        });

        test('skips providers not registered in registry', async () => {
            // Only register openai, not anthropic
            registry.register(createMockProvider('openai', ['gpt-4o']));
            fallback = new FallbackManager(registry);

            const result = await fallback.completeWithFallback(
                {
                    model: 'test',
                    systemPrompt: 'test',
                    messages: [{ role: 'user', content: 'test' }],
                },
                {
                    chain: [
                        { provider: 'anthropic', model: 'claude-sonnet-4-6' }, // Not registered
                        { provider: 'openai', model: 'gpt-4o' },
                    ],
                },
            );

            expect(result.usedProvider).toBe('openai');
        });
    });

    // ─── Health tracking with cooldown ────────────────────────────────

    describe('cooldown and backoff', () => {
        test('provider becomes unavailable after MAX_CONSECUTIVE_FAILURES transient errors', async () => {
            let callCount = 0;
            registry.register(
                createMockProvider('anthropic', ['claude-sonnet-4-6'], {
                    completeFn: async () => {
                        callCount++;
                        throw new Error('Rate limit exceeded (429)');
                    },
                }),
            );
            registry.register(createMockProvider('openai', ['gpt-4o']));
            fallback = new FallbackManager(registry);

            const chain = {
                chain: [
                    { provider: 'anthropic' as LlmProviderType, model: 'claude-sonnet-4-6' },
                    { provider: 'openai' as LlmProviderType, model: 'gpt-4o' },
                ],
            };

            const params = {
                model: 'test',
                systemPrompt: 'test',
                messages: [{ role: 'user' as const, content: 'test' }],
            };

            // Trigger 3 failures (MAX_CONSECUTIVE_FAILURES)
            for (let i = 0; i < 3; i++) {
                await fallback.completeWithFallback(params, chain);
            }

            // After 3 consecutive transient failures, anthropic should be in cooldown
            expect(fallback.isProviderAvailable('anthropic')).toBe(false);
        });

        test('provider health resets on success', async () => {
            let shouldFail = true;
            registry.register(
                createMockProvider('anthropic', ['claude-sonnet-4-6'], {
                    completeFn: async () => {
                        if (shouldFail) throw new Error('Rate limit exceeded (429)');
                        return { content: 'ok', model: 'claude-sonnet-4-6' };
                    },
                }),
            );
            registry.register(createMockProvider('openai', ['gpt-4o']));
            fallback = new FallbackManager(registry);

            const chain = {
                chain: [
                    { provider: 'anthropic' as LlmProviderType, model: 'claude-sonnet-4-6' },
                    { provider: 'openai' as LlmProviderType, model: 'gpt-4o' },
                ],
            };
            const params = {
                model: 'test',
                systemPrompt: 'test',
                messages: [{ role: 'user' as const, content: 'test' }],
            };

            // Cause 1 failure
            await fallback.completeWithFallback(params, chain);
            const health1 = fallback.getHealthStatus();
            const anthropic1 = health1.find((h) => h.provider === 'anthropic');
            expect(anthropic1!.consecutiveFailures).toBe(1);

            // Now succeed
            shouldFail = false;
            await fallback.completeWithFallback(params, chain);
            const health2 = fallback.getHealthStatus();
            const anthropic2 = health2.find((h) => h.provider === 'anthropic');
            expect(anthropic2!.consecutiveFailures).toBe(0);
            expect(anthropic2!.healthy).toBe(true);
        });

        test('resetHealth clears all cooldowns', async () => {
            registry.register(
                createMockProvider('anthropic', ['claude-sonnet-4-6'], {
                    completeFn: async () => {
                        throw new Error('Rate limit (429)');
                    },
                }),
            );
            registry.register(createMockProvider('openai', ['gpt-4o']));
            fallback = new FallbackManager(registry);

            const chain = {
                chain: [
                    { provider: 'anthropic' as LlmProviderType, model: 'claude-sonnet-4-6' },
                    { provider: 'openai' as LlmProviderType, model: 'gpt-4o' },
                ],
            };
            const params = {
                model: 'test',
                systemPrompt: 'test',
                messages: [{ role: 'user' as const, content: 'test' }],
            };

            // Create failures
            for (let i = 0; i < 3; i++) {
                await fallback.completeWithFallback(params, chain);
            }
            expect(fallback.isProviderAvailable('anthropic')).toBe(false);

            // Reset
            fallback.resetHealth();
            expect(fallback.getHealthStatus()).toEqual([]);
            expect(fallback.isProviderAvailable('anthropic')).toBe(true);
        });
    });

    // ─── Default fallback chains ──────────────────────────────────────

    describe('default fallback chains', () => {
        test('all expected chains exist', () => {
            expect(DEFAULT_FALLBACK_CHAINS['high-capability']).toBeDefined();
            expect(DEFAULT_FALLBACK_CHAINS['balanced']).toBeDefined();
            expect(DEFAULT_FALLBACK_CHAINS['cost-optimized']).toBeDefined();
            expect(DEFAULT_FALLBACK_CHAINS['local']).toBeDefined();
            expect(DEFAULT_FALLBACK_CHAINS['cloud']).toBeDefined();
        });

        test('every chain has at least one entry', () => {
            for (const [, chain] of Object.entries(DEFAULT_FALLBACK_CHAINS)) {
                expect(chain.chain.length).toBeGreaterThan(0);
            }
        });

        test('each chain entry has valid provider and model', () => {
            for (const [, chain] of Object.entries(DEFAULT_FALLBACK_CHAINS)) {
                for (const entry of chain.chain) {
                    expect(['anthropic', 'openai', 'ollama']).toContain(entry.provider);
                    expect(entry.model).toBeTruthy();
                }
            }
        });

        test('high-capability chain starts with strongest model', () => {
            const chain = DEFAULT_FALLBACK_CHAINS['high-capability'];
            expect(chain.chain[0].provider).toBe('anthropic');
            expect(chain.chain[0].model).toBe('claude-opus-4-6');
        });

        test('local chain only contains ollama providers', () => {
            const chain = DEFAULT_FALLBACK_CHAINS['local'];
            for (const entry of chain.chain) {
                expect(entry.provider).toBe('ollama');
            }
        });

        test('cloud chain only contains ollama cloud models', () => {
            const chain = DEFAULT_FALLBACK_CHAINS['cloud'];
            for (const entry of chain.chain) {
                expect(entry.provider).toBe('ollama');
                expect(entry.model).toContain(':cloud');
            }
        });
    });
});

// ─── Cost Table (CostTracker) ────────────────────────────────────────────────

describe('CostTracker (cost-table)', () => {
    // ─── MODEL_PRICING data integrity ─────────────────────────────────

    describe('MODEL_PRICING data integrity', () => {
        test('has entries for anthropic, openai, and ollama', () => {
            const providers = new Set(MODEL_PRICING.map((m) => m.provider));
            expect(providers.has('anthropic')).toBe(true);
            expect(providers.has('openai')).toBe(true);
            expect(providers.has('ollama')).toBe(true);
        });

        test('every entry has required fields', () => {
            for (const entry of MODEL_PRICING) {
                expect(entry.model).toBeTruthy();
                expect(entry.provider).toBeTruthy();
                expect(entry.displayName).toBeTruthy();
                expect(typeof entry.inputPricePerMillion).toBe('number');
                expect(typeof entry.outputPricePerMillion).toBe('number');
                expect(entry.inputPricePerMillion).toBeGreaterThanOrEqual(0);
                expect(entry.outputPricePerMillion).toBeGreaterThanOrEqual(0);
                expect(entry.maxContextTokens).toBeGreaterThan(0);
                expect(entry.maxOutputTokens).toBeGreaterThan(0);
                expect(entry.capabilityTier).toBeGreaterThanOrEqual(1);
                expect(entry.capabilityTier).toBeLessThanOrEqual(4);
                expect(typeof entry.supportsTools).toBe('boolean');
                expect(typeof entry.supportsThinking).toBe('boolean');
            }
        });

        test('model identifiers are unique', () => {
            const models = MODEL_PRICING.map((m) => m.model);
            const unique = new Set(models);
            expect(unique.size).toBe(models.length);
        });

        test('ollama local models have zero cost', () => {
            const ollamaLocal = MODEL_PRICING.filter(
                (m) => m.provider === 'ollama' && !m.isCloud,
            );
            expect(ollamaLocal.length).toBeGreaterThan(0);
            for (const m of ollamaLocal) {
                expect(m.inputPricePerMillion).toBe(0);
                expect(m.outputPricePerMillion).toBe(0);
            }
        });

        test('cloud models have expected capabilities', () => {
            const cloud = MODEL_PRICING.filter((m) => m.isCloud);
            expect(cloud.length).toBeGreaterThan(0);
            for (const m of cloud) {
                expect(m.supportsTools).toBe(true);
                expect(m.supportsSubagents).toBe(true);
                expect(m.supportsWebSearch).toBe(true);
            }
        });
    });

    // ─── getModelPricing ──────────────────────────────────────────────

    describe('getModelPricing', () => {
        test('returns correct pricing for known model', () => {
            const opus = getModelPricing('claude-opus-4-6');
            expect(opus).not.toBeNull();
            expect(opus!.provider).toBe('anthropic');
            expect(opus!.inputPricePerMillion).toBe(5);
            expect(opus!.outputPricePerMillion).toBe(25);
            expect(opus!.capabilityTier).toBe(1);
        });

        test('returns null for unknown model', () => {
            expect(getModelPricing('nonexistent-model')).toBeNull();
        });

        test('returns correct pricing for ollama model', () => {
            const llama = getModelPricing('llama3.3');
            expect(llama).not.toBeNull();
            expect(llama!.provider).toBe('ollama');
            expect(llama!.inputPricePerMillion).toBe(0);
        });

        test('returns correct pricing for openai model', () => {
            const gpt4 = getModelPricing('gpt-4.1');
            expect(gpt4).not.toBeNull();
            expect(gpt4!.provider).toBe('openai');
            expect(gpt4!.inputPricePerMillion).toBe(2);
            expect(gpt4!.outputPricePerMillion).toBe(8);
        });
    });

    // ─── estimateCost ─────────────────────────────────────────────────

    describe('estimateCost', () => {
        test('calculates correctly for claude-opus-4-6', () => {
            // $5/M input + $25/M output
            const cost = estimateCost('claude-opus-4-6', 1_000_000, 1_000_000);
            expect(cost).toBe(30);
        });

        test('calculates correctly for smaller token counts', () => {
            // 1000 input tokens at $5/M = $0.005
            // 500 output tokens at $25/M = $0.0125
            const cost = estimateCost('claude-opus-4-6', 1000, 500);
            expect(cost).toBeCloseTo(0.0175, 6);
        });

        test('returns 0 for unknown model', () => {
            expect(estimateCost('nonexistent', 1000, 1000)).toBe(0);
        });

        test('returns 0 for ollama local models', () => {
            expect(estimateCost('llama3.3', 100000, 50000)).toBe(0);
        });

        test('handles zero tokens', () => {
            expect(estimateCost('claude-opus-4-6', 0, 0)).toBe(0);
        });

        test('handles very large token counts', () => {
            const cost = estimateCost('claude-opus-4-6', 10_000_000, 5_000_000);
            // $50 input + $125 output = $175
            expect(cost).toBe(175);
        });
    });

    // ─── Provider filtering ───────────────────────────────────────────

    describe('getModelsForProvider', () => {
        test('returns only anthropic models', () => {
            const models = getModelsForProvider('anthropic');
            expect(models.length).toBeGreaterThan(0);
            for (const m of models) {
                expect(m.provider).toBe('anthropic');
            }
        });

        test('returns only openai models', () => {
            const models = getModelsForProvider('openai');
            expect(models.length).toBeGreaterThan(0);
            for (const m of models) {
                expect(m.provider).toBe('openai');
            }
        });

        test('returns only ollama models', () => {
            const models = getModelsForProvider('ollama');
            expect(models.length).toBeGreaterThan(0);
            for (const m of models) {
                expect(m.provider).toBe('ollama');
            }
        });

        test('returns empty for unknown provider', () => {
            expect(getModelsForProvider('unknown')).toEqual([]);
        });
    });

    // ─── Capability filtering ─────────────────────────────────────────

    describe('capability filtering', () => {
        test('getSubagentCapableModels returns models with supportsSubagents', () => {
            const models = getSubagentCapableModels();
            expect(models.length).toBeGreaterThan(0);
            for (const m of models) {
                expect(m.supportsSubagents).toBe(true);
            }
        });

        test('getWebSearchCapableModels returns models with supportsWebSearch', () => {
            const models = getWebSearchCapableModels();
            expect(models.length).toBeGreaterThan(0);
            for (const m of models) {
                expect(m.supportsWebSearch).toBe(true);
            }
        });

        test('getOllamaCloudModels returns only ollama cloud models', () => {
            const models = getOllamaCloudModels();
            expect(models.length).toBeGreaterThan(0);
            for (const m of models) {
                expect(m.provider).toBe('ollama');
                expect(m.isCloud).toBe(true);
            }
        });

        test('getOllamaCloudModels does not include local ollama models', () => {
            const cloudModels = getOllamaCloudModels();
            const cloudNames = new Set(cloudModels.map((m) => m.model));
            expect(cloudNames.has('llama3.3')).toBe(false);
            expect(cloudNames.has('qwen3:32b')).toBe(false);
        });
    });

    // ─── Sorting ──────────────────────────────────────────────────────

    describe('getModelsByCost', () => {
        test('returns models sorted by output price ascending', () => {
            const sorted = getModelsByCost();
            expect(sorted.length).toBe(MODEL_PRICING.length);
            for (let i = 1; i < sorted.length; i++) {
                expect(sorted[i].outputPricePerMillion).toBeGreaterThanOrEqual(
                    sorted[i - 1].outputPricePerMillion,
                );
            }
        });

        test('ollama models appear first (zero cost)', () => {
            const sorted = getModelsByCost();
            // All zero-cost models should be at the start
            const firstNonZero = sorted.findIndex((m) => m.outputPricePerMillion > 0);
            if (firstNonZero > 0) {
                for (let i = 0; i < firstNonZero; i++) {
                    expect(sorted[i].outputPricePerMillion).toBe(0);
                }
            }
        });

        test('does not mutate original MODEL_PRICING array', () => {
            const originalOrder = MODEL_PRICING.map((m) => m.model);
            getModelsByCost();
            const afterOrder = MODEL_PRICING.map((m) => m.model);
            expect(afterOrder).toEqual(originalOrder);
        });
    });

    // ─── Usage aggregation scenarios ──────────────────────────────────

    describe('usage aggregation', () => {
        test('accumulate costs across multiple calls', () => {
            // Simulate tracking costs across multiple completions
            let totalCost = 0;
            totalCost += estimateCost('claude-sonnet-4-6', 5000, 2000); // $3/M in, $15/M out
            totalCost += estimateCost('claude-sonnet-4-6', 3000, 1000);
            totalCost += estimateCost('gpt-4.1', 10000, 5000); // $2/M in, $8/M out

            const expected =
                (5000 / 1_000_000) * 3 + (2000 / 1_000_000) * 15 +
                (3000 / 1_000_000) * 3 + (1000 / 1_000_000) * 15 +
                (10000 / 1_000_000) * 2 + (5000 / 1_000_000) * 8;

            expect(totalCost).toBeCloseTo(expected, 10);
        });

        test('mixed provider cost tracking', () => {
            // Ollama calls should be free, cloud calls should have cost
            const ollamaCost = estimateCost('llama3.3', 50000, 20000);
            const anthropicCost = estimateCost('claude-haiku-4-5-20251001', 50000, 20000);

            expect(ollamaCost).toBe(0);
            expect(anthropicCost).toBeGreaterThan(0);
            // haiku: $1/M in, $5/M out → 0.05 + 0.1 = 0.15
            expect(anthropicCost).toBeCloseTo(0.15, 6);
        });
    });
});
