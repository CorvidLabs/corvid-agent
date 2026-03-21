---
module: openrouter-routes
version: 1
status: draft
files:
  - server/routes/openrouter.ts
db_tables: []
depends_on:
  - specs/providers/openrouter-provider.spec.md
---

# OpenRouter Routes

## Purpose

Dashboard API endpoints for OpenRouter model discovery and provider status. Provides read-only access to OpenRouter's model catalog with search filtering and exposes configured model entries from the internal cost table.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleOpenRouterRoutes` | `(req: Request, url: URL)` | `Response \| Promise<Response> \| null` | Route handler for `/api/openrouter/*`. Returns `null` for non-matching paths. |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/openrouter/status` | Provider availability check with info and configured model count |
| GET | `/api/openrouter/models` | List all models from OpenRouter API with optional `?q=` search filter |
| GET | `/api/openrouter/models/configured` | List models in our cost table for the openrouter provider |

## Key Behaviors

### Provider Lookup
- The `OpenRouterProvider` instance is retrieved from `LlmProviderRegistry` by type `'openrouter'`.
- If not registered, `/status` returns 503 and `/models` returns 503.

### Model Discovery
- `/models` proxies OpenRouter's upstream model catalog via `provider.listModels()`.
- Pricing is converted from per-token to per-million-tokens for display.
- Optional `q` query parameter filters by model ID or name (case-insensitive substring match).

### Configured Models
- `/models/configured` reads from the internal cost table, not the upstream API.

## Invariants

1. Only GET requests to paths starting with `/api/openrouter` are handled; all others return `null`.
2. `/status` returns 503 if the OpenRouter provider is not registered in the registry.
3. `/models` returns 503 if the provider is not registered.
4. `/models` returns `{ models: [], error: '...' }` if upstream fetch fails (not a 5xx).
5. All responses are JSON.

## Behavioral Examples

- `GET /api/openrouter/status` (provider registered) — returns `{ status: 'available', info: {...}, configuredModels: N }`.
- `GET /api/openrouter/status` (provider missing) — returns 503 `{ status: 'unavailable', reason: '...' }`.
- `GET /api/openrouter/models?q=gemini` — returns filtered models matching "gemini" with pricing and context length.
- `GET /api/openrouter/models/configured` — returns `{ models: [...] }` from cost table.
- `POST /api/openrouter/status` — returns `null` (non-matching method, pass-through).

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Provider not registered | 503 with explanation |
| Upstream model fetch fails | 200 with empty models array and error message |
| Non-GET request | Returns `null` (pass-through) |
| Path outside `/api/openrouter` | Returns `null` (pass-through) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `providers/openrouter/provider` | `OpenRouterProvider` class for `listModels()` |
| `providers/registry` | `LlmProviderRegistry.getInstance().get()` to look up provider |
| `providers/cost-table` | `getModelsForProvider()` for configured model list |
| `lib/response` | `json()` helper for JSON responses |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `handleOpenRouterRoutes` registered as a route handler |

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| 1 | 2026-03-21 | Initial spec — 3 read-only endpoints for OpenRouter model discovery. |
