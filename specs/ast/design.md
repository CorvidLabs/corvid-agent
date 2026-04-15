---
spec: ast.spec.md
sources:
  - server/ast/parser.ts
  - server/ast/queries.ts
  - server/ast/service.ts
  - server/ast/types.ts
---

## Layout

The AST module lives in `server/ast/` with four files:

```
server/ast/
  types.ts    — AstSymbol, AstSymbolKind, AstLanguage, FileSymbolIndex, ProjectSymbolIndex, SearchOptions
  parser.ts   — WASM initialization, language loading, Parser factory, extractSymbols tree walker
  queries.ts  — Tree-sitter query patterns per language (exported query strings)
  service.ts  — AstParserService: stateful project indexing, caching, and symbol search
```

## Components

### parser.ts — Core WASM Layer
Three module-level caches:
- `initialized: boolean` — tracks whether `initParser()` has been called
- `languageCache: Map<AstLanguage, Language>` — loaded grammar WASMs (process lifetime)
- `parserCache: Map<AstLanguage, Parser>` — re-used Parser instances per language

Key functions:
- `initParser()` — one-time WASM runtime boot (idempotent)
- `loadLanguage(lang)` — loads grammar WASM from `tree-sitter-wasms` package
- `createParserForLanguage(lang)` — returns a configured Parser, throws `ValidationError` if not initialized
- `extractSymbols(tree, lang)` — cursor-based tree walk extracting top-level symbols; recurses into class bodies for methods

### service.ts — AstParserService
Stateful class wrapping the parser layer:
- `projectIndexes: Map<string, ProjectSymbolIndex>` — cached per-project symbol indexes
- `init()` — delegates to `initParser()`
- `parseFile(filePath)` — reads file, checks size (>512KB → skip), detects language, parses, caches
- `indexProject(dir)` — recursive directory walk skipping `SKIP_DIRS`; uses `mtimeMs` for incremental re-indexing
- `searchSymbols(dir, query, opts)` — substring match across top-level and child symbols

### SKIP_DIRS (constant)
Directories never traversed during `indexProject`: `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`, `__pycache__`, `.cache`.

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| Max file size | 512KB | Files larger than this are silently skipped |
| `SKIP_DIRS` | `node_modules`, `.git`, `dist`, `build`, etc. | Never traversed during project indexing |
| `SUPPORTED_EXTENSIONS` | `.ts`, `.js`, `.tsx`, `.jsx`, `.mts`, `.mjs`, `.cts`, `.cjs` | Only these files are parsed |
| Default search limit | 100 | Max symbols returned by `searchSymbols` |

## Assets

### External Dependencies
- `web-tree-sitter` npm package — WASM-based parsing engine
- `tree-sitter-wasms` npm package — pre-built grammar WASMs for TypeScript, JavaScript, TSX/JSX

### Consumed By
- `server/mcp/tool-handlers/` — `corvid_code_symbols` and `corvid_find_references` MCP tools use `AstParserService`
- `server/process/` — project indexing triggered at session startup to pre-warm the symbol cache
