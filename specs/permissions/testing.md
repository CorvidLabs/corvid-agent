---
spec: broker.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/permission-broker.test.ts` | Unit | Grant creation, HMAC verification, exact/wildcard/superuser matching, expiration, revocation, emergency revoke, audit recording failures, `checkTool` for unmapped tools |
| `server/__tests__/governance-tier.test.ts` | Unit | `resolveCallerTier` tier resolution for all role combinations, `requirePermissionTier` middleware returns 403 below minimum |
| `server/__tests__/role-templates.test.ts` | Unit | `applyRoleTemplate` grants correct actions, `revokeRoleTemplate` revokes them, unknown template returns error |
| `server/__tests__/routes-permissions.test.ts` | Integration | REST endpoints: grant, revoke, list grants, emergency revoke, check tool |
| `server/__tests__/governance.test.ts` | Integration | Governance route access control by tier |

## Manual Testing

- [ ] Grant `git:create_pr` to an agent and confirm `checkTool('corvid_github_create_pr')` returns `allowed: true`
- [ ] Grant `git:*` (wildcard) and confirm all `git:` tools are allowed
- [ ] Grant `*` (superuser) and confirm any tool is allowed
- [ ] Tamper with a grant's `signature` column directly in the DB and confirm the check returns `allowed: false` with a tampering reason
- [ ] Set an `expires_at` in the past and confirm the grant is treated as inactive
- [ ] Call `emergencyRevoke` and confirm all grants for the agent are revoked with a single call
- [ ] Call `requirePermissionTier(PermissionTier.Operator)` as a Guest and confirm 403 response

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Tool not in `TOOL_ACTION_MAP` | `checkTool` returns `{ allowed: true }` (unmapped tools are not gated) |
| Grant with invalid HMAC signature | `checkAction` returns `{ allowed: false }` with tampering warning |
| `PERMISSION_HMAC_SECRET` not set | Ephemeral random key used; warning logged at startup; grants valid only for current process lifetime |
| Multiple matching grants (wildcard + exact) | First match by `created_at DESC` wins |
| Audit INSERT fails (`permission_checks`) | Permission check result still returned; error logged |
| `revoke()` with no matching grants | Returns 0 affected rows |
| Emergency revoke on agent with no active grants | Returns 0; no error |
| Expired grant exists alongside active one | Only active grant is matched; expired grant is ignored |
| `resolveCallerTier` with no auth context | Returns `PermissionTier.Guest` (0) |
