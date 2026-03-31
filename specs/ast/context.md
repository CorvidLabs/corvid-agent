# AST — Context

## Why This Module Exists

Agents need to navigate and understand codebases to do useful work. The AST module provides structured code intelligence — function signatures, class hierarchies, import/export maps — without requiring agents to read entire files. This makes code search and navigation fast and precise, especially for large projects.

## Architectural Role

AST is a **developer tooling service** that powers the `corvid_code_symbols` and `corvid_find_references` MCP tools. It sits between the raw filesystem and agent sessions, providing a queryable symbol index.

## Key Design Decisions

- **Tree-sitter over regex**: Uses tree-sitter for accurate parsing rather than regex-based extraction. This handles edge cases (nested functions, decorators, generics) that regex would miss.
- **mtime-based caching**: Only re-parses files that have changed since the last index build. This makes repeated queries fast without stale data.
- **Per-project indexes**: Each project gets its own symbol index, supporting multi-project deployments.

## Relationship to Other Modules

- **MCP Tools**: The AST service backs the code navigation MCP tools that agents use during sessions.
- **Work Tasks**: Agents working on code changes use AST queries to understand the codebase before making modifications.
