---
spec: openapi.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/openapi/__tests__/generator.test.ts` | Unit | `generateOpenApiSpec()`: path parameter extraction, auth security injection, 401/403 auto-add, default 200 response, `operationId` generation, tag sorting, Zod schema conversion fallback |
| `server/openapi/__tests__/handler.test.ts` | Unit | `handleOpenApiRoutes()`: JSON spec response headers, Swagger UI HTML content, `null` for non-matching paths, `null` for non-GET methods on spec/docs endpoints |

## Manual Testing

- [ ] `GET /api/openapi.json` — verify response is valid JSON with `openapi: '3.0.3'` and `info.title: 'Corvid Agent API'`
- [ ] `GET /api/openapi.json` — verify `Cache-Control: public, max-age=60` and `Access-Control-Allow-Origin: *` headers
- [ ] `GET /api/docs` — verify HTML response contains a functional Swagger UI page that loads from `/api/openapi.json`
- [ ] Inspect a route with `auth: 'required'` in the spec — verify `security: [{ BearerAuth: [] }]` is present and a 401 response is defined
- [ ] Inspect a route with `auth: 'admin'` in the spec — verify both 401 and 403 responses are defined
- [ ] Inspect a route with `auth: 'none'` — verify no security requirement and no auto-added 401
- [ ] Inspect a route with path `/api/agents/{id}/sessions/{sessionId}` — verify two path parameters (`id`, `sessionId`) both typed as required string
- [ ] Check `operationId` for `GET /api/agents` — verify it is `get_api_agents`
- [ ] Check `operationId` for `POST /api/sessions` — verify it is `post_api_sessions`
- [ ] Verify tags in the spec are sorted alphabetically
- [ ] Call `generateOpenApiSpec()` twice in the same process — verify second call returns cached result without regenerating

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Route Zod schema fails `z.toJSONSchema()` conversion | Falls back to `{ type: 'object' }` for the request body; no error thrown |
| `POST /api/openapi.json` (non-GET method) | `handleOpenApiRoutes` returns `null` |
| `POST /api/docs` (non-GET method) | `handleOpenApiRoutes` returns `null` |
| `GET /api/agents` | `handleOpenApiRoutes` returns `null` (not an OpenAPI path) |
| Route with no `responses` defined and no 200/201 | Default `200: { description: 'Success' }` is added |
| Route with explicit `200` response already defined | No duplicate 200 is added |
| Route with `auth: 'admin'` missing explicit 401/403 | Both 401 and 403 are auto-added |
| Route path with no `{param}` placeholders | No path parameters in the operation |
| Route path with three `{param}` placeholders | All three extracted as required string path parameters |
| Tag description map lookup for a tag not in the map | Tag included in spec without description |
| `generateOpenApiSpec({ serverUrl: 'https://api.example.com' })` | Spec contains `servers: [{ url: 'https://api.example.com' }]` |
| `generateOpenApiSpec()` with no options | Defaults to `servers: [{ url: 'http://localhost:3000' }]` |
