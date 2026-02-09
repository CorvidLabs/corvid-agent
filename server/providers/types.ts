export type LlmProviderType = 'anthropic' | 'openai' | 'ollama';
export type ExecutionMode = 'managed' | 'direct';

export interface LlmCompletionParams {
    model: string;
    systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    maxTokens?: number;
    temperature?: number;
}

export interface LlmCompletionResult {
    content: string;
    model: string;
    usage?: { inputTokens: number; outputTokens: number };
}

export interface LlmProviderInfo {
    type: LlmProviderType;
    name: string;
    executionMode: ExecutionMode;
    models: string[];
    defaultModel: string;
    supportsTools: boolean;
    supportsStreaming: boolean;
}

export interface LlmProvider {
    readonly type: LlmProviderType;
    readonly executionMode: ExecutionMode;
    getInfo(): LlmProviderInfo;
    complete(params: LlmCompletionParams): Promise<LlmCompletionResult>;
    isAvailable(): Promise<boolean>;
}
