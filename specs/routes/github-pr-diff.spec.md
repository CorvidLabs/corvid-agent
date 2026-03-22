---
module: github-pr-diff-routes
version: 1
status: draft
files:
  - server/routes/github-pr-diff.ts
db_tables: []
depends_on:
  - specs/github/github.spec.md
---

# GitHub PR Diff Routes

## Purpose

Dashboard API endpoint that proxies GitHub PR diff requests. Fetches a unified diff from the GitHub API and returns it to the dashboard client, with SSRF input validation on owner/repo/number parameters.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleGitHubPRDiffRoutes` | `(req: Request, url: URL, context?: RequestContext)` | `Response \| Promise<Response> \| null` | Route handler for `GET /api/github/pr-diff`. Returns `null` for non-matching paths. |

## Invariants

1. Owner and repo parameters must match `^[a-zA-Z0-9._-]+$` to prevent SSRF
2. Number parameter must be numeric only
3. Returns `null` for non-matching paths (pathname or method)
4. RBAC guard enforced when request context is present

## Behavioral Examples

### Scenario: Valid diff request

- **Given** valid owner, repo, and number query params
- **When** GET `/api/github/pr-diff?owner=CorvidLabs&repo=corvid-agent&number=123`
- **Then** returns JSON-wrapped unified diff text from GitHub API

### Scenario: Missing parameters

- **Given** one or more query params are missing
- **When** GET `/api/github/pr-diff?owner=CorvidLabs`
- **Then** returns 400 with error message

### Scenario: SSRF attempt with path traversal

- **Given** owner contains path traversal characters
- **When** GET `/api/github/pr-diff?owner=../evil&repo=x&number=1`
- **Then** returns 400 with invalid format error

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Missing query params | 400 `{ error: "Missing owner, repo, or number query params" }` |
| Invalid format (SSRF) | 400 `{ error: "Invalid owner, repo, or number format" }` |
| GitHub API error | Forwards GitHub status code with error message |
| Network/fetch error | Handled by `handleRouteError` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/response.ts` | `json`, `handleRouteError` |
| `server/lib/logger.ts` | `createLogger` |
| `server/middleware/guards.ts` | `tenantRoleGuard`, `RequestContext` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/server.ts` | `handleGitHubPRDiffRoutes` (route registration) |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-22 | corvid-agent | Initial spec |
