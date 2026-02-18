/**
 * Ollama model management routes.
 *
 * Provides endpoints for downloading, listing, deleting, and inspecting
 * Ollama models. Pull progress is streamed via WebSocket events.
 */

import { OllamaProvider } from '../providers/ollama/provider';
import type { ModelPullStatus } from '../providers/ollama/provider';
import { LlmProviderRegistry } from '../providers/registry';
import { parseBodyOrThrow, ValidationError, OllamaPullModelSchema, OllamaDeleteModelSchema } from '../lib/validation';
import { createLogger } from '../lib/logger';
import { json } from '../lib/response';

const log = createLogger('OllamaRoutes');

/** Get the OllamaProvider instance from the registry, or null. */
function getOllamaProvider(): OllamaProvider | null {
    const provider = LlmProviderRegistry.getInstance().get('ollama');
    if (provider && provider.type === 'ollama') {
        return provider as OllamaProvider;
    }
    return null;
}

/**
 * Handle all /api/ollama/* routes.
 */
export function handleOllamaRoutes(
    req: Request,
    url: URL,
    onPullProgress?: (status: ModelPullStatus) => void,
): Response | Promise<Response> | null {

    // GET /api/ollama/status — Ollama server status
    if (url.pathname === '/api/ollama/status' && req.method === 'GET') {
        return handleOllamaStatus();
    }

    // GET /api/ollama/models — List all models with details + capabilities
    if (url.pathname === '/api/ollama/models' && req.method === 'GET') {
        return handleListModels();
    }

    // GET /api/ollama/models/running — List models currently loaded in memory
    if (url.pathname === '/api/ollama/models/running' && req.method === 'GET') {
        return handleRunningModels();
    }

    // POST /api/ollama/models/pull — Pull (download) a model
    if (url.pathname === '/api/ollama/models/pull' && req.method === 'POST') {
        return handlePullModel(req, onPullProgress);
    }

    // DELETE /api/ollama/models — Delete a model
    if (url.pathname === '/api/ollama/models' && req.method === 'DELETE') {
        return handleDeleteModel(req);
    }

    // GET /api/ollama/models/pull/status — Get all active pull statuses
    if (url.pathname === '/api/ollama/models/pull/status' && req.method === 'GET') {
        return handlePullStatus(url);
    }

    // GET /api/ollama/library — Search the Ollama library for available models to pull
    if (url.pathname === '/api/ollama/library' && req.method === 'GET') {
        return handleLibrarySearch(url);
    }

    return null;
}

// ── Route Handlers ──────────────────────────────────────────────────────────

async function handleOllamaStatus(): Promise<Response> {
    const provider = getOllamaProvider();
    if (!provider) {
        return json({ available: false, error: 'Ollama provider not registered' }, 503);
    }

    const available = await provider.isAvailable();
    const info = provider.getInfo();
    const activePulls = provider.getActivePulls();

    return json({
        available,
        host: process.env.OLLAMA_HOST || 'http://localhost:11434',
        modelCount: info.models.length,
        models: info.models,
        activePulls: activePulls.length,
        pullStatuses: activePulls,
    });
}

async function handleListModels(): Promise<Response> {
    const provider = getOllamaProvider();
    if (!provider) {
        return json({ error: 'Ollama provider not registered' }, 503);
    }

    const available = await provider.isAvailable();
    if (!available) {
        return json({ error: 'Ollama server not reachable', models: [] }, 503);
    }

    const details = await provider.getModelDetails();
    return json({
        models: details,
        total: details.length,
    });
}

async function handleRunningModels(): Promise<Response> {
    const provider = getOllamaProvider();
    if (!provider) {
        return json({ error: 'Ollama provider not registered' }, 503);
    }

    const running = await provider.getRunningModels();
    return json({ models: running });
}

async function handlePullModel(
    req: Request,
    onPullProgress?: (status: ModelPullStatus) => void,
): Promise<Response> {
    const provider = getOllamaProvider();
    if (!provider) {
        return json({ error: 'Ollama provider not registered' }, 503);
    }

    try {
        const data = await parseBodyOrThrow(req, OllamaPullModelSchema);
        const model = data.model;

        // Check if already pulling
        const existing = provider.getPullStatus(model);
        if (existing && existing.status === 'pulling') {
            return json({
                message: `Model ${model} is already being pulled`,
                status: existing,
            }, 409);
        }

        // Check Ollama availability
        const available = await provider.isAvailable();
        if (!available) {
            return json({ error: 'Ollama server not reachable' }, 503);
        }

        log.info(`Starting model pull: ${model}`);

        // Start pull in background — don't await it
        provider.pullModel(model, (status) => {
            onPullProgress?.(status);
        }).catch((err) => {
            log.error(`Unexpected error during model pull: ${model}`, {
                error: err instanceof Error ? err.message : String(err),
            });
        });

        // Return immediately with the initial status
        const status = provider.getPullStatus(model);
        return json({
            message: `Pull started for model: ${model}`,
            status: status ?? { model, status: 'pulling', progress: 0 },
        }, 202);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

async function handleDeleteModel(req: Request): Promise<Response> {
    const provider = getOllamaProvider();
    if (!provider) {
        return json({ error: 'Ollama provider not registered' }, 503);
    }

    try {
        const data = await parseBodyOrThrow(req, OllamaDeleteModelSchema);
        const result = await provider.deleteModel(data.model);

        if (result.success) {
            return json({ ok: true, message: `Model ${data.model} deleted` });
        }
        return json({ error: result.error }, 500);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

function handlePullStatus(url: URL): Response {
    const provider = getOllamaProvider();
    if (!provider) {
        return json({ error: 'Ollama provider not registered' }, 503);
    }

    const model = url.searchParams.get('model');
    if (model) {
        const status = provider.getPullStatus(model);
        if (!status) {
            return json({ error: `No active pull for model: ${model}` }, 404);
        }
        return json({ status });
    }

    // Return all active pulls
    const statuses = provider.getActivePulls();
    return json({ statuses });
}

/**
 * Search the Ollama library for models available to pull.
 * This queries ollama.com/api/tags or provides a curated list of recommended models.
 */
async function handleLibrarySearch(url: URL): Promise<Response> {
    const query = url.searchParams.get('q') ?? '';
    const category = url.searchParams.get('category') ?? 'all';

    // Curated list of recommended models for agent work
    const recommendedModels = [
        {
            name: 'qwen3:8b',
            description: 'Qwen 3 8B — excellent tool calling, strong reasoning',
            category: 'recommended',
            parameterSize: '8B',
            capabilities: ['tools', 'chat'],
            pullCommand: 'qwen3:8b',
        },
        {
            name: 'qwen3:4b',
            description: 'Qwen 3 4B — lightweight with good tool support',
            category: 'recommended',
            parameterSize: '4B',
            capabilities: ['tools', 'chat'],
            pullCommand: 'qwen3:4b',
        },
        {
            name: 'llama3.1:8b',
            description: 'Meta Llama 3.1 8B — general purpose with tool calling',
            category: 'recommended',
            parameterSize: '8B',
            capabilities: ['tools', 'chat'],
            pullCommand: 'llama3.1:8b',
        },
        {
            name: 'llama3.1:70b',
            description: 'Meta Llama 3.1 70B — high quality, needs 40GB+ RAM',
            category: 'large',
            parameterSize: '70B',
            capabilities: ['tools', 'chat'],
            pullCommand: 'llama3.1:70b',
        },
        {
            name: 'mistral:7b',
            description: 'Mistral 7B — fast and capable with tool support',
            category: 'recommended',
            parameterSize: '7B',
            capabilities: ['tools', 'chat'],
            pullCommand: 'mistral:7b',
        },
        {
            name: 'mistral-nemo:12b',
            description: 'Mistral Nemo 12B — stronger reasoning, good tool use',
            category: 'recommended',
            parameterSize: '12B',
            capabilities: ['tools', 'chat'],
            pullCommand: 'mistral-nemo:12b',
        },
        {
            name: 'command-r:35b',
            description: 'Cohere Command R 35B — optimized for tool use and RAG',
            category: 'large',
            parameterSize: '35B',
            capabilities: ['tools', 'chat', 'rag'],
            pullCommand: 'command-r:35b',
        },
        {
            name: 'qwen2.5-coder:7b',
            description: 'Qwen 2.5 Coder 7B — specialized for code generation',
            category: 'coding',
            parameterSize: '7B',
            capabilities: ['tools', 'chat', 'code'],
            pullCommand: 'qwen2.5-coder:7b',
        },
        {
            name: 'deepseek-coder-v2:16b',
            description: 'DeepSeek Coder V2 16B — advanced code agent',
            category: 'coding',
            parameterSize: '16B',
            capabilities: ['tools', 'chat', 'code'],
            pullCommand: 'deepseek-coder-v2:16b',
        },
        {
            name: 'llava:7b',
            description: 'LLaVA 7B — vision model for image understanding',
            category: 'vision',
            parameterSize: '7B',
            capabilities: ['vision', 'chat'],
            pullCommand: 'llava:7b',
        },
        {
            name: 'phi3:mini',
            description: 'Microsoft Phi-3 Mini — tiny but capable (3.8B)',
            category: 'small',
            parameterSize: '3.8B',
            capabilities: ['chat'],
            pullCommand: 'phi3:mini',
        },
        {
            name: 'gemma2:9b',
            description: 'Google Gemma 2 9B — strong general reasoning',
            category: 'recommended',
            parameterSize: '9B',
            capabilities: ['chat'],
            pullCommand: 'gemma2:9b',
        },
        {
            name: 'nemotron-mini:4b',
            description: 'NVIDIA Nemotron Mini 4B — tool calling optimized',
            category: 'small',
            parameterSize: '4B',
            capabilities: ['tools', 'chat'],
            pullCommand: 'nemotron-mini:4b',
        },
    ];

    let filtered = recommendedModels;

    // Filter by category
    if (category !== 'all') {
        filtered = filtered.filter((m) => m.category === category);
    }

    // Filter by search query
    if (query) {
        const lower = query.toLowerCase();
        filtered = filtered.filter(
            (m) =>
                m.name.toLowerCase().includes(lower) ||
                m.description.toLowerCase().includes(lower),
        );
    }

    // Check which models are already installed
    const provider = getOllamaProvider();
    const installedModels = provider ? provider.getInfo().models : [];
    const installedSet = new Set(installedModels);

    const results = filtered.map((m) => ({
        ...m,
        installed: installedSet.has(m.pullCommand) || installedSet.has(m.name),
    }));

    return json({
        models: results,
        categories: ['all', 'recommended', 'coding', 'small', 'large', 'vision'],
        total: results.length,
    });
}
