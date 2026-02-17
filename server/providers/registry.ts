import type { LlmProvider, LlmProviderType } from './types';
import { createLogger } from '../lib/logger';

const log = createLogger('ProviderRegistry');

export class LlmProviderRegistry {
    private static instance: LlmProviderRegistry | null = null;
    private providers = new Map<LlmProviderType, LlmProvider>();
    private loggedLocalOnly = false;

    static getInstance(): LlmProviderRegistry {
        if (!LlmProviderRegistry.instance) {
            LlmProviderRegistry.instance = new LlmProviderRegistry();
        }
        return LlmProviderRegistry.instance;
    }

    register(provider: LlmProvider): void {
        const enabledRaw = process.env.ENABLED_PROVIDERS;

        // Determine the effective enabled set:
        // 1. Explicit ENABLED_PROVIDERS env var takes priority
        // 2. If no cloud API keys exist, auto-restrict to ollama only
        let enabled: string[] | null = null;
        if (enabledRaw) {
            enabled = enabledRaw.split(',').map((s) => s.trim().toLowerCase());
        } else if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
            enabled = ['ollama'];
            if (!this.loggedLocalOnly) {
                log.info('Running in local-only mode (Ollama) — no cloud API keys detected');
                this.loggedLocalOnly = true;
            }
        }

        if (enabled && !enabled.includes(provider.type)) {
            log.info(`Skipping provider ${provider.type} (not in enabled set)`);
            return;
        }

        this.providers.set(provider.type, provider);
        log.info(`Registered provider: ${provider.type}`);
    }

    get(type: LlmProviderType): LlmProvider | undefined {
        return this.providers.get(type);
    }

    getAll(): LlmProvider[] {
        return Array.from(this.providers.values());
    }

    getDefault(): LlmProvider | undefined {
        // Return first available provider (Anthropic is registered first)
        return this.providers.values().next().value;
    }
}
