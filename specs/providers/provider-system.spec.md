---
module: provider-system
version: 1
status: active
files:
  - server/providers/base.ts
  - server/providers/registry.ts
  - server/providers/router.ts
  - server/providers/fallback.ts
  - server/providers/cost-table.ts
  - server/providers/types.ts
db_tables: []
depends_on:
  - specs/lib/infra.spec.md
---

# Provider System

## Purpose

Core LLM provider abstraction layer that defines the provider interface, manages provider registration, routes prompts to cost-optimal models based on estimated complexity, handles fallback chains when providers fail, and maintains per-model pricing data for cost-aware routing decisions.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `hasClaudeAccess` | (none) | `boolean` | Returns true if Claude access is available via API key or CLI subscription |
| `_resetClaudeCliCache` | `value?: boolean \| null` | `void` | Reset Claude CLI detection cache (testing only) |
| `isLocalOnly` | (none) | `boolean` | Returns true when no cloud API keys are configured; platform should route through local Ollama models |
| `estimateComplexity` | `prompt: string` | `{ level: ComplexityLevel; signals: ComplexitySignals }` | Analyzes a prompt string and returns its estimated complexity level and signal breakdown |
| `resolveModelForTier` | `tier: ModelTier` | `{ model: string; provider: LlmProviderType }` | Resolve the canonical Claude model ID for a ModelTier — always returns an Anthropic model, never Ollama or OpenAI |
| `getModelPricing` | `model: string` | `ModelPricing \| null` | Look up pricing data for a specific model identifier |
| `estimateCost` | `model: string, inputTokens: number, outputTokens: number` | `number` | Estimate total cost in USD for a request given token counts |
| `getModelsForProvider` | `provider: string` | `ModelPricing[]` | Get all models belonging to a specific provider |
| `getSubagentCapableModels` | (none) | `ModelPricing[]` | Get models that support subagent spawning |
| `getWebSearchCapableModels` | (none) | `ModelPricing[]` | Get models with built-in web search |
| `getOllamaCloudModels` | (none) | `ModelPricing[]` | Get Ollama cloud models (remote, not local) |
| `getModelsByCost` | (none) | `ModelPricing[]` | Get all models sorted by output cost ascending |

### Exported Types

| Type | Description |
|------|-------------|
| `ModelTier` | Enum: `OPUS = 'opus'`, `SONNET = 'sonnet'`, `HAIKU = 'haiku'` — maps semantic task categories to Claude model families per council decision 2026-03-13 |
| `LlmProviderType` | Union: `'anthropic' \| 'openai' \| 'ollama' \| 'openrouter' \| 'cursor'` |
| `ExecutionMode` | Union: `'managed' \| 'direct'` |
| `JsonSchemaProperty` | JSON Schema property descriptor with type, description, enum, items, default |
| `JsonSchemaObject` | JSON Schema object with properties, required, and index signature for tool parameter schemas |
| `LlmToolDefinition` | Tool definition with name, description, and parameters (JsonSchemaObject) |
| `LlmToolCall` | Tool call result with id, name, and arguments record |
| `LlmCompletionParams` | Completion request: model, systemPrompt, messages, maxTokens, temperature, tools, signal, onActivity, onStatus, onStream |
| `LlmCompletionResult` | Completion response: content, model, usage, toolCalls, performance metrics |
| `LlmProviderInfo` | Provider metadata: type, name, executionMode, models, defaultModel, supportsTools, supportsStreaming |
| `LlmProvider` | Provider interface: type, executionMode, getInfo(), complete(), isAvailable(), acquireSlot?(), releaseSlot?() |
| `ComplexityLevel` | Union: `'simple' \| 'moderate' \| 'complex' \| 'expert'` |
| `ModelPricing` | Per-model pricing record: model, provider, displayName, input/output prices, context/output limits, capabilityTier, feature flags |
| `FallbackChain` | Ordered list of `{ provider: LlmProviderType; model: string }` pairs to try |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `MODEL_PRICING` | `ModelPricing[]` | Full pricing table for all supported models across Anthropic, OpenAI, and Ollama (local + cloud) |
| `DEFAULT_FALLBACK_CHAINS` | `Record<string, FallbackChain>` | Pre-defined fallback chains: `'high-capability'`, `'balanced'`, `'cost-optimized'`, `'local'`, `'cloud'`, `'cursor'` |
| `OLLAMA_DEFAULT_LOCAL_MODEL` | `string` | Default Ollama model for local inference, from `OLLAMA_DEFAULT_MODEL` env var or `'qwen3:14b'` |
| `CLAUDE_TIER_MODELS` | `Record<ModelTier, string>` | Maps each ModelTier to its canonical Claude model ID (e.g. OPUS → `'claude-opus-4-6'`) |

### Exported Classes

| Class | Description |
|-------|-------------|
| `BaseLlmProvider` | Abstract base class implementing `LlmProvider`; validates params before delegating to `doComplete()` |
| `LlmProviderRegistry` | Singleton registry for provider instances; filters by `ENABLED_PROVIDERS` env or auto-restricts to Ollama in local-only mode |
| `ModelRouter` | Selects the cheapest qualified model for a prompt based on complexity estimation, capability requirements, and provider health |
| `FallbackManager` | Executes completions with fallback support; tracks provider health with cooldowns and exponential backoff |

#### BaseLlmProvider Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `complete` | `params: LlmCompletionParams` | `Promise<LlmCompletionResult>` | Validates model and messages are present, then delegates to `doComplete()` |
| `isAvailable` | (none) | `Promise<boolean>` | Returns true by default; subclasses may override |
| `doComplete` (abstract) | `params: LlmCompletionParams` | `Promise<LlmCompletionResult>` | Subclass-implemented completion logic |

#### LlmProviderRegistry Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getInstance` (static) | (none) | `LlmProviderRegistry` | Returns the singleton instance |
| `register` | `provider: LlmProvider` | `void` | Registers a provider if it passes the enabled-set filter (env var or local-only auto-detection) |
| `get` | `type: LlmProviderType` | `LlmProvider \| undefined` | Look up a provider by type |
| `getAll` | (none) | `LlmProvider[]` | Return all registered providers |
| `getDefault` | (none) | `LlmProvider \| undefined` | Return the first registered provider (Anthropic is typically registered first) |

#### ModelRouter Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `registry: LlmProviderRegistry` | `ModelRouter` | Creates router with a registry and internal FallbackManager |
| `selectModel` | `prompt: string, options?: { requiresTools?, requiresThinking?, requiresSubagents?, requiresWebSearch?, maxCostPerMillion?, preferredProvider? }` | `{ model, provider, complexity, estimatedCost }` | Selects cheapest model meeting complexity tier, capability, and cost constraints |
| `getFallbackChain` | `complexity: ComplexityLevel, options?: { preferCloud?: boolean }` | `FallbackChain` | Maps complexity to a default fallback chain; uses local/cloud chains in local-only mode |
| `getFallbackManager` | (none) | `FallbackManager` | Returns the internal FallbackManager for direct fallback chain execution |
| `getStats` | (none) | `{ availableModels, availableProviders, healthStatus }` | Returns routing stats for monitoring |

#### FallbackManager Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `registry: LlmProviderRegistry` | `FallbackManager` | Creates manager backed by a provider registry |
| `completeWithFallback` | `params: LlmCompletionParams, chain: FallbackChain` | `Promise<LlmCompletionResult & { usedProvider, usedModel }>` | Tries each model in chain until one succeeds; marks providers healthy/unhealthy |
| `isProviderAvailable` | `provider: LlmProviderType` | `boolean` | Returns true if provider is healthy or cooldown has expired |
| `getHealthStatus` | (none) | `ProviderHealth[]` | Returns health records for all tracked providers |
| `resetHealth` | (none) | `void` | Clears all health tracking data |

## Invariants

1. `BaseLlmProvider.complete()` must throw `ValidationError` if `params.model` is falsy or `params.messages` is empty.
2. `LlmProviderRegistry` is a singleton -- `getInstance()` always returns the same instance.
3. When `ENABLED_PROVIDERS` env var is set, only providers in that comma-separated list are registered.
4. When no cloud API keys are detected and `ENABLED_PROVIDERS` is not set, only Ollama providers are registered (local-only mode).
5. `ModelRouter.selectModel()` always returns a result -- if no qualified model is found, it falls back to the cheapest available model regardless of tier.
6. `ModelRouter.selectModel()` throws `ValidationError` only when zero providers are registered at all.
7. `FallbackManager` marks a provider unhealthy after 3 consecutive transient failures with exponential backoff cooldowns (1min base, doubling).
8. `FallbackManager.completeWithFallback()` throws `ExternalServiceError` only when all models in the chain fail.
9. Cooldown-expired providers are automatically marked healthy again on the next availability check.
10. `MODEL_PRICING` is the single source of truth for model capabilities and cost; the router and cost functions derive all decisions from it.
11. **Provider isolation**: Default fallback chains contain only models from a single provider. No cross-provider fallback — if the designated provider fails, the error surfaces rather than silently switching to a different provider. OpenRouter and OpenAI remain registered providers for explicit use but are not in default fallback chains.
12. `hasClaudeAccess()` caches CLI detection on first call and reuses the cached value thereafter.

## Behavioral Examples

### Scenario: Simple prompt routes to cheapest model
- **Given** cloud API keys are configured and multiple providers are registered
- **When** `selectModel("list all files")` is called
- **Then** complexity is estimated as `'simple'`, and the cheapest model meeting tier 4 requirements is returned (e.g., a local Ollama model at $0)

### Scenario: Complex prompt routes to higher-tier model
- **Given** cloud API keys are configured
- **When** `selectModel("refactor the authentication system and migrate to OAuth2, then implement multi-step verification")` is called
- **Then** complexity is estimated as `'expert'`, and a tier-1 model is selected

### Scenario: Local-only mode restricts to Ollama
- **Given** no `ANTHROPIC_API_KEY`, no `OPENAI_API_KEY`, and no `claude` CLI
- **When** a provider is registered
- **Then** only Ollama-type providers are accepted; cloud providers are skipped

### Scenario: Fallback chain handles model failure within same provider
- **Given** a fallback chain with `[anthropic/claude-opus-4-6, anthropic/claude-sonnet-4-6]`
- **When** claude-opus-4-6 throws a rate limit error
- **Then** the failure is recorded, and the request is retried with claude-sonnet-4-6 (same provider)

### Scenario: Cursor fallback chain degrades from auto to composer-2-fast
- **Given** the `'cursor'` fallback chain is used and `cursor/auto` times out
- **When** `completeWithFallback()` tries the next entry
- **Then** `cursor/composer-2-fast` completes the request and `usedModel` is `'composer-2-fast'`

### Scenario: All providers in chain fail
- **Given** a fallback chain where every provider throws an error
- **When** `completeWithFallback()` exhausts all options
- **Then** an `ExternalServiceError` is thrown with all error messages concatenated

### Scenario: Provider cooldown expires
- **Given** a provider was marked unhealthy 2 minutes ago with a 1-minute cooldown
- **When** `isProviderAvailable()` is called
- **Then** the provider is marked healthy again and returns `true`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `complete()` called with no model | Throws `ValidationError` with provider type context |
| `complete()` called with empty messages | Throws `ValidationError` with provider type context |
| No providers registered and `selectModel()` called | Throws `ValidationError('No models available for routing')` |
| All fallback chain entries fail | Throws `ExternalServiceError('LLM', ...)` with concatenated error details |
| Unknown model passed to `getModelPricing()` | Returns `null` |
| Unknown model passed to `estimateCost()` | Returns `0` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/errors` | `ValidationError`, `ExternalServiceError` |
| `server/lib/logger` | `createLogger()` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `LlmProviderRegistry` (creates singleton, registers providers) |
| `server/process/manager.ts` | `LlmProviderRegistry`, `LlmProviderType`, `hasClaudeAccess` |
| `server/process/direct-process.ts` | `LlmProvider`, `LlmToolCall` types |
| `server/mcp/direct-tools.ts` | `LlmToolDefinition` type |
| `server/routes/ollama.ts` | `LlmProviderRegistry` |
| `server/health/service.ts` | `hasClaudeAccess` |
| `server/councils/discussion.ts` | `getModelPricing` |
| `server/providers/anthropic/provider.ts` | `BaseLlmProvider`, types from `types.ts` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-28 | jackdaw | Add `'cursor'` to `DEFAULT_FALLBACK_CHAINS`; add cursor health-tracking test (closes #1530) |
| 2026-03-27 | rook | Document `OLLAMA_DEFAULT_LOCAL_MODEL` constant (closes #1573) |
| 2026-03-04 | corvid-agent | Initial spec |
