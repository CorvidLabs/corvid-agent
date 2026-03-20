---
name: rest-api
description: REST API development — adding endpoints, route patterns, middleware, request/response conventions. Trigger keywords: api, endpoint, route, REST, HTTP, handler, middleware, request, response.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# REST API — Endpoint Development

Patterns for adding and modifying HTTP API endpoints in the corvid-agent server.

## Architecture

- **Runtime:** Bun's built-in HTTP server
- **Routes:** `server/routes/` — 34+ route modules
- **Registration:** `server/routes/index.ts` — all routes registered here
- **Middleware:** `server/middleware/` — auth, CORS, security checks

## Adding a New Endpoint

1. Create or edit a route handler file in `server/routes/`
2. Export a handler function that takes `(req: Request, ...params)` and returns `Response`
3. Register in `server/routes/index.ts`

### Route Handler Pattern

```typescript
import { createLogger } from '../lib/logger';

const log = createLogger('MyRoute');

export function handleMyEndpoint(req: Request): Response {
  // Parse request
  const url = new URL(req.url);
  const params = url.searchParams;

  // Business logic
  const result = doSomething();

  // Return JSON response
  return Response.json({ ok: true, data: result });
}
```

### Error Responses

```typescript
// 400 Bad Request
return Response.json({ error: 'Missing required field' }, { status: 400 });

// 404 Not Found
return Response.json({ error: 'Resource not found' }, { status: 404 });

// 500 Internal Server Error
return Response.json({ error: 'Internal server error' }, { status: 500 });
```

## Conventions

- Use `Response.json()` for all JSON responses
- Use typed error enums with `Sendable` conformance patterns
- Use `createLogger('RouteName')` for logging
- Named exports only (no default exports)
- TypeScript strict mode
- Input validation at the boundary (validate user/external input, trust internal code)

## Database Access

Use `bun:sqlite` for database queries. See the `database` skill for migration patterns.

```typescript
import { db } from '../db/schema';

const rows = db.query('SELECT * FROM agents WHERE id = ?').all(agentId);
```

## Authentication

Middleware in `server/middleware/` handles:
- API key validation
- Session token auth
- CORS headers
- Startup security checks (X-Forwarded-For validation)
