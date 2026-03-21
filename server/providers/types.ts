export type LlmProviderType = 'anthropic' | 'openai' | 'openrouter' | 'ollama';
export type ExecutionMode = 'managed' | 'direct';

/**
 * ModelTier — Structured Claude-First dispatch tiers.
 *
 * Maps semantic task categories to the appropriate Claude model family.
 * Council decision 2026-03-13 (5-0): Opus/Sonnet/Haiku tiered dispatch.
 *
 *   OPUS   — council sessions, architecture decisions, complex reasoning
 *   SONNET — work tasks, code generation, specialist agents
 *   HAIKU  — routing decisions, triage, lightweight classification
 */
export enum ModelTier {
    OPUS   = 'opus',   // claude-opus-4-6
    SONNET = 'sonnet', // claude-sonnet-4-6
    HAIKU  = 'haiku',  // claude-haiku-4-5-20251001
}

export interface JsonSchemaProperty {
    type: string;
    description?: string;
    enum?: string[];
    items?: JsonSchemaProperty;
    default?: unknown;
}

/** JSON Schema object with properties/required (used for tool parameter schemas). */
export interface JsonSchemaObject {
    type?: string;
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
    [key: string]: unknown;
}

export interface LlmToolDefinition {
    name: string;
    description: string;
    parameters: JsonSchemaObject;
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
    acquireSlot?(model: string, signal?: AbortSignal, onStatus?: (msg: string) => void): Promise<boolean>;

    /** Release a previously acquired slot. */
    releaseSlot?(model: string): void;
}
