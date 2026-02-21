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
    /** Whether this model supports spawning subagents */
    supportsSubagents?: boolean;
    /** Whether this model has built-in web search */
    supportsWebSearch?: boolean;
    /** Whether this is an Ollama cloud model (runs remotely, not local) */
    isCloud?: boolean;
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
        inputPricePerMillion: 5,
        outputPricePerMillion: 25,
        maxContextTokens: 200_000,
        maxOutputTokens: 32_000,
        capabilityTier: 1,
        supportsTools: true,
        supportsThinking: true,
    },
    {
        model: 'claude-sonnet-4-6',
        provider: 'anthropic',
        displayName: 'Claude Sonnet 4.6',
        inputPricePerMillion: 3,
        outputPricePerMillion: 15,
        maxContextTokens: 200_000,
        maxOutputTokens: 16_000,
        capabilityTier: 2,
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
        inputPricePerMillion: 1,
        outputPricePerMillion: 5,
        maxContextTokens: 200_000,
        maxOutputTokens: 8_192,
        capabilityTier: 3,
        supportsTools: true,
        supportsThinking: false,
    },
    // ─── OpenAI ──────────────────────────────────────────────────────────
    {
        model: 'gpt-4.1',
        provider: 'openai',
        displayName: 'GPT-4.1',
        inputPricePerMillion: 2,
        outputPricePerMillion: 8,
        maxContextTokens: 1_047_576,
        maxOutputTokens: 32_768,
        capabilityTier: 1,
        supportsTools: true,
        supportsThinking: false,
    },
    {
        model: 'gpt-4.1-mini',
        provider: 'openai',
        displayName: 'GPT-4.1 Mini',
        inputPricePerMillion: 0.40,
        outputPricePerMillion: 1.60,
        maxContextTokens: 1_047_576,
        maxOutputTokens: 16_384,
        capabilityTier: 2,
        supportsTools: true,
        supportsThinking: false,
    },
    {
        model: 'gpt-4.1-nano',
        provider: 'openai',
        displayName: 'GPT-4.1 Nano',
        inputPricePerMillion: 0.10,
        outputPricePerMillion: 0.40,
        maxContextTokens: 1_047_576,
        maxOutputTokens: 16_384,
        capabilityTier: 3,
        supportsTools: true,
        supportsThinking: false,
    },
    {
        model: 'o3',
        provider: 'openai',
        displayName: 'o3',
        inputPricePerMillion: 2,
        outputPricePerMillion: 8,
        maxContextTokens: 200_000,
        maxOutputTokens: 100_000,
        capabilityTier: 1,
        supportsTools: true,
        supportsThinking: true,
    },
    {
        model: 'o4-mini',
        provider: 'openai',
        displayName: 'o4-mini',
        inputPricePerMillion: 1.10,
        outputPricePerMillion: 4.40,
        maxContextTokens: 200_000,
        maxOutputTokens: 100_000,
        capabilityTier: 2,
        supportsTools: true,
        supportsThinking: true,
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
        model: 'qwen3:32b',
        provider: 'ollama',
        displayName: 'Qwen 3 32B',
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        maxContextTokens: 128_000,
        maxOutputTokens: 8_192,
        capabilityTier: 2,
        supportsTools: true,
        supportsThinking: true,
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
    // ─── Ollama Cloud (remote, pay-per-use via Ollama) ──────────────────
    {
        model: 'qwen3.5:cloud',
        provider: 'ollama',
        displayName: 'Qwen 3.5 397B (Cloud)',
        inputPricePerMillion: 0,   // Pricing TBD — Ollama cloud billing
        outputPricePerMillion: 0,
        maxContextTokens: 128_000,
        maxOutputTokens: 32_000,
        capabilityTier: 1,
        supportsTools: true,
        supportsThinking: true,
        supportsSubagents: true,
        supportsWebSearch: true,
        isCloud: true,
    },
    {
        model: 'minimax-m2.5:cloud',
        provider: 'ollama',
        displayName: 'MiniMax M2.5 (Cloud)',
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        maxContextTokens: 1_000_000,
        maxOutputTokens: 32_000,
        capabilityTier: 1,
        supportsTools: true,
        supportsThinking: true,
        supportsSubagents: true,
        supportsWebSearch: true,
        isCloud: true,
    },
    {
        model: 'deepseek-v3.2:cloud',
        provider: 'ollama',
        displayName: 'DeepSeek V3.2 (Cloud)',
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        maxContextTokens: 128_000,
        maxOutputTokens: 16_000,
        capabilityTier: 1,
        supportsTools: true,
        supportsThinking: true,
        supportsSubagents: true,
        supportsWebSearch: true,
        isCloud: true,
    },
    {
        model: 'glm-5:cloud',
        provider: 'ollama',
        displayName: 'GLM-5 (Cloud)',
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        maxContextTokens: 128_000,
        maxOutputTokens: 16_000,
        capabilityTier: 2,
        supportsTools: true,
        supportsThinking: true,
        supportsSubagents: true,
        supportsWebSearch: true,
        isCloud: true,
    },
    {
        model: 'qwen3-coder-next:cloud',
        provider: 'ollama',
        displayName: 'Qwen 3 Coder Next (Cloud)',
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        maxContextTokens: 128_000,
        maxOutputTokens: 16_000,
        capabilityTier: 1,
        supportsTools: true,
        supportsThinking: true,
        supportsSubagents: true,
        supportsWebSearch: true,
        isCloud: true,
    },
    {
        model: 'kimi-k2.5:cloud',
        provider: 'ollama',
        displayName: 'Kimi K2.5 (Cloud)',
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        maxContextTokens: 128_000,
        maxOutputTokens: 16_000,
        capabilityTier: 2,
        supportsTools: true,
        supportsThinking: true,
        supportsSubagents: true,
        supportsWebSearch: true,
        isCloud: true,
    },
    {
        model: 'devstral-small-2:cloud',
        provider: 'ollama',
        displayName: 'Devstral Small 2 24B (Cloud)',
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        maxContextTokens: 128_000,
        maxOutputTokens: 16_000,
        capabilityTier: 2,
        supportsTools: true,
        supportsThinking: false,
        supportsSubagents: true,
        supportsWebSearch: true,
        isCloud: true,
    },
    {
        model: 'nemotron-3-nano:cloud',
        provider: 'ollama',
        displayName: 'Nemotron 3 Nano 30B (Cloud)',
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        maxContextTokens: 128_000,
        maxOutputTokens: 16_000,
        capabilityTier: 2,
        supportsTools: true,
        supportsThinking: false,
        supportsSubagents: true,
        supportsWebSearch: true,
        isCloud: true,
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
 * Get models that support subagent spawning.
 */
export function getSubagentCapableModels(): ModelPricing[] {
    return MODEL_PRICING.filter((m) => m.supportsSubagents === true);
}

/**
 * Get models that support built-in web search.
 */
export function getWebSearchCapableModels(): ModelPricing[] {
    return MODEL_PRICING.filter((m) => m.supportsWebSearch === true);
}

/**
 * Get Ollama cloud models (remote, not local).
 */
export function getOllamaCloudModels(): ModelPricing[] {
    return MODEL_PRICING.filter((m) => m.provider === 'ollama' && m.isCloud === true);
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
