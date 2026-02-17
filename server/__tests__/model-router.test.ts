/**
 * Tests for Multi-Model Cost-Aware Routing:
 * - cost-table.ts: Model pricing, cost estimation
 * - router.ts: Complexity estimation, model selection
 * - fallback.ts: Fallback chains, provider health
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import {
    MODEL_PRICING,
    getModelPricing,
    estimateCost,
    getModelsForProvider,
    getModelsByCost,
} from '../providers/cost-table';
import { estimateComplexity, ModelRouter } from '../providers/router';
import { FallbackManager, DEFAULT_FALLBACK_CHAINS } from '../providers/fallback';
import { LlmProviderRegistry } from '../providers/registry';
import type { LlmProvider, LlmProviderType, LlmCompletionParams, LlmCompletionResult, LlmProviderInfo } from '../providers/types';

// ─── Mock Provider ───────────────────────────────────────────────────────────

function createMockProvider(type: LlmProviderType, models: string[]): LlmProvider {
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
            return {
                content: 'Mock response',
                model: params.model,
                usage: { inputTokens: 100, outputTokens: 50 },
            };
        },
        async isAvailable(): Promise<boolean> {
            return true;
        },
    };
}

// ─── Cost Table Tests ────────────────────────────────────────────────────────

describe('Cost Table', () => {
    test('MODEL_PRICING has entries for all providers', () => {
        const providers = new Set(MODEL_PRICING.map((m) => m.provider));
        expect(providers.has('anthropic')).toBe(true);
        expect(providers.has('openai')).toBe(true);
        expect(providers.has('ollama')).toBe(true);
    });

    test('all models have required fields', () => {
        for (const model of MODEL_PRICING) {
            expect(model.model).toBeTruthy();
            expect(model.provider).toBeTruthy();
            expect(model.displayName).toBeTruthy();
            expect(typeof model.inputPricePerMillion).toBe('number');
            expect(typeof model.outputPricePerMillion).toBe('number');
            expect(model.maxContextTokens).toBeGreaterThan(0);
            expect(model.maxOutputTokens).toBeGreaterThan(0);
            expect(model.capabilityTier).toBeGreaterThanOrEqual(1);
            expect(model.capabilityTier).toBeLessThanOrEqual(4);
        }
    });

    test('getModelPricing returns correct model', () => {
        const opus = getModelPricing('claude-opus-4-6');
        expect(opus).not.toBeNull();
        expect(opus!.provider).toBe('anthropic');
        expect(opus!.capabilityTier).toBe(1);
    });

    test('getModelPricing returns null for unknown model', () => {
        expect(getModelPricing('nonexistent-model')).toBeNull();
    });

    test('estimateCost calculates correctly', () => {
        // claude-opus-4-6: $15/M input, $75/M output
        const cost = estimateCost('claude-opus-4-6', 1_000_000, 1_000_000);
        expect(cost).toBe(90); // $15 input + $75 output
    });

    test('estimateCost returns 0 for unknown model', () => {
        expect(estimateCost('nonexistent', 1000, 1000)).toBe(0);
    });

    test('ollama models have zero cost', () => {
        const ollamaModels = getModelsForProvider('ollama');
        expect(ollamaModels.length).toBeGreaterThan(0);
        for (const m of ollamaModels) {
            expect(m.inputPricePerMillion).toBe(0);
            expect(m.outputPricePerMillion).toBe(0);
        }
    });

    test('getModelsByCost returns cheapest first', () => {
        const sorted = getModelsByCost();
        for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i].outputPricePerMillion).toBeGreaterThanOrEqual(
                sorted[i - 1].outputPricePerMillion,
            );
        }
    });

    test('getModelsForProvider filters correctly', () => {
        const anthropic = getModelsForProvider('anthropic');
        expect(anthropic.length).toBeGreaterThan(0);
        for (const m of anthropic) {
            expect(m.provider).toBe('anthropic');
        }
    });
});

// ─── Complexity Estimation Tests ─────────────────────────────────────────────

describe('Complexity Estimation', () => {
    test('simple prompts are classified as simple', () => {
        const { level } = estimateComplexity('list files');
        expect(level).toBe('simple');
    });

    test('short queries are simple or moderate', () => {
        const { level } = estimateComplexity('show status');
        expect(['simple', 'moderate']).toContain(level);
    });

    test('complex prompts with keywords are classified higher', () => {
        const { level } = estimateComplexity(
            'Refactor the authentication system, migrate to JWT, and optimize database queries',
        );
        expect(['complex', 'expert']).toContain(level);
    });

    test('multi-step prompts are classified as complex or expert', () => {
        const { level } = estimateComplexity(
            'First analyze the codebase. Then refactor the API layer. After that, implement tests.',
        );
        expect(['complex', 'expert']).toContain(level);
    });

    test('returns complexity signals', () => {
        const { signals } = estimateComplexity('refactor and optimize the code');
        expect(signals.inputTokenEstimate).toBeGreaterThan(0);
        expect(typeof signals.requiresTools).toBe('boolean');
        expect(typeof signals.requiresThinking).toBe('boolean');
        expect(signals.complexityKeywords).toBeGreaterThanOrEqual(0);
    });

    test('tool-related prompts signal requiresTools', () => {
        const { signals } = estimateComplexity('create a new file and run the tests');
        expect(signals.requiresTools).toBe(true);
    });
});

// ─── Model Router Tests ──────────────────────────────────────────────────────

describe('ModelRouter', () => {
    let registry: LlmProviderRegistry;
    let router: ModelRouter;

    beforeEach(() => {
        // Create a fresh registry (bypass singleton for tests)
        registry = new (LlmProviderRegistry as new () => LlmProviderRegistry)();
        registry.register(createMockProvider('anthropic', ['claude-opus-4-6', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001']));
        registry.register(createMockProvider('openai', ['gpt-4o', 'gpt-4o-mini']));
        router = new ModelRouter(registry);
    });

    test('selects model for simple prompt', () => {
        const result = router.selectModel('list files');
        expect(result.model).toBeTruthy();
        expect(result.provider).toBeTruthy();
        expect(result.complexity).toBeTruthy();
        expect(typeof result.estimatedCost).toBe('number');
    });

    test('selects cheaper model for simple tasks', () => {
        const simple = router.selectModel('show status');
        const complex = router.selectModel('Refactor the entire authentication system, migrate to JWT tokens, and optimize all database queries for performance');

        // Simple task should select a cheaper or equal cost model
        expect(simple.estimatedCost).toBeLessThanOrEqual(complex.estimatedCost + 0.01);
    });

    test('respects preferred provider', () => {
        const result = router.selectModel('help me code', {
            preferredProvider: 'openai',
        });
        expect(result.provider).toBe('openai');
    });

    test('returns complexity level', () => {
        const simple = router.selectModel('list');
        const complex = router.selectModel('refactor and architect the entire system design');

        expect(['simple', 'moderate']).toContain(simple.complexity);
        expect(['complex', 'expert']).toContain(complex.complexity);
    });

    test('getFallbackChain returns chain for each complexity', () => {
        const expert = router.getFallbackChain('expert');
        const simple = router.getFallbackChain('simple');

        expect(expert.chain.length).toBeGreaterThan(0);
        expect(simple.chain.length).toBeGreaterThan(0);
    });

    test('getStats returns current routing info', () => {
        const stats = router.getStats();
        expect(stats.availableModels).toBeGreaterThan(0);
        expect(stats.availableProviders.length).toBeGreaterThan(0);
        expect(Array.isArray(stats.healthStatus)).toBe(true);
    });
});

// ─── Fallback Manager Tests ──────────────────────────────────────────────────

describe('FallbackManager', () => {
    let registry: LlmProviderRegistry;
    let fallback: FallbackManager;

    beforeEach(() => {
        registry = new (LlmProviderRegistry as new () => LlmProviderRegistry)();
        registry.register(createMockProvider('anthropic', ['claude-sonnet-4-5-20250929']));
        registry.register(createMockProvider('openai', ['gpt-4o']));
        fallback = new FallbackManager(registry);
    });

    test('DEFAULT_FALLBACK_CHAINS has expected chains', () => {
        expect(DEFAULT_FALLBACK_CHAINS['high-capability']).toBeTruthy();
        expect(DEFAULT_FALLBACK_CHAINS['balanced']).toBeTruthy();
        expect(DEFAULT_FALLBACK_CHAINS['cost-optimized']).toBeTruthy();
    });

    test('all chains have at least one entry', () => {
        for (const [, chain] of Object.entries(DEFAULT_FALLBACK_CHAINS)) {
            expect(chain.chain.length).toBeGreaterThan(0);
        }
    });

    test('isProviderAvailable returns true initially', () => {
        expect(fallback.isProviderAvailable('anthropic')).toBe(true);
        expect(fallback.isProviderAvailable('openai')).toBe(true);
    });

    test('getHealthStatus returns empty initially', () => {
        expect(fallback.getHealthStatus()).toEqual([]);
    });

    test('resetHealth clears all status', () => {
        fallback.resetHealth();
        expect(fallback.getHealthStatus()).toEqual([]);
    });

    test('completeWithFallback succeeds with first provider', async () => {
        const result = await fallback.completeWithFallback(
            {
                model: 'claude-sonnet-4-5-20250929',
                systemPrompt: 'You are helpful',
                messages: [{ role: 'user', content: 'Hello' }],
            },
            DEFAULT_FALLBACK_CHAINS['balanced'],
        );

        expect(result.content).toBe('Mock response');
        expect(result.usedProvider).toBeTruthy();
        expect(result.usedModel).toBeTruthy();
    });

    test('completeWithFallback fails when chain is empty', async () => {
        try {
            await fallback.completeWithFallback(
                {
                    model: 'test',
                    systemPrompt: 'test',
                    messages: [{ role: 'user', content: 'test' }],
                },
                { chain: [] },
            );
            expect(true).toBe(false); // Should not reach here
        } catch (err: unknown) {
            expect((err as Error).message).toContain('All providers in fallback chain failed');
        }
    });
});
