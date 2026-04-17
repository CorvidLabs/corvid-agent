/** Convert raw model IDs like "claude-opus-4-6-20260101" into friendly display names like "Opus 4" */
export function friendlyModelName(model?: string): string {
    if (!model) return '';
    const m = model.toLowerCase();
    // Claude models
    if (m.includes('opus-4')) return 'Opus 4';
    if (m.includes('sonnet-4')) return 'Sonnet 4';
    if (m.includes('haiku-4')) return 'Haiku 4';
    if (m.includes('opus')) return 'Opus';
    if (m.includes('sonnet')) return 'Sonnet';
    if (m.includes('haiku')) return 'Haiku';
    // OpenAI
    if (m.includes('gpt-4o')) return 'GPT-4o';
    if (m.includes('gpt-4')) return 'GPT-4';
    if (m.includes('o1')) return 'o1';
    if (m.includes('o3')) return 'o3';
    // Ollama / open models
    if (m.includes('nemotron')) return 'Nemotron';
    if (m.includes('qwen')) return 'Qwen';
    if (m.includes('llama')) return 'Llama';
    if (m.includes('mistral')) return 'Mistral';
    if (m.includes('gemma')) return 'Gemma';
    if (m.includes('deepseek')) return 'DeepSeek';
    if (m.includes('kimi')) return 'Kimi';
    if (m.includes('phi')) return 'Phi';
    // Fallback: capitalize first word, strip version noise
    const short = model.split(/[-_]/)[0];
    return short.charAt(0).toUpperCase() + short.slice(1);
}

/** Format provider name for display (uppercase, clean) */
export function friendlyProviderName(provider?: string): string {
    if (!provider) return 'Anthropic';
    const p = provider.toLowerCase();
    if (p === 'anthropic') return 'Anthropic';
    if (p === 'ollama') return 'Ollama';
    if (p === 'openai') return 'OpenAI';
    if (p === 'google') return 'Google';
    if (p === 'bedrock') return 'Bedrock';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
}
