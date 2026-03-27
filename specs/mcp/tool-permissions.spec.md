---
module: tool-permissions
version: 1
status: active
files:
  - server/mcp/tool-permissions.ts
db_tables: []
depends_on: []
---

# Tool Permissions

## Purpose

Centralizes the default tool allowlist and permission resolution logic for MCP tool filtering. Extracted from `sdk-tools.ts` so that permission logic can be tested independently and reused across modules.

## Public API

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `DEFAULT_ALLOWED_TOOLS` | `Set<string>` | Tools available to all agents by default when `mcp_tool_permissions` is NULL |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `resolveAllowedTools` | `(permissions: string[] \| null \| undefined)` | `Set<string>` | Returns the allowed tool set: defaults for null/undefined/empty, or a custom set for non-empty arrays |

## Invariants

- `resolveAllowedTools(null)` and `resolveAllowedTools(undefined)` always return `DEFAULT_ALLOWED_TOOLS`
- `resolveAllowedTools([])` returns `DEFAULT_ALLOWED_TOOLS` (empty should not block all tools)
- `resolveAllowedTools` with a non-empty array returns a new `Set` containing exactly those tool names
- `DEFAULT_ALLOWED_TOOLS` is immutable at runtime (const `Set`)

## Behavioral Examples

```ts
resolveAllowedTools(null);                        // → DEFAULT_ALLOWED_TOOLS
resolveAllowedTools(undefined);                   // → DEFAULT_ALLOWED_TOOLS
resolveAllowedTools([]);                          // → DEFAULT_ALLOWED_TOOLS
resolveAllowedTools(['corvid_send_message']);      // → Set(['corvid_send_message'])
```

## Error Cases

No explicit error cases — the function handles all expected input shapes (null, undefined, empty array, non-empty array).

## Dependencies

None.

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| 1 | 2026-03-27 | Initial spec — extracted from sdk-tools.ts |
