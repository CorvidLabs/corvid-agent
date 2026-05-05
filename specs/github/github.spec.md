---
module: github
version: 1
status: draft
files:
  - server/github/off-limits.ts
  - server/github/operations.ts
  - server/github/pr-body.ts
db_tables: []
depends_on:
  - specs/lib/infra/infra.spec.md
---

# GitHub

## Purpose
Provides GitHub operations via the `gh` CLI (stars, forks, PRs, issues, reviews, follows) and enforces a repo blocklist that prevents write operations against off-limits repositories.

## Public API

### Exported Functions

#### off-limits.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `isRepoOffLimits` | `repo: string` | `boolean` | Returns true if the repo is on the off-limits blocklist |
| `assertRepoAllowed` | `repo: string` | `void` | Throws if the repo is off-limits; call before any write operation |
| `_resetCache` | (none) | `void` | Resets the in-memory blocklist cache (for testing) |

#### pr-body.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `formatPrBody` | `opts: PrBodyOptions` | `string` | Formats a standardized PR body with Summary, Changes, and Test Plan sections |

| Type | Description |
|------|-------------|
| `PrBodyOptions` | Interface with fields: summary (string[]), changes? (string[]), testPlan? (string[]) |

#### operations.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `starRepo` | `repo: string` | `Promise<{ ok: boolean; message: string }>` | Stars a GitHub repository via the REST API |
| `unstarRepo` | `repo: string` | `Promise<{ ok: boolean; message: string }>` | Unstars a GitHub repository |
| `forkRepo` | `repo: string, org?: string` | `Promise<{ ok: boolean; message: string; forkUrl?: string }>` | Forks a repository, optionally into an org |
| `listOpenPrs` | `repo: string, maxPrs?: number` | `Promise<{ ok: boolean; prs: PullRequest[]; error?: string }>` | Lists open pull requests for a repo (default limit 10) |
| `getPrDiff` | `repo: string, prNumber: number` | `Promise<{ ok: boolean; diff: string; error?: string }>` | Gets the diff for a specific pull request |
| `addPrComment` | `repo: string, prNumber: number, body: string` | `Promise<{ ok: boolean; error?: string }>` | Adds a comment on a pull request |
| `addPrReview` | `repo: string, prNumber: number, event: 'APPROVE' \| 'REQUEST_CHANGES' \| 'COMMENT', body: string` | `Promise<{ ok: boolean; error?: string }>` | Submits a PR review (approve, request changes, or comment) |
| `createPr` | `repo: string, title: string, body: string, headBranch: string, baseBranch?: string, cwd?: string` | `Promise<{ ok: boolean; prUrl?: string; error?: string }>` | Creates a pull request |
| `getRepoInfo` | `repo: string` | `Promise<{ ok: boolean; info?: Record<string, unknown>; error?: string }>` | Gets repository metadata (name, owner, stars, forks, etc.) |
| `followUser` | `username: string` | `Promise<{ ok: boolean; message: string }>` | Follows a GitHub user |
| `createIssue` | `repo: string, title: string, body: string, labels?: string[]` | `Promise<{ ok: boolean; issueUrl?: string; error?: string }>` | Creates a GitHub issue with optional labels |
| `listIssues` | `repo: string, state?: 'open' \| 'closed' \| 'all', limit?: number` | `Promise<{ ok: boolean; issues: Issue[]; error?: string }>` | Lists issues for a repo |
| `findSimilarIssues` | `repo: string, title: string, threshold?: number` | `Promise<{ hasSimilar: boolean; matches: Issue[] }>` | Finds open issues with similar titles using keyword overlap (Jaccard similarity) |
| `createIssueWithDedup` | `repo: string, title: string, body: string, labels?: string[]` | `Promise<{ ok: boolean; issueUrl?: string; error?: string; deduplicated?: boolean }>` | Creates an issue with automatic deduplication check |
| `listIssueComments` | `repo: string, issueNumber: number, since?: string` | `Promise<{ ok: boolean; comments: IssueComment[]; error?: string }>` | Lists comments on an issue, optionally filtered by date |
| `closeIssue` | `repo: string, issueNumber: number` | `Promise<{ ok: boolean; error?: string }>` | Closes a GitHub issue |
| `addIssueComment` | `repo: string, issueNumber: number, body: string` | `Promise<{ ok: boolean; error?: string }>` | Adds a comment on a GitHub issue |
| `getPrState` | `repo: string, prNumber: number` | `Promise<{ ok: boolean; pr?: PrViewResult; error?: string }>` | Gets the state of a PR (open/closed/merged, checks, review decision) |
| `searchOpenPrsForIssue` | `repo: string, issueNumber: number` | `Promise<{ ok: boolean; prs: PullRequest[]; error?: string }>` | Searches open PRs for references to a given issue number (`#NNN` in title or body). Used to deduplicate before creating new work |
| `isGitHubConfigured` | (none) | `boolean` | Returns true if GH_TOKEN is set in the environment |

### Exported Types

| Type | Description |
|------|-------------|
| `PullRequest` | Interface with fields: number, title, url, author, state, headBranch, baseBranch, body, createdAt, additions, deletions, changedFiles |
| `Issue` | Interface with fields: number, title, state, labels (Array<{ name: string }>), url |
| `IssueComment` | Interface with fields: id, body, author, createdAt |
| `PrViewResult` | Interface with fields: state ('OPEN' \| 'CLOSED' \| 'MERGED'), mergedAt, closedAt, statusCheckRollup, reviewDecision |

## Invariants
1. All `gh` CLI operations require `GH_TOKEN` to be set; if absent, operations return `{ ok: false }` with an error message.
2. The off-limits blocklist is loaded once from `.claude/off-limits-repos.txt` and cached in memory for the process lifetime.
3. Blocklist matching is case-insensitive (lowercased comparison).
4. Lines starting with `#` or empty lines in the blocklist file are ignored.
5. If the blocklist file is missing or unreadable, an empty set is used (no repos blocked).
6. `assertRepoAllowed` throws an `Error` (not a typed error) when a repo is off-limits.
7. `findSimilarIssues` uses Jaccard similarity with configurable threshold (default 0.5) and filters stop words from title comparisons.
8. `createIssueWithDedup` returns the existing issue URL with `deduplicated: true` if a similar issue is found, instead of creating a duplicate.
9. All `gh` CLI calls use `buildSafeGhEnv()` to construct a sanitized environment.

## Behavioral Examples

### Scenario: Starring an off-limits repo
- **Given** the repo `example/blocked` is listed in `.claude/off-limits-repos.txt`
- **When** `assertRepoAllowed('example/blocked')` is called
- **Then** it throws an `Error` with message containing "off-limits"

### Scenario: Creating a PR without GH_TOKEN
- **Given** `GH_TOKEN` is not set in the environment
- **When** `createPr('owner/repo', 'title', 'body', 'feature-branch')` is called
- **Then** it returns `{ ok: false, error: 'GH_TOKEN not configured' }`

### Scenario: Issue deduplication
- **Given** an open issue titled "Fix broken login page" exists
- **When** `createIssueWithDedup('owner/repo', 'Fix login page bug', 'body')` is called
- **Then** it returns the existing issue URL with `deduplicated: true`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `GH_TOKEN` not set | All operations return `{ ok: false }` with stderr "GH_TOKEN not configured" |
| `gh` CLI exits with non-zero code | Returns `{ ok: false }` with stderr from the process |
| Repo is off-limits | `assertRepoAllowed` throws Error; `isRepoOffLimits` returns true |
| Blocklist file missing | Treated as empty (no repos blocked) |
| JSON parse failure on CLI output | Returns `{ ok: false }` with parse error message |
| `Bun.spawn` throws | Caught and returned as `{ ok: false }` with error message |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger` | `createLogger` for structured logging |
| `server/lib/env` | `buildSafeGhEnv` for sanitized environment variables |
| `node:fs` | `readFileSync` for loading the blocklist file |
| `node:path` | `resolve` for constructing the blocklist file path |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/mcp/tool-handlers` | GitHub operations (star, fork, PR, issue, etc.) exposed as MCP tools |
| `server/webhooks/service` | `isGitHubConfigured` and GitHub operations for webhook-triggered actions |
| `server/scheduler/service` | GitHub operations for scheduled tasks (review PRs, star repos, etc.) |
| `server/work/service` | `createPr`, `assertRepoAllowed` for work task PR creation |
| `server/work/session-lifecycle` | `formatPrBody` for standardized PR body formatting in fallback PR creation |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
| 2026-03-08 | corvid-agent | Documented `searchOpenPrsForIssue` |
