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
import { getModelCapabilityDetector } from './model-capabilities';
import { createLogger } from '../../lib/logger';

const log = createLogger('OllamaProvider');

const MODEL_CACHE_TTL_MS = 30_000;

export interface ModelPullStatus {
    model: string;
    status: 'pulling' | 'completed' | 'error';
    progress: number;
    downloadedBytes: number;
    totalBytes: number;
    currentLayer: string;
    error?: string;
    startedAt?: string;
}

export interface ModelDetail {
    name: string;
    size: number;
    sizeHuman: string;
    modifiedAt: string;
    family: string;
    capabilities?: {
        supportsTools: boolean;
        supportsVision: boolean;
        contextWindow: number;
    };
    loaded?: boolean;
}

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
    message: OllamaChatMessage & { thinking?: string };
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
        details?: {
            family?: string;
            parameter_size?: string;
            quantization_level?: string;
        };
    }>;
}

interface OllamaPsResponse {
    models: Array<{
        name: string;
        model: string;
        size: number;
        digest: string;
        expires_at: string;
    }>;
}

export class OllamaProvider extends BaseLlmProvider {
    readonly type: LlmProviderType = 'ollama';
    readonly executionMode: ExecutionMode = 'direct';

    private cachedModels: string[] = [];
    private cachedTags: OllamaTagsResponse['models'] = [];
    private cacheTimestamp = 0;
    private activePullStatuses = new Map<string, ModelPullStatus>();
    private readonly capabilityDetector = getModelCapabilityDetector();

    /**
     * Concurrency limiter — allows up to MAX_CONCURRENT Ollama requests at once.
     * Default 1 because Ollama returns 500s on concurrent tool-call requests
     * (even with OLLAMA_NUM_PARALLEL > 1). Serial processing is slower but
     * reliable, and avoids VRAM swap overhead entirely.
     */
    private static readonly MAX_CONCURRENT = parseInt(
        process.env.OLLAMA_MAX_PARALLEL ?? '1', 10,
    );
    private activeRequests = 0;
    private waitQueue: Array<() => void> = [];

    private get host(): string {
        return process.env.OLLAMA_HOST || 'http://localhost:11434';
    }

    getInfo(): LlmProviderInfo {
        return {
            type: this.type,
            name: 'Ollama',
            executionMode: this.executionMode,
            models: this.cachedModels,
            defaultModel: this.cachedModels[0] ?? 'qwen3',
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
            this.cachedTags = data.models;
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

    /** Max time (ms) to wait for a single Ollama chat completion. */
    private static readonly REQUEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

    /**
     * Model families that use a "thinking" mode by default (extended CoT).
     * For these models we explicitly set `think: false` so the model produces
     * content directly rather than spending the entire token budget on
     * internal reasoning and returning an empty `content` field.
     */
    private static readonly THINKING_MODEL_FAMILIES = new Set(['qwen3']);

    /**
     * Model families where the native Ollama `tools` API parameter causes
     * severe performance degradation. For these models, tools are described
     * only in the system prompt and tool calls are extracted from the model's
     * text output via extractToolCallsFromContent().
     *
     * Qwen3 8B in particular takes 10x+ longer when `tools` is in the API
     * request, even with `think: false`, because it spends excessive time
     * evaluating tool schemas during prompt processing.
     */
    private static readonly TEXT_BASED_TOOL_FAMILIES = new Set(['qwen3']);

    protected async doComplete(params: LlmCompletionParams): Promise<LlmCompletionResult> {
        // Wait for a concurrency slot
        if (this.activeRequests >= OllamaProvider.MAX_CONCURRENT) {
            await new Promise<void>((resolve) => this.waitQueue.push(resolve));
        }
        this.activeRequests++;
        try {
            return await this.doCompleteInner(params);
        } finally {
            this.activeRequests--;
            // Release next waiter
            const next = this.waitQueue.shift();
            if (next) next();
        }
    }

    private async doCompleteInner(params: LlmCompletionParams): Promise<LlmCompletionResult> {
        const messages: OllamaChatMessage[] = [];

        // Detect model family for family-specific options
        const modelFamily = this.getModelFamily(params.model);
        const useTextBasedTools = OllamaProvider.TEXT_BASED_TOOL_FAMILIES.has(modelFamily);

        // System prompt as first message
        if (params.systemPrompt) {
            messages.push({ role: 'system', content: params.systemPrompt });
        }

        // Conversation messages
        for (const m of params.messages) {
            if (m.role === 'tool' && useTextBasedTools) {
                // Remap tool results to user messages for models without native tools API
                messages.push({ role: 'user', content: `[Tool Result]: ${m.content}` });
            } else {
                messages.push({ role: m.role, content: m.content });
            }
        }

        // Build request body — use streaming so cancelled requests properly
        // signal Ollama to stop generation (with stream:false, Ollama keeps
        // processing even after the client disconnects).
        const body: Record<string, unknown> = {
            model: params.model,
            messages,
            stream: true,
        };

        // Build options — set num_ctx to a reasonable context window.
        // Ollama defaults to 2048-4096 which is too small for agent workflows.
        // 16384 gives enough room for council review prompts that aggregate
        // multiple member responses and discussion rounds.
        const defaultCtx = parseInt(process.env.OLLAMA_NUM_CTX ?? '16384', 10);
        const options: Record<string, unknown> = {
            num_ctx: defaultCtx,
        };
        if (params.temperature !== undefined) {
            options.temperature = params.temperature;
        }
        body.options = options;

        // Disable thinking mode for models that default to it.
        // Qwen3 spends all tokens in `thinking` and returns empty `content`.
        if (OllamaProvider.THINKING_MODEL_FAMILIES.has(modelFamily)) {
            body.think = false;
        }

        // Map tools to Ollama's OpenAI-compatible format.
        // Skip native tools for model families where it causes severe slowdown —
        // those models get tool instructions in the system prompt and tool calls
        // are parsed from their text output by extractToolCallsFromContent().
        if (params.tools && params.tools.length > 0 && !useTextBasedTools) {
            body.tools = params.tools.map((t) => this.toOllamaTool(t));
        }

        // Combine external abort signal (from session kill) with the timeout signal.
        // Either one firing will cancel the fetch and free the Ollama slot.
        const timeoutSignal = AbortSignal.timeout(OllamaProvider.REQUEST_TIMEOUT_MS);
        const combinedSignal = params.signal
            ? AbortSignal.any([params.signal, timeoutSignal])
            : timeoutSignal;

        log.info(`Ollama request: model=${params.model} tools=${useTextBasedTools ? 'text-based' : (body.tools ? 'native' : 'none')} msgs=${messages.length}`);
        const response = await fetch(`${this.host}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: combinedSignal,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ollama API error (${response.status}): ${text}`);
        }

        if (!response.body) {
            throw new Error('Ollama returned no response body');
        }

        // Accumulate streamed response chunks into a single result.
        // Streaming ensures Ollama detects disconnection and stops generation.
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamBuffer = '';
        let content = '';
        let thinking = '';
        let finalData: OllamaChatResponse | null = null;
        let lastActivitySignal = 0;
        const ACTIVITY_INTERVAL = 10_000; // Signal activity every 10s

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                streamBuffer += decoder.decode(value, { stream: true });
                const lines = streamBuffer.split('\n');
                streamBuffer = lines.pop() ?? '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const chunk = JSON.parse(line) as OllamaChatResponse;
                        if (chunk.message?.content) {
                            content += chunk.message.content;
                        }
                        if (chunk.message?.thinking) {
                            thinking += chunk.message.thinking;
                        }
                        if (chunk.done) {
                            finalData = chunk;
                        }
                    } catch {
                        // skip malformed lines
                    }
                }

                // Periodically signal that the model is actively generating
                const now = Date.now();
                if (params.onActivity && now - lastActivitySignal >= ACTIVITY_INTERVAL) {
                    lastActivitySignal = now;
                    params.onActivity();
                }
            }

            // Process any remaining buffer
            if (streamBuffer.trim()) {
                try {
                    const chunk = JSON.parse(streamBuffer) as OllamaChatResponse;
                    if (chunk.message?.content) {
                        content += chunk.message.content;
                    }
                    if (chunk.message?.thinking) {
                        thinking += chunk.message.thinking;
                    }
                    if (chunk.done) {
                        finalData = chunk;
                    }
                } catch {
                    // skip
                }
            }
        } finally {
            reader.releaseLock();
        }

        // Parse tool calls from final response (native tool call format)
        let toolCalls: LlmToolCall[] | undefined;
        if (finalData?.message?.tool_calls && finalData.message.tool_calls.length > 0) {
            toolCalls = finalData.message.tool_calls.map((tc) => ({
                id: tc.id || crypto.randomUUID().slice(0, 8),
                name: tc.function.name,
                arguments: tc.function.arguments,
            }));
        }

        // Resolve content — some models (Qwen3) may put output in `thinking`
        // if thinking mode slips through despite `think: false`.
        if (!content && thinking) {
            log.warn(`Model ${params.model} returned empty content but has thinking — using thinking as content`);
            content = thinking;
        }

        // Fallback: parse tool calls from content text for models that use
        // <|python_tag|> format (e.g., llama3.1) instead of structured tool_calls.
        if (!toolCalls && content) {
            const parsed = this.extractToolCallsFromContent(content, params.tools);
            if (parsed.length > 0) {
                toolCalls = parsed;
                // Strip the tool call text from content so it isn't echoed back
                content = content.replace(/\s*<\|python_tag\|>[\s\S]*$/, '').trim();
                // Strip JSON array tool calls (Mistral format) - with or without code fences
                content = content.replace(/\s*```(?:json)?\s*\[[\s\S]*?\]\s*```\s*/g, '').trim();
                content = content.replace(/\s*\[\s*\{\s*"name"\s*:\s*"[\w]+"\s*,[\s\S]*?\}\s*\]\s*/g, '').trim();
                // Also strip plain function calls from content
                if (params.tools) {
                    for (const tool of params.tools) {
                        const stripPattern = new RegExp(
                            `\\s*${tool.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\([\\s\\S]*?\\)\\s*`,
                            'g',
                        );
                        content = content.replace(stripPattern, '').trim();
                    }
                }
                log.info(`Extracted ${parsed.length} tool call(s) from content text`, {
                    calls: parsed.map(c => ({ name: c.name, args: c.arguments })),
                });
            }
        }

        // Normalize tool call arguments: map common aliases to expected parameter names.
        // Text-based tool calling models often guess wrong names (e.g., "file_path" instead of "path").
        if (toolCalls && params.tools) {
            for (const tc of toolCalls) {
                const toolDef = params.tools.find((t) => t.name === tc.name);
                if (toolDef) {
                    tc.arguments = this.normalizeToolArgs(tc.arguments, toolDef);
                }
            }
        }

        return {
            content,
            model: finalData?.model ?? params.model,
            usage: {
                inputTokens: finalData?.prompt_eval_count ?? 0,
                outputTokens: finalData?.eval_count ?? 0,
            },
            toolCalls,
        };
    }

    /**
     * Extract tool calls from content text when models use non-standard formats.
     * Handles:
     * - Pattern 1: Llama3.1's `<|python_tag|>function_name(key="value", ...)` format
     * - Pattern 2: Plain `function_name({...})` JSON-style patterns matching known tool names
     * - Pattern 3: JSON array of tool calls (Mistral format): `[{"name":"tool","arguments":{}}]`
     * - Pattern 4: Python-style `function_name(key="value")` without <|python_tag|> prefix
     */
    private extractToolCallsFromContent(
        content: string,
        tools?: LlmToolDefinition[],
    ): LlmToolCall[] {
        if (!tools || tools.length === 0) return [];

        const toolNames = new Set(tools.map((t) => t.name));
        const calls: LlmToolCall[] = [];

        // Pattern 1: <|python_tag|>function_name(key="value", key2="value2")
        const pythonTagMatch = content.match(/<\|python_tag\|>\s*([\s\S]*)/);
        if (pythonTagMatch) {
            const body = pythonTagMatch[1].trim();
            // Match function calls: tool_name(args)
            const fnPattern = /(\w+)\s*\(([\s\S]*?)\)/g;
            let match;
            while ((match = fnPattern.exec(body)) !== null) {
                const fnName = match[1];
                const argsStr = match[2].trim();
                if (!toolNames.has(fnName)) continue;

                try {
                    const args = this.parsePythonArgs(argsStr);
                    calls.push({
                        id: crypto.randomUUID().slice(0, 8),
                        name: fnName,
                        arguments: args,
                    });
                } catch (e) {
                    log.warn(`Failed to parse python-style args for ${fnName}: ${argsStr}`);
                }
            }
        }

        // Pattern 2: JSON-style tool calls embedded in text
        // e.g., corvid_list_agents({}) or corvid_save_memory({"key":"val"})
        if (calls.length === 0) {
            for (const toolName of toolNames) {
                const jsonPattern = new RegExp(
                    `${toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(\\s*(\\{[\\s\\S]*?\\})\\s*\\)`,
                    'g',
                );
                let jMatch;
                while ((jMatch = jsonPattern.exec(content)) !== null) {
                    try {
                        const args = JSON.parse(jMatch[1]);
                        calls.push({
                            id: crypto.randomUUID().slice(0, 8),
                            name: toolName,
                            arguments: args,
                        });
                    } catch {
                        // Not valid JSON, skip
                    }
                }
            }
        }

        // Pattern 3: JSON array of tool calls in content
        // e.g., ```\n[{"name":"tool","arguments":{...}}]\n``` or just [{"name":"tool",...}]
        // Also handles JSON embedded within surrounding text (model may add preamble text)
        if (calls.length === 0) {
            // Strip markdown code fences if present
            const stripped = content.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();

            // Try whole content first, then extract embedded JSON arrays
            const candidates: string[] = [stripped];
            // Extract JSON arrays embedded in text: find [ ... ] containing "name"
            const arrayMatch = stripped.match(/\[\s*\{[\s\S]*?"name"\s*:[\s\S]*?\}\s*\]/g);
            if (arrayMatch) {
                candidates.push(...arrayMatch);
            }
            // Also try single objects: {"name": "tool", "arguments": {...}}
            const objMatch = stripped.match(/\{\s*"name"\s*:\s*"[\w]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/g);
            if (objMatch) {
                candidates.push(...objMatch);
            }

            for (const candidate of candidates) {
                try {
                    const parsed = JSON.parse(candidate);
                    const arr = Array.isArray(parsed) ? parsed : [parsed];
                    for (const item of arr) {
                        if (item && typeof item === 'object' && typeof item.name === 'string' && toolNames.has(item.name)) {
                            calls.push({
                                id: crypto.randomUUID().slice(0, 8),
                                name: item.name,
                                arguments: item.arguments ?? item.parameters ?? {},
                            });
                        }
                    }
                    if (calls.length > 0) break; // Found valid tool calls
                } catch {
                    // Not valid JSON, try next candidate
                }
            }
        }

        // Pattern 4: Python-style keyword args without <|python_tag|> prefix
        // e.g., corvid_save_memory(key="value", content="data")
        // Llama3.1 sometimes outputs this format directly in content text
        if (calls.length === 0) {
            for (const toolName of toolNames) {
                const pyPattern = new RegExp(
                    `${toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(([\\s\\S]*?)\\)`,
                    'g',
                );
                let pyMatch;
                while ((pyMatch = pyPattern.exec(content)) !== null) {
                    const argsStr = pyMatch[1].trim();
                    // Skip if it looks like JSON (already handled by Pattern 2)
                    if (argsStr.startsWith('{')) continue;
                    try {
                        const args = this.parsePythonArgs(argsStr);
                        if (Object.keys(args).length > 0) {
                            calls.push({
                                id: crypto.randomUUID().slice(0, 8),
                                name: toolName,
                                arguments: args,
                            });
                        }
                    } catch {
                        // Not parseable, skip
                    }
                }
            }
        }

        return calls;
    }

    /**
     * Parse Python-style keyword arguments: key="value", key2="value2"
     * into a JSON object.
     */
    private parsePythonArgs(argsStr: string): Record<string, unknown> {
        if (!argsStr.trim()) return {};

        // Try parsing as JSON first (some models output JSON in parens)
        try {
            const parsed = JSON.parse(argsStr);
            if (typeof parsed === 'object' && parsed !== null) return parsed;
        } catch { /* not JSON, continue */ }

        // Parse Python keyword args: key="value", key2=123, key3=true
        const result: Record<string, unknown> = {};
        // Match key=value pairs, handling quoted strings with escaped quotes
        const kwargPattern = /(\w+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\[[^\]]*\]|\{[^}]*\}|[^,)]+))/g;
        let kwMatch;
        while ((kwMatch = kwargPattern.exec(argsStr)) !== null) {
            const key = kwMatch[1];
            const value = kwMatch[2] ?? kwMatch[3] ?? kwMatch[4]?.trim();
            if (value === undefined) continue;

            // Try to parse as JSON value (numbers, booleans, null)
            if (typeof value === 'string') {
                if (value === 'true') result[key] = true;
                else if (value === 'false') result[key] = false;
                else if (value === 'null' || value === 'None') result[key] = null;
                else if (/^-?\d+(\.\d+)?$/.test(value)) result[key] = Number(value);
                else result[key] = value.replace(/\\"/g, '"').replace(/\\'/g, "'");
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * Normalize tool call arguments to match the expected parameter schema.
     * Text-based tool calling models often guess parameter names (e.g., "file_path"
     * instead of "path"). This maps unrecognized argument keys to the closest
     * matching schema parameter using substring matching.
     */
    private normalizeToolArgs(
        args: Record<string, unknown>,
        toolDef: LlmToolDefinition,
    ): Record<string, unknown> {
        const schemaProps = (toolDef.parameters as any)?.properties;
        if (!schemaProps) return args;

        const schemaKeys = new Set(Object.keys(schemaProps));
        const normalized: Record<string, unknown> = {};
        let didNormalize = false;

        for (const [key, value] of Object.entries(args)) {
            if (schemaKeys.has(key)) {
                // Key matches schema exactly
                normalized[key] = value;
            } else {
                // Try to find a matching schema key by substring match
                const lowerKey = key.toLowerCase().replace(/[_-]/g, '');
                let matched = false;
                for (const schemaKey of schemaKeys) {
                    const lowerSchema = schemaKey.toLowerCase().replace(/[_-]/g, '');
                    if (lowerKey.includes(lowerSchema) || lowerSchema.includes(lowerKey)) {
                        // Don't overwrite if we already have a value for this schema key
                        if (!(schemaKey in normalized)) {
                            normalized[schemaKey] = value;
                            didNormalize = true;
                            matched = true;
                            break;
                        }
                    }
                }
                if (!matched) {
                    // Keep the original key as fallback
                    normalized[key] = value;
                }
            }
        }

        if (didNormalize) {
            log.info(`Normalized tool args for ${toolDef.name}`, {
                original: args,
                normalized,
            });
        }

        return normalized;
    }

    /** Extract the model family from a model name (e.g., "qwen3:8b" → "qwen3"). */
    private getModelFamily(modelName: string): string {
        const lower = modelName.toLowerCase();
        // Match known families
        if (lower.startsWith('qwen3')) return 'qwen3';
        if (lower.startsWith('qwen2')) return 'qwen2';
        if (lower.includes('llama')) return 'llama';
        if (lower.includes('mistral')) return 'mistral';
        if (lower.includes('phi')) return 'phi';
        if (lower.includes('gemma')) return 'gemma';
        if (lower.includes('command-r')) return 'command-r';
        if (lower.includes('nemotron')) return 'nemotron';
        // Fallback: use the part before the colon
        return lower.split(':')[0].split('-')[0];
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

    /** Get detailed information about all installed models. */
    async getModelDetails(): Promise<ModelDetail[]> {
        await this.refreshModels();
        const runningModels = await this.getRunningModels();
        const runningSet = new Set(runningModels.map((m) => m.name));

        const details: ModelDetail[] = [];
        for (const tag of this.cachedTags) {
            const caps = await this.capabilityDetector.getCapabilities(tag.name);
            details.push({
                name: tag.name,
                size: tag.size,
                sizeHuman: this.formatBytes(tag.size),
                modifiedAt: tag.modified_at,
                family: tag.details?.family ?? caps.family,
                capabilities: {
                    supportsTools: caps.supportsTools,
                    supportsVision: caps.supportsVision,
                    contextWindow: caps.contextLength,
                },
                loaded: runningSet.has(tag.name),
            });
        }
        return details;
    }

    /** Get models currently loaded in memory. */
    async getRunningModels(): Promise<Array<{ name: string; size: number }>> {
        try {
            const response = await fetch(`${this.host}/api/ps`, {
                signal: AbortSignal.timeout(3_000),
            });
            if (!response.ok) return [];
            const data = (await response.json()) as OllamaPsResponse;
            return data.models.map((m) => ({ name: m.name, size: m.size }));
        } catch {
            return [];
        }
    }

    /** Pull (download) a model with progress callbacks. */
    async pullModel(model: string, onProgress?: (status: ModelPullStatus) => void): Promise<void> {
        const pullStatus: ModelPullStatus = {
            model,
            status: 'pulling',
            progress: 0,
            downloadedBytes: 0,
            totalBytes: 0,
            currentLayer: '',
            startedAt: new Date().toISOString(),
        };
        this.activePullStatuses.set(model, pullStatus);
        onProgress?.(pullStatus);

        try {
            const response = await fetch(`${this.host}/api/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: model, stream: true }),
            });

            if (!response.ok || !response.body) {
                throw new Error(`Pull request failed: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const event = JSON.parse(line) as {
                            status: string;
                            digest?: string;
                            total?: number;
                            completed?: number;
                            error?: string;
                        };

                        if (event.error) {
                            pullStatus.status = 'error';
                            pullStatus.error = event.error;
                            this.activePullStatuses.set(model, { ...pullStatus });
                            onProgress?.({ ...pullStatus });
                            this.scheduleStatusCleanup(model);
                            return;
                        }

                        pullStatus.currentLayer = event.digest?.slice(0, 12) ?? event.status;
                        if (event.total && event.total > 0) {
                            pullStatus.totalBytes = event.total;
                            pullStatus.downloadedBytes = event.completed ?? 0;
                            pullStatus.progress = Math.round((pullStatus.downloadedBytes / pullStatus.totalBytes) * 100);
                        }
                        this.activePullStatuses.set(model, { ...pullStatus });
                        onProgress?.({ ...pullStatus });
                    } catch {
                        // skip malformed lines
                    }
                }
            }

            pullStatus.status = 'completed';
            pullStatus.progress = 100;
            this.activePullStatuses.set(model, { ...pullStatus });
            onProgress?.({ ...pullStatus });
            this.scheduleStatusCleanup(model);

            // Refresh model list
            this.cacheTimestamp = 0;
            await this.refreshModels();
            this.capabilityDetector.clearCache();

            log.info(`Model pull completed: ${model}`);
        } catch (err) {
            pullStatus.status = 'error';
            pullStatus.error = err instanceof Error ? err.message : String(err);
            this.activePullStatuses.set(model, { ...pullStatus });
            onProgress?.({ ...pullStatus });
            this.scheduleStatusCleanup(model);
            log.error(`Model pull failed: ${model}`, { error: pullStatus.error });
        }
    }

    /** Delete a model. */
    async deleteModel(model: string): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await fetch(`${this.host}/api/delete`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: model }),
            });

            if (!response.ok) {
                const text = await response.text();
                return { success: false, error: `Ollama returned ${response.status}: ${text}` };
            }

            // Refresh model list
            this.cacheTimestamp = 0;
            await this.refreshModels();
            log.info(`Model deleted: ${model}`);
            return { success: true };
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            return { success: false, error };
        }
    }

    /** Get all active pull statuses. */
    getActivePulls(): ModelPullStatus[] {
        return Array.from(this.activePullStatuses.values()).filter(
            (s) => s.status === 'pulling',
        );
    }

    /** Get pull status for a specific model. */
    getPullStatus(model: string): ModelPullStatus | undefined {
        return this.activePullStatuses.get(model);
    }

    /** Remove a terminal pull status after 60s so the map doesn't grow unbounded. */
    private scheduleStatusCleanup(model: string): void {
        setTimeout(() => {
            const status = this.activePullStatuses.get(model);
            if (status && status.status !== 'pulling') {
                this.activePullStatuses.delete(model);
            }
        }, 60_000);
    }

    private formatBytes(bytes: number): string {
        if (!bytes || bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let idx = 0;
        let size = bytes;
        while (size >= 1024 && idx < units.length - 1) {
            size /= 1024;
            idx++;
        }
        return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
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
