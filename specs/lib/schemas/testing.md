---
spec: index.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| (no dedicated test file) | — | Barrel re-exports are verified indirectly through marketplace route tests that import from this module |

## Manual Testing

- [ ] Import `CreateListingSchema` from `server/lib/schemas`; verify it is the same schema object as importing from `server/lib/schemas/marketplace`
- [ ] Verify all 11 expected schemas are importable from the barrel

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Adding a new schema to `marketplace.ts` without updating `index.ts` | Schema is not accessible from the barrel (would require a `index.ts` update) |
| Circular import attempt | Not possible as barrel only re-exports; no logic that could create circular deps |
