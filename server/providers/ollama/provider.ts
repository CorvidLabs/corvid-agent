import { BaseLlmProvider } from '../base';
import type {
    LlmProviderType,
    ExecutionMode,
    LlmCompletionParams,
    LlmCompletionResult,
    LlmProviderInfo,
    LlmToolDefinition,
    LlmToolCall,
} from '../types';
import { createLogger } from '../../lib/logger';

const log = createLogger('OllamaProvider');

const MODEL_CACHE_TTL_MS = 30_000;

interface OllamaChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: Record<string, unknown> };
    }>;
}

interface OllamaChatResponse {
    model: string;
    message: OllamaChatMessage;
    done: boolean;
    eval_count?: number;
    prompt_eval_count?: number;
}

interface OllamaTagsResponse {
    models: Array<{
        name: string;
        model: string;
        modified_at: string;
        size: number;
    }>;
}

export class OllamaProvider extends BaseLlmProvider {
    readonly type: LlmProviderType = 'ollama';
    readonly executionMode: ExecutionMode = 'direct';

    private cachedModels: string[] = [];
    private cacheTimestamp = 0;

    private get host(): string {
        return process.env.OLLAMA_HOST || 'http://localhost:11434';
    }

    getInfo(): LlmProviderInfo {
        return {
            type: this.type,
            name: 'Ollama',
            executionMode: this.executionMode,
            models: this.cachedModels,
            defaultModel: this.cachedModels[0] ?? 'llama3.1',
            supportsTools: true,
            supportsStreaming: false,
        };
    }

    async refreshModels(): Promise<string[]> {
        const now = Date.now();
        if (now - this.cacheTimestamp < MODEL_CACHE_TTL_MS && this.cachedModels.length > 0) {
            return this.cachedModels;
        }

        try {
            const response = await fetch(`${this.host}/api/tags`, {
                signal: AbortSignal.timeout(5_000),
            });

            if (!response.ok) {
                log.warn('Failed to fetch Ollama models', { status: response.status });
                return this.cachedModels;
            }

            const data = (await response.json()) as OllamaTagsResponse;
            this.cachedModels = data.models.map((m) => m.name);
            this.cacheTimestamp = now;
            log.info(`Refreshed Ollama models: ${this.cachedModels.length} available`);
            return this.cachedModels;
        } catch (err) {
            log.warn('Failed to connect to Ollama', {
                host: this.host,
                error: err instanceof Error ? err.message : String(err),
            });
            return this.cachedModels;
        }
    }

    protected async doComplete(params: LlmCompletionParams): Promise<LlmCompletionResult> {
        const messages: OllamaChatMessage[] = [];

        // System prompt as first message
        if (params.systemPrompt) {
            messages.push({ role: 'system', content: params.systemPrompt });
        }

        // Conversation messages
        for (const m of params.messages) {
            messages.push({ role: m.role, content: m.content });
        }

        // Build request body
        const body: Record<string, unknown> = {
            model: params.model,
            messages,
            stream: false,
        };

        if (params.temperature !== undefined) {
            body.options = { temperature: params.temperature };
        }

        // Map tools to Ollama's OpenAI-compatible format
        if (params.tools && params.tools.length > 0) {
            body.tools = params.tools.map((t) => this.toOllamaTool(t));
        }

        const response = await fetch(`${this.host}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ollama API error (${response.status}): ${text}`);
        }

        const data = (await response.json()) as OllamaChatResponse;

        // Parse tool calls from response
        let toolCalls: LlmToolCall[] | undefined;
        if (data.message.tool_calls && data.message.tool_calls.length > 0) {
            toolCalls = data.message.tool_calls.map((tc) => ({
                id: tc.id || crypto.randomUUID().slice(0, 8),
                name: tc.function.name,
                arguments: tc.function.arguments,
            }));
        }

        return {
            content: data.message.content ?? '',
            model: data.model,
            usage: {
                inputTokens: data.prompt_eval_count ?? 0,
                outputTokens: data.eval_count ?? 0,
            },
            toolCalls,
        };
    }

    async isAvailable(): Promise<boolean> {
        try {
            const response = await fetch(`${this.host}/api/tags`, {
                signal: AbortSignal.timeout(3_000),
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    private toOllamaTool(tool: LlmToolDefinition): Record<string, unknown> {
        return {
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            },
        };
    }
}
