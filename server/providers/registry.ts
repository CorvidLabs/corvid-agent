import type { LlmProvider, LlmProviderType } from './types';
import { createLogger } from '../lib/logger';

const log = createLogger('ProviderRegistry');

export class LlmProviderRegistry {
    private static instance: LlmProviderRegistry | null = null;
    private providers = new Map<LlmProviderType, LlmProvider>();

    static getInstance(): LlmProviderRegistry {
        if (!LlmProviderRegistry.instance) {
            LlmProviderRegistry.instance = new LlmProviderRegistry();
        }
        return LlmProviderRegistry.instance;
    }

    register(provider: LlmProvider): void {
        const enabledRaw = process.env.ENABLED_PROVIDERS;
        if (enabledRaw) {
            const enabled = enabledRaw.split(',').map((s) => s.trim().toLowerCase());
            if (!enabled.includes(provider.type)) {
                log.info(`Skipping provider ${provider.type} (not in ENABLED_PROVIDERS)`);
                return;
            }
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
