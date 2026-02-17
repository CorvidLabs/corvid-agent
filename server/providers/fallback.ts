/**
 * Fallback — Fallback chains for rate-limited or unavailable providers.
 *
 * When a primary model fails, automatically tries the next model in the
 * fallback chain. Tracks provider health for routing decisions.
 */
import type { LlmCompletionParams, LlmCompletionResult, LlmProviderType } from './types';
import type { LlmProviderRegistry } from './registry';
import { createLogger } from '../lib/logger';

const log = createLogger('ProviderFallback');

interface ProviderHealth {
    provider: LlmProviderType;
    healthy: boolean;
    lastFailure: number | null;
    consecutiveFailures: number;
    /** Cooldown period in ms before retrying a failed provider */
    cooldownMs: number;
}

const DEFAULT_COOLDOWN_MS = 60_000; // 1 minute cooldown after failure
const MAX_CONSECUTIVE_FAILURES = 3;

export interface FallbackChain {
    /** Ordered list of [provider, model] pairs to try */
    chain: Array<{ provider: LlmProviderType; model: string }>;
}

/**
 * Default fallback chains for common scenarios.
 */
export const DEFAULT_FALLBACK_CHAINS: Record<string, FallbackChain> = {
    'high-capability': {
        chain: [
            { provider: 'anthropic', model: 'claude-opus-4-6' },
            { provider: 'openai', model: 'gpt-4o' },
            { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929' },
            { provider: 'ollama', model: 'qwen3:32b' },
        ],
    },
    'balanced': {
        chain: [
            { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929' },
            { provider: 'openai', model: 'gpt-4o' },
            { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
            { provider: 'openai', model: 'gpt-4o-mini' },
            { provider: 'ollama', model: 'llama3.3' },
        ],
    },
    'cost-optimized': {
        chain: [
            { provider: 'ollama', model: 'llama3.3' },
            { provider: 'openai', model: 'gpt-4o-mini' },
            { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
        ],
    },
};

export class FallbackManager {
    private registry: LlmProviderRegistry;
    private health: Map<LlmProviderType, ProviderHealth> = new Map();

    constructor(registry: LlmProviderRegistry) {
        this.registry = registry;
    }

    /**
     * Execute a completion with fallback support.
     * Tries each model in the chain until one succeeds.
     */
    async completeWithFallback(
        params: LlmCompletionParams,
        chain: FallbackChain,
    ): Promise<LlmCompletionResult & { usedProvider: LlmProviderType; usedModel: string }> {
        const errors: string[] = [];

        for (const entry of chain.chain) {
            // Skip unhealthy providers in cooldown
            if (!this.isProviderAvailable(entry.provider)) {
                log.debug('Skipping provider in cooldown', { provider: entry.provider });
                continue;
            }

            const provider = this.registry.get(entry.provider);
            if (!provider) continue;

            try {
                const result = await provider.complete({
                    ...params,
                    model: entry.model,
                });

                // Mark provider as healthy on success
                this.markHealthy(entry.provider);

                return {
                    ...result,
                    usedProvider: entry.provider,
                    usedModel: entry.model,
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                errors.push(`${entry.provider}/${entry.model}: ${message}`);

                // Check if this is a rate limit or transient error
                if (this.isTransientError(message)) {
                    this.markFailure(entry.provider);
                    log.warn('Provider failed (transient), trying next', {
                        provider: entry.provider,
                        model: entry.model,
                        error: message,
                    });
                } else {
                    // Non-transient errors (auth, invalid model, etc.) — still try next
                    log.warn('Provider failed (non-transient)', {
                        provider: entry.provider,
                        model: entry.model,
                        error: message,
                    });
                }
            }
        }

        throw new Error(`All providers in fallback chain failed:\n${errors.join('\n')}`);
    }

    /**
     * Check if a provider is available (not in cooldown).
     */
    isProviderAvailable(provider: LlmProviderType): boolean {
        const health = this.health.get(provider);
        if (!health) return true; // No health record = healthy

        if (health.healthy) return true;

        // Check cooldown
        if (health.lastFailure) {
            const elapsed = Date.now() - health.lastFailure;
            if (elapsed > health.cooldownMs) {
                // Cooldown expired — give it another chance
                health.healthy = true;
                health.consecutiveFailures = 0;
                return true;
            }
        }

        return false;
    }

    /**
     * Get health status for all known providers.
     */
    getHealthStatus(): ProviderHealth[] {
        return Array.from(this.health.values());
    }

    /**
     * Reset health status for all providers.
     */
    resetHealth(): void {
        this.health.clear();
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private markHealthy(provider: LlmProviderType): void {
        const existing = this.health.get(provider);
        if (existing) {
            existing.healthy = true;
            existing.consecutiveFailures = 0;
        }
    }

    private markFailure(provider: LlmProviderType): void {
        const existing = this.health.get(provider);
        if (existing) {
            existing.consecutiveFailures++;
            existing.lastFailure = Date.now();
            if (existing.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                existing.healthy = false;
                // Exponential backoff: 1min, 2min, 4min...
                existing.cooldownMs = DEFAULT_COOLDOWN_MS * Math.pow(2, existing.consecutiveFailures - MAX_CONSECUTIVE_FAILURES);
            }
        } else {
            this.health.set(provider, {
                provider,
                healthy: true,
                lastFailure: Date.now(),
                consecutiveFailures: 1,
                cooldownMs: DEFAULT_COOLDOWN_MS,
            });
        }
    }

    private isTransientError(message: string): boolean {
        const lower = message.toLowerCase();
        return (
            lower.includes('rate limit') ||
            lower.includes('429') ||
            lower.includes('503') ||
            lower.includes('502') ||
            lower.includes('timeout') ||
            lower.includes('econnrefused') ||
            lower.includes('fetch failed') ||
            lower.includes('overloaded')
        );
    }
}
