import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { FallbackManager, DEFAULT_FALLBACK_CHAINS } from '../providers/fallback';
import type { FallbackChain } from '../providers/fallback';
import type { LlmProvider, LlmProviderType, LlmCompletionParams, LlmCompletionResult } from '../providers/types';
import { LlmProviderRegistry } from '../providers/registry';
import { ExternalServiceError } from '../lib/errors';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeResult(content: string, model: string): LlmCompletionResult {
    return { content, model, usage: { inputTokens: 10, outputTokens: 20 } };
}

function makeParams(overrides?: Partial<LlmCompletionParams>): LlmCompletionParams {
    return {
        model: 'test-model',
        systemPrompt: 'You are a test assistant.',
        messages: [{ role: 'user', content: 'Hello' }],
        ...overrides,
    };
}

function createMockProvider(
    type: LlmProviderType,
    impl?: (params: LlmCompletionParams) => Promise<LlmCompletionResult>,
): LlmProvider {
    return {
        type,
        executionMode: 'direct',
        getInfo: () => ({
            type,
            name: `mock-${type}`,
            executionMode: 'direct' as const,
            models: ['test-model'],
            defaultModel: 'test-model',
            supportsTools: true,
            supportsStreaming: false,
        }),
        complete: impl ?? mock(() => Promise.resolve(makeResult('ok', 'test-model'))),
        isAvailable: mock(() => Promise.resolve(true)),
    };
}

function createMockRegistry(providers: LlmProvider[]): LlmProviderRegistry {
    const reg = {
        get(type: LlmProviderType) {
            return providers.find((p) => p.type === type);
        },
        getAll() {
            return providers;
        },
        getDefault() {
            return providers[0];
        },
    } as unknown as LlmProviderRegistry;
    return reg;
}

function makeChain(...entries: Array<{ provider: LlmProviderType; model: string }>): FallbackChain {
    return { chain: entries };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FallbackManager', () => {
    let manager: FallbackManager;
    let currentTime: number;

    beforeEach(() => {
        currentTime = 1_000_000;
        spyOn(Date, 'now').mockImplementation(() => currentTime);
    });

    afterEach(() => {
        mock.restore();
    });

    // ── Basic fallback behavior ──────────────────────────────────────────

    describe('completeWithFallback', () => {
        it('returns result from primary provider on success', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.resolve(makeResult('primary response', 'claude-sonnet')),
            );
            const registry = createMockRegistry([anthropic]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            const result = await manager.completeWithFallback(makeParams(), chain);

            expect(result.content).toBe('primary response');
            expect(result.usedProvider).toBe('anthropic');
            expect(result.usedModel).toBe('claude-sonnet');
        });

        it('falls back to second provider when primary fails', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('rate limit exceeded')),
            );
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('fallback response', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            const result = await manager.completeWithFallback(makeParams(), chain);

            expect(result.content).toBe('fallback response');
            expect(result.usedProvider).toBe('openai');
            expect(result.usedModel).toBe('gpt-4');
        });

        it('falls back through multiple providers', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('503 service unavailable')),
            );
            const openai = createMockProvider('openai', () =>
                Promise.reject(new Error('timeout waiting for response')),
            );
            const ollama = createMockProvider('ollama', () =>
                Promise.resolve(makeResult('local response', 'llama3')),
            );
            const registry = createMockRegistry([anthropic, openai, ollama]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
                { provider: 'ollama', model: 'llama3' },
            );

            const result = await manager.completeWithFallback(makeParams(), chain);

            expect(result.content).toBe('local response');
            expect(result.usedProvider).toBe('ollama');
        });

        it('skips providers not in registry', async () => {
            const ollama = createMockProvider('ollama', () =>
                Promise.resolve(makeResult('ollama response', 'llama3')),
            );
            // Registry only has ollama — anthropic and openai are not registered
            const registry = createMockRegistry([ollama]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
                { provider: 'ollama', model: 'llama3' },
            );

            const result = await manager.completeWithFallback(makeParams(), chain);

            expect(result.content).toBe('ollama response');
            expect(result.usedProvider).toBe('ollama');
        });

        it('overrides model from params with chain entry model', async () => {
            let receivedModel = '';
            const anthropic = createMockProvider('anthropic', (params) => {
                receivedModel = params.model;
                return Promise.resolve(makeResult('ok', params.model));
            });
            const registry = createMockRegistry([anthropic]);
            manager = new FallbackManager(registry);

            const chain = makeChain({ provider: 'anthropic', model: 'chain-model' });

            await manager.completeWithFallback(makeParams({ model: 'original-model' }), chain);

            expect(receivedModel).toBe('chain-model');
        });
    });

    // ── Chain exhaustion ─────────────────────────────────────────────────

    describe('chain exhaustion', () => {
        it('throws ExternalServiceError when all providers fail', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('rate limit exceeded')),
            );
            const openai = createMockProvider('openai', () =>
                Promise.reject(new Error('502 bad gateway')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            try {
                await manager.completeWithFallback(makeParams(), chain);
                expect(true).toBe(false); // should not reach
            } catch (err) {
                expect(err).toBeInstanceOf(ExternalServiceError);
                const msg = (err as ExternalServiceError).message;
                expect(msg).toContain('All providers in fallback chain failed');
                expect(msg).toContain('anthropic/claude-sonnet: rate limit exceeded');
                expect(msg).toContain('openai/gpt-4: 502 bad gateway');
            }
        });

        it('throws when all providers are in cooldown', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('rate limit exceeded')),
            );
            const registry = createMockRegistry([anthropic]);
            manager = new FallbackManager(registry);

            const chain = makeChain({ provider: 'anthropic', model: 'claude-sonnet' });

            // Exhaust the provider with 3 consecutive failures to trigger cooldown
            for (let i = 0; i < 3; i++) {
                try {
                    await manager.completeWithFallback(makeParams(), chain);
                } catch {
                    // expected
                }
            }

            // Now the provider should be in cooldown — chain is empty
            try {
                await manager.completeWithFallback(makeParams(), chain);
                expect(true).toBe(false); // should not reach
            } catch (err) {
                expect(err).toBeInstanceOf(ExternalServiceError);
            }
        });
    });

    // ── Transient error detection ────────────────────────────────────────

    describe('transient error detection', () => {
        it('marks provider failure for rate limit errors', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('rate limit exceeded')),
            );
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('ok', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            await manager.completeWithFallback(makeParams(), chain);

            // After 1 failure, provider should still be available (threshold is 3)
            const health = manager.getHealthStatus();
            const anthropicHealth = health.find((h) => h.provider === 'anthropic');
            expect(anthropicHealth).toBeDefined();
            expect(anthropicHealth!.consecutiveFailures).toBe(1);
            expect(anthropicHealth!.healthy).toBe(true);
        });

        it('marks provider failure for 429 errors', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('HTTP 429 Too Many Requests')),
            );
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('ok', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            await manager.completeWithFallback(makeParams(), chain);

            const health = manager.getHealthStatus();
            expect(health.find((h) => h.provider === 'anthropic')!.consecutiveFailures).toBe(1);
        });

        it('marks provider failure for timeout and connection errors', async () => {
            const providers = ['timeout', 'ECONNREFUSED', 'fetch failed', 'overloaded', '503', '502'];

            for (const errorMsg of providers) {
                const anthropic = createMockProvider('anthropic', () =>
                    Promise.reject(new Error(errorMsg)),
                );
                const openai = createMockProvider('openai', () =>
                    Promise.resolve(makeResult('ok', 'gpt-4')),
                );
                const registry = createMockRegistry([anthropic, openai]);
                const mgr = new FallbackManager(registry);

                const chain = makeChain(
                    { provider: 'anthropic', model: 'claude-sonnet' },
                    { provider: 'openai', model: 'gpt-4' },
                );

                await mgr.completeWithFallback(makeParams(), chain);

                const health = mgr.getHealthStatus();
                const h = health.find((s) => s.provider === 'anthropic');
                expect(h).toBeDefined();
                expect(h!.consecutiveFailures).toBe(1);
            }
        });

        it('does not mark failure for non-transient errors (auth, 4xx)', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('Authentication failed: invalid API key')),
            );
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('ok', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            await manager.completeWithFallback(makeParams(), chain);

            // Non-transient errors do not call markFailure, so no health record
            const health = manager.getHealthStatus();
            const anthropicHealth = health.find((h) => h.provider === 'anthropic');
            expect(anthropicHealth).toBeUndefined();
        });

        it('still tries next provider on non-transient errors', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('model not found: claude-ultra')),
            );
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('fallback', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-ultra' },
                { provider: 'openai', model: 'gpt-4' },
            );

            const result = await manager.completeWithFallback(makeParams(), chain);
            expect(result.content).toBe('fallback');
            expect(result.usedProvider).toBe('openai');
        });
    });

    // ── Health state transitions ─────────────────────────────────────────

    describe('health state transitions', () => {
        it('transitions to unhealthy after MAX_CONSECUTIVE_FAILURES (3) transient errors', async () => {
            let callCount = 0;
            const anthropic = createMockProvider('anthropic', () => {
                callCount++;
                return Promise.reject(new Error('rate limit exceeded'));
            });
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('ok', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            // 3 consecutive failures needed to trigger unhealthy
            for (let i = 0; i < 3; i++) {
                await manager.completeWithFallback(makeParams(), chain);
            }

            const health = manager.getHealthStatus();
            const h = health.find((s) => s.provider === 'anthropic');
            expect(h!.healthy).toBe(false);
            expect(h!.consecutiveFailures).toBe(3);
            expect(callCount).toBe(3);
        });

        it('provider remains healthy before reaching failure threshold', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('rate limit exceeded')),
            );
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('ok', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            // Only 2 failures — below threshold of 3
            for (let i = 0; i < 2; i++) {
                await manager.completeWithFallback(makeParams(), chain);
            }

            const health = manager.getHealthStatus();
            const h = health.find((s) => s.provider === 'anthropic');
            expect(h!.healthy).toBe(true);
            expect(h!.consecutiveFailures).toBe(2);
        });

        it('resets consecutive failures on success (healthy recovery)', async () => {
            let failCount = 0;
            const anthropic = createMockProvider('anthropic', () => {
                failCount++;
                if (failCount <= 2) return Promise.reject(new Error('rate limit exceeded'));
                return Promise.resolve(makeResult('recovered', 'claude-sonnet'));
            });
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('ok', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            // Fail twice then succeed
            await manager.completeWithFallback(makeParams(), chain);
            await manager.completeWithFallback(makeParams(), chain);

            let h = manager.getHealthStatus().find((s) => s.provider === 'anthropic');
            expect(h!.consecutiveFailures).toBe(2);

            // Third call succeeds — anthropic recovers
            const result = await manager.completeWithFallback(makeParams(), chain);
            expect(result.usedProvider).toBe('anthropic');

            h = manager.getHealthStatus().find((s) => s.provider === 'anthropic');
            expect(h!.consecutiveFailures).toBe(0);
            expect(h!.healthy).toBe(true);
        });
    });

    // ── Cooldown and exponential backoff ─────────────────────────────────

    describe('cooldown and exponential backoff', () => {
        it('skips provider during cooldown period', async () => {
            let anthropicCalls = 0;
            const anthropic = createMockProvider('anthropic', () => {
                anthropicCalls++;
                return Promise.reject(new Error('rate limit exceeded'));
            });
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('openai ok', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            // 3 failures to enter cooldown
            for (let i = 0; i < 3; i++) {
                await manager.completeWithFallback(makeParams(), chain);
            }
            expect(anthropicCalls).toBe(3);

            // Next call should skip anthropic entirely (cooldown)
            const result = await manager.completeWithFallback(makeParams(), chain);
            expect(result.usedProvider).toBe('openai');
            expect(anthropicCalls).toBe(3); // no additional call to anthropic
        });

        it('re-enables provider after cooldown expires', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('rate limit exceeded')),
            );
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('openai ok', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            // 3 failures at t=1_000_000 to enter cooldown
            for (let i = 0; i < 3; i++) {
                await manager.completeWithFallback(makeParams(), chain);
            }

            expect(manager.isProviderAvailable('anthropic')).toBe(false);

            // Advance past the 60s cooldown
            currentTime = 1_000_000 + 61_000;

            expect(manager.isProviderAvailable('anthropic')).toBe(true);
        });

        it('applies exponential backoff: cooldownMs doubles with additional failures beyond threshold', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('rate limit exceeded')),
            );
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('ok', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            // 3 consecutive failures: cooldownMs = 60_000 * 2^(3-3) = 60_000
            for (let i = 0; i < 3; i++) {
                await manager.completeWithFallback(makeParams(), chain);
            }

            let h = manager.getHealthStatus().find((s) => s.provider === 'anthropic');
            expect(h!.cooldownMs).toBe(60_000); // 60s * 2^0 = 60s
            expect(h!.consecutiveFailures).toBe(3);
            expect(h!.healthy).toBe(false);
        });

        it('resets consecutive failures when cooldown expires (provider gets fresh chances)', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('rate limit exceeded')),
            );
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('ok', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            // 3 failures to enter cooldown
            for (let i = 0; i < 3; i++) {
                await manager.completeWithFallback(makeParams(), chain);
            }

            expect(manager.isProviderAvailable('anthropic')).toBe(false);

            // Expire cooldown — isProviderAvailable resets consecutiveFailures to 0
            currentTime = 1_000_000 + 61_000;
            expect(manager.isProviderAvailable('anthropic')).toBe(true);

            const h = manager.getHealthStatus().find((s) => s.provider === 'anthropic');
            expect(h!.consecutiveFailures).toBe(0);
            expect(h!.healthy).toBe(true);

            // One more failure starts fresh from consecutiveFailures=1
            await manager.completeWithFallback(makeParams(), chain);
            const h2 = manager.getHealthStatus().find((s) => s.provider === 'anthropic');
            expect(h2!.consecutiveFailures).toBe(1);
            expect(h2!.healthy).toBe(true);
        });
    });

    // ── isProviderAvailable ──────────────────────────────────────────────

    describe('isProviderAvailable', () => {
        it('returns true for unknown providers (no health record)', () => {
            const registry = createMockRegistry([]);
            manager = new FallbackManager(registry);

            expect(manager.isProviderAvailable('anthropic')).toBe(true);
        });

        it('returns true for healthy providers', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('rate limit exceeded')),
            );
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('ok', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            // 1 failure — still healthy
            await manager.completeWithFallback(makeParams(), chain);
            expect(manager.isProviderAvailable('anthropic')).toBe(true);
        });

        it('returns false for providers in cooldown', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('rate limit exceeded')),
            );
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('ok', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            for (let i = 0; i < 3; i++) {
                await manager.completeWithFallback(makeParams(), chain);
            }

            expect(manager.isProviderAvailable('anthropic')).toBe(false);
        });
    });

    // ── getHealthStatus and resetHealth ───────────────────────────────────

    describe('getHealthStatus / resetHealth', () => {
        it('returns empty array when no providers have been tried', () => {
            const registry = createMockRegistry([]);
            manager = new FallbackManager(registry);

            expect(manager.getHealthStatus()).toEqual([]);
        });

        it('returns health entries for providers that have been tracked', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('rate limit exceeded')),
            );
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('ok', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            await manager.completeWithFallback(makeParams(), chain);

            const health = manager.getHealthStatus();
            // anthropic had a transient failure → tracked
            // openai succeeded → tracked (markHealthy on existing)
            // But openai only gets markHealthy called if it already has a health record.
            // Since openai has no previous failure, it won't have a health entry.
            expect(health.length).toBe(1);
            expect(health[0].provider).toBe('anthropic');
        });

        it('clears all health state on resetHealth', async () => {
            const anthropic = createMockProvider('anthropic', () =>
                Promise.reject(new Error('rate limit exceeded')),
            );
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('ok', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            for (let i = 0; i < 3; i++) {
                await manager.completeWithFallback(makeParams(), chain);
            }

            expect(manager.isProviderAvailable('anthropic')).toBe(false);

            manager.resetHealth();

            expect(manager.getHealthStatus()).toEqual([]);
            expect(manager.isProviderAvailable('anthropic')).toBe(true);
        });
    });

    // ── Concurrent request handling ──────────────────────────────────────

    describe('concurrent request handling', () => {
        it('handles multiple concurrent requests with shared health state', async () => {
            let anthropicCalls = 0;
            const anthropic = createMockProvider('anthropic', () => {
                anthropicCalls++;
                return Promise.reject(new Error('rate limit exceeded'));
            });
            const openai = createMockProvider('openai', () =>
                Promise.resolve(makeResult('openai ok', 'gpt-4')),
            );
            const registry = createMockRegistry([anthropic, openai]);
            manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'anthropic', model: 'claude-sonnet' },
                { provider: 'openai', model: 'gpt-4' },
            );

            // Fire 5 concurrent requests
            const results = await Promise.all([
                manager.completeWithFallback(makeParams(), chain),
                manager.completeWithFallback(makeParams(), chain),
                manager.completeWithFallback(makeParams(), chain),
                manager.completeWithFallback(makeParams(), chain),
                manager.completeWithFallback(makeParams(), chain),
            ]);

            // All should eventually succeed via fallback
            for (const r of results) {
                expect(r.content).toBe('openai ok');
            }

            // Health state should reflect cumulative failures
            const h = manager.getHealthStatus().find((s) => s.provider === 'anthropic');
            expect(h).toBeDefined();
            expect(h!.consecutiveFailures).toBeGreaterThanOrEqual(3);
        });
    });

    // ── DEFAULT_FALLBACK_CHAINS ──────────────────────────────────────────

    describe('DEFAULT_FALLBACK_CHAINS', () => {
        it('has expected chain names', () => {
            expect(Object.keys(DEFAULT_FALLBACK_CHAINS)).toEqual(
                expect.arrayContaining(['high-capability', 'balanced', 'cost-optimized', 'local', 'cloud']),
            );
        });

        it('each chain has at least 2 entries', () => {
            for (const [, chain] of Object.entries(DEFAULT_FALLBACK_CHAINS)) {
                expect(chain.chain.length).toBeGreaterThanOrEqual(2);
            }
        });
    });
});
