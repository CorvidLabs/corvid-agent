---
spec: _template.spec.md
---

## Automated Testing

This is the root-level testing companion for the spec template. Each module's `testing.md` documents:

- **Automated Testing** — Existing test files, their type (unit/integration/e2e), and what they cover
- **Manual Testing** — Step-by-step QA checklists for verifying behavior that can't be fully automated
- **Edge Cases** — Boundary values, race conditions, permission matrices, and error paths

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/*.test.ts` | Unit | Per-module unit tests using `bun:test` |
| `e2e/**/*.spec.ts` | E2E | Playwright browser tests for the Angular dashboard |

## Manual Testing

- [ ] Run `fledge run test` and verify all tests pass
- [ ] Run `fledge run lint` and verify zero lint errors
- [ ] Run `fledge run typecheck` and verify zero type errors
- [ ] Run `fledge run spec-check` and verify all specs pass

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| New spec added without companion files | `specsync check` should warn about missing companions |
| Companion references non-existent spec | Frontmatter `spec:` field validation should flag the mismatch |
| Empty companion file (only template comments) | `specsync check --strict` should report incomplete companions |
