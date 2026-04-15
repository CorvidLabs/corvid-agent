---
spec: provider-system.spec.md
sources:
  - server/providers/base.ts
  - server/providers/registry.ts
  - server/providers/router.ts
  - server/providers/fallback.ts
  - server/providers/cost-table.ts
  - server/providers/types.ts
---

## Module Structure

Six files under `server/providers/`:
- `types.ts` — all interfaces and enums: `LlmProvider`, `LlmProviderType`, `ModelTier`, `ExecutionMode`, `LlmCompletionParams`, `LlmCompletionResult`, `ModelPricing`, `FallbackChain`, `ComplexityLevel`, etc.
- `base.ts` — `BaseLlmProvider` abstract class; validates params before delegating to `doComplete()`
- `registry.ts` — `LlmProviderRegistry` singleton; `ENABLED_PROVIDERS` env filter and local-only auto-detection
- `router.ts` — `ModelRouter` class; `estimateComplexity()`, `selectModel()` with capability/cost constraints, `hasClaudeAccess()`, `isLocalOnly()`
- `fallback.ts` — `FallbackManager` class; health tracking, exponential backoff cooldowns, `completeWithFallback()`
- `cost-table.ts` — `MODEL_PRICING` array, `DEFAULT_FALLBACK_CHAINS`, `CLAUDE_TIER_MODELS`, helper functions (`getModelPricing`, `estimateCost`, `getModelsForProvider`, etc.)

## Key Classes and Functions

**`LlmProviderRegistry`** — Singleton via `getInstance()`. `register()` checks `ENABLED_PROVIDERS` env (comma-separated) or local-only mode before accepting a provider. `getDefault()` returns the first registered provider (Anthropic is registered first in `server/index.ts`).

**`ModelRouter`** — `estimateComplexity()` analyzes prompt length and content signals to produce `simple/moderate/complex/expert`. `selectModel()` filters `MODEL_PRICING` by tier, capabilities (tools, thinking, subagents, web search), cost per million, and preferred provider; falls back to cheapest available if no exact match. `getFallbackChain()` maps complexity to pre-defined chains; uses `local`/`cloud` variants in local-only mode.

**`FallbackManager`** — Tracks provider health in `Map<LlmProviderType, ProviderHealth>`. After 3 consecutive transient failures, marks provider unhealthy with 1min initial cooldown (doubling). Cooldown-expired providers auto-recover on next `isProviderAvailable()` check. `completeWithFallback()` iterates the chain; throws `ExternalServiceError` only if all entries fail.

**`hasClaudeAccess()`** — Caches result on first call. Checks `ANTHROPIC_API_KEY` env and presence of `claude` CLI binary.

## Configuration Values

| Env Var | Default | Description |
|---------|---------|-------------|
| `ENABLED_PROVIDERS` | (all) | Comma-separated provider allowlist |
| `OLLAMA_DEFAULT_MODEL` | `'qwen3:14b'` | Default local Ollama model |
| `ANTHROPIC_API_KEY` | (none) | Enables Anthropic provider |

## Related Resources

**Fallback chains:** `high-capability` (Anthropic Opus/Sonnet), `balanced`, `cost-optimized`, `local` (Ollama), `cloud` (Anthropic), `cursor`.

**Consumed by:** `server/index.ts` (registry setup), `server/process/manager.ts` (routing decisions), `server/health/service.ts` (`hasClaudeAccess`), `server/councils/discussion.ts` (`getModelPricing`).
