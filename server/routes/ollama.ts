/**
 * Ollama model management routes.
 *
 * Provides endpoints for downloading, listing, deleting, and inspecting
 * Ollama models. Pull progress is streamed via WebSocket events.
 */

import type { Database } from 'bun:sqlite';
import { createProject, getProjectByName, updateProject } from '../db/projects';
import { createSession } from '../db/sessions';
import { createLogger } from '../lib/logger';
import { json } from '../lib/response';
import { OllamaDeleteModelSchema, OllamaPullModelSchema, parseBodyOrThrow, ValidationError } from '../lib/validation';
import type { ProcessManager } from '../process/manager';
import type { ModelPullStatus } from '../providers/ollama/provider';
import { OllamaProvider } from '../providers/ollama/provider';
import { extractToolCallsFromContent } from '../providers/ollama/tool-parser';
import { detectModelFamily, getCompactToolInstructionPrompt } from '../providers/ollama/tool-prompt-templates';
import { LlmProviderRegistry } from '../providers/registry';
import type { LlmToolDefinition } from '../providers/types';

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
  db: Database,
  processManager: ProcessManager,
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
    return handleLaunchClaude(req, db, processManager);
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

async function handlePullModel(req: Request, onPullProgress?: (status: ModelPullStatus) => void): Promise<Response> {
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
      return json(
        {
          message: `Model ${model} is already being pulled`,
          status: existing,
        },
        409,
      );
    }

    // Check Ollama availability
    const available = await provider.isAvailable();
    if (!available) {
      return json({ error: 'Ollama server not reachable' }, 503);
    }

    log.info(`Starting model pull: ${model}`);

    // Start pull in background — don't await it
    provider
      .pullModel(model, (status) => {
        onPullProgress?.(status);
      })
      .catch((err) => {
        log.error(`Unexpected error during model pull: ${model}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      });

    // Return immediately with the initial status
    const status = provider.getPullStatus(model);
    return json(
      {
        message: `Pull started for model: ${model}`,
        status: status ?? { model, status: 'pulling', progress: 0 },
      },
      202,
    );
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
      (m) => m.name.toLowerCase().includes(lower) || m.description.toLowerCase().includes(lower),
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
async function handleLaunchClaude(req: Request, db: Database, processManager: ProcessManager): Promise<Response> {
  const provider = getOllamaProvider();
  if (!provider) {
    return json({ error: 'Ollama provider not registered' }, 503);
  }

  try {
    const body = (await req.json()) as { model?: string; agentId?: string; prompt?: string; workDir?: string };
    const model = body.model ?? 'qwen3.5:cloud';

    // Validate it's a cloud model
    if (!OllamaProvider.isCloudModel(model)) {
      return json(
        {
          error: 'Model must be an Ollama cloud model (e.g., kimi-k2.5:cloud, qwen3.5:cloud)',
          example: 'kimi-k2.5:cloud',
        },
        400,
      );
    }

    // Check if Ollama is reachable and model is available
    const available = await provider.isAvailable();
    if (!available) {
      return json({ error: 'Ollama is not running. Start it with: ollama serve' }, 503);
    }

    const details = await provider.getModelDetails();
    const hasModel = details.some((m) => m.name === model);
    if (!hasModel) {
      return json(
        {
          error: `Model ${model} not found. Pull it first: ollama pull ${model}`,
          available: details.filter((m) => OllamaProvider.isCloudModel(m.name)).map((m) => m.name),
        },
        400,
      );
    }

    // Build the proxy URL that Claude Code will use instead of api.anthropic.com
    const port = process.env.PORT ?? '3000';
    const proxyUrl = `http://localhost:${port}/api/ollama/claude-proxy`;

    // Create a project with ANTHROPIC_BASE_URL in envVars so the spawned
    // Claude Code process talks to our local Ollama proxy instead of
    // api.anthropic.com. Project envVars are passed to the subprocess via
    // buildSafeEnv and persist across async spawn — no race condition.
    // Reuse existing Ollama proxy project or create one.
    // Project name is unique per tenant — look up first.
    const projectName = `Ollama: ${model}`;
    let ollamaProject = getProjectByName(db, projectName);
    if (ollamaProject) {
      // Update envVars in case proxy URL changed (e.g. different port)
      ollamaProject =
        updateProject(db, ollamaProject.id, {
          envVars: {
            ANTHROPIC_BASE_URL: proxyUrl,
            // Dummy API key so Claude Code uses key auth (which respects BASE_URL)
            // instead of OAuth (which always talks to Anthropic directly).
            ANTHROPIC_API_KEY: 'ollama-proxy',
          },
          workingDir: body.workDir ?? process.cwd(),
        }) ?? ollamaProject;
    } else {
      ollamaProject = createProject(db, {
        name: projectName,
        description: `Claude Code backed by Ollama cloud model ${model}`,
        workingDir: body.workDir ?? process.cwd(),
        envVars: {
          ANTHROPIC_BASE_URL: proxyUrl,
          ANTHROPIC_API_KEY: 'ollama-proxy',
        },
      });
    }

    const session = createSession(db, {
      projectId: ollamaProject.id,
      agentId: body.agentId,
      name: `Claude Code (Ollama: ${model})`,
      initialPrompt: body.prompt ?? '',
      source: 'web',
    });

    // Start the process — SDK reads ANTHROPIC_BASE_URL from the project's
    // envVars and passes it to the spawned Claude Code subprocess.
    processManager.startProcess(session);

    log.info('Launched Claude Code with Ollama backend', {
      sessionId: session.id,
      model,
      proxyUrl,
    });

    return json(
      {
        session,
        model,
        proxy_url: proxyUrl,
      },
      201,
    );
  } catch (err) {
    log.error('Launch claude error', { error: err instanceof Error ? err.message : String(err) });
    return json({ error: 'Failed to launch Claude Code with Ollama' }, 500);
  }
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
  if (envModel?.includes('cloud')) {
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
    const body = (await req.json()) as {
      model?: string;
      messages?: Array<{
        role: string;
        content:
          | string
          | Array<{
              type: string;
              text?: string;
              id?: string;
              name?: string;
              input?: Record<string, unknown>;
              tool_use_id?: string;
              content?: string | Array<{ type: string; text?: string }>;
            }>;
      }>;
      system?: string | Array<{ type: string; text?: string }>;
      max_tokens?: number;
      temperature?: number;
      stream?: boolean;
      tools?: Array<{
        name: string;
        description?: string;
        input_schema?: { type?: string; properties?: Record<string, unknown>; required?: string[] };
      }>;
    };

    // Get the actual Ollama cloud model to use
    const ollamaModel = mapAnthropicToOllamaModel(body.model ?? '');

    // Check if model is available
    const modelDetails = await provider.getModelDetails();
    const hasModel = modelDetails.some((m) => m.name === ollamaModel);

    if (!hasModel) {
      return json(
        {
          error: `Model ${ollamaModel} not available. Pull it first: POST /api/ollama/models/pull`,
          type: 'invalid_request_error',
        },
        400,
      );
    }

    // Convert Anthropic tools to LlmToolDefinition format for text-based parsing
    const toolDefs: LlmToolDefinition[] = (body.tools ?? []).map((t) => {
      // Ensure properties have required 'type' field for JsonSchemaProperty compatibility
      const rawProps = t.input_schema?.properties ?? {};
      const properties: Record<string, { type: string; description?: string }> = {};
      for (const [key, val] of Object.entries(rawProps)) {
        const prop = val as { type?: string; description?: string };
        properties[key] = { type: prop.type ?? 'string', description: prop.description };
      }
      return {
        name: t.name,
        description: t.description ?? '',
        parameters: {
          type: t.input_schema?.type ?? 'object',
          properties,
          required: t.input_schema?.required,
        },
      };
    });
    const toolNames = toolDefs.map((t) => t.name);

    // Build system prompt — Anthropic sends system as string or content block array
    let systemPrompt =
      typeof body.system === 'string'
        ? body.system
        : Array.isArray(body.system)
          ? body.system
              .filter((b) => b.type === 'text')
              .map((b) => b.text ?? '')
              .join('\n')
          : 'You are a helpful assistant.';

    // Inject tool instructions into system prompt so the model knows how to call tools
    if (toolDefs.length > 0) {
      const family = detectModelFamily(ollamaModel);
      const toolPrompt = getCompactToolInstructionPrompt(family, toolNames, toolDefs);
      systemPrompt = `${systemPrompt}\n\n${toolPrompt}`;
    }

    // Convert Anthropic messages to Ollama format.
    // Handles text, tool_use (assistant requesting tool), and tool_result (user providing result).
    const ollamaMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const msg of body.messages ?? []) {
      if (typeof msg.content === 'string') {
        ollamaMessages.push({
          role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: msg.content,
        });
      } else if (Array.isArray(msg.content)) {
        const textParts: string[] = [];
        const toolUseParts: string[] = [];
        const toolResultParts: string[] = [];

        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            textParts.push(block.text);
          } else if (block.type === 'tool_use' && block.name) {
            // Assistant's tool call — convert to text-based format
            const args = block.input ?? {};
            toolUseParts.push(JSON.stringify([{ name: block.name, arguments: args }]));
          } else if (block.type === 'tool_result') {
            // Tool result — wrap in delimiters the model recognizes
            const resultContent =
              typeof block.content === 'string'
                ? block.content
                : Array.isArray(block.content)
                  ? block.content
                      .filter((b: { type: string; text?: string }) => b.type === 'text')
                      .map((b: { type: string; text?: string }) => b.text ?? '')
                      .join('\n')
                  : '';
            toolResultParts.push(`«tool_output»\n${resultContent}\n«/tool_output»`);
          }
        }

        if (msg.role === 'assistant') {
          // Combine text and tool_use parts for assistant messages
          const combined = [...textParts, ...toolUseParts].filter(Boolean).join('\n');
          if (combined) {
            ollamaMessages.push({ role: 'assistant', content: combined });
          }
        } else {
          // User messages may contain tool_result blocks
          const combined = [...textParts, ...toolResultParts].filter(Boolean).join('\n');
          if (combined) {
            ollamaMessages.push({ role: 'user', content: combined });
          }
        }
      } else {
        ollamaMessages.push({
          role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: String(msg.content),
        });
      }
    }

    // Acquire slot
    const slotAcquired = await provider.acquireSlot(ollamaModel);
    if (!slotAcquired) {
      return json({ error: 'Model is busy - try again later' }, 503);
    }

    const msgId = `msg_${Date.now()}`;
    const effectiveModel = body.model ?? 'claude-sonnet-4-6-20250514';

    try {
      if (body.stream) {
        // Streaming response — emit Anthropic SSE format so the SDK can parse it.
        // We accumulate the full response, then parse for tool calls at the end,
        // because text-based tool calls can only be detected after full generation.
        const encoder = new TextEncoder();
        const sse = (event: string, data: unknown) =>
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

        // Track if slot was already released to prevent double-release
        let released = false;

        return new Response(
          new ReadableStream({
            async start(controller) {
              try {
                // message_start
                controller.enqueue(
                  sse('message_start', {
                    type: 'message_start',
                    message: {
                      id: msgId,
                      type: 'message',
                      role: 'assistant',
                      content: [],
                      model: effectiveModel,
                      stop_reason: null,
                      stop_sequence: null,
                      usage: { input_tokens: 0, output_tokens: 0 },
                    },
                  }),
                );

                // Stream text into a text content block first
                controller.enqueue(
                  sse('content_block_start', {
                    type: 'content_block_start',
                    index: 0,
                    content_block: { type: 'text', text: '' },
                  }),
                );

                let outputTokens = 0;
                let fullContent = '';
                await provider.complete({
                  model: ollamaModel,
                  systemPrompt,
                  messages: ollamaMessages,
                  tools: toolDefs.length > 0 ? toolDefs : undefined,
                  maxTokens: body.max_tokens ?? 4096,
                  temperature: body.temperature ?? 0.7,
                  onStream: (token) => {
                    outputTokens++;
                    fullContent += token;
                    controller.enqueue(
                      sse('content_block_delta', {
                        type: 'content_block_delta',
                        index: 0,
                        delta: { type: 'text_delta', text: token },
                      }),
                    );
                  },
                });

                // Close the text content block
                controller.enqueue(
                  sse('content_block_stop', {
                    type: 'content_block_stop',
                    index: 0,
                  }),
                );

                // Parse tool calls from the accumulated response text
                const parsedToolCalls = toolDefs.length > 0 ? extractToolCallsFromContent(fullContent, toolDefs) : [];

                // If tool calls were found, emit them as tool_use content blocks
                if (parsedToolCalls.length > 0) {
                  log.info(`Proxy extracted ${parsedToolCalls.length} tool call(s) from response`, {
                    model: ollamaModel,
                    tools: parsedToolCalls.map((tc) => tc.name),
                  });

                  for (let i = 0; i < parsedToolCalls.length; i++) {
                    const tc = parsedToolCalls[i];
                    const blockIndex = i + 1; // text block is index 0

                    // content_block_start for tool_use
                    controller.enqueue(
                      sse('content_block_start', {
                        type: 'content_block_start',
                        index: blockIndex,
                        content_block: {
                          type: 'tool_use',
                          id: `toolu_${tc.id}`,
                          name: tc.name,
                          input: {},
                        },
                      }),
                    );

                    // Send the full input as a single delta
                    controller.enqueue(
                      sse('content_block_delta', {
                        type: 'content_block_delta',
                        index: blockIndex,
                        delta: {
                          type: 'input_json_delta',
                          partial_json: JSON.stringify(tc.arguments),
                        },
                      }),
                    );

                    // content_block_stop
                    controller.enqueue(
                      sse('content_block_stop', {
                        type: 'content_block_stop',
                        index: blockIndex,
                      }),
                    );
                  }
                }

                // message_delta — tool_use means stop_reason is 'tool_use'
                const stopReason = parsedToolCalls.length > 0 ? 'tool_use' : 'end_turn';
                controller.enqueue(
                  sse('message_delta', {
                    type: 'message_delta',
                    delta: { stop_reason: stopReason, stop_sequence: null },
                    usage: { output_tokens: outputTokens },
                  }),
                );

                // message_stop
                controller.enqueue(sse('message_stop', { type: 'message_stop' }));
                controller.close();
              } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                log.error('Ollama streaming failed', { model: ollamaModel, error: errorMsg });
                // Send error as an SSE event the SDK can handle
                controller.enqueue(
                  sse('error', {
                    type: 'error',
                    error: { type: 'api_error', message: `Ollama: ${errorMsg}` },
                  }),
                );
                controller.close();
              } finally {
                if (!released) {
                  released = true;
                  provider.releaseSlot(ollamaModel);
                }
              }
            },
            cancel() {
              if (!released) {
                released = true;
                provider.releaseSlot(ollamaModel);
              }
            },
          }),
          {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          },
        );
      } else {
        // Non-streaming — return full Anthropic message format
        let content = '';
        await provider.complete({
          model: ollamaModel,
          systemPrompt,
          messages: ollamaMessages,
          tools: toolDefs.length > 0 ? toolDefs : undefined,
          maxTokens: body.max_tokens ?? 4096,
          temperature: body.temperature ?? 0.7,
          onStream: (token) => {
            content += token;
          },
        });
        provider.releaseSlot(ollamaModel);

        // Parse tool calls from response text
        const parsedToolCalls = toolDefs.length > 0 ? extractToolCallsFromContent(content, toolDefs) : [];

        const contentBlocks: Array<{
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: Record<string, unknown>;
        }> = [];

        // Always include text block (may be empty if model only output tool calls)
        contentBlocks.push({ type: 'text', text: content });

        // Add tool_use blocks if parsed
        for (const tc of parsedToolCalls) {
          contentBlocks.push({
            type: 'tool_use',
            id: `toolu_${tc.id}`,
            name: tc.name,
            input: tc.arguments,
          });
        }

        const stopReason = parsedToolCalls.length > 0 ? 'tool_use' : 'end_turn';

        return json({
          id: msgId,
          type: 'message',
          role: 'assistant',
          content: contentBlocks,
          model: effectiveModel,
          stop_reason: stopReason,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        });
      }
    } catch (err) {
      provider.releaseSlot(ollamaModel);
      throw err;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error('Claude proxy error', { error: errorMsg });
    return json(
      {
        error: {
          type: 'ollama_proxy_error',
          message: `Ollama request failed: ${errorMsg}`,
          hint: 'Ollama cloud model failed. Check that Ollama is running and the model is available. This proxy does NOT fall back to Anthropic.',
        },
      },
      502,
    );
  }
}
