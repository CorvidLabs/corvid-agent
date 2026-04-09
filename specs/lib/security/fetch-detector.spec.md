---
module: fetch-detector
version: 1
status: draft
files:
  - server/lib/fetch-detector.ts
db_tables: []
depends_on: []
---

# Fetch Detector

## Purpose

Detects external fetch/HTTP calls in code diffs. Used by work task validation to flag new outbound network calls to domains not already approved in the codebase. Prevents agents from introducing external API calls based on untrusted suggestions (e.g. issue comments from non-collaborators).

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `scanDiff` | `(diff: string)` | `FetchScanResult` | Scans a unified diff for external fetch calls in added lines. Checks against `APPROVED_DOMAINS` and deduplicates by domain+pattern. |
| `formatScanReport` | `(result: FetchScanResult)` | `string` | Formats scan results into a human-readable report. Returns empty string if no unapproved fetches found. |
| `extractDomain` | `(url: string)` | `string \| null` | Extracts the hostname from a URL string. Handles template literal expressions by stripping `${}`. Falls back to regex for partial URLs. |
| `isDomainApproved` | `(domain: string)` | `boolean` | Checks if a domain is in the approved list. Handles subdomains: if `slack.com` is approved, `api.slack.com` is also approved. |

### Exported Types

| Type | Description |
|------|-------------|
| `FetchScanResult` | `{ hasUnapprovedFetches: boolean; findings: FetchFinding[] }` — aggregate scan result. |
| `FetchFinding` | `{ url, domain, pattern, line }` — a single detected external fetch call. |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `APPROVED_DOMAINS` | `Set<string>` | Set of pre-approved domains: core services (Anthropic, GitHub, OpenAI, Stripe), chat platforms (Telegram, Slack, Discord), Algorand indexers, local addresses, and CDN (unpkg). |

### Exported Classes

(none)

## Invariants

1. Only added lines in the diff are scanned — removed lines and context lines are ignored.
2. Approved domains (including subdomains) never produce findings.
3. Findings are deduplicated by `(domain, pattern name)` — at most one finding per domain per pattern type.
4. `extractDomain` strips `${}` template expressions before parsing to handle dynamic URLs.
5. Import-pattern matches (node-fetch, undici, axios, etc.) are flagged with domain `npm-package`.
6. Subdomain matching: `api.slack.com` matches approved domain `slack.com`.

## Behavioral Examples

### Scenario: Unapproved external fetch

- **Given** a diff adding `fetch('https://evil.com/data')`
- **When** `scanDiff` is called
- **Then** `hasUnapprovedFetches` is `true` with a finding for domain `evil.com`

### Scenario: Approved domain fetch

- **Given** a diff adding `fetch('https://api.github.com/repos')`
- **When** `scanDiff` is called
- **Then** `hasUnapprovedFetches` is `false` (github.com is approved)

### Scenario: Subdomain of approved domain

- **Given** a diff adding `fetch('https://hooks.slack.com/webhook')`
- **When** `scanDiff` is called
- **Then** no finding is produced because `hooks.slack.com` matches approved `slack.com`

### Scenario: New HTTP client import

- **Given** a diff adding `import got from 'got'`
- **When** `scanDiff` is called
- **Then** a finding is produced with domain `npm-package` and pattern `import`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Empty diff string | Returns `{ hasUnapprovedFetches: false, findings: [] }` |
| Malformed URL in fetch call | `extractDomain` returns `null`, finding is skipped |
| Template literal URL with `${}` | Expressions are replaced with `PLACEHOLDER` before parsing |

## Dependencies

### Consumes

(none — leaf module with no imports)

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/work/validation.ts` | `scanDiff`, `formatScanReport` for work task diff validation |
| `server/polling/auto-merge.ts` | `scanDiff` for PR diff security scanning before auto-merge |
| `server/routes/security-overview.ts` | `APPROVED_DOMAINS` for security dashboard domain display |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | corvid-agent | Initial spec (#591) |
