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
}

export interface LlmCompletionResult {
    content: string;
    model: string;
    usage?: { inputTokens: number; outputTokens: number };
    toolCalls?: LlmToolCall[];
}

/** A single chunk yielded during streaming completion */
export interface LlmStreamChunk {
    /** Incremental text content */
    text: string;
    /** True when this is the final chunk (includes aggregated metadata) */
    done: boolean;
    /** Only present on the final chunk */
    model?: string;
    /** Only present on the final chunk */
    usage?: { inputTokens: number; outputTokens: number };
    /** Only present on the final chunk if the model made tool calls */
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
    /** Stream completion yielding incremental text chunks. Optional — only available when supportsStreaming is true. */
    streamComplete?(params: LlmCompletionParams): AsyncGenerator<LlmStreamChunk>;
    isAvailable(): Promise<boolean>;
}
