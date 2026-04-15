---
spec: github.spec.md
sources:
  - server/github/off-limits.ts
  - server/github/operations.ts
---

## Layout

Two-file module under `server/github/`:
- `off-limits.ts` — blocklist loader, `isRepoOffLimits`, `assertRepoAllowed`
- `operations.ts` — all `gh` CLI operations wrapping `Bun.spawn`

## Components

### off-limits.ts
Loads `.claude/off-limits-repos.txt` once on first use and caches in a module-level Set for the process lifetime. Case-insensitive matching (all values lowercased). Lines beginning with `#` or empty lines are ignored. Missing file → empty set.

Key functions:
- `isRepoOffLimits(repo)` — returns `boolean`
- `assertRepoAllowed(repo)` — throws `Error` with "off-limits" in message if blocked
- `_resetCache()` — clears cache for test isolation

### operations.ts
All GitHub operations go through `Bun.spawn` calling the `gh` CLI. Each function:
1. Checks `GH_TOKEN` via `isGitHubConfigured()`; returns `{ ok: false }` if absent
2. Spawns `gh` with environment built by `buildSafeGhEnv()` to prevent secret leakage
3. Waits for process exit; parses stdout (JSON where applicable)
4. Returns a typed `{ ok: boolean, ... }` result object; never throws

**Notable operations:**
- `createPr` — uses `cwd` param for git context; calls `gh pr create` with `--fill` and explicit branch args
- `findSimilarIssues` — implements Jaccard similarity with configurable threshold (default 0.5); filters stop words
- `createIssueWithDedup` — calls `findSimilarIssues` first; returns existing issue URL with `deduplicated: true` if match found
- `searchOpenPrsForIssue` — searches PR titles/bodies for `#NNN` references; used for work-task deduplication
- `getPrState` — GraphQL query for detailed PR state including `statusCheckRollup` and `reviewDecision`

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| Required GitHub scopes | `repo`, `read:org` | Checked in startup token validation |
| Default PR list limit | 10 | `maxPrs` default in `listOpenPrs` |
| Jaccard similarity threshold | 0.5 | Default for `findSimilarIssues` |
| Blocklist file path | `.claude/off-limits-repos.txt` | Relative to server process CWD |

## Assets

**External services:**
- `gh` CLI — must be installed and authenticated; all operations delegate to it
- GitHub REST and GraphQL APIs — called through `gh api` subcommands

**Env vars:**
- `GH_TOKEN` — required for all operations; absence causes all operations to return `{ ok: false }`
