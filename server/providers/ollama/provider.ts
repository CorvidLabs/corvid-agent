import { ExternalServiceError } from '../../lib/errors';
import { createLogger } from '../../lib/logger';
import { BaseLlmProvider } from '../base';
import type {
  ExecutionMode,
  LlmCompletionParams,
  LlmCompletionResult,
  LlmProviderInfo,
  LlmProviderType,
  LlmToolCall,
  LlmToolDefinition,
} from '../types';
import { getModelCapabilityDetector } from './model-capabilities';
import { sanitizeModelOutput } from './response-sanitizer';
import { extractToolCallsFromContent, normalizeToolArgs, stripJsonToolCallArrays } from './tool-parser';

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
  eval_duration?: number; // nanoseconds
  prompt_eval_duration?: number; // nanoseconds
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
    size_vram?: number; // bytes loaded into GPU VRAM (0 = CPU-only)
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
   * Weight-based concurrency limiter for model-size-aware scheduling.
   * Small models (<=7B) cost 1 slot, medium (8-13B) cost 2, large (>=14B) cost 3.
   *
   * GPU-aware defaults:
   * - CPU mode (no GPU / OLLAMA_NUM_GPU=0): maxWeight=1 (serial, one model at a time)
   * - GPU mode (auto-detected via /api/ps size_vram): maxWeight=3 (concurrent)
   * - Override: set OLLAMA_MAX_PARALLEL env var to skip auto-detection
   *
   * Auto-detection: after the first completion, probes /api/ps to check if
   * the model was loaded into GPU VRAM. If so, upgrades from serial to concurrent.
   */
  private maxWeight = process.env.OLLAMA_MAX_PARALLEL ? parseInt(process.env.OLLAMA_MAX_PARALLEL, 10) : 1; // Serial until GPU auto-detected
  private activeWeight = 0;
  private waitQueue: Array<{ weight: number; resolve: () => void }> = [];
  /** null = not yet probed, true/false = detected */
  private gpuDetected: boolean | null = process.env.OLLAMA_MAX_PARALLEL ? true : null;

  private get host(): string {
    return process.env.OLLAMA_HOST || 'http://localhost:11434';
  }

  /** Check whether a model name indicates cloud-proxied inference. */
  static isCloudModel(model: string): boolean {
    return model.includes('-cloud') || model.endsWith(':cloud');
  }

  /**
   * Extract the base model name from a cloud model string.
   * Strips size tags (e.g. `:480b`) and cloud suffixes (`:cloud`, `-cloud`).
   * Examples:
   *   "qwen3-coder:480b-cloud" → "qwen3-coder"
   *   "deepseek-v3.1:671b-cloud" → "deepseek-v3.1"
   *   "qwen3.5:cloud" → "qwen3.5"
   *   "devstral-small-2:cloud" → "devstral-small-2"
   */
  private static cloudBaseModel(model: string): string {
    return model.replace(/:.*$/, '').replace(/-cloud$/, '');
  }

  /**
   * Get the host for a specific model. Cloud models (suffix "-cloud" or ":cloud")
   * require the local Ollama instance because cloud proxying uses locally-stored auth.
   * If OLLAMA_HOST points to a non-local address, cloud models fall back to localhost.
   */
  private hostForModel(model: string): string {
    if (OllamaProvider.isCloudModel(model)) {
      const configuredHost = this.host;
      // If host is already localhost, use it directly
      if (configuredHost.includes('localhost') || configuredHost.includes('127.0.0.1')) {
        return configuredHost;
      }
      // Cloud models need local Ollama for auth proxy — override to localhost
      const url = new URL(configuredHost);
      const localHost = `${url.protocol}//localhost:${url.port || '11434'}`;
      log.info(`Cloud model "${model}" — redirecting from ${configuredHost} to ${localHost}`);
      return localHost;
    }
    return this.host;
  }

  getInfo(): LlmProviderInfo {
    const configuredDefault = process.env.OLLAMA_DEFAULT_MODEL;
    const defaultModel = configuredDefault ?? this.cachedModels[0] ?? 'qwen3:14b';
    return {
      type: this.type,
      name: 'Ollama',
      executionMode: this.executionMode,
      models: this.cachedModels,
      defaultModel,
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
      let allModels = data.models;

      // If host is non-local, also check localhost for cloud models
      // (cloud models only appear on the local Ollama instance)
      if (!this.host.includes('localhost') && !this.host.includes('127.0.0.1')) {
        try {
          const url = new URL(this.host);
          const localHost = `${url.protocol}//localhost:${url.port || '11434'}`;
          const localResponse = await fetch(`${localHost}/api/tags`, {
            signal: AbortSignal.timeout(3_000),
          });
          if (localResponse.ok) {
            const localData = (await localResponse.json()) as OllamaTagsResponse;
            const cloudModels = localData.models.filter((m) => m.name.includes('-cloud'));
            if (cloudModels.length > 0) {
              allModels = [...allModels, ...cloudModels];
              log.info(`Found ${cloudModels.length} cloud model(s) on localhost`);
            }
          }
        } catch {
          // localhost not available — no cloud models
        }
      }

      this.cachedModels = allModels.map((m) => m.name);
      this.cachedTags = allModels;
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
  private static readonly REQUEST_TIMEOUT_MS = parseInt(
    process.env.OLLAMA_REQUEST_TIMEOUT ?? String(30 * 60 * 1000),
    10,
  ); // 30 minutes default (CPU inference with large context can be slow)

  /**
   * Model families that use a "thinking" mode by default (extended CoT).
   * For LOCAL models we set `think: false` so the model produces content
   * directly rather than spending the entire token budget on internal
   * reasoning and returning an empty `content` field.
   *
   * Cloud models with thinking support get `think: true` — they have the
   * compute headroom to benefit from extended reasoning.
   */
  private static readonly THINKING_MODEL_FAMILIES = new Set(['qwen3', 'qwen3.5', 'qwen3next', 'qwen3moe']);

  /**
   * Cloud models where thinking mode should be enabled.
   * These are frontier-class models with enough compute to benefit from CoT.
   */
  private static readonly CLOUD_THINKING_MODELS = new Set([
    'qwen3.5',
    'deepseek-v3.2',
    'qwen3-coder-next',
    'minimax-m2.5',
    'glm-5',
    'kimi-k2.5',
    'deepseek-v3.1',
    'qwen3-coder',
  ]);

  /**
   * Per-model context window overrides for cloud models.
   * Frontier models with large native context windows get higher limits.
   * Key is the model name WITHOUT the :cloud suffix.
   */
  private static readonly CLOUD_CONTEXT_OVERRIDES = new Map<string, number>([
    ['minimax-m2.5', 131072], // 1M native, give 128K
    ['qwen3.5', 65536], // 397B frontier — 64K
    ['deepseek-v3.2', 65536], // 671B — 64K
    ['qwen3-coder', 65536], // 480B coder — 64K
    ['deepseek-v3.1', 65536], // 671B — 64K
    ['kimi-k2.5', 131072], // Kimi has 128K+ native context
    ['qwen3-coder-next', 65536], // 235B coder — 64K
  ]);

  /**
   * Model families where the native Ollama `tools` API parameter either
   * causes severe performance degradation or doesn't work reliably.
   *
   * For these models, tools are described only in the system prompt and
   * tool calls are extracted from the model's text output via
   * extractToolCallsFromContent().
   *
   * - qwen3: 10x+ slower when `tools` is in the API request
   * - kimi, minimax, gemini, glm, devstral, nemotron: Cloud-proxied models where
   *   the Ollama proxy doesn't reliably translate native tool_calls back.
   *   These models output tool call JSON in text when instructed via
   *   system prompt, which the text-based extractor handles well.
   */
  private static readonly TEXT_BASED_TOOL_FAMILIES = new Set([
    'qwen3',
    'qwen3.5',
    'qwen3next',
    'qwen3moe',
    'kimi',
    'minimax',
    'gemini',
    'glm',
    'devstral',
    'nemotron',
    'deepseek3.2',
    'gpt-oss',
  ]);

  /**
   * Acquire an inference slot for the given model. Blocks until enough
   * weight budget is available. Called once before an agent's agentic loop
   * so the model stays loaded (preserves KV cache across turns).
   *
   * @param timeoutMs - Max ms to wait in queue before giving up. Defaults to
   *   OLLAMA_SLOT_WAIT_TIMEOUT_MS env var, or 5 minutes if not set.
   *   Pass 0 to wait indefinitely (not recommended).
   */
  async acquireSlot(
    model: string,
    signal?: AbortSignal,
    onStatus?: (msg: string) => void,
    timeoutMs?: number,
  ): Promise<boolean> {
    const weight = this.getModelWeight(model);
    if (this.activeWeight > 0 && this.activeWeight + weight > this.maxWeight) {
      const effectiveTimeout =
        timeoutMs !== undefined
          ? timeoutMs
          : parseInt(process.env.OLLAMA_SLOT_WAIT_TIMEOUT_MS ?? String(5 * 60 * 1000), 10);
      const mode = this.gpuDetected === null ? 'detecting' : this.gpuDetected ? 'GPU' : 'CPU';
      onStatus?.(
        `Queued — waiting for model slot (need ${weight}, ${this.activeWeight}/${this.maxWeight} in use, ${mode})`,
      );
      // Track whether releaseWaiters() granted us the slot before abort/timeout fired
      let granted = false;
      let timedOut = false;
      await new Promise<void>((resolve) => {
        const waiter = { weight, resolve };
        this.waitQueue.push(waiter);

        // Helper to remove from queue if still waiting
        const removeFromQueue = (): boolean => {
          const idx = this.waitQueue.indexOf(waiter);
          if (idx >= 0) {
            this.waitQueue.splice(idx, 1);
            return true; // was still in queue
          }
          // releaseWaiters() already popped us and incremented activeWeight
          granted = true;
          return false;
        };

        // If caller aborts while queued, remove from wait queue
        signal?.addEventListener(
          'abort',
          () => {
            removeFromQueue();
            resolve(); // unblock the await
          },
          { once: true },
        );

        // Queue timeout: stop waiting if slot not granted within timeoutMs
        if (effectiveTimeout > 0) {
          setTimeout(() => {
            const stillInQueue = removeFromQueue();
            if (stillInQueue) {
              timedOut = true;
              log.warn(
                `acquireSlot timed out after ${effectiveTimeout}ms waiting for ${model} (weight=${weight}, active=${this.activeWeight}/${this.maxWeight}, queue=${this.waitQueue.length})`,
              );
              resolve();
            }
          }, effectiveTimeout);
        }
      });
      if (timedOut) return false;
      if (signal?.aborted) {
        if (granted) {
          // Slot was acquired by releaseWaiters before abort — caller owns it
          log.info(
            `Slot acquired (via race) for ${model} before abort (weight=${weight}, active=${this.activeWeight}/${this.maxWeight})`,
          );
          return true;
        }
        return false; // Aborted before slot was acquired
      }
    } else {
      this.activeWeight += weight;
    }
    onStatus?.(''); // Clear queued status
    log.info(`Slot acquired for ${model} (weight=${weight}, active=${this.activeWeight}/${this.maxWeight})`);
    return true;
  }

  /** Release a previously acquired slot and unblock queued waiters. */
  releaseSlot(model: string): void {
    const weight = this.getModelWeight(model);
    this.activeWeight -= weight;
    if (this.activeWeight < 0) {
      log.warn(`activeWeight went negative (${this.activeWeight}) after releasing ${model} — clamping to 0`);
      this.activeWeight = 0;
    }
    log.info(`Slot released for ${model} (weight=${weight}, active=${this.activeWeight}/${this.maxWeight})`);
    // Probe GPU after first release to potentially upgrade concurrency
    if (this.gpuDetected === null) {
      /* c8 ignore next 3 -- defensive catch on GPU probe */
      this.probeGpuMode().catch((err) => {
        log.warn('GPU probe failed', { error: err instanceof Error ? err.message : String(err) });
      });
    }
    this.releaseWaiters();
  }

  /** Max retries for transient errors. */
  private static readonly MAX_RETRIES = 3;
  /** Base delay in ms for exponential backoff (1s, 2s, 4s). */
  private static readonly RETRY_BASE_DELAY_MS = 1_000;

  protected async doComplete(params: LlmCompletionParams): Promise<LlmCompletionResult> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= OllamaProvider.MAX_RETRIES; attempt++) {
      try {
        return await this.doCompleteInner(params);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry if aborted
        if (params.signal?.aborted) throw lastError;

        // Only retry transient errors
        if (!this.isRetryableError(lastError) || attempt >= OllamaProvider.MAX_RETRIES) {
          throw lastError;
        }

        // Exponential backoff: 1s, 2s, 4s + jitter (0-500ms)
        const delay = OllamaProvider.RETRY_BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 500);
        log.warn(
          `Retryable error on attempt ${attempt + 1}/${OllamaProvider.MAX_RETRIES + 1}: ${lastError.message} — retrying in ${delay}ms`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));

        // Check abort again after sleeping
        if (params.signal?.aborted) throw lastError;
      }
    }
    // Should not reach here, but just in case
    throw lastError ?? new Error('Ollama completion failed');
  }

  /** Classify whether an error is transient and worth retrying. */
  private isRetryableError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    // Connection errors
    if (
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('epipe') ||
      msg.includes('socket hang up') ||
      msg.includes('fetch failed') ||
      msg.includes('network')
    )
      return true;
    // HTTP 503 Service Unavailable
    if (msg.includes('503')) return true;
    // HTTP 429 Too Many Requests
    if (msg.includes('429')) return true;
    // Ollama OOM
    if (msg.includes('out of memory') || msg.includes('oom')) return true;
    // Stream idle timeout (model may recover)
    if (msg.includes('stream idle')) return true;
    // NVIDIA cloud proxy timeout — their backend killed the request, retry may succeed
    if (msg.includes('cloud proxy timeout')) return true;
    return false;
  }

  /** Release queued waiters that fit within the remaining weight budget. */
  private releaseWaiters(): void {
    let i = 0;
    while (i < this.waitQueue.length) {
      // Always allow at least one model through when nothing is running
      const canFit = this.activeWeight === 0 || this.activeWeight + this.waitQueue[i].weight <= this.maxWeight;
      if (canFit) {
        const waiter = this.waitQueue.splice(i, 1)[0];
        this.activeWeight += waiter.weight;
        waiter.resolve();
      } else {
        i++;
      }
    }
  }

  /**
   * Probe Ollama to detect GPU inference by checking if any running model
   * has VRAM allocated. If GPU is detected, upgrade from serial to concurrent.
   * Sets maxWeight based on available VRAM:
   *   - <10GB VRAM: maxWeight=3  (fit 1 large or 3 small)
   *   - 10-40GB:    maxWeight=5  (mid-range GPU)
   *   - >40GB:      maxWeight=8  (M1 Ultra 64GB / high-end)
   */
  private async probeGpuMode(): Promise<void> {
    if (this.gpuDetected !== null) return;

    // If OLLAMA_NUM_GPU=0 is explicitly set, force CPU mode
    if (process.env.OLLAMA_NUM_GPU === '0') {
      this.gpuDetected = false;
      log.info('OLLAMA_NUM_GPU=0 — forcing serial scheduling (CPU mode)');
      return;
    }

    try {
      const response = await fetch(`${this.host}/api/ps`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) return;
      const data = (await response.json()) as OllamaPsResponse;

      // Log detailed GPU info for debugging
      for (const m of data.models) {
        const sizeGB = (m.size / 1024 ** 3).toFixed(1);
        const vramGB = ((m.size_vram ?? 0) / 1024 ** 3).toFixed(1);
        const gpuPct = m.size > 0 ? Math.round(((m.size_vram ?? 0) / m.size) * 100) : 0;
        log.info(`Ollama model "${m.name}": size=${sizeGB}GB, vram=${vramGB}GB (${gpuPct}% GPU)`);
      }

      const totalVram = data.models.reduce((sum, m) => sum + (m.size_vram ?? 0), 0);
      const hasGpu = totalVram > 0;
      this.gpuDetected = hasGpu;

      if (hasGpu) {
        // Check GPU offload ratio — warn if model is mostly on CPU
        for (const m of data.models) {
          const ratio = m.size > 0 ? (m.size_vram ?? 0) / m.size : 0;
          if (ratio > 0 && ratio < 0.5) {
            log.warn(
              `Model "${m.name}" is only ${Math.round(ratio * 100)}% on GPU — expect slow inference. Check OLLAMA_NUM_GPU or available VRAM.`,
            );
          }
        }

        // Scale maxWeight based on VRAM capacity
        const totalVramGB = totalVram / 1024 ** 3;
        if (totalVramGB > 40) {
          this.maxWeight = 8; // M1 Ultra 64GB / high-end
        } else if (totalVramGB > 10) {
          this.maxWeight = 5; // Mid-range
        } else {
          this.maxWeight = 3; // Entry-level GPU
        }
        log.info(
          `GPU detected — concurrent scheduling enabled (maxWeight=${this.maxWeight}, vram=${totalVramGB.toFixed(1)}GB)`,
        );
        this.releaseWaiters();
      } else {
        log.info('No GPU detected (size_vram=0) — keeping serial scheduling (maxWeight=1)');
      }
    } catch {
      log.warn('Failed to probe GPU mode via /api/ps — keeping serial scheduling');
    }
  }

  /** Resolve the concurrency weight for a model based on its parameter size. */
  private getModelWeight(modelName: string): number {
    // Cloud models (e.g. "qwen3.5:cloud") are proxied through Ollama's cloud
    // gateway. Allow up to 2 concurrent cloud requests — modern cloud proxies
    // handle parallel inference. Use half of maxWeight (min 2) so two cloud
    // models can run simultaneously.
    if (modelName.includes('-cloud') || modelName.includes(':cloud')) {
      return Math.max(2, Math.ceil(this.maxWeight / 2));
    }
    const tag = this.cachedTags.find((t) => t.name === modelName);
    const paramSize = tag?.details?.parameter_size; // e.g. "14B", "3.4B", "8B"
    if (!paramSize) return 1; // unknown → assume small
    const billions = parseFloat(paramSize); // "14B" → 14, "3.4B" → 3.4
    if (Number.isNaN(billions)) return 1;
    if (billions >= 14) return 3;
    if (billions >= 8) return 2;
    return 1;
  }

  private async doCompleteInner(params: LlmCompletionParams): Promise<LlmCompletionResult> {
    const messages: OllamaChatMessage[] = [];

    // Detect model family for family-specific options
    const modelFamily = this.getModelFamily(params.model);
    const isCloud = OllamaProvider.isCloudModel(params.model);
    // Cloud-proxied models always use text-based tools — the Ollama proxy
    // doesn't reliably translate native tool_calls back for any model.
    // Local models only use text-based if their family is known to be slow/broken.
    const useTextBasedTools = isCloud || OllamaProvider.TEXT_BASED_TOOL_FAMILIES.has(modelFamily);

    // System prompt as first message
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }

    // Conversation messages — preserve tool_calls on assistant messages and
    // tool call IDs on tool result messages so the Ollama API (especially
    // cloud-proxied models) can match tool results to their originating calls.
    for (const m of params.messages) {
      if (m.role === 'tool' && useTextBasedTools) {
        // Remap tool results to user messages for models without native tools API.
        // Use a distinct delimiter that the model is unlikely to generate on its own.
        // The «» brackets are rare in training data and help prevent hallucination.
        messages.push({ role: 'user', content: `«tool_output»\n${m.content}\n«/tool_output»` });
      } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0 && !useTextBasedTools) {
        // Include tool_calls in the assistant message so the API knows
        // which tool calls the subsequent tool-result messages answer.
        messages.push({
          role: 'assistant',
          content: m.content,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });
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

    // Build Ollama options for optimal performance.
    const defaultCtx = parseInt(process.env.OLLAMA_NUM_CTX ?? '8192', 10);
    // Cloud models run on powerful remote hardware — give them generous context
    // and output limits. Per-model overrides allow frontier models with 128K+
    // context to use their full capacity.
    const cloudCtxOverride = OllamaProvider.CLOUD_CONTEXT_OVERRIDES.get(OllamaProvider.cloudBaseModel(params.model));
    const cloudCtxDefault = parseInt(process.env.OLLAMA_CLOUD_NUM_CTX ?? '32768', 10);
    const effectiveCtx = isCloud ? (cloudCtxOverride ?? cloudCtxDefault) : defaultCtx;
    const localMaxOutput = parseInt(process.env.OLLAMA_NUM_PREDICT ?? '2048', 10);
    const cloudMaxOutput = parseInt(process.env.OLLAMA_CLOUD_NUM_PREDICT ?? '4096', 10);
    const maxOutput = isCloud ? cloudMaxOutput : localMaxOutput;
    const options: Record<string, unknown> = {
      num_ctx: effectiveCtx,
      // Cap output tokens to prevent runaway generation (14B models can get stuck)
      num_predict: maxOutput,
    };
    if (!isCloud) {
      // Local-only tuning — meaningless for cloud-proxied inference and
      // may confuse the proxy or cause unexpected behaviour.
      // Force all layers to GPU — critical for Apple Silicon performance.
      options.num_gpu = parseInt(process.env.OLLAMA_NUM_GPU ?? '-1', 10);
      // Larger batch size speeds up prompt evaluation significantly.
      options.num_batch = parseInt(process.env.OLLAMA_NUM_BATCH ?? '512', 10);
    }
    if (params.temperature !== undefined) {
      options.temperature = params.temperature;
    }
    body.options = options;

    // Thinking mode handling:
    // - Cloud models with thinking support: ENABLE thinking (they have compute
    //   headroom and produce better results with extended CoT).
    // - Local thinking models: DISABLE thinking (they spend all tokens on
    //   internal reasoning and return empty `content`).
    if (isCloud) {
      const baseModel = OllamaProvider.cloudBaseModel(params.model);
      if (OllamaProvider.CLOUD_THINKING_MODELS.has(baseModel)) {
        body.think = true;
      }
    } else if (OllamaProvider.THINKING_MODEL_FAMILIES.has(modelFamily)) {
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
    const combinedSignal = params.signal ? AbortSignal.any([params.signal, timeoutSignal]) : timeoutSignal;

    const effectiveHost = this.hostForModel(params.model);
    const requestUrl = `${effectiveHost}/api/chat`;
    const requestBody = JSON.stringify(body);
    log.info(
      `Ollama request: model=${params.model} tools=${useTextBasedTools ? 'text-based' : body.tools ? 'native' : 'none'} msgs=${messages.length} url=${requestUrl} bodyLen=${requestBody.length}`,
    );
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
      signal: combinedSignal,
    });

    if (!response.ok) {
      const text = await response.text();
      log.error(`Ollama API ${response.status} for model=${params.model}: ${text.slice(0, 200)}`);
      throw new ExternalServiceError('Ollama', `API error (${response.status}): ${text}`);
    }

    if (!response.body) {
      throw new ExternalServiceError('Ollama', 'No response body returned');
    }

    // Accumulate streamed response chunks into a single result.
    // Streaming ensures Ollama detects disconnection and stops generation.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let streamBuffer = '';
    let content = '';
    let thinking = '';
    let finalData: OllamaChatResponse | null = null;
    // Accumulate tool_calls from ALL chunks — some models send them
    // in non-final stream chunks and the done:true chunk omits them.
    const streamedToolCalls: OllamaChatMessage['tool_calls'] = [];
    let lastActivitySignal = 0;
    const ACTIVITY_INTERVAL = 10_000; // Signal activity every 10s
    // Cloud-proxied models have a ~90s server-side timeout (NVIDIA).
    // Use a shorter idle timeout (100s) so we detect failure quickly and retry,
    // rather than waiting the full 2 minutes for local models.
    const STREAM_IDLE_TIMEOUT_MS = isCloud ? 100_000 : 2 * 60 * 1000;

    try {
      while (true) {
        // Race read against idle timeout to detect hung streams
        const readPromise = reader.read();
        const timeoutPromise = new Promise<{ done: true; value: undefined }>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`Ollama stream idle for ${STREAM_IDLE_TIMEOUT_MS / 1000}s — aborting (model may be stuck)`),
              ),
            STREAM_IDLE_TIMEOUT_MS,
          ),
        );
        let readResult: ReadableStreamReadResult<Uint8Array>;
        try {
          readResult = (await Promise.race([readPromise, timeoutPromise])) as ReadableStreamReadResult<Uint8Array>;
        } catch (idleErr) {
          log.warn(`Stream idle timeout for ${params.model} after generating ${content.length} chars`);
          throw idleErr;
        }
        const { done, value } = readResult;
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
              params.onStream?.(chunk.message.content);
            }
            if (chunk.message?.thinking) {
              thinking += chunk.message.thinking;
            }
            if (chunk.message?.tool_calls && chunk.message.tool_calls.length > 0) {
              streamedToolCalls!.push(...chunk.message.tool_calls);
            }
            if (chunk.done) {
              finalData = chunk;
            }
          } catch (_parseErr) {
            log.debug('Skipped malformed stream line', { line: line.slice(0, 200), model: params.model });
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
        } catch (_parseErr) {
          log.debug('Skipped malformed stream buffer', { line: streamBuffer.slice(0, 200), model: params.model });
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Parse tool calls from response — check both the final done chunk
    // and any tool_calls accumulated during streaming (some models send
    // tool_calls in non-final chunks and the done chunk omits them).
    let toolCalls: LlmToolCall[] | undefined;
    const nativeToolCalls =
      finalData?.message?.tool_calls && finalData.message.tool_calls.length > 0
        ? finalData.message.tool_calls
        : streamedToolCalls.length > 0
          ? streamedToolCalls
          : null;
    if (nativeToolCalls) {
      toolCalls = nativeToolCalls.map((tc) => ({
        id: tc.id || crypto.randomUUID().slice(0, 8),
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));
    }

    // Detect NVIDIA cloud proxy errors embedded in stream content.
    // When NVIDIA's backend times out, it returns error text like
    // "Function process_single_item_agent timed out after 90.0 seconds"
    // or "API request returned None" as the model's "response".
    if (isCloud && content) {
      const lower = content.toLowerCase();
      if (
        (lower.includes('timed out') && lower.includes('process_single_item')) ||
        lower.includes('api request returned none') ||
        (lower.includes('timed out after') && lower.includes('seconds'))
      ) {
        log.warn(`NVIDIA cloud proxy error detected in response for ${params.model}: ${content.slice(0, 200)}`);
        throw new Error(`Cloud proxy timeout: ${content.slice(0, 150)}`);
      }
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
      const parsed = extractToolCallsFromContent(content, params.tools);
      if (parsed.length > 0) {
        toolCalls = parsed;
        // Strip the tool call text from content so it isn't echoed back
        content = content.replace(/\s*<\|python_tag\|>[\s\S]*$/, '').trim();
        // Strip JSON array tool calls (Mistral format) - with or without code fences
        content = content.replace(/\s*```(?:json)?\s*\[[\s\S]*?\]\s*```\s*/g, '').trim();
        content = stripJsonToolCallArrays(content);
        // Strip XML <tool_call> tags (Hermes/Qwen format)
        content = content.replace(/\s*<tool_call>[\s\S]*?<\/tool_call>\s*/g, '').trim();
        // Strip ReAct Action/Action Input blocks
        content = content
          .replace(
            /\s*(?:Thought\s*:.*\n\s*)?Action\s*:\s*\S+\s*\n\s*Action\s*Input\s*:[\s\S]*?(?=\n\s*(?:Action\s*:|Thought\s*:|$))/g,
            '',
          )
          .trim();
        // Also strip plain function calls from content
        if (params.tools) {
          for (const tool of params.tools) {
            // Strip function(args) format
            const stripPattern = new RegExp(
              `\\s*${tool.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\([\\s\\S]*?\\)\\s*`,
              'g',
            );
            content = content.replace(stripPattern, '').trim();
            // Strip split name+JSON format (name on one line, JSON on next)
            const splitStripPattern = new RegExp(
              `\\s*${tool.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n\\s*\\{[\\s\\S]*?\\}\\s*`,
              'g',
            );
            content = content.replace(splitStripPattern, '').trim();
          }
        }
        log.info(`Extracted ${parsed.length} tool call(s) from content text`, {
          calls: parsed.map((c) => ({ name: c.name, args: c.arguments })),
        });
      }
    }

    // Normalize tool call arguments: map common aliases to expected parameter names.
    // Text-based tool calling models often guess wrong names (e.g., "file_path" instead of "path").
    if (toolCalls && params.tools) {
      for (const tc of toolCalls) {
        const toolDef = params.tools.find((t) => t.name === tc.name);
        if (toolDef) {
          tc.arguments = normalizeToolArgs(tc.arguments, toolDef);
        }
      }
    }

    const evalDurationMs = (finalData?.eval_duration ?? 0) / 1_000_000;
    const promptEvalDurationMs = (finalData?.prompt_eval_duration ?? 0) / 1_000_000;
    const outputTokens = finalData?.eval_count ?? 0;
    const inputTokens = finalData?.prompt_eval_count ?? 0;
    const tokensPerSecond = evalDurationMs > 0 ? outputTokens / (evalDurationMs / 1000) : 0;
    const promptTps = promptEvalDurationMs > 0 ? inputTokens / (promptEvalDurationMs / 1000) : 0;

    log.info(
      `Ollama completed: model=${params.model} in=${inputTokens}tok (${Math.round(promptTps)} tok/s, ${Math.round(promptEvalDurationMs)}ms) out=${outputTokens}tok (${Math.round(tokensPerSecond * 10) / 10} tok/s, ${Math.round(evalDurationMs)}ms)`,
    );

    if (tokensPerSecond > 0 && tokensPerSecond < 5) {
      log.warn(
        `Very slow inference: ${tokensPerSecond.toFixed(1)} tok/s. On Apple Silicon this should be 30-60 tok/s. Check: (1) Ollama running natively (not in Docker), (2) num_gpu=-1, (3) sufficient memory for model + KV cache.`,
      );
    }

    // Sanitize output — strip leaked thinking tags, context summaries,
    // system prompt fragments that less-capable models sometimes echo.
    content = sanitizeModelOutput(content, params.model);

    return {
      content,
      model: finalData?.model ?? params.model,
      usage: {
        inputTokens: finalData?.prompt_eval_count ?? 0,
        outputTokens,
      },
      toolCalls,
      performance: {
        evalDurationMs,
        promptEvalDurationMs,
        tokensPerSecond: Math.round(tokensPerSecond * 10) / 10,
      },
    };
  }

  /** Extract the model family from a model name (e.g., "qwen3:8b" → "qwen3"). */
  private getModelFamily(modelName: string): string {
    const lower = modelName.toLowerCase();
    // Match known families — order matters: more specific before generic
    if (lower.startsWith('qwen3')) return 'qwen3';
    if (lower.startsWith('qwen2')) return 'qwen2';
    if (lower.includes('llama')) return 'llama';
    if (lower.includes('mistral')) return 'mistral';
    if (lower.includes('devstral')) return 'devstral';
    if (lower.includes('phi')) return 'phi';
    if (lower.includes('gemma')) return 'gemma';
    if (lower.includes('command-r')) return 'command-r';
    if (lower.includes('nemotron')) return 'nemotron';
    if (lower.includes('minimax')) return 'minimax';
    if (lower.includes('kimi')) return 'kimi';
    if (lower.includes('glm')) return 'glm';
    if (lower.includes('gemini')) return 'gemini';
    if (lower.includes('deepseek')) return 'deepseek';
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
        throw new ExternalServiceError('Ollama', `Pull request failed: ${response.status}`);
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
    return Array.from(this.activePullStatuses.values()).filter((s) => s.status === 'pulling');
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
