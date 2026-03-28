import { test, expect, describe } from 'bun:test';
import { FallbackManager } from '../providers/fallback';
import type { FallbackChain } from '../providers/fallback';
import { ExternalServiceError } from '../lib/errors';
import type { LlmProviderType } from '../providers/types';

/** Minimal mock provider with controllable complete() behavior. */
function mockProvider(result: { content: string; model: string; usage?: { inputTokens: number; outputTokens: number } } | Error) {
    return {
        complete: async (_params: unknown) => {
            if (result instanceof Error) throw result;
            return result;
        },
    };
}

/** Minimal mock registry that returns providers by type. */
function mockRegistry(providers: Partial<Record<LlmProviderType, ReturnType<typeof mockProvider>>>) {
    return {
        get(provider: LlmProviderType) {
            return providers[provider];
        },
    };
}

/** Standard two-provider fallback chain for tests. */
const TWO_PROVIDER_CHAIN: FallbackChain = {
    chain: [
        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
        { provider: 'openai', model: 'gpt-4.1' },
    ],
};

describe('FallbackManager', () => {
    let fm: FallbackManager;

    describe('completeWithFallback', () => {
        test('returns result from first healthy provider', async () => {
            const registry = mockRegistry({
                anthropic: mockProvider({ content: 'hello', model: 'claude-sonnet-4-6' }),
                openai: mockProvider({ content: 'fallback', model: 'gpt-4.1' }),
            });
            fm = new FallbackManager(registry as any);

            const result = await fm.completeWithFallback({ messages: [] } as any, TWO_PROVIDER_CHAIN);
            expect(result.content).toBe('hello');
            expect(result.usedProvider).toBe('anthropic');
            expect(result.usedModel).toBe('claude-sonnet-4-6');
        });

        test('falls back to second provider when first throws', async () => {
            const registry = mockRegistry({
                anthropic: mockProvider(new Error('rate limit exceeded')),
                openai: mockProvider({ content: 'fallback-response', model: 'gpt-4.1' }),
            });
            fm = new FallbackManager(registry as any);

            const result = await fm.completeWithFallback({ messages: [] } as any, TWO_PROVIDER_CHAIN);
            expect(result.content).toBe('fallback-response');
            expect(result.usedProvider).toBe('openai');
            expect(result.usedModel).toBe('gpt-4.1');
        });

        test('throws ExternalServiceError when all providers fail', async () => {
            const registry = mockRegistry({
                anthropic: mockProvider(new Error('rate limit')),
                openai: mockProvider(new Error('503 service unavailable')),
            });
            fm = new FallbackManager(registry as any);

            await expect(
                fm.completeWithFallback({ messages: [] } as any, TWO_PROVIDER_CHAIN),
            ).rejects.toBeInstanceOf(ExternalServiceError);
        });

        test('includes usedProvider and usedModel in result', async () => {
            const registry = mockRegistry({
                anthropic: mockProvider({ content: 'ok', model: 'claude-sonnet-4-6', usage: { inputTokens: 10, outputTokens: 20 } }),
            });
            fm = new FallbackManager(registry as any);

            const result = await fm.completeWithFallback({ messages: [] } as any, TWO_PROVIDER_CHAIN);
            expect(result).toHaveProperty('usedProvider', 'anthropic');
            expect(result).toHaveProperty('usedModel', 'claude-sonnet-4-6');
            expect(result).toHaveProperty('content', 'ok');
            expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
        });
    });

    describe('isProviderAvailable', () => {
        test('returns true for unknown provider (no health record)', () => {
            const registry = mockRegistry({});
            fm = new FallbackManager(registry as any);
            expect(fm.isProviderAvailable('anthropic')).toBe(true);
        });

        test('returns false when provider is in cooldown', async () => {
            // Trigger 3 consecutive transient failures to enter cooldown
            const registry = mockRegistry({
                anthropic: mockProvider(new Error('429 rate limit')),
            });
            fm = new FallbackManager(registry as any);

            const singleChain: FallbackChain = {
                chain: [{ provider: 'anthropic', model: 'claude-sonnet-4-6' }],
            };

            // Each call triggers a transient failure + markFailure
            for (let i = 0; i < 3; i++) {
                try { await fm.completeWithFallback({ messages: [] } as any, singleChain); } catch {}
            }

            expect(fm.isProviderAvailable('anthropic')).toBe(false);
        });

        test('returns true after cooldown expires', async () => {
            const registry = mockRegistry({
                anthropic: mockProvider(new Error('429 rate limit')),
            });
            fm = new FallbackManager(registry as any);

            const singleChain: FallbackChain = {
                chain: [{ provider: 'anthropic', model: 'claude-sonnet-4-6' }],
            };

            // Trigger cooldown
            for (let i = 0; i < 3; i++) {
                try { await fm.completeWithFallback({ messages: [] } as any, singleChain); } catch {}
            }
            expect(fm.isProviderAvailable('anthropic')).toBe(false);

            // Simulate cooldown expiry by manipulating the health record via getHealthStatus
            const healthRecords = fm.getHealthStatus();
            const anthropicHealth = healthRecords.find(h => h.provider === 'anthropic');
            if (anthropicHealth) {
                // Set lastFailure far in the past so cooldown has expired
                anthropicHealth.lastFailure = Date.now() - 120_000;
            }

            expect(fm.isProviderAvailable('anthropic')).toBe(true);
        });
    });

    describe('markFailure via completeWithFallback', () => {
        test('3 consecutive transient failures trigger cooldown', async () => {
            const registry = mockRegistry({
                anthropic: mockProvider(new Error('timeout connecting')),
            });
            fm = new FallbackManager(registry as any);

            const singleChain: FallbackChain = {
                chain: [{ provider: 'anthropic', model: 'claude-sonnet-4-6' }],
            };

            // First two failures: still available (consecutiveFailures < 3)
            try { await fm.completeWithFallback({ messages: [] } as any, singleChain); } catch {}
            expect(fm.isProviderAvailable('anthropic')).toBe(true);

            try { await fm.completeWithFallback({ messages: [] } as any, singleChain); } catch {}
            expect(fm.isProviderAvailable('anthropic')).toBe(true);

            // Third failure: triggers cooldown
            try { await fm.completeWithFallback({ messages: [] } as any, singleChain); } catch {}
            expect(fm.isProviderAvailable('anthropic')).toBe(false);
        });
    });

    describe('isTransientError detection', () => {
        test('rate limit, 429, 503, timeout, econnrefused all trigger fallback', async () => {
            const transientMessages = [
                'rate limit exceeded',
                'HTTP 429 Too Many Requests',
                '503 Service Unavailable',
                'timeout waiting for response',
                'ECONNREFUSED 127.0.0.1:11434',
            ];

            for (const msg of transientMessages) {
                const registry = mockRegistry({
                    anthropic: mockProvider(new Error(msg)),
                    openai: mockProvider({ content: 'ok', model: 'gpt-4.1' }),
                });
                const localFm = new FallbackManager(registry as any);
                const result = await localFm.completeWithFallback({ messages: [] } as any, TWO_PROVIDER_CHAIN);
                // If it fell back to openai, the transient error was detected
                expect(result.usedProvider).toBe('openai');
            }
        });
    });

    describe('resetHealth', () => {
        test('clears all health records', async () => {
            const registry = mockRegistry({
                anthropic: mockProvider(new Error('429')),
            });
            fm = new FallbackManager(registry as any);

            const singleChain: FallbackChain = {
                chain: [{ provider: 'anthropic', model: 'claude-sonnet-4-6' }],
            };

            // Trigger failures
            for (let i = 0; i < 3; i++) {
                try { await fm.completeWithFallback({ messages: [] } as any, singleChain); } catch {}
            }
            expect(fm.isProviderAvailable('anthropic')).toBe(false);

            fm.resetHealth();
            expect(fm.isProviderAvailable('anthropic')).toBe(true);
            expect(fm.getHealthStatus()).toHaveLength(0);
        });
    });
});
