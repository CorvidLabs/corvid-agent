---
spec: openapi.spec.md
sources:
  - server/openapi/generator.ts
  - server/openapi/handler.ts
  - server/openapi/index.ts
  - server/openapi/route-registry.ts
  - server/openapi/routes/agents.ts
  - server/openapi/routes/sessions.ts
  - server/openapi/routes/system.ts
---

## Module Structure

`server/openapi/` is organized into a generator, handler, route registry, and per-domain route metadata files:

| File/Dir | Description |
|---------|-------------|
| `generator.ts` | `generateOpenApiSpec()` — assembles OpenAPI 3.0.3 document from the route registry; converts Zod schemas via `z.toJSONSchema()`; caches result in-process |
| `handler.ts` | `handleOpenApiRoutes()` — routes `GET /api/openapi.json` and `GET /api/docs` to JSON spec and Swagger UI responses |
| `index.ts` | Re-exports public API: `generateOpenApiSpec`, `handleOpenApiRoutes`, `routes` |
| `route-registry.ts` | Aggregates all per-domain route arrays into the single `routes: RouteEntry[]` export |
| `routes/*.ts` | 27 per-domain route metadata files (agents, sessions, system, marketplace, billing, etc.) |

## Key Subsystems

### Route Registry and Metadata
Route metadata is declared in the `routes/` subdirectory as `RouteEntry` arrays — one file per API domain. The `route-registry.ts` barrel aggregates them all. Route handler files in `server/routes/` are NOT modified by the OpenAPI module; the registry is the sole source of truth for API documentation.

`RouteEntry` shape:
```typescript
{
  method: HttpMethod,
  path: string,           // OpenAPI-style: /api/agents/{id}
  summary: string,
  description?: string,
  tags: string[],
  requestBody?: z.ZodType, // Converted to JSON Schema at generation time
  auth: 'required' | 'admin' | 'none',
  responses?: Record<string, string>
}
```

### OpenAPI Generator (generator.ts)
`generateOpenApiSpec()` pipeline:
1. Iterates all `routes` entries
2. Extracts `{param}` path parameters → required string path parameters
3. Converts Zod `requestBody` schemas to JSON Schema via `z.toJSONSchema()` (falls back to `{ type: 'object' }` on error)
4. Injects `BearerAuth` security requirement for `auth: 'required'` and `auth: 'admin'` routes
5. Auto-adds 200 response if no 200/201 is explicitly defined
6. Auto-adds 401 for auth-protected routes; 403 for admin routes
7. Generates deterministic `operationId` from `{method}_{path_with_underscores}`
8. Sorts tags alphabetically with descriptions from a built-in tag description map
9. Caches the assembled document in-process

### HTTP Handler (handler.ts)
Two endpoints only:
- `GET /api/openapi.json` → JSON response with `Cache-Control: public, max-age=60` and `Access-Control-Allow-Origin: *`
- `GET /api/docs` → Swagger UI HTML using CDN-hosted `swagger-ui-dist@5`
- All other paths → returns `null` (pass-through)

## Configuration Values and Constants

| Setting | Value | Description |
|---------|-------|-------------|
| OpenAPI version | `3.0.3` | Always used; not configurable |
| Spec title | `'Corvid Agent API'` | Always used; not configurable |
| Default server URL | `http://localhost:3000` | Used when `GeneratorOptions.serverUrl` is not provided |
| Spec cache | In-process singleton | Cached after first generation; reused for server lifetime |
| Swagger UI CDN | `swagger-ui-dist@5` | CDN-hosted; no local asset bundling required |

## Related Resources

| Resource | Description |
|----------|-------------|
| `server/routes/*.ts` (55 modules) | HTTP handler implementations — NOT modified by the OpenAPI module |
| `server/lib/validation.ts` | Zod request schemas imported by route files (e.g., `CreateAgentSchema`) |
| `server/index.ts` | Calls `handleOpenApiRoutes()` as an early handler before route dispatch |
| `GET /api/openapi.json` | Machine-readable OpenAPI spec; cached, CORS-open, 60s cache |
| `GET /api/docs` | Swagger UI browser interface |
