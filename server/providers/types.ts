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
    /** Called when the provider's queue status changes (e.g. "Queued...", or "" when cleared). */
    onStatus?: (message: string) => void;
    /** Called with each text token as it arrives during streaming. */
    onStream?: (text: string) => void;
}

export interface LlmCompletionResult {
    content: string;
    model: string;
    usage?: { inputTokens: number; outputTokens: number };
    toolCalls?: LlmToolCall[];
    performance?: {
        evalDurationMs: number;       // time spent generating output tokens
        promptEvalDurationMs: number; // time spent processing prompt
        tokensPerSecond: number;      // eval_count / (eval_duration in seconds)
    };
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

    /**
     * Acquire an inference slot for the given model. Blocks until a slot is
     * available. Call releaseSlot() when done with the entire agentic loop
     * so the model stays loaded in memory (avoids KV cache eviction between
     * turns). No-op for providers without concurrency limits.
     */
    acquireSlot?(model: string, signal?: AbortSignal, onStatus?: (msg: string) => void): Promise<void>;

    /** Release a previously acquired slot. */
    releaseSlot?(model: string): void;
}
