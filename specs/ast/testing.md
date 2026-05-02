---
spec: ast.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/ast-service.test.ts` | Unit | `AstParserService.init`, `parseFile`, `parseSource`, `indexProject` (fresh + incremental), `searchSymbols`, `invalidateFile`, `clearProjectIndex`; error paths for uninitialized service and unsupported extensions |

## Manual Testing

- [ ] Run `fledge run test -- server/__tests__/ast-service.test.ts` to confirm all AST unit tests pass
- [ ] In a running session, invoke the `corvid_code_symbols` MCP tool on this repo's `server/` directory and confirm TypeScript function/class symbols are returned
- [ ] Modify a source file and re-index the project; confirm the modified file's symbols update while unchanged files are skipped (check logs for "skipping unchanged" messages)
- [ ] Point `parseFile` at a file larger than 512KB; confirm it returns null without error
- [ ] Call `createParserForLanguage` before `initParser`; confirm a `ValidationError` is thrown with an informative message

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `initParser()` called twice | Idempotent — no error, no duplicate initialization |
| `parseFile` on a `.py` file | Returns `null` — unsupported extension |
| `parseFile` on a deleted/unreadable file | Returns `null`, logs debug message |
| `parseFile` on exactly 512KB file | Parsed normally (limit is `> 512KB`) |
| `parseFile` on a 512KB + 1 byte file | Returns `null`, logs debug message |
| `indexProject` on a directory with only `node_modules/` | Returns empty index — SKIP_DIRS prevents traversal |
| `indexProject` re-run with no file changes | All files skipped via mtime check; zero new parses |
| `searchSymbols` on a not-yet-indexed project | Returns empty array (no project index) |
| `searchSymbols` with `kinds` filter | Only symbols matching the specified kinds are returned |
| Class method symbol lookup | `searchSymbols` finds methods nested under parent class symbols |
| Tree-sitter parse returns null tree | `parseSource` returns empty array, no error |
| Parser/Tree objects not deleted after parse (resource leak) | WASM memory grows unbounded — `try/finally` in implementation prevents this |
