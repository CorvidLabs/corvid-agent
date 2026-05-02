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

Run the full pipeline with one command:

```bash
fledge lanes run verify               # lint → typecheck → test → spec-check
```

Or run individual tasks:

```bash
fledge run lint                       # Biome lint check
fledge run typecheck                  # TypeScript type checking
fledge run test                       # Test suite
fledge run spec-check                 # Spec invariant verification
```

**All four must pass.** Do not commit with failures.

### Other useful lanes

```bash
fledge lanes run check                # Quick: lint + typecheck only (parallel)
fledge lanes run fix                  # Auto-fix: lint-fix + format (parallel)
fledge lanes run audit                # Full audit: all checks + SQL lint + security scan
```

## Linting

- Uses [Biome](https://biomejs.dev/) — config in `biome.json`
- `fledge run lint` — check for issues
- `fledge run lint-fix` — auto-fix what it can
- `fledge run format` — auto-format files
- Covers `server/`, `shared/`, `scripts/`
- Client has its own Prettier config (separate)

## TypeScript Checking

- `fledge run typecheck` wraps `bun x tsc --noEmit --skipLibCheck`
- Strict mode is enabled project-wide

## Spec Checking

Module specifications in `specs/` define invariants for specific modules.

- Before modifying any file listed in a spec's `files:` frontmatter, read the spec
- After modifying, run `fledge run spec-check`
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

1. Run `fledge run typecheck` + `fledge run test` after each implementation attempt
2. Iterate up to 3 times on failure
3. Only create a PR when validation passes
