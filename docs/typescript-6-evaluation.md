# TypeScript 6 Compatibility Evaluation

**Date:** 2026-04-26  
**TypeScript version evaluated:** 6.0.3  
**Current pinned version:** ~5.9.3 (with `overrides` lock in package.json)  
**Evaluator:** Rook

---

## Summary

**Status: BLOCKED — not yet ready to upgrade**

TypeScript 6.0.3 type-checks cleanly against all code (0 errors), but `@angular/build@21.2.7` declares a hard peer dependency ceiling of `<6.0`. Until Angular ships a build package that officially supports TypeScript 6, upgrading risks breaking the Angular build pipeline.

---

## Type-Check Results

```
bun x tsc@6 --noEmit --skipLibCheck   # server + shared
# Exit: 0, 0 errors

cd client && bun x tsc@6 --noEmit --skipLibCheck
# Exit: 0, 0 errors
```

No code-level changes are required. The entire codebase compiles cleanly under TypeScript 6.

---

## Dependency Compatibility Matrix

| Package | Version | TypeScript peer dep | TS 6.0.3 compatible? |
|---------|---------|--------------------|-----------------------|
| `@angular/compiler-cli` | 21.2.9 | `>=5.9 <6.1` | ✅ Yes |
| `@angular/build` | 21.2.7 | `>=5.9 <6.0` | ❌ **No** |
| `@angular/core` | 21.2.9 | (none) | ✅ Yes |
| `@angular/cli` | 21.2.5 | (none explicit) | ✅ Likely |
| `@biomejs/biome` | 2.4.x | (none) | ✅ Yes |
| `@types/bun` | 1.3.12 | (none) | ✅ Yes |
| `@anthropic-ai/claude-agent-sdk` | 0.2.114 | (none) | ✅ Yes |

---

## Blockers

### 1. `@angular/build@21.2.7` — peer dep `>=5.9 <6.0`

This is the primary blocker. `@angular/build` orchestrates the Angular build pipeline (esbuild, Vite, incremental compilation). Its peer dep ceiling `<6.0` means Angular 21.2.x officially does not support TypeScript 6.

Even though `@angular/compiler-cli` (which handles TypeScript compilation itself) allows `<6.1`, the build tooling constraint is more restrictive. Upgrading without resolving this would:
- Produce peer dependency warnings/errors on install
- Risk undefined behavior from the build tool running against an untested TypeScript version

### 2. `package.json` governance lock (Layer 1)

`package.json` is a Layer 1 (Structural) protected file — requires supermajority council vote + human approval to modify. Even if all dependency constraints were satisfied, the actual version bump and override removal would need that process.

---

## Required Changes (when Angular support lands)

Changes needed in `package.json` (cannot be applied by automated workflow — Layer 1):

```json
// devDependencies
"typescript": "~6.0.3"   // was "~5.9.3"

// overrides — remove or update the typescript pin:
"typescript": "~6.0.3"   // was "~5.9.3"
```

No source code changes needed.

---

## Path Forward

1. **Wait for `@angular/build` to support TypeScript 6** — Angular 21.3 or 22 will likely bump the ceiling. Monitor the Angular changelog.
2. **Re-run this evaluation** against the updated Angular build package.
3. **Submit a council proposal** to update `package.json` (Layer 1 process).

---

## Notes on TypeScript 6 Breaking Changes

TypeScript 6.0 is a major version but focuses on new features and improved module system support. Key breaking changes that could affect a codebase are minimal. The 0-error result from `tsc@6 --noEmit --skipLibCheck` confirms there are no code-level incompatibilities in this repo.
