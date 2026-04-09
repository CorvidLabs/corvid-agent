---
module: ast
version: 1
status: draft
files:
  - server/ast/parser.ts
  - server/ast/queries.ts
  - server/ast/service.ts
  - server/ast/types.ts
db_tables: []
depends_on:
  - specs/lib/infra/infra.spec.md
---

# AST

## Purpose

Provides tree-sitter-based parsing of TypeScript and JavaScript source files, extracting navigational symbols (functions, classes, interfaces, types, enums, imports, exports) and building per-project symbol indexes with mtime-based caching for fast code navigation and search.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `initParser` | _(none)_ | `Promise<void>` | One-time WASM runtime initialization for tree-sitter. Must be called before any parsing. Idempotent. |
| `loadLanguage` | `lang: AstLanguage` | `Promise<Language>` | Load and cache a language grammar WASM file for the given language. |
| `createParserForLanguage` | `lang: AstLanguage` | `Promise<Parser>` | Create a tree-sitter Parser configured for the given language. Throws if `initParser()` has not been called. |
| `languageFromExtension` | `ext: string` | `AstLanguage \| null` | Map a file extension (e.g. `.ts`, `.jsx`) to its AST language, or null if unsupported. |
| `extractSymbols` | `tree: Tree, lang: AstLanguage` | `AstSymbol[]` | Extract navigational symbols from a tree-sitter syntax tree using cursor-based tree walking. |

### Exported Types

| Type | Description |
|------|-------------|
| `AstSymbolKind` | Union literal: `'function' \| 'class' \| 'interface' \| 'type_alias' \| 'enum' \| 'import' \| 'export' \| 'variable' \| 'method'` |
| `AstSymbol` | Symbol descriptor with `name`, `kind`, `startLine`, `endLine`, `isExported`, optional `children`, `moduleSpecifier`, and `importedNames`. |
| `FileSymbolIndex` | Per-file index containing `filePath`, `mtimeMs`, and `symbols: AstSymbol[]`. |
| `ProjectSymbolIndex` | Per-project index containing `projectDir`, `files: Map<string, FileSymbolIndex>`, and `lastFullIndexAt` timestamp. |
| `AstLanguage` | Union literal: `'typescript' \| 'javascript' \| 'tsx' \| 'jsx'` |
| `SearchOptions` | Interface with optional `kinds?: AstSymbolKind[]` and `limit?: number` for filtering symbol searches. |

### Exported Classes

| Class | Description |
|-------|-------------|
| `AstParserService` | Stateful service that manages WASM initialization, per-file parsing, project-wide indexing with mtime caching, and symbol search. |

#### AstParserService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `init` | _(none)_ | `Promise<void>` | Initialize the WASM runtime. Must be called before any parsing. Idempotent. |
| `parseFile` | `filePath: string` | `Promise<FileSymbolIndex \| null>` | Parse a single file and return its symbol index, or null if unsupported, too large (>512KB), or unreadable. |
| `parseSource` | `source: string, lang: AstLanguage` | `Promise<AstSymbol[]>` | Parse raw source code string and extract symbols for the given language. |
| `indexProject` | `projectDir: string` | `Promise<ProjectSymbolIndex>` | Recursively walk a project directory, parse all TS/JS files, and build/update a cached symbol index. Skips files unchanged since last index. |
| `getProjectIndex` | `projectDir: string` | `ProjectSymbolIndex \| null` | Retrieve a previously cached project index, or null if not yet indexed. |
| `searchSymbols` | `projectDir: string, query: string, options?: SearchOptions` | `AstSymbol[]` | Search symbols across a project by name substring match, with optional kind filter and result limit (default 100). |
| `invalidateFile` | `projectDir: string, filePath: string` | `void` | Remove a single file from the project index cache, forcing re-parse on next index. |
| `clearProjectIndex` | `projectDir: string` | `void` | Clear the entire cached project index for a directory. |

## Invariants

1. `initParser()` must be called before `createParserForLanguage()` or any `AstParserService` method that parses. A `ValidationError` is thrown otherwise.
2. Language WASM files are loaded once and cached in a module-level `Map` for the process lifetime.
3. Files larger than 512KB are silently skipped during parsing (returns null).
4. The `indexProject` method uses `mtimeMs` to skip re-parsing unchanged files, providing incremental re-indexing.
5. Directories in `SKIP_DIRS` (node_modules, .git, dist, build, etc.) are never traversed.
6. Only files with extensions in `SUPPORTED_EXTENSIONS` (.ts, .js, .tsx, .jsx, .mts, .mjs, .cts, .cjs) are parsed.
7. Tree-sitter `Parser` and `Tree` objects are always deleted after use (via try/finally) to prevent WASM memory leaks.
8. The file is read before stat to avoid TOCTOU race conditions (CodeQL js/file-system-race).
9. `searchSymbols` also searches children of symbols (e.g. class methods), not just top-level symbols.
10. `extractSymbols` only extracts top-level nodes from the root; nested declarations inside function bodies are not indexed.

## Behavioral Examples

### Scenario: Indexing a project for the first time
- **Given** `AstParserService.init()` has been called
- **When** `indexProject('/path/to/project')` is called
- **Then** all .ts/.js/.tsx/.jsx files are recursively discovered (skipping node_modules, .git, etc.), parsed via tree-sitter, and their symbols are cached in a `ProjectSymbolIndex`

### Scenario: Re-indexing an unchanged project
- **Given** a project has been indexed previously
- **When** `indexProject('/path/to/project')` is called again with no file changes
- **Then** all files are skipped (mtime unchanged) and the cached index is returned with zero new parses

### Scenario: Searching for a function by name
- **Given** a project index exists with a function named `createLogger`
- **When** `searchSymbols(projectDir, 'createLogger')` is called
- **Then** the matching `AstSymbol` with `kind: 'function'` is returned

### Scenario: Parsing an unsupported file extension
- **Given** a file with extension `.py`
- **When** `parseFile('/path/to/file.py')` is called
- **Then** null is returned because `.py` is not in the supported extensions

### Scenario: Parsing before initialization
- **Given** `initParser()` has NOT been called
- **When** `createParserForLanguage('typescript')` is called
- **Then** a `ValidationError` is thrown with message indicating parser is not initialized

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `createParserForLanguage` called before `initParser` | Throws `ValidationError` |
| `AstParserService.parseFile` called before `init` | Throws `ValidationError` |
| `AstParserService.parseSource` called before `init` | Throws `ValidationError` |
| `AstParserService.indexProject` called before `init` | Throws `ValidationError` |
| File exceeds 512KB | `parseFile` returns `null`, logs debug message |
| File is unreadable (permissions, deleted) | `parseFile` returns `null`, logs debug message |
| Directory unreadable during walk | Silently skipped (catch block returns) |
| Unsupported file extension | `languageFromExtension` returns `null`; `parseFile` returns `null` |
| Tree-sitter parse returns null tree | `parseSource` returns empty array |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `web-tree-sitter` | `Parser`, `Language`, `Tree`, `Node` — core WASM-based parsing engine |
| `tree-sitter-wasms` | Pre-built WASM grammar files for TypeScript, JavaScript, TSX |
| `lib` | `ValidationError` from `server/lib/errors`, `createLogger` from `server/lib/logger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `mcp` | `AstParserService` used by MCP tool handlers for code navigation (e.g. `corvid_search_symbols`) |
| `process` | Project indexing triggered during session startup |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
