export type LlmProviderType = 'anthropic' | 'openai' | 'ollama';
export type ExecutionMode = 'managed' | 'direct';

export interface LlmToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
}

export interface LlmToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

export interface LlmCompletionParams {
    model: string;
    systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }>;
    maxTokens?: number;
    temperature?: number;
    tools?: LlmToolDefinition[];
    /** External abort signal — allows callers to cancel in-flight requests. */
    signal?: AbortSignal;
    /** Called periodically during streaming to signal the model is generating. */
    onActivity?: () => void;
}

export interface LlmCompletionResult {
    content: string;
    model: string;
    usage?: { inputTokens: number; outputTokens: number };
    toolCalls?: LlmToolCall[];
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
