import { createLogger } from '../lib/logger';
import { hasClaudeAccess } from './router';
import type { LlmProvider, LlmProviderType } from './types';

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

    // Gate Ollama behind feature flag (council decision 2026-03-13).
    // Ollama must not appear in any production dispatch path unless the
    // operator explicitly opts in via OLLAMA_LOCAL_EXPERIMENTAL=true.
    if (provider.type === 'ollama') {
      const ollamaEnabled = process.env.OLLAMA_LOCAL_EXPERIMENTAL === 'true';
      if (!ollamaEnabled) {
        log.info(
          'Skipping OllamaProvider — set OLLAMA_LOCAL_EXPERIMENTAL=true to enable ' +
            '(experimental, not on production dispatch path)',
        );
        return;
      }
    }

    // Determine the effective enabled set:
    // 1. Explicit ENABLED_PROVIDERS env var takes priority
    // 2. If no cloud API keys exist, auto-restrict to ollama only
    //    (only reachable when OLLAMA_LOCAL_EXPERIMENTAL=true, since Ollama
    //    is gated above)
    let enabled: string[] | null = null;
    if (enabledRaw) {
      enabled = enabledRaw.split(',').map((s) => s.trim().toLowerCase());
    } else if (!hasClaudeAccess() && !process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY) {
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
