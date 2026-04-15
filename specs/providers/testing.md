---
spec: provider-system.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/providers.test.ts` | Unit | `BaseLlmProvider` param validation, `LlmProviderRegistry` singleton, `ENABLED_PROVIDERS` filter, local-only auto-detection |
| `server/__tests__/provider-registry.test.ts` | Unit | Registry register/get/getAll/getDefault, filter behavior |
| `server/__tests__/model-router.test.ts` | Unit | `selectModel` complexity routing, capability filtering, cost constraint, fallback to cheapest, zero-provider error |
| `server/__tests__/fallback-manager.test.ts` | Unit | `completeWithFallback` success on first try, retry on failure, unhealthy marking, cooldown expiry, all-fail ExternalServiceError |
| `server/__tests__/cost-table.test.ts` | Unit | `getModelPricing`, `estimateCost`, `getModelsForProvider`, `getSubagentCapableModels`, `getModelsByCost` |
| `server/__tests__/provider-fallback.test.ts` | Integration | Fallback chain execution with mocked providers |
| `server/__tests__/model-capabilities.test.ts` | Unit | Capability flags on MODEL_PRICING entries |
| `server/__tests__/cloud-models.test.ts` | Unit | Ollama cloud model filtering |
| `server/__tests__/providers-cursor.test.ts` | Unit | Cursor provider health tracking |

## Manual Testing

- [ ] Unset `ANTHROPIC_API_KEY` and confirm only Ollama providers are registered (local-only mode)
- [ ] Set `ENABLED_PROVIDERS=anthropic` and confirm other provider types are rejected at registration
- [ ] Call `selectModel("list files")` and confirm a low-tier model is chosen
- [ ] Call `selectModel("refactor the entire auth system with OAuth2 migration")` and confirm a high-tier model is chosen
- [ ] Mark a provider unhealthy and confirm `isProviderAvailable` returns false, then confirm it auto-recovers after cooldown

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `complete()` with no model set | `ValidationError` thrown with provider context |
| `complete()` with empty messages array | `ValidationError` thrown |
| `selectModel()` with zero registered providers | Throws `ValidationError('No models available for routing')` |
| All fallback chain entries fail | `ExternalServiceError` thrown with all error messages concatenated |
| Unknown model passed to `getModelPricing()` | Returns `null` |
| Unknown model passed to `estimateCost()` | Returns `0` |
| `hasClaudeAccess()` called multiple times | Cached result used after first call |
| `ENABLED_PROVIDERS` set to unknown value | That provider type is never registered |
| Provider marked unhealthy, cooldown expires | `isProviderAvailable` returns true; provider marked healthy again |
| `resolveModelForTier(ModelTier.OPUS)` | Always returns an Anthropic Claude model, never Ollama |
