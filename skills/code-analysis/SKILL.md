---
name: code-analysis
description: Use this skill when the user wants to find code symbols (functions, classes, types), trace references across a codebase, or navigate code structure. Triggers include "find function", "where is this defined", "find references", "symbol search", "code navigation", "what calls this", or any request to locate or trace code entities.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Code Analysis — Symbol Search & Reference Tracing

Search for code symbols using AST parsing and find all references to a symbol across the project.

## MCP Tools

- `corvid_code_symbols` — Search for code symbols (functions, classes, interfaces, types)
  - Parameters: `query` (symbol name or pattern), `project` (optional, project name), `type` (optional: "function", "class", "interface", "type", "variable")
- `corvid_find_references` — Find all references to a symbol across the project
  - Parameters: `symbol` (symbol name), `project` (optional, project name)

## Examples

### Find a function

```
Use corvid_code_symbols:
  query: "handleMessage"
  type: "function"
```

### Find all references

```
Use corvid_find_references:
  symbol: "CreditService"
```

## Notes

- Symbol search uses AST parsing for accurate results (not text search)
- Reference tracing finds imports, calls, and type usage
- Specify `type` to narrow results when a name is common
