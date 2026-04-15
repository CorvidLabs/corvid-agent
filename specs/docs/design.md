---
spec: docs.spec.md
sources:
  - server/docs/index.ts
  - server/docs/mcp-tool-docs.ts
  - server/docs/openapi-generator.ts
  - server/docs/route-registry.ts
---

## Layout

Four-file backend module serving OpenAPI documentation via HTTP. No UI rendering logic — returns JSON spec and a minimal Swagger UI HTML page that loads assets from CDN.

```
server/docs/
  index.ts            — buildOpenApiSpec (cached), getSwaggerUiHtml
  mcp-tool-docs.ts    — Static list of 28 corvid_* MCP tool documentation entries
  openapi-generator.ts — generateOpenApiSpec from RouteDefinition[] + Zod schemas
  route-registry.ts   — buildRouteRegistry: complete list of all REST API routes
```

Served via `server/routes/docs.ts` at:
- `GET /api/docs` → Swagger UI HTML
- `GET /api/docs/openapi.json` → OpenAPI 3.1 JSON spec

## Components

### `index.ts` — Spec Cache and HTML

`buildOpenApiSpec(version)` builds and caches the OpenAPI spec on first call. Subsequent calls return the cached version (version argument is ignored after first call — invariant 1).

`getSwaggerUiHtml(specUrl)` returns a minimal HTML page that loads Swagger UI from CDN and points it at the given spec URL.

### `openapi-generator.ts` — Spec Generator

`generateOpenApiSpec(routes, version)` produces a complete OpenAPI 3.1 object:
- Paths generated from `RouteDefinition[]`
- Schemas converted from Zod types via `toJSONSchema()` (with `$schema` key stripped)
- Tags derived from route definitions
- `bearerAuth` security scheme for `auth: true` routes
- Auto-generated operation IDs from method + path segments
- Standard 400/404/500 error responses on all routes; 401/403 on auth-gated routes
- MCP tools attached under `x-mcp-tools` custom extension

### `route-registry.ts` — Route Definitions

`buildRouteRegistry()` returns the complete list of `RouteDefinition` objects covering all REST API routes. Uses lazy imports of validation schemas to avoid circular dependencies.

### `mcp-tool-docs.ts` — Static MCP Docs

`getMcpToolDocs()` returns a static array of 28 `McpToolDoc` entries describing all `corvid_*` tools. This list must be kept in sync with actual tool registrations in `server/mcp/sdk-tools.ts`.

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| MCP tool count | 28 | Expected number of `corvid_*` tool entries in static docs list |
| Swagger UI | CDN (unpkg/jsdelivr) | Loaded from external CDN in the HTML page |
| Cache behavior | Single build, then cached forever | Re-build requires server restart |

## Assets

| Resource | Description |
|----------|-------------|
| `server/lib/validation` | Zod schemas for request bodies (lazily imported) |
| Swagger UI CDN | External dependency; unavailable offline |
| `x-mcp-tools` spec extension | Custom OpenAPI extension key for MCP tool documentation |
