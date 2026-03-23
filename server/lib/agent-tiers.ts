/**
 * Agent tier system — capability-based tiers that gate iteration limits,
 * nudge budgets, rate limits, and council participation.
 *
 * Tier is determined by the model powering the agent. Higher-tier models
 * get more autonomy; lower-tier models get tighter guardrails.
 *
 * @module
 */

import { detectModelFamily, type ModelFamily } from '../providers/ollama/tool-prompt-templates';

// ─── Tier definitions ────────────────────────────────────────────────────

export type AgentTier = 'high' | 'standard' | 'limited';

export interface AgentTierConfig {
    tier: AgentTier;
    /** Max agentic loop iterations before hard stop. */
    maxToolIterations: number;
    /** Max standard nudges (initial engagement). */
    maxNudges: number;
    /** Max mid-chain nudges (hallucination correction). */
    maxMidChainNudges: number;
    /** Max PRs an agent can create per session. */
    maxPrsPerSession: number;
    /** Max issues an agent can create per session. */
    maxIssuesPerSession: number;
    /** Max messages an agent can send per session. */
    maxMessagesPerSession: number;
    /** Whether the agent may participate in council votes. */
    canVoteInCouncil: boolean;
    /** Minimum governance tier the agent can modify (0=constitutional, 2=operational). */
    minGovernanceTier: number;
}

/**
 * Tier configurations.
 *
 * - high: Claude, GPT-4 class — full autonomy
 * - standard: Llama 3.1 70B+, Qwen 72B+ — moderate guardrails
 * - limited: Small models (<30B), unknown models — tight guardrails
 */
const TIER_CONFIGS: Record<AgentTier, AgentTierConfig> = {
    high: {
        tier: 'high',
        maxToolIterations: 25,
        maxNudges: 2,
        maxMidChainNudges: 2,
        maxPrsPerSession: 5,
        maxIssuesPerSession: 5,
        maxMessagesPerSession: 20,
        canVoteInCouncil: true,
        minGovernanceTier: 2,
    },
    standard: {
        tier: 'standard',
        maxToolIterations: 15,
        maxNudges: 4,
        maxMidChainNudges: 3,
        maxPrsPerSession: 2,
        maxIssuesPerSession: 3,
        maxMessagesPerSession: 10,
        canVoteInCouncil: true,
        minGovernanceTier: 2,
    },
    limited: {
        tier: 'limited',
        maxToolIterations: 8,
        maxNudges: 5,
        maxMidChainNudges: 4,
        maxPrsPerSession: 1,
        maxIssuesPerSession: 2,
        maxMessagesPerSession: 5,
        canVoteInCouncil: false,
        minGovernanceTier: 2,
    },
};

// ─── Model → tier mapping ────────────────────────────────────────────────

/**
 * Model families considered high-tier (frontier API models).
 * These aren't Ollama families — they're provider-level identifiers.
 */
const HIGH_TIER_PROVIDERS = new Set(['claude', 'anthropic', 'openai', 'gpt-4']);

/**
 * Ollama model families considered standard-tier.
 * These have decent tool-calling ability when properly prompted.
 */
const STANDARD_TIER_FAMILIES = new Set<ModelFamily>([
    'llama',
    'qwen2',
    'qwen3',
    'mistral',
    'command-r',
    'deepseek',
    'minimax',
    'kimi',
]);

/**
 * Ollama model families relegated to limited-tier.
 * These struggle with multi-step tool calling.
 */
const LIMITED_TIER_FAMILIES = new Set<ModelFamily>([
    'phi',
    'gemma',
    'hermes',
    'nemotron',
    'glm',
    'devstral',
    'gemini',
    'unknown',
]);

/**
 * Check if a model is a cloud model (hosted remotely via Ollama cloud proxy).
 * Cloud models are large remote models that deserve a tier boost.
 */
export function isCloudModel(name: string): boolean {
    return name.includes(':cloud') || name.endsWith('-cloud');
}

/**
 * Determine the agent tier from a model identifier.
 *
 * Heuristic:
 *  1. If the model name matches a known high-tier provider → high
 *  2. Cloud models (`:cloud` suffix) get boosted to at least standard
 *  3. Detect the Ollama model family and map to standard/limited
 *  4. Check for large parameter counts in the name (70b, 72b → standard)
 *  5. Default to limited (conservative)
 */
export function getAgentTier(model: string): AgentTier {
    const lower = model.toLowerCase();

    // High-tier: API providers
    for (const provider of HIGH_TIER_PROVIDERS) {
        if (lower.includes(provider)) return 'high';
    }

    // Cloud models are large remote models — boost to at least standard
    const cloud = isCloudModel(lower);

    // Detect model family
    const family = detectModelFamily(model);

    // Standard-tier families
    if (STANDARD_TIER_FAMILIES.has(family)) {
        // Cloud models from standard families get high tier (frontier-class)
        if (cloud) return 'high';
        // But small local variants of standard families should be limited
        if (isSmallModel(lower)) return 'limited';
        return 'standard';
    }

    // Limited-tier families — but cloud models and large locals get boosted
    if (LIMITED_TIER_FAMILIES.has(family)) {
        if (cloud) return 'standard';
        if (isLargeModel(lower)) return 'standard';
        return 'limited';
    }

    // Unknown family — cloud models still get standard
    if (cloud) return 'standard';

    // Fallback: check for large parameter counts
    if (isLargeModel(lower)) return 'standard';

    return 'limited';
}

/**
 * Get the full tier configuration for a model.
 */
export function getAgentTierConfig(model: string): AgentTierConfig {
    return TIER_CONFIGS[getAgentTier(model)];
}

/**
 * Get tier config by tier name directly.
 */
export function getTierConfig(tier: AgentTier): AgentTierConfig {
    return TIER_CONFIGS[tier];
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Check for small model indicators in the name. */
function isSmallModel(name: string): boolean {
    // Match parameter counts like 1b, 3b, 7b, 8b (small), but not 70b, 72b
    const paramMatch = name.match(/(\d+(?:\.\d+)?)\s*b/);
    if (paramMatch) {
        const params = parseFloat(paramMatch[1]);
        if (params < 20) return true;
    }
    return false;
}

/** Check for large model indicators in the name. */
function isLargeModel(name: string): boolean {
    const paramMatch = name.match(/(\d+(?:\.\d+)?)\s*b/);
    if (paramMatch) {
        const params = parseFloat(paramMatch[1]);
        if (params >= 30) return true;
    }
    return false;
}
