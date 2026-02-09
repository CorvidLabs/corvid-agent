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
