/**
 * Model capability detection and caching for Ollama.
 *
 * Queries Ollama's /api/show endpoint to determine what features a model
 * supports (tool calling, vision, embeddings, structured output, etc.)
 * and caches results for the lifetime of the process.
 */

import { createLogger } from '../../lib/logger';

const log = createLogger('ModelCapabilities');

export interface ModelCapabilities {
    name: string;
    /** Whether the model supports the OpenAI-compatible tool calling format. */
    supportsTools: boolean;
    /** Whether the model supports vision/image inputs. */
    supportsVision: boolean;
    /** Whether the model is an embedding model (no chat). */
    isEmbeddingModel: boolean;
    /** Context window size in tokens. */
    contextLength: number;
    /** Model parameter count (e.g. "8B", "3.8B") — informational. */
    parameterSize: string;
    /** Quantization level (e.g. "Q4_K_M") — informational. */
    quantization: string;
    /** Model family/architecture (e.g. "llama", "qwen2", "phi3"). */
    family: string;
    /** Cached at timestamp. */
    cachedAt: number;
}

/** Models known to support tool calling based on Ollama docs + testing. */
const TOOL_CAPABLE_FAMILIES = new Set([
    'llama',     // Llama 3.1+
    'qwen2',     // Qwen 2/2.5
    'qwen3',     // Qwen 3
    'mistral',   // Mistral/Mixtral
    'command-r', // Cohere Command R
    'firefunction', // Fireworks FireFunction
    'hermes',    // Nous Hermes
    'nemotron',  // NVIDIA Nemotron
]);

/** Models known to NOT support tool calling even if family might. */
const TOOL_INCAPABLE_PATTERNS = [
    /embed/i,
    /nomic/i,
    /mxbai/i,
    /all-minilm/i,
    /snowflake/i,
    /bge/i,
];

/** Models known to support vision. */
const VISION_PATTERNS = [
    /llava/i,
    /bakllava/i,
    /moondream/i,
    /llama.*vision/i,
];

const CAPABILITY_CACHE = new Map<string, ModelCapabilities>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface OllamaShowResponse {
    modelfile?: string;
    template?: string;
    parameters?: string;
    details?: {
        parent_model?: string;
        format?: string;
        family?: string;
        families?: string[];
        parameter_size?: string;
        quantization_level?: string;
    };
    model_info?: Record<string, unknown>;
}

export class ModelCapabilityDetector {
    private host: string;

    constructor(host?: string) {
        this.host = host || process.env.OLLAMA_HOST || 'http://localhost:11434';
    }

    /**
     * Get capabilities for a model. Returns cached result if available.
     */
    async getCapabilities(modelName: string): Promise<ModelCapabilities> {
        const cached = CAPABILITY_CACHE.get(modelName);
        if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
            return cached;
        }

        try {
            const response = await fetch(`${this.host}/api/show`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: modelName }),
                signal: AbortSignal.timeout(5_000),
            });

            if (!response.ok) {
                log.warn(`Failed to get model info for ${modelName}`, { status: response.status });
                return this.inferFromName(modelName);
            }

            const data = (await response.json()) as OllamaShowResponse;
            const capabilities = this.parseCapabilities(modelName, data);
            CAPABILITY_CACHE.set(modelName, capabilities);
            log.info(`Detected capabilities for ${modelName}`, {
                tools: capabilities.supportsTools,
                vision: capabilities.supportsVision,
                context: capabilities.contextLength,
                family: capabilities.family,
            });
            return capabilities;
        } catch (err) {
            log.warn(`Failed to detect capabilities for ${modelName}`, {
                error: err instanceof Error ? err.message : String(err),
            });
            return this.inferFromName(modelName);
        }
    }

    /**
     * Get the effective context window for a model, with a safety margin.
     * Returns ~80% of the raw context length to leave room for model overhead.
     */
    async getEffectiveContextLength(modelName: string): Promise<number> {
        const caps = await this.getCapabilities(modelName);
        return Math.floor(caps.contextLength * 0.8);
    }

    /**
     * Check if a model can be used for tool-based agent work.
     */
    async canUseTools(modelName: string): Promise<boolean> {
        const caps = await this.getCapabilities(modelName);
        return caps.supportsTools;
    }

    /**
     * Find the best available model for a given task.
     */
    async findBestModel(
        availableModels: string[],
        requirements: { tools?: boolean; vision?: boolean; minContext?: number },
    ): Promise<string | null> {
        for (const model of availableModels) {
            const caps = await this.getCapabilities(model);

            if (requirements.tools && !caps.supportsTools) continue;
            if (requirements.vision && !caps.supportsVision) continue;
            if (requirements.minContext && caps.contextLength < requirements.minContext) continue;

            return model;
        }
        return null;
    }

    /** Clear the capability cache (e.g., after pulling new models). */
    clearCache(): void {
        CAPABILITY_CACHE.clear();
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private parseCapabilities(name: string, data: OllamaShowResponse): ModelCapabilities {
        const details = data.details ?? {};
        const modelInfo = data.model_info ?? {};

        const family = details.family ?? '';
        const families = details.families ?? [];
        const allFamilies = [family, ...families].filter(Boolean);

        // Context length: check model_info for various keys
        let contextLength = 4096; // Conservative default
        for (const key of Object.keys(modelInfo)) {
            if (key.includes('context_length') || key.includes('context_window')) {
                const val = modelInfo[key];
                if (typeof val === 'number' && val > 0) {
                    contextLength = val;
                    break;
                }
            }
        }

        // Also check parameters string for num_ctx
        if (data.parameters) {
            const ctxMatch = data.parameters.match(/num_ctx\s+(\d+)/);
            if (ctxMatch) {
                contextLength = Math.max(contextLength, parseInt(ctxMatch[1], 10));
            }
        }

        // Tool support detection
        const supportsTools = this.detectToolSupport(name, allFamilies, data.template);

        // Vision support
        const supportsVision = VISION_PATTERNS.some((p) => p.test(name)) ||
            allFamilies.some((f) => f === 'clip' || f === 'mllama');

        // Embedding model detection
        const isEmbeddingModel = TOOL_INCAPABLE_PATTERNS.some((p) => p.test(name)) ||
            allFamilies.some((f) => f === 'bert' || f === 'nomic-bert');

        return {
            name,
            supportsTools: supportsTools && !isEmbeddingModel,
            supportsVision,
            isEmbeddingModel,
            contextLength,
            parameterSize: details.parameter_size ?? 'unknown',
            quantization: details.quantization_level ?? 'unknown',
            family,
            cachedAt: Date.now(),
        };
    }

    private detectToolSupport(
        name: string,
        families: string[],
        template?: string,
    ): boolean {
        // Check if the template includes tool-related tokens
        if (template) {
            const hasToolTokens = template.includes('tool_call') ||
                template.includes('<tool>') ||
                template.includes('function_call') ||
                template.includes('.ToolCalls') ||
                template.includes('tools');
            if (hasToolTokens) return true;
        }

        // Check family against known tool-capable families
        for (const fam of families) {
            if (TOOL_CAPABLE_FAMILIES.has(fam.toLowerCase())) return true;
        }

        // Check model name patterns
        const lowerName = name.toLowerCase();
        for (const fam of TOOL_CAPABLE_FAMILIES) {
            if (lowerName.includes(fam)) return true;
        }

        return false;
    }

    /**
     * Fallback: infer basic capabilities from the model name alone.
     */
    private inferFromName(name: string): ModelCapabilities {
        const isEmbedding = TOOL_INCAPABLE_PATTERNS.some((p) => p.test(name));
        const isVision = VISION_PATTERNS.some((p) => p.test(name));

        let family = 'unknown';
        const lowerName = name.toLowerCase();
        if (lowerName.includes('llama')) family = 'llama';
        else if (lowerName.includes('qwen')) family = 'qwen2';
        else if (lowerName.includes('mistral')) family = 'mistral';
        else if (lowerName.includes('phi')) family = 'phi';
        else if (lowerName.includes('gemma')) family = 'gemma';

        const supportsTools = !isEmbedding && TOOL_CAPABLE_FAMILIES.has(family);

        const caps: ModelCapabilities = {
            name,
            supportsTools,
            supportsVision: isVision,
            isEmbeddingModel: isEmbedding,
            contextLength: isEmbedding ? 512 : 4096,
            parameterSize: 'unknown',
            quantization: 'unknown',
            family,
            cachedAt: Date.now(),
        };

        CAPABILITY_CACHE.set(name, caps);
        return caps;
    }
}

/** Singleton instance. */
let instance: ModelCapabilityDetector | null = null;
export function getModelCapabilityDetector(): ModelCapabilityDetector {
    if (!instance) {
        instance = new ModelCapabilityDetector();
    }
    return instance;
}
