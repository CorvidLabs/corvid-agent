---
spec: github-polling.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/github-searcher.test.ts` | Unit | `fetchMentions` allowlist filtering, `containsMention` regex, `filterNewMentions` dedup, `repoQualifier`, `resolveFullRepo`, self-review/dismissed review exclusion |
| `server/__tests__/auto-merge.test.ts` | Unit | All-SUCCESS merge trigger, partial pass skipped, `gh pr merge` failure handling |
| `server/__tests__/ci-retry.test.ts` | Unit | Cooldown enforcement, pending checks skip, fix session creation, existing session dedup |
| `server/__tests__/mention-polling.test.ts` | Integration | Full mention polling cycle with mocked `gh` CLI |
| `server/__tests__/polling-service.test.ts` | Integration | Service start/stop, event emission, polling config CRUD |
| `server/__tests__/polling-service-core.test.ts` | Unit | Core polling state management |

## Manual Testing

- [ ] Configure a `mention_polling_config` with a real GitHub repo and confirm `@mention` events are detected within the poll interval
- [ ] Verify auto-merge only fires when ALL CI checks return `SUCCESS` (create a PR with one failing check and confirm it is not merged)
- [ ] Simulate auto-update by pushing a commit to origin/main and confirm the server exits with code 75 when no sessions are running
- [ ] Confirm auto-update defers when there is an active session (status `'running'` with non-null pid)
- [ ] Create a CI-failing PR and confirm a fix session is spawned; then confirm no duplicate session is spawned within the 30-minute cooldown

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `gh` CLI command fails during search | Method returns empty array; error logged |
| JSON parse error on `gh` output | Empty array returned; error logged |
| `git fetch origin main` fails | `AutoUpdateService.check()` returns early without pulling |
| HEAD does not advance after `git pull` | No restart (prevents infinite loop) |
| `bun install` fails after pull | `git reset --hard` rollback; no exit-75 restart |
| Repo is just an org name (no `/`) | `resolveFullRepo` extracts `owner/repo` from HTML URL |
| `AutoUpdateService` on non-main branch | Update check skipped entirely |
| CIRetryService: PR has only PENDING checks | PR is skipped (only pure failures trigger fix) |
| CIRetryService: session named `Poll: repo #N:` exists | PR skipped (already being fixed) |
| Per-config `allowedUsers` set to `['alice']` but global allows `bob` | Only `alice` mentions returned |
