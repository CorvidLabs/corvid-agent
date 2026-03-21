---
module: mcp-default-tools
version: 1
status: active
files:
  - server/mcp/default-tools.ts
db_tables: []
depends_on: []
---

# MCP Default Tools

## Purpose

Defines the canonical list of default tools available to all agents when no explicit tool permissions are configured. This constant is imported by the skill-bundles module so that bundle tool resolution merges with (rather than replaces) the default set.

## Public API

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `DEFAULT_CORE_TOOLS` | `readonly string[]` | 41-element array of tool name strings representing the union of tools from both the SDK-tools and direct-tools backends |

## Invariants

1. **Single export**: The module exports exactly one constant (`DEFAULT_CORE_TOOLS`) and no functions or types
2. **Immutable**: The array is declared `as const` and typed `readonly string[]`, preventing mutation at runtime
3. **No dependencies**: The module has no imports — it is a pure data declaration with no runtime dependencies

## Behavioral Examples

### Scenario: Importing default tools

- **Given** a consumer module (e.g., skill-bundles) needs the default tool list
- **When** it imports `DEFAULT_CORE_TOOLS`
- **Then** it receives a readonly array of 41 tool name strings covering both SDK-tools and direct-tools backends

## Error Cases

| Condition | Behavior |
|-----------|----------|
| N/A | This module is a pure constant declaration with no runtime error paths |

## Dependencies

### Consumes

None — this module has no imports.

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/db/skill-bundles.ts` | `DEFAULT_CORE_TOOLS` for merging bundle tools with defaults |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-20 | corvid-agent | Initial spec |
