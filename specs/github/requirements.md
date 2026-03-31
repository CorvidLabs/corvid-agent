---
spec: github.spec.md
---

## User Stories

- As a team agent, I want to star and fork repositories so that I can track interesting projects and contribute to the open-source ecosystem on behalf of my operator.
- As a team agent, I want to create pull requests and add reviews so that I can submit code changes and provide feedback on other agents' work without manual intervention.
- As an agent operator, I want a repo blocklist that prevents write operations against protected repositories so that agents cannot accidentally modify critical upstream projects.
- As a team agent, I want to create issues with automatic deduplication so that I do not file duplicate bug reports or feature requests.
- As a team agent, I want to search open PRs for references to a specific issue so that I can avoid creating duplicate work when an issue is already being addressed.
- As an agent developer, I want all GitHub operations to return structured `{ ok, error }` results so that I can handle failures gracefully without try/catch boilerplate.
- As a platform administrator, I want GitHub operations to require `GH_TOKEN` and use a sanitized environment so that credentials are handled safely and no secrets leak to subprocesses.

## Acceptance Criteria

- All `gh` CLI operations return `{ ok: false }` with a descriptive error when `GH_TOKEN` is not set in the environment.
- `isRepoOffLimits` returns `true` for any repo listed in `.claude/off-limits-repos.txt`, using case-insensitive comparison.
- `assertRepoAllowed` throws an `Error` with a message containing "off-limits" when the repo is on the blocklist.
- The blocklist file is loaded once and cached in memory; `_resetCache` clears it for test isolation.
- Lines starting with `#` or empty lines in the blocklist file are ignored; a missing file results in an empty blocklist (no repos blocked).
- `findSimilarIssues` uses Jaccard similarity with a configurable threshold (default 0.5), filtering stop words from title comparisons.
- `createIssueWithDedup` returns the existing issue URL with `deduplicated: true` instead of creating a new issue when a similar open issue is found.
- `searchOpenPrsForIssue` finds PRs referencing `#NNN` in title or body and returns them as `PullRequest[]`.
- `addPrReview` supports the three review event types: `APPROVE`, `REQUEST_CHANGES`, and `COMMENT`.
- `createPr` accepts an optional `baseBranch` (defaults to repo default branch) and optional `cwd` for the working directory.
- All `gh` CLI calls use `buildSafeGhEnv()` to construct a sanitized subprocess environment.
- JSON parse failures on CLI output return `{ ok: false }` with the parse error message.
- `isGitHubConfigured` returns `true` if and only if `GH_TOKEN` is set in the environment.

## Constraints

- All GitHub operations are executed via the `gh` CLI and `Bun.spawn`, not the GitHub REST API directly.
- The blocklist is a flat text file, not a database table; changes require a file edit and process restart (or `_resetCache`).
- No OAuth flow or user-level authentication is provided; a single `GH_TOKEN` is used for all operations.
- The module has no database tables; all state is either in-memory (blocklist cache) or delegated to GitHub.

## Out of Scope

- GitHub webhook ingestion (handled by `server/webhooks/`).
- Repository cloning, branch management, or local git operations.
- GitHub Actions or CI/CD pipeline management.
- Multi-account or per-agent GitHub token management.
- Rate limiting or retry logic for GitHub API calls.
