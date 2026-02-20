/**
 * ModelRouter — Estimates task complexity and selects the cheapest qualified model.
 *
 * When an agent's model is set to 'auto', the router analyzes the prompt
 * and selects the most cost-effective model that can handle it.
 */
import type { LlmProviderType } from './types';
import type { LlmProviderRegistry } from './registry';
import { MODEL_PRICING, estimateCost } from './cost-table';
import { FallbackManager, DEFAULT_FALLBACK_CHAINS, type FallbackChain } from './fallback';
import { createLogger } from '../lib/logger';

const log = createLogger('ModelRouter');

/** Cached result of claude CLI detection (checked once at startup). */
let claudeCliAvailable: boolean | null = null;

function detectClaudeCli(): boolean {
    if (claudeCliAvailable !== null) return claudeCliAvailable;
    claudeCliAvailable = Bun.which('claude') !== null;
    return claudeCliAvailable;
}

/** Returns true if Claude access is available (API key or subscription). */
export function hasClaudeAccess(): boolean {
    return !!process.env.ANTHROPIC_API_KEY || detectClaudeCli();
}

/** Reset claude CLI detection cache (for testing only). */
export function _resetClaudeCliCache(value?: boolean | null): void {
    claudeCliAvailable = value ?? null;
}

/**
 * Returns true when no cloud API keys are configured — the platform
 * should route everything through local Ollama models.
 */
export function isLocalOnly(): boolean {
    return !hasClaudeAccess() && !process.env.OPENAI_API_KEY;
}

export type ComplexityLevel = 'simple' | 'moderate' | 'complex' | 'expert';

interface ComplexitySignals {
    /** Estimated input tokens */
    inputTokenEstimate: number;
    /** Whether tool use is required */
    requiresTools: boolean;
    /** Whether extended thinking is likely needed */
    requiresThinking: boolean;
    /** Keywords suggesting high complexity */
    complexityKeywords: number;
    /** Whether multi-step reasoning is needed */
    multiStep: boolean;
    /** Whether the task benefits from subagent spawning */
    suggestsSubagents: boolean;
    /** Whether the task needs web search */
    suggestsWebSearch: boolean;
}

/**
 * Keywords that suggest higher complexity tasks.
 */
const COMPLEXITY_KEYWORDS = [
    'refactor', 'architect', 'design', 'implement', 'migrate',
    'optimize', 'debug', 'security', 'audit', 'review',
    'analyze', 'complex', 'multi-step', 'comprehensive',
];

const SIMPLE_KEYWORDS = [
    'list', 'show', 'get', 'status', 'help', 'describe',
    'count', 'check', 'find', 'search', 'read',
];

const SUBAGENT_KEYWORDS = [
    'subagent', 'parallel', 'spawn', 'concurrent', 'research',
    'explore', 'investigate', 'compare', 'audit multiple',
];

const WEB_SEARCH_KEYWORDS = [
    'latest', 'current', 'recent', 'today', 'news',
    'look up', 'search the web', 'what is the price',
];

/**
 * Estimate complexity from a prompt string.
 */
export function estimateComplexity(prompt: string): { level: ComplexityLevel; signals: ComplexitySignals } {
    const lower = prompt.toLowerCase();

    // Token estimate (rough: ~4 chars per token)
    const inputTokenEstimate = Math.ceil(prompt.length / 4);

    // Count complexity keywords
    const complexityKeywords = COMPLEXITY_KEYWORDS.filter((kw) => lower.includes(kw)).length;
    const simpleKeywords = SIMPLE_KEYWORDS.filter((kw) => lower.includes(kw)).length;

    // Multi-step detection
    const multiStep = lower.includes('then') || lower.includes('step') ||
        lower.includes('first') || lower.includes('after that') ||
        (lower.match(/\d+\./g)?.length ?? 0) >= 2;

    // Tool use detection
    const requiresTools = lower.includes('file') || lower.includes('code') ||
        lower.includes('run') || lower.includes('execute') ||
        lower.includes('create') || lower.includes('modify');

    // Thinking detection
    const requiresThinking = complexityKeywords >= 3 || multiStep ||
        prompt.length > 2000 || lower.includes('reason') || lower.includes('think');

    // Subagent detection
    const suggestsSubagents = SUBAGENT_KEYWORDS.some((kw) => lower.includes(kw));

    // Web search detection
    const suggestsWebSearch = WEB_SEARCH_KEYWORDS.some((kw) => lower.includes(kw));

    const signals: ComplexitySignals = {
        inputTokenEstimate,
        requiresTools,
        requiresThinking,
        complexityKeywords,
        multiStep,
        suggestsSubagents,
        suggestsWebSearch,
    };

    // Determine level
    let level: ComplexityLevel;

    if (complexityKeywords >= 3 || (multiStep && requiresThinking)) {
        level = 'expert';
    } else if (complexityKeywords >= 1 || multiStep || prompt.length > 1000) {
        level = 'complex';
    } else if (simpleKeywords > complexityKeywords && prompt.length < 200) {
        level = 'simple';
    } else {
        level = 'moderate';
    }

    return { level, signals };
}

/**
 * Map complexity levels to minimum capability tiers.
 */
function minTierForComplexity(level: ComplexityLevel): number {
    switch (level) {
        case 'expert': return 1;
        case 'complex': return 2;
        case 'moderate': return 3;
        case 'simple': return 4;
    }
}

export class ModelRouter {
    private registry: LlmProviderRegistry;
    private fallbackManager: FallbackManager;

    constructor(registry: LlmProviderRegistry) {
        this.registry = registry;
        this.fallbackManager = new FallbackManager(registry);
    }

    /**
     * Select the cheapest qualified model for a given prompt.
     * Returns the model identifier and provider type.
     */
    selectModel(
        prompt: string,
        options?: {
            requiresTools?: boolean;
            requiresThinking?: boolean;
            requiresSubagents?: boolean;
            requiresWebSearch?: boolean;
            maxCostPerMillion?: number;
            preferredProvider?: LlmProviderType;
        },
    ): { model: string; provider: LlmProviderType; complexity: ComplexityLevel; estimatedCost: number } {
        const { level, signals } = estimateComplexity(prompt);
        const minTier = minTierForComplexity(level);

        // In local-only mode, restrict candidates to Ollama models
        const localOnly = isLocalOnly();

        // Filter models that meet requirements
        let candidates = MODEL_PRICING.filter((m) => {
            // Local-only: skip cloud providers entirely
            if (localOnly && m.provider !== 'ollama') return false;
            // Must meet capability tier
            if (m.capabilityTier > minTier) return false;

            // Must support tools if needed
            if ((options?.requiresTools ?? signals.requiresTools) && !m.supportsTools) return false;

            // Must support thinking if needed
            if ((options?.requiresThinking ?? signals.requiresThinking) && !m.supportsThinking) return false;

            // Prefer subagent-capable models when requested or detected
            if (options?.requiresSubagents && !m.supportsSubagents) return false;

            // Prefer web-search-capable models when requested or detected
            if (options?.requiresWebSearch && !m.supportsWebSearch) return false;

            // Must be within cost limit if specified
            if (options?.maxCostPerMillion !== undefined) {
                if (m.outputPricePerMillion > options.maxCostPerMillion) return false;
            }

            // Must have available provider
            const provider = this.registry.get(m.provider);
            if (!provider) return false;

            // Must not be in cooldown
            if (!this.fallbackManager.isProviderAvailable(m.provider)) return false;

            return true;
        });

        // Prefer specified provider if available
        if (options?.preferredProvider) {
            const preferred = candidates.filter((m) => m.provider === options.preferredProvider);
            if (preferred.length > 0) {
                candidates = preferred;
            }
        }

        // Sort by cost (cheapest first)
        candidates.sort((a, b) => a.outputPricePerMillion - b.outputPricePerMillion);

        if (candidates.length === 0) {
            // Fallback: use the cheapest available model regardless of tier
            const fallback = MODEL_PRICING
                .filter((m) => this.registry.get(m.provider))
                .sort((a, b) => a.outputPricePerMillion - b.outputPricePerMillion)[0];

            if (!fallback) {
                throw new Error('No models available for routing');
            }

            log.warn('No qualified model found, using fallback', {
                complexity: level,
                model: fallback.model,
            });

            return {
                model: fallback.model,
                provider: fallback.provider,
                complexity: level,
                estimatedCost: estimateCost(fallback.model, signals.inputTokenEstimate, 1000),
            };
        }

        const selected = candidates[0];

        log.debug('Selected model', {
            complexity: level,
            model: selected.model,
            provider: selected.provider,
            outputPricePerM: selected.outputPricePerMillion,
        });

        return {
            model: selected.model,
            provider: selected.provider,
            complexity: level,
            estimatedCost: estimateCost(selected.model, signals.inputTokenEstimate, 1000),
        };
    }

    /**
     * Get a fallback chain for a complexity level.
     */
    getFallbackChain(complexity: ComplexityLevel, options?: { preferCloud?: boolean }): FallbackChain {
        // In local-only mode, use cloud chain if available, otherwise local
        if (isLocalOnly()) {
            if (options?.preferCloud) {
                return DEFAULT_FALLBACK_CHAINS['cloud'];
            }
            return DEFAULT_FALLBACK_CHAINS['local'];
        }

        switch (complexity) {
            case 'expert':
                return DEFAULT_FALLBACK_CHAINS['high-capability'];
            case 'complex':
                return DEFAULT_FALLBACK_CHAINS['balanced'];
            case 'moderate':
            case 'simple':
                return DEFAULT_FALLBACK_CHAINS['cost-optimized'];
        }
    }

    /**
     * Get the fallback manager for direct fallback chain execution.
     */
    getFallbackManager(): FallbackManager {
        return this.fallbackManager;
    }

    /**
     * Get routing stats for monitoring.
     */
    getStats(): {
        availableModels: number;
        availableProviders: string[];
        healthStatus: Array<{ provider: string; healthy: boolean }>;
    } {
        const providers = this.registry.getAll();
        return {
            availableModels: MODEL_PRICING.filter(
                (m) => this.registry.get(m.provider) && this.fallbackManager.isProviderAvailable(m.provider),
            ).length,
            availableProviders: providers.map((p) => p.type),
            healthStatus: this.fallbackManager.getHealthStatus().map((h) => ({
                provider: h.provider,
                healthy: h.healthy,
            })),
        };
    }
}
