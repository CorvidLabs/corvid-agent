---
spec: types.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| _(none)_ | — | This module is a pure `.d.ts` stub; there is no runtime code to test. Correctness is verified by TypeScript compilation only. |

Type correctness is verified by running `fledge run typecheck` across the server codebase. If the ambient declarations diverge from the actual package API, imports in `server/algochat/` will produce compile-time errors.

## Manual Testing

- [ ] Remove `@corvidlabs/ts-algochat` from `node_modules` (or in CI without the package) and run `fledge run typecheck` — verify compilation succeeds using these ambient declarations
- [ ] Install the real `@corvidlabs/ts-algochat` package and re-run `fledge run typecheck` — verify TypeScript prefers the real package over the stubs with no errors
- [ ] Add a new function to the real package that is missing from the stubs — verify `fledge run typecheck` emits a type error at call sites, confirming stubs are checked

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Package not installed | Ambient declarations allow compilation to succeed |
| Package installed | TypeScript prefers real package; stubs are ignored |
| Stub function signature diverges from real package | `tsc` emits error at call sites where types mismatch |
| New field added to real `DecryptedMessage` not in stub | Index signature `[key: string]: unknown` prevents compile error |
| `PROTOCOL` object accessed with unknown key | Index signature `[key: string]: unknown` allows forward-compatible access |
| `AlgorandService` constructed with config of unknown shape | `config: unknown` parameter permits any config object |
