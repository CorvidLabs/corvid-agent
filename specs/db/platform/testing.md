---
spec: github-allowlist.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/health-collector.test.ts` | Unit | Health snapshot recording and trend queries |
| `server/__tests__/marketplace-service.test.ts` | Integration | Marketplace DB operations via service layer |
| `server/__tests__/flock-directory-service.test.ts` | Integration | Flock agent registration and lookup |
| `server/__tests__/flock-directory-chain-sync.test.ts` | Integration | Flock on-chain sync behavior |

## Manual Testing

- [ ] Add a GitHub username to the allowlist; verify `isGitHubUserAllowed` returns `true`
- [ ] Remove all entries from allowlist with `GITHUB_ALLOWLIST_OPEN_MODE=false`; verify all users denied
- [ ] Remove all entries from allowlist with `GITHUB_ALLOWLIST_OPEN_MODE=true`; verify all users allowed
- [ ] Add a GitHub username in mixed case; verify stored and looked up as lowercase
- [ ] Record health snapshots; query trend data; verify rolling window excludes old entries
- [ ] Register a Flock agent; verify `flock_agents` row created with correct wallet address
- [ ] Run model exam for an agent; verify run + result rows created with correct pass/fail status

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `addToGitHubAllowlist` called twice with same username | Upsert: second call updates label without creating duplicate |
| `isGitHubUserAllowed` with uppercase username | Normalized to lowercase before lookup |
| `removeFromGitHubAllowlist` on non-existent username | Returns `false` |
| Empty allowlist + `GITHUB_ALLOWLIST_OPEN_MODE` not set | Deny all (default closed) |
| `getListingRecord` for deleted listing | Returns `null` |
| `listReviewsForListing` on listing with no reviews | Returns empty array |
| Health snapshot query with no rows in window | Returns empty array or zero counts |
| Flock agent with same wallet registered twice | Upsert behavior; no duplicate rows |
| Model exam run with all questions failed | `pass_rate = 0`; stored correctly |
