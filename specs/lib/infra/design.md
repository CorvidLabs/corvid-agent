---
spec: infra.spec.md
sources:
  - server/lib/logger.ts
  - server/lib/env.ts
  - server/lib/errors.ts
  - server/lib/response.ts
  - server/lib/validation.ts
  - server/lib/first-run-banner.ts
---

## Layout

Foundational utilities under `server/lib/`. These are the most-imported files in the server codebase — virtually every module imports at least one:
- `logger.ts` — `createLogger` factory, `Logger` interface
- `env.ts` — `buildSafeGhEnv` for subprocess environment allowlisting
- `errors.ts` — `AppError` hierarchy with 8 typed subclasses
- `response.ts` — HTTP response helpers and `handleRouteError`
- `validation.ts` — Zod schemas (50+ schemas) and parse helpers
- `first-run-banner.ts` — startup UX for new installations

## Components

### logger.ts
Module-scoped logger instances created via `createLogger('ModuleName')`. Supports two output formats:
- JSON (production, `NODE_ENV=production` or `LOG_FORMAT=json`) — machine-readable structured logs
- Text (development) — human-readable `[level] [module] message` format

Log levels: `debug`, `info`, `warn`, `error`. `warn` and `error` → stderr; `debug` and `info` → stdout. Minimum level controlled by `LOG_LEVEL` env var (default: `info`). Child loggers inherit parent module name with sub-module suffix.

Lazily loads trace context from `../observability/trace-context` to attach `traceId`/`requestId` to log lines without creating circular imports.

### errors.ts
`AppError` base class hierarchy for consistent HTTP status mapping:

| Subclass | Status | Code |
|----------|--------|------|
| `ValidationError` | 400 | `VALIDATION_ERROR` |
| `AuthenticationError` | 401 | `AUTHENTICATION_ERROR` |
| `AuthorizationError` | 403 | `AUTHORIZATION_ERROR` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ConflictError` | 409 | `CONFLICT` |
| `RateLimitError` | 429 | `RATE_LIMITED` |
| `NotImplementedError` | 501 | `NOT_IMPLEMENTED` |
| `ExternalServiceError` | 502 | `EXTERNAL_SERVICE_ERROR` |

### response.ts
Thin wrappers over `new Response(JSON.stringify(...), { headers, status })`. `handleRouteError` is the standard catch block for all route handlers — maps `AppError` subclasses to their HTTP status, falls back to 500. Never exposes internal error details to clients.

### validation.ts
Over 50 statically defined Zod schemas covering all HTTP request bodies in the server. `parseBodyOrThrow` and `parseBody` are the two primary entry points for route handlers. Re-exports `ValidationError` for backward compatibility.

### env.ts
`buildSafeGhEnv()` returns only allowlisted env vars (`PATH`, `HOME`, `GH_TOKEN`, etc.), preventing leakage of secrets like `ANTHROPIC_API_KEY` to `gh` CLI subprocesses.

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| Default log level | `info` | Minimum level when `LOG_LEVEL` is unset |
| JSON log format trigger | `NODE_ENV=production` or `LOG_FORMAT=json` | Switches to machine-readable output |

## Assets

No external dependencies beyond `zod`, `node:os`, and the lazy-loaded trace context module.
