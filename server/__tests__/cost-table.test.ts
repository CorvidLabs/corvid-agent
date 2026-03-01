import { describe, it, expect } from 'bun:test';
import {
    getModelPricing,
    estimateCost,
    getModelsForProvider,
    getModelsByCost,
    getSubagentCapableModels,
    getWebSearchCapableModels,
    getOllamaCloudModels,
    MODEL_PRICING,
} from '../providers/cost-table';

/**
 * cost-table tests — pricing lookup, cost estimation edge cases,
 * and model filtering functions.
 */

describe('getModelPricing', () => {
    it('returns pricing for a known Anthropic model', () => {
        const pricing = getModelPricing('claude-opus-4-6');
        expect(pricing).not.toBeNull();
        expect(pricing!.provider).toBe('anthropic');
        expect(pricing!.inputPricePerMillion).toBeGreaterThan(0);
        expect(pricing!.outputPricePerMillion).toBeGreaterThan(0);
    });

    it('returns pricing for a known OpenAI model', () => {
        const pricing = getModelPricing('gpt-4.1');
        expect(pricing).not.toBeNull();
        expect(pricing!.provider).toBe('openai');
    });

    it('returns pricing for a known Ollama local model', () => {
        const pricing = getModelPricing('llama3.3');
        expect(pricing).not.toBeNull();
        expect(pricing!.provider).toBe('ollama');
        expect(pricing!.inputPricePerMillion).toBe(0);
        expect(pricing!.outputPricePerMillion).toBe(0);
    });

    it('returns null for an unknown model', () => {
        expect(getModelPricing('nonexistent-model-v99')).toBeNull();
    });

    it('returns null for an empty string', () => {
        expect(getModelPricing('')).toBeNull();
    });

    it('is case-sensitive (does not match wrong case)', () => {
        // Model IDs are case-sensitive; verify uppercase variant doesn't match
        expect(getModelPricing('CLAUDE-OPUS-4-6')).toBeNull();
    });
});

describe('estimateCost', () => {
    it('returns 0 for an unknown model', () => {
        expect(estimateCost('nonexistent', 1000, 1000)).toBe(0);
    });

    it('returns 0 for zero tokens', () => {
        expect(estimateCost('claude-opus-4-6', 0, 0)).toBe(0);
    });

    it('computes correct cost for known model with exact token counts', () => {
        // claude-opus-4-6: $5/1M input, $25/1M output
        const cost = estimateCost('claude-opus-4-6', 1_000_000, 1_000_000);
        expect(cost).toBeCloseTo(30, 2); // 5 + 25
    });

    it('computes correct cost for fractional token counts', () => {
        // 500 input tokens, 200 output tokens on claude-opus-4-6
        const cost = estimateCost('claude-opus-4-6', 500, 200);
        const expected = (500 / 1_000_000) * 5 + (200 / 1_000_000) * 25;
        expect(cost).toBeCloseTo(expected, 10);
    });

    it('returns 0 for free (Ollama local) models regardless of token count', () => {
        expect(estimateCost('llama3.3', 1_000_000, 1_000_000)).toBe(0);
    });

    it('handles very large token counts without overflow', () => {
        // 1 billion input tokens
        const cost = estimateCost('claude-opus-4-6', 1_000_000_000, 0);
        expect(cost).toBe(5000); // (1B / 1M) * $5
        expect(Number.isFinite(cost)).toBe(true);
    });

    it('handles negative token counts (returns negative cost — no guard)', () => {
        // This tests current behavior, not ideal behavior
        const cost = estimateCost('claude-opus-4-6', -1_000_000, 0);
        expect(cost).toBe(-5);
    });
});

describe('getModelsForProvider', () => {
    it('returns only Anthropic models for "anthropic"', () => {
        const models = getModelsForProvider('anthropic');
        expect(models.length).toBeGreaterThan(0);
        expect(models.every((m) => m.provider === 'anthropic')).toBe(true);
    });

    it('returns only OpenAI models for "openai"', () => {
        const models = getModelsForProvider('openai');
        expect(models.length).toBeGreaterThan(0);
        expect(models.every((m) => m.provider === 'openai')).toBe(true);
    });

    it('returns only Ollama models for "ollama"', () => {
        const models = getModelsForProvider('ollama');
        expect(models.length).toBeGreaterThan(0);
        expect(models.every((m) => m.provider === 'ollama')).toBe(true);
    });

    it('returns empty array for unknown provider', () => {
        expect(getModelsForProvider('unknown-provider')).toEqual([]);
    });
});

describe('getModelsByCost', () => {
    it('returns models sorted by outputPricePerMillion ascending', () => {
        const sorted = getModelsByCost();
        for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i].outputPricePerMillion).toBeGreaterThanOrEqual(
                sorted[i - 1].outputPricePerMillion,
            );
        }
    });

    it('does not mutate the original MODEL_PRICING array', () => {
        const originalFirst = MODEL_PRICING[0].model;
        getModelsByCost();
        expect(MODEL_PRICING[0].model).toBe(originalFirst);
    });

    it('returns the same number of models as MODEL_PRICING', () => {
        expect(getModelsByCost().length).toBe(MODEL_PRICING.length);
    });
});

describe('getSubagentCapableModels', () => {
    it('returns only models with supportsSubagents === true', () => {
        const models = getSubagentCapableModels();
        expect(models.length).toBeGreaterThan(0);
        expect(models.every((m) => m.supportsSubagents === true)).toBe(true);
    });

    it('does not include models without supportsSubagents', () => {
        const models = getSubagentCapableModels();
        const ids = new Set(models.map((m) => m.model));
        // claude-opus-4-6 does not have supportsSubagents
        expect(ids.has('claude-opus-4-6')).toBe(false);
    });
});

describe('getWebSearchCapableModels', () => {
    it('returns only models with supportsWebSearch === true', () => {
        const models = getWebSearchCapableModels();
        expect(models.length).toBeGreaterThan(0);
        expect(models.every((m) => m.supportsWebSearch === true)).toBe(true);
    });
});

describe('getOllamaCloudModels', () => {
    it('returns only Ollama models with isCloud === true', () => {
        const models = getOllamaCloudModels();
        expect(models.length).toBeGreaterThan(0);
        expect(models.every((m) => m.provider === 'ollama' && m.isCloud === true)).toBe(true);
    });

    it('does not include local Ollama models', () => {
        const models = getOllamaCloudModels();
        const ids = new Set(models.map((m) => m.model));
        expect(ids.has('llama3.3')).toBe(false);
    });
});

describe('MODEL_PRICING data integrity', () => {
    it('all models have unique identifiers', () => {
        const ids = MODEL_PRICING.map((m) => m.model);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('all models have non-negative pricing', () => {
        for (const m of MODEL_PRICING) {
            expect(m.inputPricePerMillion).toBeGreaterThanOrEqual(0);
            expect(m.outputPricePerMillion).toBeGreaterThanOrEqual(0);
        }
    });

    it('all models have positive context windows', () => {
        for (const m of MODEL_PRICING) {
            expect(m.maxContextTokens).toBeGreaterThan(0);
            expect(m.maxOutputTokens).toBeGreaterThan(0);
        }
    });

    it('capability tiers are between 1 and 4', () => {
        for (const m of MODEL_PRICING) {
            expect(m.capabilityTier).toBeGreaterThanOrEqual(1);
            expect(m.capabilityTier).toBeLessThanOrEqual(4);
        }
    });
});
