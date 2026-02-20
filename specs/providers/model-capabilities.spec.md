---
module: model-capabilities
version: 1
status: active
files:
  - server/providers/ollama/model-capabilities.ts
db_tables: []
depends_on: []
---

# Model Capabilities

## Purpose

Detects and caches Ollama model capabilities by querying the `/api/show` endpoint. Determines tool support, vision support, embedding status, context window size, and model family. Provides a model selection API for finding the best model matching given requirements.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `ModelCapabilities` | Full capability profile: name, supportsTools, supportsVision, isEmbeddingModel, contextLength, parameterSize, quantization, family, cachedAt |

### Exported Classes

| Class | Description |
|-------|-------------|
| `ModelCapabilityDetector` | Detects and caches model capabilities |

#### ModelCapabilityDetector Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getCapabilities` | `(modelName: string)` | `Promise<ModelCapabilities>` | Get or fetch capabilities for a model |
| `getEffectiveContextLength` | `(modelName: string)` | `Promise<number>` | Get 80% of raw context (safety margin) |
| `canUseTools` | `(modelName: string)` | `Promise<boolean>` | Check if model supports tool calling |
| `findBestModel` | `(availableModels, requirements)` | `Promise<string \| null>` | Find first model matching tools/vision/minContext requirements |
| `clearCache` | `()` | `void` | Clear the capability cache |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getModelCapabilityDetector` | `()` | `ModelCapabilityDetector` | Singleton accessor |

## Invariants

1. **Cache TTL 10 minutes**: Capabilities are cached per model name with a 10-minute TTL. Within TTL, cached results are returned without network calls
2. **Tool support detected via template + family + name**: Detection checks in order: (a) template contains tool-related tokens (`tool_call`, `<tool>`, `function_call`, `.ToolCalls`, `tools`), (b) family is in `TOOL_CAPABLE_FAMILIES` set, (c) model name contains a known tool-capable family name
3. **Embedding models always supportsTools=false**: Even if family or template suggests tool support, embedding models (`embed`, `nomic`, `mxbai`, `all-minilm`, `snowflake`, `bge` patterns) are forced to `supportsTools=false`
4. **Fallback inference from name when /api/show fails**: If the API call fails or returns non-200, basic capabilities are inferred from the model name patterns alone, with conservative defaults (4096 context for chat, 512 for embedding)
5. **Effective context = 80% of raw**: `getEffectiveContextLength()` returns `floor(contextLength * 0.8)` to leave room for model overhead
6. **Context length from model_info or parameters**: Checks `model_info` keys containing `context_length` or `context_window`, and `parameters` string for `num_ctx`. Uses the maximum found value

## Behavioral Examples

### Scenario: Tool support detected from template

- **Given** a model whose `/api/show` template contains `tool_call`
- **When** `getCapabilities` is called
- **Then** `supportsTools` is `true` (regardless of family)

### Scenario: Embedding model excluded from tools

- **Given** a model named `nomic-embed-text`
- **When** `getCapabilities` is called
- **Then** `isEmbeddingModel` is `true`
- **And** `supportsTools` is `false`

### Scenario: Fallback for unknown model

- **Given** a model named `custom-model:latest` with no matching patterns
- **When** `/api/show` fails
- **Then** `inferFromName` returns `family='unknown'`, `supportsTools=false`, `contextLength=4096`

### Scenario: Cache hit within TTL

- **Given** capabilities for `qwen3:8b` were fetched 5 minutes ago
- **When** `getCapabilities('qwen3:8b')` is called again
- **Then** cached result is returned without an API call

### Scenario: findBestModel with tool requirement

- **Given** available models: `['nomic-embed-text', 'phi3:mini', 'qwen3:8b']`
- **When** `findBestModel` is called with `{tools: true}`
- **Then** `nomic-embed-text` is skipped (embedding), `phi3:mini` is evaluated, `qwen3:8b` is returned (first tool-capable)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `/api/show` returns non-200 | Falls back to `inferFromName`, result cached |
| `/api/show` times out (5s) | Falls back to `inferFromName`, result cached |
| Network error connecting to Ollama | Falls back to `inferFromName`, result cached |
| Unknown model name (no family match) | Returns `family='unknown'`, `supportsTools=false` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/providers/ollama/provider.ts` | `getModelCapabilityDetector()` for capability detection |

## Configuration

Internal constants (not env-configurable):

| Constant | Value | Description |
|----------|-------|-------------|
| `CACHE_TTL_MS` | `600000` (10 min) | Capability cache TTL |
| `TOOL_CAPABLE_FAMILIES` | `llama, qwen2, qwen3, mistral, command-r, firefunction, hermes, nemotron` | Families known to support tools |
| `TOOL_INCAPABLE_PATTERNS` | `embed, nomic, mxbai, all-minilm, snowflake, bge` | Patterns for embedding/non-tool models |
| `VISION_PATTERNS` | `llava, bakllava, moondream, llama.*vision` | Patterns for vision-capable models |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
