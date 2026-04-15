---
spec: github.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/github-token-check.test.ts` | Unit | `checkGitHubToken` with injectable fetch: valid scopes, missing scopes, fine-grained token, missing token, network error, non-200 response |
| `server/__tests__/github-tool-handlers.test.ts` | Unit | MCP tool handlers that delegate to `operations.ts`; mocked `gh` CLI spawn |
| `server/__tests__/github-searcher.test.ts` | Unit | `findSimilarIssues` Jaccard similarity calculation; stop word filtering; threshold boundary |
| `server/__tests__/routes-github-allowlist.test.ts` | Route | GitHub allowlist management routes |
| `server/__tests__/routes-github-pr-diff.test.ts` | Route | PR diff retrieval route |
| `server/__tests__/github-allowlist.test.ts` | Unit | Allowlist CRUD operations |

## Manual Testing

- [ ] Set `GH_TOKEN` and call `starRepo('torvalds/linux')`; verify `{ ok: true }` response
- [ ] Unset `GH_TOKEN`; call any operation; verify `{ ok: false, error: 'GH_TOKEN not configured' }`
- [ ] Add a repo to `.claude/off-limits-repos.txt`; call `assertRepoAllowed` for that repo; verify it throws
- [ ] Call `createIssueWithDedup` with a title similar to an existing open issue; verify `deduplicated: true` is returned with the existing issue URL
- [ ] Call `listOpenPrs` on a repo with > 10 open PRs; verify only 10 are returned by default
- [ ] Call `getPrState` on a merged PR; verify `state: 'MERGED'` and `mergedAt` are populated
- [ ] Call `searchOpenPrsForIssue` for an issue number that is referenced in an open PR body; verify the PR is returned
- [ ] Call `_resetCache()` after modifying the blocklist file; verify the new list is loaded

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `GH_TOKEN` not set | All operations return `{ ok: false }` with descriptive error message |
| `gh` CLI not installed or not on PATH | `Bun.spawn` throws; caught and returned as `{ ok: false }` |
| `gh` exits with non-zero code | Returns `{ ok: false }` with stderr content |
| Repo in blocklist checked case-insensitively | `isRepoOffLimits('OWNER/REPO')` matches `owner/repo` in blocklist |
| Blocklist file missing | Empty set used; no repos blocked |
| `gh` returns non-JSON output for JSON-expecting call | Parse error caught; returns `{ ok: false }` |
| `findSimilarIssues` with exact title match | `hasSimilar: true`; matched issue in `matches` array |
| `findSimilarIssues` with completely different title | `hasSimilar: false` |
| `createIssueWithDedup` when no similar issues exist | Creates new issue normally; `deduplicated` is undefined/false |
| `forkRepo` with `org` param | `--org <org>` flag added to `gh repo fork` call |
| `addPrReview` with `APPROVE` event | `gh pr review --approve` called with body |
