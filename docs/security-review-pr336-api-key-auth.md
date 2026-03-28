# Security Review: PR #336 — API Key Authentication

**Date**: 2026-03-02
**Reviewer**: Security Lead (Council P0 disposition)
**PR**: #336 — "Implements client and API key authentication" by @0xGaspar
**Scope**: +441/-62 across 7 files
**Verdict**: Approve with conditions

## Overview

PR #336 adds a client-side authentication overlay that prompts for an API key
(via URL parameter or form input), and adds a server-side path filter to apply
auth guards on `/api/` and `/a2a/` routes only. It also improves Docker
deployment configuration and documentation.

The PR builds on the existing auth architecture (timing-safe comparison, key
rotation with grace period, audit logging) rather than replacing it.

## Files Changed

| File | Change |
|------|--------|
| `client/src/app/app.ts` | Auth overlay UI (+200/-2) |
| `deploy/.env.example` | New env template (+61) |
| `deploy/Dockerfile` | Claude CLI, home dir for corvid user (+7/-2) |
| `deploy/README.md` | Complete rewrite (+135/-46) |
| `deploy/docker-compose.yml` | Volume rename, env vars (+30/-11) |
| `server/db/connection.ts` | DB_PATH env var support (+1/-1) |
| `server/routes/index.ts` | Route guard path filter (+7) |

## Findings

### [MEDIUM] M-1: Client auth gate is UX-only, not a security boundary

**Location**: `client/src/app/app.ts:278`

The `isAuthenticated` flag is computed once at page load from the presence of
an API key in the environment. This is trivially bypassable via browser DevTools
or direct API calls. The server-side guard chain is the real enforcement layer.

**Risk**: Low (server enforcement intact).
**Action**: Document that the overlay is UX-only.

### [MEDIUM] M-2: API key leaks via URL parameter

**Location**: `client/src/app/app.ts:305`

The form submits via `window.location.href = /?apiKey=...` which creates a
browser history entry with the key, sends it in Referer headers, and may
appear in reverse proxy access logs.

The `environment.ts` cleanup via `history.replaceState()` mitigates but cannot
prevent all leakage vectors (the initial navigation is already logged).

**Risk**: Medium in production behind reverse proxies.
**Recommendation**: Consider POST-based submission or `window.location.replace()`.

### [MEDIUM] M-3: Redundant/misplaced route guard

**Location**: `server/routes/index.ts:167-170`

The PR adds an early return before the guard chain:
```typescript
if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/a2a/')) {
    return null;
}
```

The existing code at line 195 already handles this with more path prefixes
(`/webhooks/`, `/slack/`). The PR's version:
1. Is redundant
2. Is placed before CORS headers are applied

**Risk**: Medium (CORS regression for non-API routes).
**Action**: Remove the duplicate check.

### [LOW] L-1: DB_PATH env var is a silent behavior change — RESOLVED

**Location**: `server/db/connection.ts:29` (no longer present)

The `DB_PATH` env var was removed from `connection.ts` after this review.
The database path is now determined by convention (`corvid-agent.db` in the
working directory) without an env-var override.

**Status**: Resolved — the silent behavior change no longer exists.

### [LOW] L-2: `.env.example` has partial API key prefix

**Location**: `.env.example` (project root; `deploy/.env.example` no longer exists)

`ANTHROPIC_API_KEY=sk-ant-` may confuse users or leak key format if the
file is accidentally committed.

**Action**: Use empty value or placeholder text.

### [INFO] I-1: No brute-force protection on auth endpoint

The auth check happens on GET requests (600/min rate limit). There is no
progressive delay or lockout after repeated failures. Audit logging captures
failures but there is no automated response.

**Recommendation**: Follow-up PR to add per-IP exponential backoff.

### [INFO] I-2: Claude Code CLI in production image

The Dockerfile installs `@anthropic-ai/claude-code` globally without version
pinning, adding supply-chain risk.

**Recommendation**: Pin version; document credential lifecycle.

## Architecture Alignment

The PR correctly preserves:
- Timing-safe key comparison (`auth.ts:439-456`)
- Key rotation with 24h grace period (`auth.ts:307-327`)
- Guard chain pattern (`guards.ts:117-123`)
- Audit logging of failed auth (`auth.ts:230-234`)
- Public path exemptions (`auth.ts:182`)
- Multi-tenant key hashing (`tenant/middleware.ts:71-76`)

Client-side key handling follows good practices:
- In-memory storage only (no localStorage/sessionStorage)
- URL sanitization via `history.replaceState()`
- SSR-safe window checks
- Auth interceptor adds Bearer header to all API calls
- WebSocket uses `?key=` param (browser limitation workaround)

## Disposition

**Approve with conditions**:

| Priority | Item | Type |
|----------|------|------|
| Must fix | Remove redundant route guard (M-3) | Code change |
| Should fix | Clean `.env.example` key prefix (L-2) | Config |
| Should fix | Document client overlay is UX-only (M-1) | Comment |
| Follow-up | Per-IP brute-force backoff (I-1) | New PR |
| Follow-up | POST-based key submission (M-2) | New PR |
| Follow-up | Pin Claude CLI version (I-2) | New PR |
