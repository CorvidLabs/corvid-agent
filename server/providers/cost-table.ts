/**
 * Cost Table — Per-model pricing data for cost-aware routing.
 *
 * Prices in USD per million tokens. Updated periodically from public
 * provider pricing pages.
 */

export interface ModelPricing {
    /** Model identifier (as used in API calls) */
    model: string;
    /** Provider type */
    provider: 'anthropic' | 'openai' | 'ollama';
    /** Display name */
    displayName: string;
    /** USD per 1M input tokens */
    inputPricePerMillion: number;
    /** USD per 1M output tokens */
    outputPricePerMillion: number;
    /** Max context window in tokens */
    maxContextTokens: number;
    /** Max output tokens */
    maxOutputTokens: number;
    /** Relative capability tier (1 = highest, 4 = lowest) */
    capabilityTier: number;
    /** Whether this model supports tool use */
    supportsTools: boolean;
    /** Whether this model supports extended thinking */
    supportsThinking: boolean;
}

/**
 * Pricing data for supported models.
 * Prices as of February 2026.
 */
export const MODEL_PRICING: ModelPricing[] = [
    // ─── Anthropic ─────────────────────────────────────────────────────────
    {
        model: 'claude-opus-4-6',
        provider: 'anthropic',
        displayName: 'Claude Opus 4.6',
        inputPricePerMillion: 15,
        outputPricePerMillion: 75,
        maxContextTokens: 200_000,
        maxOutputTokens: 32_000,
        capabilityTier: 1,
        supportsTools: true,
        supportsThinking: true,
    },
    {
        model: 'claude-sonnet-4-5-20250929',
        provider: 'anthropic',
        displayName: 'Claude Sonnet 4.5',
        inputPricePerMillion: 3,
        outputPricePerMillion: 15,
        maxContextTokens: 200_000,
        maxOutputTokens: 16_000,
        capabilityTier: 2,
        supportsTools: true,
        supportsThinking: true,
    },
    {
        model: 'claude-haiku-4-5-20251001',
        provider: 'anthropic',
        displayName: 'Claude Haiku 4.5',
        inputPricePerMillion: 0.80,
        outputPricePerMillion: 4,
        maxContextTokens: 200_000,
        maxOutputTokens: 8_192,
        capabilityTier: 3,
        supportsTools: true,
        supportsThinking: false,
    },
    // ─── OpenAI ──────────────────────────────────────────────────────────
    {
        model: 'gpt-4o',
        provider: 'openai',
        displayName: 'GPT-4o',
        inputPricePerMillion: 2.5,
        outputPricePerMillion: 10,
        maxContextTokens: 128_000,
        maxOutputTokens: 16_384,
        capabilityTier: 2,
        supportsTools: true,
        supportsThinking: false,
    },
    {
        model: 'gpt-4o-mini',
        provider: 'openai',
        displayName: 'GPT-4o Mini',
        inputPricePerMillion: 0.15,
        outputPricePerMillion: 0.60,
        maxContextTokens: 128_000,
        maxOutputTokens: 16_384,
        capabilityTier: 3,
        supportsTools: true,
        supportsThinking: false,
    },
    {
        model: 'o3-mini',
        provider: 'openai',
        displayName: 'o3-mini',
        inputPricePerMillion: 1.10,
        outputPricePerMillion: 4.40,
        maxContextTokens: 200_000,
        maxOutputTokens: 100_000,
        capabilityTier: 2,
        supportsTools: true,
        supportsThinking: true,
    },
    // ─── Ollama (local, zero cost) ───────────────────────────────────────
    {
        model: 'llama3.3',
        provider: 'ollama',
        displayName: 'Llama 3.3 70B',
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        maxContextTokens: 128_000,
        maxOutputTokens: 8_192,
        capabilityTier: 3,
        supportsTools: true,
        supportsThinking: false,
    },
    {
        model: 'qwen2.5-coder',
        provider: 'ollama',
        displayName: 'Qwen 2.5 Coder 32B',
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        maxContextTokens: 32_000,
        maxOutputTokens: 8_192,
        capabilityTier: 3,
        supportsTools: true,
        supportsThinking: false,
    },
];

/**
 * Get pricing for a specific model.
 */
export function getModelPricing(model: string): ModelPricing | null {
    return MODEL_PRICING.find((m) => m.model === model) ?? null;
}

/**
 * Estimate cost for a request in USD.
 */
export function estimateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
): number {
    const pricing = getModelPricing(model);
    if (!pricing) return 0;

    const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePerMillion;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePerMillion;
    return inputCost + outputCost;
}

/**
 * Get all models for a provider.
 */
export function getModelsForProvider(provider: string): ModelPricing[] {
    return MODEL_PRICING.filter((m) => m.provider === provider);
}

/**
 * Get all models sorted by cost (cheapest first).
 */
export function getModelsByCost(): ModelPricing[] {
    return [...MODEL_PRICING].sort((a, b) => {
        // Sort by output price (typically the dominant cost)
        const aCost = a.outputPricePerMillion;
        const bCost = b.outputPricePerMillion;
        return aCost - bCost;
    });
}
