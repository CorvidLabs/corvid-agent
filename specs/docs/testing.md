---
spec: docs.spec.md
---

## Automated Testing

The `server/openapi/` directory has its own test suite (separate from `server/docs/`):

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/openapi/__tests__/handler.test.ts` | Integration | `/api/docs` and `/api/docs/openapi.json` endpoints |
| `server/openapi/__tests__/generator.test.ts` | Unit | `generateOpenApiSpec` output shape, auth flags, operation IDs |

## Manual Testing

- [ ] `GET /api/docs/openapi.json` — verify valid OpenAPI 3.1 JSON returned
- [ ] `GET /api/docs/openapi.json` twice — verify same cached spec returned both times
- [ ] Inspect `x-mcp-tools` key in spec — verify 28 tool entries present
- [ ] `GET /api/docs` — verify HTML returned with Swagger UI CDN script tag
- [ ] Load Swagger UI in browser — verify all routes rendered with correct auth indicators
- [ ] Check a route with `auth: true` — verify `bearerAuth` security scheme shown in Swagger UI
- [ ] Verify operation IDs are unique across all routes in the spec

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `buildOpenApiSpec('1.0.0')` called then `buildOpenApiSpec('2.0.0')` called | Returns cached spec from first call; version "1.0.0" — not updated |
| Zod schema with unsupported type | `toJSONSchema()` may throw; route-level try/catch or schema is omitted |
| `server/lib/validation` unavailable at require time | `buildRouteRegistry` throws; stack trace surfaced at startup |
| MCP tool count in static list differs from actual registered tools | No runtime enforcement; spec becomes stale — must be kept in sync manually |
| Swagger UI CDN unavailable | HTML page loads but UI fails to render; JSON spec still accessible |
| `$schema` key in converted Zod schema | Stripped before embedding in OpenAPI components |
| Route with no `requestSchema` | Path operation has no `requestBody` in spec |
