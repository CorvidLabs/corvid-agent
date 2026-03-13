---
module: github-searcher
version: 1
status: draft
files:
  - server/polling/github-searcher.ts
db_tables: []
depends_on:
  - specs/polling/mention-polling-service.spec.md
---

# GitHub Searcher

## Purpose

Extracted GitHub search logic from MentionPollingService. Searches GitHub for @mentions, assignments, and PR reviews using the `gh` CLI. Independently testable and reusable across polling, webhooks, and work tasks. Provides both the `GitHubSearcher` class (stateful, with per-cycle caching) and pure helper functions for repo qualification, mention detection, and deduplication.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `repoQualifier` | `(repo: string)` | `string` | Builds GitHub search qualifier. Returns `repo:owner/name` for full repos or `org:name` for org/user-only configs. |
| `resolveFullRepo` | `(configRepo: string, htmlUrl: string)` | `string` | Resolves full `owner/repo` from a GitHub HTML URL when the config repo is just an org name. Returns `configRepo` unchanged if it already contains `/`. |
| `shouldPollEventType` | `(config: MentionPollingConfig, type: string)` | `boolean` | Checks whether a polling config includes a specific event type. Returns `true` if `eventFilter` is empty (poll all). |
| `containsMention` | `(body: string, username: string)` | `boolean` | Checks whether a text body contains an `@mention` of the given username using regex with word boundary detection. |
| `filterNewMentions` | `(mentions: DetectedMention[], processedIds: string[])` | `DetectedMention[]` | Filters out mentions whose IDs are already in the processed set. Returns all mentions if `processedIds` is empty. |
| `escapeRegex` | `(str: string)` | `string` | Escapes special regex characters in a string for safe use in `RegExp` constructors. |

### Exported Types

| Type | Description |
|------|-------------|
| `DetectedMention` | `{ id, type, body, sender, number, title, htmlUrl, createdAt, isPullRequest }` — a detected GitHub mention or assignment. |
| `GhResult` | `{ ok: boolean; stdout: string; stderr: string }` — result of running a `gh` CLI command. |
| `RunGhFn` | `(args: string[]) => Promise<GhResult>` — injected function for executing `gh` commands (testability). |
| `IsAllowedFn` | `(sender: string) => boolean` — callback to check allowlist membership. |

### Exported Classes

| Class | Description |
|-------|-------------|
| `GitHubSearcher` | Stateful searcher with per-cycle global review cache. Takes a `RunGhFn` in the constructor for dependency injection. |

#### GitHubSearcher Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `fetchMentions` | `(config: MentionPollingConfig, isAllowed: IsAllowedFn)` | `Promise<DetectedMention[]>` | Orchestrates all search methods, applies allowlist filtering, and returns sorted mentions (newest first). |
| `searchIssueMentions` | `(repo, username, since)` | `Promise<DetectedMention[]>` | Searches for issue/PR comments mentioning the username. |
| `fetchRecentComments` | `(repo, issueNumber, username, since, isPR, issueData)` | `Promise<DetectedMention[]>` | Fetches recent comments on a specific issue/PR and finds @mentions. |
| `searchNewIssueMentions` | `(repo, username, since)` | `Promise<DetectedMention[]>` | Searches for newly opened issues mentioning the username in their body. |
| `searchAssignedIssues` | `(repo, username, since)` | `Promise<DetectedMention[]>` | Searches for issues/PRs recently assigned to the username. |
| `searchPullRequestMentions` | `(repo, username, since)` | `Promise<DetectedMention[]>` | Searches for open PRs with review requested from the user. |
| `searchGlobalAuthoredPRReviews` | `(username, since)` | `Promise<DetectedMention[]>` | Searches for review comments on ALL open PRs authored by the agent globally (not repo-scoped). |
| `searchAuthoredPRReviews` | `(repo, username, since)` | `Promise<DetectedMention[]>` | Searches for reviews on agent-authored PRs within a specific repo. |
| `fetchPRReviews` | `(repo, prNumber, username, since, prTitle, prHtmlUrl)` | `Promise<DetectedMention[]>` | Fetches review submissions (approve/changes_requested/comment) on a specific PR. |
| `fetchPRReviewComments` | `(repo, prNumber, username, since, prTitle, prHtmlUrl)` | `Promise<DetectedMention[]>` | Fetches inline code review comments on a specific PR. |
| `clearGlobalReviewCache` | `()` | `void` | Clears the per-cycle cache for global authored PR review results. Called at the start of each poll cycle. |

## Invariants

1. `fetchMentions` pads `lastPollAt` by -1 day because GitHub search `updated:` only supports date precision — deduplication relies on `processedIds`, not the date filter.
2. Assignment-type mentions always bypass both global and per-config allowlist filters — the assignment itself is authorization.
3. `searchGlobalAuthoredPRReviews` results are cached per cycle by `(username, sinceDate)` to prevent redundant API calls when multiple configs share the same username.
4. Self-reviews and self-comments are always filtered out (reviewer/commenter matching the agent username).
5. Dismissed reviews (`state === 'DISMISSED'`) are excluded.
6. Empty `COMMENTED` reviews (phantom top-level for inline comments) are excluded.
7. All search methods return empty arrays on error — errors are logged but never thrown to callers.
8. Mentions are sorted by `createdAt` descending (newest first) before filtering.

## Behavioral Examples

### Scenario: Mention in issue comment

- **Given** a GitHub issue comment containing `@corvid-agent please fix this`
- **When** `fetchMentions` is called with the appropriate config
- **Then** a `DetectedMention` of type `issue_comment` is returned with the comment body and sender

### Scenario: Assignment bypasses allowlist

- **Given** an issue assigned to `corvid-agent` by a user NOT in the allowlist
- **When** `fetchMentions` is called
- **Then** the assignment mention is included (type `assignment` bypasses allowlist)

### Scenario: Org-level repo qualifier

- **Given** a config with `repo: 'CorvidLabs'` (no `/`)
- **When** `repoQualifier` is called
- **Then** it returns `org:CorvidLabs`

### Scenario: Full repo qualifier

- **Given** a config with `repo: 'CorvidLabs/corvid-agent'`
- **When** `repoQualifier` is called
- **Then** it returns `repo:CorvidLabs/corvid-agent`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `gh` CLI command fails (`ok: false`) | Returns empty array for that search method |
| Empty stdout from `gh` | Returns empty array |
| JSON parse error | Caught, logged, returns empty array |
| Malformed HTML URL in `resolveFullRepo` | Falls back to returning `configRepo` unchanged |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `shared/types` | `MentionPollingConfig` type |
| `server/lib/logger` | `createLogger` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/polling/service.ts` | `GitHubSearcher`, `DetectedMention`, `GhResult`, `RunGhFn`, `IsAllowedFn`, `filterNewMentions` |
| `server/polling/auto-merge.ts` | `resolveFullRepo` |
| `server/polling/ci-retry.ts` | `resolveFullRepo` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | corvid-agent | Initial spec (#591) |
