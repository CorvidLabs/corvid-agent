# Security Issue Triage — 2026-03-01

Triage of open security issues against PR #391 (security hardening batch) and subsequent merges.

## Issues Triaged

### #381 — Content-Length limit middleware [CLOSED]

**Status:** Fully implemented in PR #391

- `contentLengthGuard()` in `server/middleware/guards.ts:103-115`
- Wired as first guard in `server/routes/index.ts:199`
- Rejects POST/PUT/PATCH with Content-Length > 1MB (configurable) with 413
- GET/HEAD/OPTIONS/DELETE exempted
- 6 test cases in `server/__tests__/guards.test.ts`

### #378 — Security response headers [CLOSED]

**Status:** Fully implemented in PR #391

`instrumentResponse()` in `server/index.ts:433-455` sets on every response:

| Header | Value |
|--------|-------|
| X-Content-Type-Options | nosniff |
| X-Frame-Options | DENY |
| X-XSS-Protection | 0 |
| Referrer-Policy | strict-origin-when-cross-origin |
| Strict-Transport-Security | max-age=31536000; includeSubDomains (non-localhost only) |

Note: CSP `default-src 'self'` intentionally omitted — would break SPA frontend.

### #379 — Audit logging for sensitive operations [CLOSED]

**Status:** Fully implemented in PR #391 (was already closed)

11 new `AuditAction` types added. `recordAudit()` wired into:

- Session create/kill (`routes/sessions.ts`)
- Agent CRUD (`routes/agents.ts`)
- Tenant register/member ops (`routes/tenants.ts`)
- Webhook register/delete (`routes/webhooks.ts`)
- API key rotation (`routes/settings.ts`)
- Failed auth attempts (`middleware/auth.ts`)

### #389 — MCP SDK transitive dependency vulnerabilities [OPEN — P2]

**Status:** Open, accepted risk with monitoring

`bun audit` confirms 5 vulnerabilities, all transitive from `@modelcontextprotocol/sdk@1.27.1` (latest).
None are exploitable through our code paths:

| Package | Severity | Exploitable? | Reason |
|---------|----------|-------------|--------|
| minimatch (ReDoS) | high | No | 5 levels deep in OTel GCP detector; no user input reaches it |
| minimatch (ReDoS) | high | No | Same path as above |
| qs (DoS) | low | No | Express is only used in MCP stdio transport (local process) |
| ajv (ReDoS) | moderate | Unlikely | Requires attacker-controlled JSON Schema; our schemas are static |
| hono (timing) | low | No | We don't use Hono's auth; we have our own `timingSafeEqual` |

**Action items:**
- Monitor MCP SDK releases for dependency bumps
- Consider Bun `overrides` to pin `minimatch >=9.0.7`
- Re-audit after next MCP SDK update
