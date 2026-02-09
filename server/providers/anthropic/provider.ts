import { BaseLlmProvider } from '../base';
import type { LlmProviderType, ExecutionMode, LlmCompletionParams, LlmCompletionResult, LlmProviderInfo } from '../types';

export class AnthropicProvider extends BaseLlmProvider {
    readonly type: LlmProviderType = 'anthropic';
    readonly executionMode: ExecutionMode = 'managed';

    private static readonly MODELS = [
        'claude-sonnet-4-20250514',
        'claude-opus-4-20250514',
        'claude-haiku-3-5-20241022',
    ];
    private static readonly DEFAULT_MODEL = 'claude-sonnet-4-20250514';

    getInfo(): LlmProviderInfo {
        return {
            type: this.type,
            name: 'Anthropic',
            executionMode: this.executionMode,
            models: AnthropicProvider.MODELS,
            defaultModel: AnthropicProvider.DEFAULT_MODEL,
            supportsTools: true,
            supportsStreaming: true,
        };
    }

    protected async doComplete(params: LlmCompletionParams): Promise<LlmCompletionResult> {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic();

        const response = await client.messages.create({
            model: params.model,
            max_tokens: params.maxTokens ?? 1024,
            system: params.systemPrompt,
            messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
        });

        const content = response.content
            .filter((block) => block.type === 'text')
            .map((block) => 'text' in block ? block.text : '')
            .join('');

        return {
            content,
            model: response.model,
            usage: response.usage
                ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
                : undefined,
        };
    }

    async isAvailable(): Promise<boolean> {
        try {
            const { default: Anthropic } = await import('@anthropic-ai/sdk');
            // Check that the API key is configured
            const client = new Anthropic();
            return !!client.apiKey;
        } catch {
            return false;
        }
    }
}
