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

    // POST /api/ollama/launch-claude — Launch Claude Code with an Ollama cloud model
    if (url.pathname === '/api/ollama/launch-claude' && req.method === 'POST') {
        return handleLaunchClaude(req);
    }

    // Anthropic API proxy for Claude Code → Ollama cloud models
    if (url.pathname.startsWith('/api/ollama/claude-proxy') && req.method === 'GET') {
        return handleClaudeProxyModels();
    }
    if (url.pathname.startsWith('/api/ollama/claude-proxy') && req.method === 'POST') {
        return handleClaudeProxyMessages(req);
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
        // ── Cloud models — Tier 1: Frontier (best for complex agent tasks) ──
        {
            name: 'qwen3.5:cloud',
            description: 'Qwen 3.5 397B — frontier reasoning with 64K context, thinking, top-tier tool calling',
            category: 'cloud',
            parameterSize: '397B',
            capabilities: ['tools', 'chat', 'cloud', 'thinking'],
            pullCommand: 'qwen3.5:cloud',
        },
        {
            name: 'deepseek-v3.2:cloud',
            description: 'DeepSeek V3.2 671B — strongest open model, 64K context, thinking + tools',
            category: 'cloud',
            parameterSize: '671B',
            capabilities: ['tools', 'chat', 'cloud', 'thinking'],
            pullCommand: 'deepseek-v3.2:cloud',
        },
        {
            name: 'kimi-k2.5:cloud',
            description: 'Kimi K2.5 — Moonshot frontier, 128K context, strong agentic tool calling',
            category: 'cloud',
            parameterSize: '?',
            capabilities: ['tools', 'chat', 'cloud', 'thinking'],
            pullCommand: 'kimi-k2.5:cloud',
        },
        {
            name: 'minimax-m2.5:cloud',
            description: 'MiniMax M2.5 456B — massive 1M native context, strong reasoning + tools',
            category: 'cloud',
            parameterSize: '456B',
            capabilities: ['tools', 'chat', 'cloud', 'thinking'],
            pullCommand: 'minimax-m2.5:cloud',
        },
        // ── Cloud models — Tier 2: Code specialists ──
        {
            name: 'qwen3-coder:480b-cloud',
            description: 'Qwen 3 Coder 480B — best cloud coding model, 64K context, thinking + tools',
            category: 'cloud',
            parameterSize: '480B',
            capabilities: ['tools', 'chat', 'cloud', 'code', 'thinking'],
            pullCommand: 'qwen3-coder:480b-cloud',
        },
        {
            name: 'qwen3-coder-next:cloud',
            description: 'Qwen 3 Coder Next 235B — fast top-tier code generation, 64K context',
            category: 'cloud',
            parameterSize: '235B',
            capabilities: ['tools', 'chat', 'cloud', 'code', 'thinking'],
            pullCommand: 'qwen3-coder-next:cloud',
        },
        {
            name: 'devstral-small-2:cloud',
            description: 'Devstral Small 2 24B — fastest cloud coding assistant, low latency',
            category: 'cloud',
            parameterSize: '24B',
            capabilities: ['tools', 'chat', 'cloud', 'code'],
            pullCommand: 'devstral-small-2:cloud',
        },
        // ── Cloud models — Tier 3: General purpose ──
        {
            name: 'deepseek-v3.1:671b-cloud',
            description: 'DeepSeek V3.1 671B — massive reasoning model, 64K context, thinking + tools',
            category: 'cloud',
            parameterSize: '671B',
            capabilities: ['tools', 'chat', 'cloud', 'thinking'],
            pullCommand: 'deepseek-v3.1:671b-cloud',
        },
        {
            name: 'glm-5:cloud',
            description: 'GLM-5 — Zhipu frontier with thinking and agentic tool use',
            category: 'cloud',
            parameterSize: '?',
            capabilities: ['tools', 'chat', 'cloud', 'thinking'],
            pullCommand: 'glm-5:cloud',
        },
        {
            name: 'nemotron-3-nano:cloud',
            description: 'Nemotron 3 Nano 30B — NVIDIA cloud, fast inference with tool support',
            category: 'cloud',
            parameterSize: '30B',
            capabilities: ['tools', 'chat', 'cloud'],
            pullCommand: 'nemotron-3-nano:cloud',
        },
        {
            name: 'gpt-oss:120b-cloud',
            description: 'GPT-OSS 120B — open-source GPT variant, solid general reasoning + tools',
            category: 'cloud',
            parameterSize: '120B',
            capabilities: ['tools', 'chat', 'cloud'],
            pullCommand: 'gpt-oss:120b-cloud',
        },
        // ── Local recommended models ──
        {
            name: 'qwen3:8b',
            description: 'Qwen 3 8B — excellent tool calling, strong reasoning',
            category: 'recommended',
            parameterSize: '8B',
            capabilities: ['tools', 'chat'],
            pullCommand: 'qwen3:8b',
        },
        {
            name: 'qwen3:32b',
            description: 'Qwen 3 32B — best local model for complex agent tasks',
            category: 'recommended',
            parameterSize: '32B',
            capabilities: ['tools', 'chat', 'thinking'],
            pullCommand: 'qwen3:32b',
        },
        {
            name: 'qwen3:4b',
            description: 'Qwen 3 4B — lightweight with good tool support',
            category: 'small',
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
        // ── Coding models ──
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
        // ── Vision models ──
        {
            name: 'llava:7b',
            description: 'LLaVA 7B — vision model for image understanding',
            category: 'vision',
            parameterSize: '7B',
            capabilities: ['vision', 'chat'],
            pullCommand: 'llava:7b',
        },
        // ── Small/efficient models ──
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
        categories: ['all', 'cloud', 'recommended', 'coding', 'small', 'large', 'vision'],
        total: results.length,
    });
}

// ── Claude Launch Handler ───────────────────────────────────────────────────

/**
 * Launch Claude Code CLI using an Ollama cloud model as the backend.
 *
 * This creates a temporary API proxy that translates Anthropic API requests
 * to Ollama cloud model requests, then launches Claude Code pointing at
 * that proxy.
 */
async function handleLaunchClaude(req: Request): Promise<Response> {
    const provider = getOllamaProvider();
    if (!provider) {
        return json({ error: 'Ollama provider not registered' }, 503);
    }

    try {
        const body = await req.json() as { model?: string };
        const model = body.model ?? 'qwen3.5:cloud';

        // Validate it's a cloud model
        if (!model.includes('cloud')) {
            return json({
                error: 'Model must be an Ollama cloud model (e.g., kimi-k2.5:cloud, qwen3.5:cloud)',
                example: 'kimi-k2.5:cloud',
            }, 400);
        }

        // Check if model is available
        const details = await provider.getModelDetails();
        const hasModel = details.some((m) => m.name === model);

        if (!hasModel) {
            return json({
                error: `Model ${model} not found in available models. Try pulling it first.`,
                available: details.filter((m) => m.name.includes('cloud')).map((m) => m.name),
            }, 400);
        }

        // Build the launch command for the user
        const port = process.env.PORT ?? '3000';
        const host = `http://localhost:${port}`;
        const proxyUrl = `${host}/api/ollama/claude-proxy`;

        // Map cloud model to Anthropic-style ID
        const anthropicModel = mapCloudModelToAnthropicId(model);

        const command = `ANTHROPIC_API_URL="${proxyUrl}" CLAUDE_MODEL="${anthropicModel}" claude`;

        return json({
            message: 'Run this command to launch Claude Code with Ollama cloud model',
            command,
            model: {
                ollama: model,
                anthropic_id: anthropicModel,
            },
            proxy_url: proxyUrl,
            instructions: [
                '1. Ensure Ollama is running with the cloud model available',
                '2. Run the command above in your terminal',
                '3. Claude Code will use the Ollama cloud model as its backend',
            ],
            note: 'The ANTHROPIC_API_URL tells Claude Code to use the Ollama proxy instead of Anthropic. If Ollama fails, the request FAILS - no fallback to Claude API.',
        });
    } catch (err) {
        log.error('Launch claude error', { error: err instanceof Error ? err.message : String(err) });
        return json({ error: 'Failed to generate launch command' }, 500);
    }
}

/**
 * Map Ollama cloud model names to Anthropic-compatible IDs.
 */
function mapCloudModelToAnthropicId(ollamaModel: string): string {
    const map: Record<string, string> = {
        'kimi-k2.5:cloud': 'claude-opus-4-6-ollama',
        'qwen3.5:cloud': 'claude-opus-4-6-ollama',
        'deepseek-v3.2:cloud': 'claude-opus-4-6-ollama',
        'minimax-m2.5:cloud': 'claude-opus-4-6-ollama',
        'qwen3-coder:480b-cloud': 'claude-sonnet-4-6-ollama',
        'qwen3-coder-next:cloud': 'claude-sonnet-4-6-ollama',
        'devstral-small-2:cloud': 'claude-sonnet-4-6-ollama',
        'deepseek-v3.1:671b-cloud': 'claude-opus-4-6-ollama',
        'glm-5:cloud': 'claude-sonnet-4-6-ollama',
        'nemotron-3-nano:cloud': 'claude-haiku-4-5-ollama',
        'gpt-oss:120b-cloud': 'claude-sonnet-4-6-ollama',
    };
    return map[ollamaModel] ?? 'claude-sonnet-4-6-ollama';
}

// ── Claude API Proxy Handlers ───────────────────────────────────────────────

/**
 * Map Anthropic model IDs back to Ollama cloud model names.
 */
function mapAnthropicToOllamaModel(_anthropicId: string): string {
    // Extract the cloud model from the anthropic ID
    // claude-*-ollama is just a placeholder - we use the CLAUDE_MODEL env var
    // to determine which model to actually use
    const envModel = process.env.CLAUDE_OLLAMA_MODEL;
    if (envModel && envModel.includes('cloud')) {
        return envModel;
    }
    // Default fallback
    return 'qwen3.5:cloud';
}

/**
 * Handle GET /api/ollama/claude-proxy/v1/models
 * Returns models in Anthropic API format.
 */
async function handleClaudeProxyModels(): Promise<Response> {
    const provider = getOllamaProvider();
    if (!provider) {
        return json({ error: 'Ollama provider not registered' }, 503);
    }

    const cloudModels = [
        { id: 'claude-opus-4-6-ollama', display_name: 'Ollama Cloud - Kimi/Qwen/DeepSeek', context_window: 128000 },
        { id: 'claude-sonnet-4-6-ollama', display_name: 'Ollama Cloud - Coder/Devstral', context_window: 64000 },
        { id: 'claude-haiku-4-5-ollama', display_name: 'Ollama Cloud - Nemotron', context_window: 32000 },
    ];

    return json({
        data: cloudModels,
        has_more: false,
    });
}

/**
 * Handle POST /api/ollama/claude-proxy/v1/messages
 * Proxies Anthropic API requests to Ollama cloud models.
 */
async function handleClaudeProxyMessages(req: Request): Promise<Response> {
    const provider = getOllamaProvider();
    if (!provider) {
        return json({ error: 'Ollama provider not registered' }, 503);
    }

    try {
        const body = await req.json() as {
            model?: string;
            messages?: Array<{ role: string; content: string }>;
            system?: string;
            max_tokens?: number;
            temperature?: number;
            stream?: boolean;
        };

        // Get the actual Ollama cloud model to use
        const ollamaModel = mapAnthropicToOllamaModel(body.model ?? '');

        // Check if model is available
        const modelDetails = await provider.getModelDetails();
        const hasModel = modelDetails.some((m) => m.name === ollamaModel);

        if (!hasModel) {
            return json({
                error: `Model ${ollamaModel} not available. Pull it first: POST /api/ollama/models/pull`,
                type: 'invalid_request_error',
            }, 400);
        }

        // Build system prompt
        const systemPrompt = body.system ?? 'You are a helpful assistant.';

        // Convert messages
        const ollamaMessages = (body.messages ?? []).map((msg) => ({
            role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: msg.content,
        }));

        // Acquire slot
        const slotAcquired = await provider.acquireSlot(ollamaModel);
        if (!slotAcquired) {
            return json({ error: 'Model is busy - try again later' }, 503);
        }

        try {
            if (body.stream) {
                // Streaming response
                const encoder = new TextEncoder();
                return new Response(
                    new ReadableStream({
                        async start(controller) {
                            let content = '';
                            try {
                                await provider.complete({
                                    model: ollamaModel,
                                    systemPrompt,
                                    messages: ollamaMessages,
                                    maxTokens: body.max_tokens ?? 4096,
                                    temperature: body.temperature ?? 0.7,
                                    onStream: (token) => {
                                        content += token;
                                        controller.enqueue(encoder.encode(token));
                                    },
                                });
                                controller.close();
                            } catch (err) {
                                // Ollama failed - send error marker but don't fall back
                                const errorMsg = err instanceof Error ? err.message : String(err);
                                log.error('Ollama streaming failed', { model: ollamaModel, error: errorMsg });
                                controller.enqueue(encoder.encode(`\n[OLLAMA_ERROR: ${errorMsg}]`));
                                controller.close();
                            } finally {
                                provider.releaseSlot(ollamaModel);
                            }
                        },
                        cancel() {
                            provider.releaseSlot(ollamaModel);
                        },
                    }),
                    {
                        headers: {
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Cache-Control': 'no-cache',
                        },
                    }
                );
            } else {
                // Non-streaming
                let content = '';
                await provider.complete({
                    model: ollamaModel,
                    systemPrompt,
                    messages: ollamaMessages,
                    maxTokens: body.max_tokens ?? 4096,
                    temperature: body.temperature ?? 0.7,
                    onStream: (token) => {
                        content += token;
                    },
                });
                provider.releaseSlot(ollamaModel);

                return json({
                    id: `msg_${Date.now()}`,
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'text', text: content }],
                    model: body.model ?? 'claude-opus-4-6-ollama',
                });
            }
        } catch (err) {
            provider.releaseSlot(ollamaModel);
            throw err;
        }
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error('Claude proxy error', { error: errorMsg });
        return json({
            error: {
                type: 'ollama_proxy_error',
                message: `Ollama request failed: ${errorMsg}`,
                hint: 'Ollama cloud model failed. Check that Ollama is running and the model is available. This proxy does NOT fall back to Anthropic.',
            },
        }, 502);
    }
}
