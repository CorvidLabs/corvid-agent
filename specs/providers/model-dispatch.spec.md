---
module: model-dispatch
version: 1
status: active
files:
  - server/providers/router.ts
  - server/providers/types.ts
  - server/providers/cost-table.ts
db_tables: []
depends_on:
  - specs/providers/provider-system.spec.md
  - specs/process/process-manager.spec.md
  - specs/work/work-task-service.spec.md
---

# Model Dispatch

## Purpose

Codifies the tiered model dispatch strategy for task delegation. The primary orchestrating agent selects the appropriate model tier based on task complexity, ensuring cost-effective execution without sacrificing quality. This applies regardless of which LLM provider is active — the tier abstraction is provider-agnostic.

Council decision 2026-03-13 (5-0): Structured Claude-First — Opus/Sonnet/Haiku tiered dispatch; Ollama removed from production path.

## Tier Definitions

| Tier | ModelTier Enum | Canonical Model | Use Cases |
|------|---------------|-----------------|-----------|
| Heavy | `OPUS` | claude-opus-4-6 | Architecture decisions, multi-file refactors, spec authoring, security-sensitive work, council sessions, complex reasoning |
| Standard | `SONNET` | claude-sonnet-4-6 | Work tasks, code generation, single-file changes, routine fixes, test additions, specialist agent sessions |
| Light | `HAIKU` | claude-haiku-4-5-20251001 | Routing decisions, triage, classification, ticket labeling, README updates, trivial edits, formatting |

## Public API

### Exported Types (server/providers/types.ts)

| Type | Description |
|------|-------------|
| `ModelTier` | Enum: `opus`, `sonnet`, `haiku` — semantic task tier |
| `LlmProviderType` | Type: `'anthropic' \| 'openai' \| 'ollama'` — supported LLM providers |
| `ExecutionMode` | Type: `'managed' \| 'direct'` — session execution mode |
| `JsonSchemaProperty` | Interface for JSON schema property definitions used in tool schemas |
| `JsonSchemaObject` | Interface for JSON schema object definitions used in tool schemas |
| `LlmToolDefinition` | Interface for LLM tool definitions (name, description, inputSchema) |
| `LlmToolCall` | Interface for LLM tool call results (id, name, input) |
| `LlmCompletionParams` | Interface for LLM completion request parameters |
| `LlmCompletionResult` | Interface for LLM completion response results |
| `LlmProviderInfo` | Interface for provider metadata (name, models, status) |
| `LlmProvider` | Interface for LLM provider implementations |

### Exported Functions (server/providers/router.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `hasClaudeAccess` | `()` | `boolean` | Check if Claude CLI or Anthropic API key is available |
| `_resetClaudeCliCache` | `(value?: boolean \| null)` | `void` | Reset the Claude CLI cache (test helper) |
| `isLocalOnly` | `()` | `boolean` | Check if running in local-only mode (no cloud API keys) |
| `resolveModelForTier` | `(tier: ModelTier)` | `{ model: string; provider: LlmProviderType }` | Map tier to canonical model ID and provider |
| `estimateComplexity` | `(prompt: string)` | `{ level: ComplexityLevel; signals: ComplexitySignals }` | Analyze prompt to estimate complexity |

### Exported Types (server/providers/router.ts)

| Type | Description |
|------|-------------|
| `ComplexityLevel` | Type: `'simple' \| 'moderate' \| 'complex' \| 'expert'` — estimated task complexity |
| `ModelRouter` | Class providing model selection via `selectModel` and `selectModelByTier` |

### Exported Constants (server/providers/router.ts)

| Constant | Type | Description |
|----------|------|-------------|
| `CLAUDE_TIER_MODELS` | `Record<ModelTier, string>` | Maps each tier to its canonical Claude model ID |

### Exported Functions (server/providers/cost-table.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getModelPricing` | `(model: string)` | `ModelPricing \| null` | Get pricing info for a model |
| `estimateCost` | `(model, inputTokens, outputTokens)` | `number` | Estimate cost in USD for token usage |
| `getModelsForProvider` | `(provider: string)` | `ModelPricing[]` | Get all models for a provider |
| `getSubagentCapableModels` | `()` | `ModelPricing[]` | Get models capable of subagent execution |
| `getWebSearchCapableModels` | `()` | `ModelPricing[]` | Get models with web search capability |
| `getOllamaCloudModels` | `()` | `ModelPricing[]` | Get Ollama cloud models |
| `getModelsByCost` | `()` | `ModelPricing[]` | Get all models sorted by cost ascending |

### Exported Types (server/providers/cost-table.ts)

| Type | Description |
|------|-------------|
| `ModelPricing` | Interface for model pricing data (model, provider, costs, capabilities) |

### Exported Constants (server/providers/cost-table.ts)

| Constant | Type | Description |
|----------|------|-------------|
| `MODEL_PRICING` | `ModelPricing[]` | Complete pricing table for all supported models |

### ModelRouter Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `selectModel` | `(prompt, options?)` | `{ model, provider, complexity, estimatedCost }` | Auto-select cheapest qualified model based on complexity analysis |
| `selectModelByTier` | `(tier: ModelTier)` | `{ model, provider }` | Select model directly by tier — throws if Anthropic unavailable |

## Invariants

1. **Tier-to-model mapping is deterministic**: `resolveModelForTier(tier)` always returns the same canonical model for a given tier. No randomization or load balancing at this layer
2. **Provider-agnostic interface**: `CreateWorkTaskInput.modelTier` accepts the same `ModelTier` enum regardless of which provider is configured. The router resolves the tier to a concrete model
3. **No silent degradation**: `selectModelByTier` throws `ValidationError` if the Anthropic provider is unavailable rather than falling back to a lower-quality model. Callers should enqueue via TaskQueueService
4. **Cost ordering**: HAIKU < SONNET < OPUS in `outputPricePerMillion`. The auto-router (`selectModel`) selects the cheapest model meeting the minimum capability tier
5. **MCP tool exposure**: The `model_tier` parameter on `corvid_create_work_task` maps directly to `ModelTier` enum values (`heavy` → OPUS, `standard` → SONNET, `light` → HAIKU). If omitted, the router uses `estimateComplexity` to auto-select
6. **Delegation preference**: The orchestrating agent should prefer delegating to lighter tiers when the task complexity allows it. This is enforced by CLAUDE.md guidelines, not runtime guards

## Tier Selection Guidelines

### Use Heavy (Opus) when:
- Task involves architecture or design decisions
- Multiple files need coordinated changes
- Security-sensitive code modifications
- Creating or updating module specs
- Council deliberation sessions

### Use Standard (Sonnet) when:
- Implementing a feature in 1-3 files
- Writing or updating tests
- Bug fixes with clear scope
- Code reviews and PR reviews
- Work tasks spawned by schedules

### Use Light (Haiku) when:
- Ticket triage and labeling
- README or documentation-only changes
- Renaming variables or fixing typos
- Status checks and health reports
- Routing decisions (which agent handles a message)

## Behavioral Examples

### Scenario: Work task with explicit tier

- **Given** an agent calls `corvid_create_work_task` with `model_tier: "light"`
- **When** the WorkTaskService creates the session
- **Then** `selectModelByTier(ModelTier.HAIKU)` is used to resolve the model
- **And** the session runs with `claude-haiku-4-5-20251001`

### Scenario: Work task with auto tier selection

- **Given** an agent calls `corvid_create_work_task` without `model_tier`
- **When** the WorkTaskService creates the session
- **Then** `estimateComplexity(description)` determines the complexity level
- **And** the appropriate tier is selected based on the complexity

### Scenario: Anthropic unavailable

- **Given** no `ANTHROPIC_API_KEY` and no Claude CLI
- **When** `selectModelByTier(ModelTier.SONNET)` is called
- **Then** a `ValidationError` is thrown
- **And** the caller should enqueue the task for later execution

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Anthropic provider unavailable | `selectModelByTier` throws `ValidationError` — caller should enqueue via TaskQueueService |
| No models available for routing | `selectModel` throws `ValidationError("No models available for routing")` |
| Invalid `model_tier` value on MCP tool | Returns error result with valid values listed |
| Local-only mode (no cloud keys) | `selectModel` restricts candidates to Ollama models; `selectModelByTier` throws |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/providers/registry.ts` | `LlmProviderRegistry` for provider availability checks |
| `server/providers/cost-table.ts` | `MODEL_PRICING` for cost-aware selection |
| `server/providers/fallback.ts` | `FallbackManager` for provider health checks |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `ModelRouter.selectModel` for auto-routing |
| `server/work/service.ts` | `resolveModelForTier` for explicit tier dispatch |
| `server/mcp/tool-handlers/work.ts` | Maps `model_tier` parameter to `ModelTier` enum |
| `server/scheduler/service.ts` | Tier selection for scheduled work tasks |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | corvid-agent | Initial spec — codifies council decision 2026-03-13 tiered dispatch strategy |
