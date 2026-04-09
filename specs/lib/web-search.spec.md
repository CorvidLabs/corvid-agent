---
module: web-search
version: 1
status: draft
files:
  - server/lib/web-search.ts
db_tables: []
depends_on:
  - specs/lib/infra/infra.spec.md
---

# Web Search

## Purpose

Provides web search capabilities via the Brave Search API, including single-query and multi-query (concurrent, deduplicated) search functions for use by agent sessions and tools.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `braveWebSearch` | `query: string, options?: WebSearchOptions` | `Promise<WebSearchResult[]>` | Searches the web using the Brave Search API. Returns an empty array with a logged warning if `BRAVE_SEARCH_API_KEY` is not set. Clamps `count` to 1..20 (default 5). Supports optional `freshness` filter. |
| `braveMultiSearch` | `queries: string[], options?: WebSearchOptions` | `Promise<{ query: string; results: WebSearchResult[] }[]>` | Runs multiple searches concurrently via `Promise.allSettled` and deduplicates results by URL across all queries. Failed queries are logged as warnings and excluded from output. |

### Exported Types
| Type | Description |
|------|-------------|
| `WebSearchResult` | Search result object: `title: string`, `url: string`, `description: string`, `age?: string`. |
| `WebSearchOptions` | Options object: `count?: number` (default 5, max 20), `freshness?: 'pd' \| 'pw' \| 'pm' \| 'py'` (past day/week/month/year). |

### Exported Classes
_(none)_

## Invariants

1. If `BRAVE_SEARCH_API_KEY` is not set, `braveWebSearch` returns an empty array and logs a warning. It never throws for a missing API key.
2. The `count` parameter is clamped to the range [1, 20] regardless of what the caller passes.
3. The API key is sent via the `X-Subscription-Token` header, never as a query parameter.
4. Non-2xx responses from the Brave API throw an `ExternalServiceError` with service name `"Brave Search"`.
5. `braveMultiSearch` uses `Promise.allSettled` so that individual query failures do not prevent other queries from returning results.
6. `braveMultiSearch` deduplicates results by URL across all queries: the first query to return a given URL keeps it; subsequent duplicates are filtered out.
7. Result objects only include `title`, `url`, `description`, and optionally `age` -- no raw API response data leaks through.

## Behavioral Examples

### Scenario: Successful single search
- **Given** `BRAVE_SEARCH_API_KEY` is set and the Brave API is reachable
- **When** `braveWebSearch('Algorand SDK', { count: 3 })` is called
- **Then** it returns up to 3 `WebSearchResult` objects with `title`, `url`, `description`, and optional `age`.

### Scenario: Missing API key
- **Given** `BRAVE_SEARCH_API_KEY` is not set in the environment
- **When** `braveWebSearch('anything')` is called
- **Then** it returns `[]` and logs a warning `'BRAVE_SEARCH_API_KEY not set -- web search unavailable'`.

### Scenario: API error response
- **Given** the Brave API returns a 429 Too Many Requests response
- **When** `braveWebSearch('test')` is called
- **Then** it throws an `ExternalServiceError` with message `'Brave Search: API error: 429 Too Many Requests'`.

### Scenario: Multi-search with deduplication
- **Given** two queries that return overlapping URLs
- **When** `braveMultiSearch(['query A', 'query B'])` is called
- **Then** the output contains both query results, but any URL appearing in query A's results is filtered out from query B's results.

### Scenario: Multi-search with partial failure
- **Given** three queries where the second one fails due to a network error
- **When** `braveMultiSearch(['q1', 'q2', 'q3'])` is called
- **Then** results for q1 and q3 are returned; q2 is omitted with a logged warning.

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `BRAVE_SEARCH_API_KEY` not set | Returns empty array `[]`; logs warning. No error thrown. |
| Brave API returns non-2xx status | Throws `ExternalServiceError('Brave Search', 'API error: {status} {statusText}')`. Logs the status and first 200 chars of response body. |
| Network failure during fetch | Error propagates as-is (not caught by `braveWebSearch`). In `braveMultiSearch`, the failed query is logged as a warning and excluded from results. |
| `count` below 1 or above 20 | Clamped to valid range via `Math.min(Math.max(..., 1), 20)`. |
| API returns no web results | Returns empty array `[]` (maps over `data.web?.results ?? []`). |

## Dependencies

### Consumes
| Module | What is used |
|--------|-------------|
| `infra` | `createLogger` from `logger.ts` for structured logging; `ExternalServiceError` from `errors.ts` for API failure reporting. |
| `BRAVE_SEARCH_API_KEY` env var | Required for API authentication. Without it, search is silently disabled. |

### Consumed By
| Module | What is used |
|--------|-------------|
| MCP tool handlers | `braveWebSearch` and `braveMultiSearch` exposed as agent tools for web research. |
| Agent sessions | Web search capability during task execution. |

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
