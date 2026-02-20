---
module: ollama-provider
version: 1
status: active
files:
  - server/providers/ollama/provider.ts
  - server/providers/ollama/tool-parser.ts
db_tables: []
depends_on:
  - specs/providers/model-capabilities.spec.md
  - specs/providers/tool-prompt-templates.spec.md
---

# Ollama Provider

## Purpose

Ollama LLM provider with weight-based concurrency limiting, streaming inference, and multi-format tool call extraction. Implements the `LlmProvider` interface for local and cloud Ollama models, handling GPU auto-detection, model management (pull/delete/list), cloud model routing, and text-based tool calling for model families that degrade with native tool APIs.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `ModelPullStatus` | Progress tracking for model downloads: model, status, progress%, bytes, current layer, error |
| `ModelDetail` | Installed model metadata: name, size, family, capabilities, loaded status |

### Exported Functions (tool-parser.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `extractToolCallsFromContent` | `(content, tools?)` | `LlmToolCall[]` | Extract tool calls from text using 4 pattern strategies |
| `parsePythonArgs` | `(argsStr)` | `Record<string, unknown>` | Parse Python-style keyword arguments into JSON |
| `stripJsonToolCallArrays` | `(content)` | `string` | Strip JSON tool call arrays from content using balanced brackets |
| `fuzzyMatchToolName` | `(name, args, tools)` | `string \| undefined` | Fuzzy-match hallucinated tool name to real tool |
| `normalizeToolArgs` | `(args, toolDef)` | `Record<string, unknown>` | Map aliased argument keys to schema parameter names |

### Exported Classes

| Class | Description |
|-------|-------------|
| `OllamaProvider` | Main Ollama provider extending `BaseLlmProvider` |

#### OllamaProvider Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `acquireSlot` | `(model, signal?, onStatus?)` | `Promise<boolean>` | Acquire weight-based inference slot, blocks until available |
| `releaseSlot` | `(model)` | `void` | Release slot and unblock queued waiters |
| `refreshModels` | `()` | `Promise<string[]>` | Fetch installed models from Ollama (cached 30s) |
| `getModelDetails` | `()` | `Promise<ModelDetail[]>` | Get detailed info for all installed models |
| `getRunningModels` | `()` | `Promise<Array<{name, size}>>` | Get currently loaded models via /api/ps |
| `pullModel` | `(model, onProgress?)` | `Promise<void>` | Download a model with streaming progress |
| `deleteModel` | `(model)` | `Promise<{success, error?}>` | Remove a model |
| `getActivePulls` | `()` | `ModelPullStatus[]` | Get all active pull operations |
| `getPullStatus` | `(model)` | `ModelPullStatus \| undefined` | Get pull status for specific model |
| `isAvailable` | `()` | `Promise<boolean>` | Check if Ollama is reachable |

## Invariants

1. **Weight-based concurrency**: `activeWeight` never exceeds `maxWeight` and never goes negative. If negative is detected, clamp to 0 and log a warning
2. **Slot always released**: Every `acquireSlot` that returns `true` must have a corresponding `releaseSlot` call, even on abort or error. The direct-process wraps the agentic loop in a try/finally to guarantee this
3. **Text-based tool calling for qwen3**: Models in `TEXT_BASED_TOOL_FAMILIES` never receive the native `tools` API parameter. Tool calls are extracted from text output only
4. **Cloud model routing**: Models with `-cloud` suffix are routed to the local Ollama instance (`localhost`) even when `OLLAMA_HOST` points to a remote GPU server. Cloud models require local Ollama for auth proxying
5. **Merged model listing**: `refreshModels()` queries both the configured host and localhost (when different). Cloud models from localhost are merged into the model list
6. **GPU auto-detection on first completion**: After the first `releaseSlot`, probes `/api/ps` to check VRAM allocation. If GPU detected, upgrades `maxWeight` based on VRAM tier (<10GB=3, 10-40GB=5, >40GB=8)
7. **Stream idle timeout (2 min)**: If no data arrives from Ollama stream for 120 seconds, the request is aborted with an error
8. **Model cache TTL (30s)**: `refreshModels()` returns cached results within 30 seconds of last fetch
9. **Tool call normalization**: After extraction, tool arguments are normalized via substring key matching to map common aliases (e.g., `file_path` -> `path`) to expected schema parameter names. Existing keys are never overwritten
10. **Thinking mode disabled for qwen3**: Models in `THINKING_MODEL_FAMILIES` get `think: false` to prevent empty content responses
11. **Request timeout (30 min)**: Combined abort signal uses both external signal and 30-minute timeout. Configurable via `OLLAMA_REQUEST_TIMEOUT`
12. **Retry on transient errors**: Retryable errors (connection reset, 503, 429, OOM) are retried up to 3 times with exponential backoff (1s, 2s, 4s) + jitter. Permanent errors (model not found, invalid request) fail immediately
13. **Pull status cleanup**: Terminal pull statuses are removed from the map after 60 seconds

## Behavioral Examples

### Scenario: Text-based tool calling for Qwen3

- **Given** a completion request with model `qwen3:8b` and tools
- **When** `doCompleteInner` builds the request body
- **Then** `body.tools` is NOT set (text-based family)
- **And** tool results in messages are remapped to user role with `<<tool_output>>` delimiters
- **And** tool calls are extracted from the model's text content

### Scenario: Weight-based slot queueing

- **Given** `maxWeight=3` and `activeWeight=2`
- **When** a large model (weight=3) requests a slot
- **Then** it queues until active weight drops to 0
- **And** the onStatus callback reports the queue position

### Scenario: Abort during slot wait

- **Given** an agent waiting in the slot queue
- **When** the abort signal fires
- **Then** the waiter is removed from the queue
- **And** `acquireSlot` returns `false`
- **And** `activeWeight` is unchanged

### Scenario: GPU auto-detection upgrades concurrency

- **Given** `gpuDetected === null` (not yet probed)
- **When** first slot is released and `/api/ps` shows VRAM > 0
- **Then** `gpuDetected` is set to `true`
- **And** `maxWeight` is upgraded based on VRAM tier
- **And** queued waiters are released if they now fit

### Scenario: Cloud model routed to localhost

- **Given** `OLLAMA_HOST=http://gpu-server:11434` and model `qwen3-coder:480b-cloud`
- **When** `hostForModel` resolves the endpoint
- **Then** the request is sent to `http://localhost:11434` (not gpu-server)
- **And** a log message notes the redirect

### Scenario: Merged model listing with cloud models

- **Given** `OLLAMA_HOST=http://gpu-server:11434` with 3 local models
- **And** localhost has 2 cloud models (`-cloud` suffix)
- **When** `refreshModels()` is called
- **Then** the returned list contains all 5 models (3 local + 2 cloud)

### Scenario: Retry on transient error

- **Given** a completion request to Ollama
- **When** Ollama returns 503 (service unavailable)
- **Then** the request is retried after 1s + jitter
- **And** up to 3 retries are attempted before failing

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Ollama unreachable (fetch fails) | `isAvailable()` returns false; completion throws with connection error (retried if transient) |
| Stream idle timeout (2 min no data) | Stream aborted, error thrown with diagnostic message |
| Request timeout (30 min) | Combined signal aborts fetch |
| Malformed stream data | Skipped with debug log, processing continues |
| Pull already in progress | Pull status map tracks concurrent pulls per model |
| Model not found (404) | Permanent error, not retried |
| Context too long error | Not retried at provider level (handled by direct-process trimming) |
| Negative activeWeight | Clamped to 0 with warning log |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/providers/base.ts` | `BaseLlmProvider` base class |
| `server/providers/types.ts` | `LlmProviderType`, `ExecutionMode`, `LlmCompletionParams`, `LlmCompletionResult`, `LlmProviderInfo`, `LlmToolDefinition`, `LlmToolCall` |
| `server/providers/ollama/model-capabilities.ts` | `getModelCapabilityDetector()` |
| `server/providers/ollama/tool-parser.ts` | `extractToolCallsFromContent`, `parsePythonArgs`, `stripJsonToolCallArrays`, `fuzzyMatchToolName`, `normalizeToolArgs` |
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/providers/registry.ts` | Registered as `ollama` provider |
| `server/process/direct-process.ts` | `acquireSlot`, `releaseSlot`, `complete` via `LlmProvider` interface |
| `server/routes/ollama.ts` | `pullModel`, `deleteModel`, `getModelDetails`, `refreshModels`, `getActivePulls` |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_REQUEST_TIMEOUT` | `1800000` (30 min) | Max time for a single completion |
| `OLLAMA_MAX_PARALLEL` | Auto-detected | Override max concurrency weight (skips GPU detection) |
| `OLLAMA_NUM_GPU` | `-1` (all) | GPU layers; `0` forces CPU mode |
| `OLLAMA_NUM_CTX` | `8192` | Default context window size |
| `OLLAMA_NUM_PREDICT` | `2048` | Max output tokens per completion |
| `OLLAMA_NUM_BATCH` | `512` | Prompt evaluation batch size |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
| 2026-02-20 | corvid-agent | Add cloud model routing (hostForModel), merged model listing, invariants 4-5 |
