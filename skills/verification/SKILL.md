---
name: verification
description: Pre-commit verification — tsc type checking, test suite, spec invariant checks. Trigger keywords: verify, validate, check, tsc, typecheck, spec check, pre-commit.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Verification — Pre-Commit Pipeline

The verification pipeline that must pass before any commit.

## Commands

Run all three in order:

```bash
bun x tsc --noEmit --skipLibCheck    # TypeScript type checking
bun test                              # Test suite
bun run spec:check                    # Spec invariant verification
```

**All three must pass.** Do not commit with failures.

## TypeScript Checking

- Uses `bun x tsc` (not `bunx` — the space matters)
- `--noEmit` — type-check only, no output files
- `--skipLibCheck` — skip checking node_modules declarations (faster)
- Strict mode is enabled project-wide

## Spec Checking

Module specifications in `specs/` define invariants for specific modules.

- Before modifying any file listed in a spec's `files:` frontmatter, read the spec
- After modifying, run `bun run spec:check`
- If your change violates a spec invariant, **update the spec first** (add a Change Log entry)
- Specs take precedence over code comments — if code contradicts the spec, the code is the bug

## Stats Checking

Optional but recommended:

```bash
bun run stats:check
```

Verifies codebase statistics are within expected ranges.

## Work Task Auto-Validation

Work tasks (created via `corvid_create_work_task`) automatically:

1. Run `tsc` + `bun test` after each implementation attempt
2. Iterate up to 3 times on failure
3. Only create a PR when validation passes
