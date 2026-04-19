---
spec: ast.spec.md
---

## User Stories

- As a team agent, I want to search for functions, classes, and types by name across a project so that I can navigate large codebases efficiently during coding tasks
- As an agent developer, I want incremental project re-indexing that skips unchanged files so that repeated code navigation queries are fast
- As a team agent, I want to parse a single file and extract its exported symbols so that I can understand a module's public API without reading the entire file
- As a platform administrator, I want the AST parser to handle large projects safely so that indexing does not consume excessive memory or crash the server
- As a team agent, I want to filter symbol search results by kind (function, class, interface, etc.) so that I can find exactly the type of symbol I need

## Acceptance Criteria

- `initParser` initializes the tree-sitter WASM runtime and is idempotent; calling it multiple times has no side effects
- `createParserForLanguage` throws `ValidationError` if called before `initParser`
- `languageFromExtension` maps `.ts`, `.js`, `.tsx`, `.jsx`, `.mts`, `.mjs`, `.cts`, `.cjs` to the correct `AstLanguage` and returns `null` for unsupported extensions
- `extractSymbols` returns symbols with `name`, `kind`, `startLine`, `endLine`, `isExported`, and optional `children` for class methods
- `AstParserService.parseFile` returns `null` for files larger than 512KB, files with unsupported extensions, or unreadable files
- `AstParserService.indexProject` recursively walks the project directory, skipping `SKIP_DIRS` (node_modules, .git, dist, build, etc.)
- `AstParserService.indexProject` uses `mtimeMs` comparison to skip re-parsing unchanged files on subsequent calls
- `AstParserService.searchSymbols` performs substring matching on symbol names including class method children, with a default limit of 100 results
- `AstParserService.searchSymbols` accepts optional `kinds` filter and `limit` in `SearchOptions`
- `AstParserService.invalidateFile` removes a specific file from the project index cache, forcing re-parse on next index
- `AstParserService.clearProjectIndex` removes the entire cached index for a project directory
- Tree-sitter `Parser` and `Tree` objects are always deleted after use via try/finally to prevent WASM memory leaks
- Only top-level declarations from the AST root are indexed; nested declarations inside function bodies are excluded

## Constraints

- Requires `web-tree-sitter` WASM runtime and `@vscode/tree-sitter-wasm` grammar files as dependencies
- Language WASM files are loaded once and cached in a module-level `Map` for the process lifetime
- Files are read before stat to avoid TOCTOU race conditions
- Only TypeScript and JavaScript family languages are supported (no Python, Go, Rust, etc.)
- The file size limit of 512KB is hardcoded and not configurable

## Out of Scope

- Parsing languages other than TypeScript/JavaScript family (.ts, .js, .tsx, .jsx, .mts, .mjs, .cts, .cjs)
- Semantic analysis or type resolution (only syntactic symbol extraction)
- Cross-file reference tracking or dependency graphs
- Real-time file watching for automatic re-indexing (indexing is on-demand)
- Extracting symbols from nested scopes within function bodies
