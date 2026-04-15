---
spec: plugins.spec.md
sources:
  - server/plugins/loader.ts
  - server/plugins/permissions.ts
  - server/plugins/registry.ts
  - server/plugins/types.ts
---

## Module Structure

Four files under `server/plugins/`:
- `types.ts` — all interfaces: `PluginManifest`, `CorvidPlugin`, `CorvidPluginTool`, `PluginToolContext`, `PluginCapability`, `PluginStatus`, `PluginRecord`, `PluginCapabilityRecord`, `ManifestValidationResult`, `LoadResult`
- `loader.ts` — `loadPluginFromPackage()`, `validateManifest()`, `isValidPluginName()`, `buildPluginToolName()`
- `permissions.ts` — `isValidCapability()`, `validateCapabilities()`, `getGrantedCapabilities()`, `grantCapability()`, `revokeCapability()`, `grantAllCapabilities()`, `hasCapability()`
- `registry.ts` — `PluginRegistry` class (in-memory map + DB persistence for lifecycle)

## Key Classes and Functions

**`PluginRegistry`** — Central registry backed by `Map<string, CorvidPlugin>` (keyed by plugin name) and the SQLite `plugins`/`plugin_capabilities` tables.

- `loadPlugin(packageName, autoGrant?)` — calls `loadPluginFromPackage`, validates, calls `onLoad`, upserts DB record with status `'active'`, optionally auto-grants all manifest capabilities.
- `unloadPlugin(name)` — calls `onUnload` (warns on failure but continues), removes from in-memory map, sets DB status to `'disabled'`.
- `executeTool(toolName, input, context)` — resolves namespaced name → plugin → tool, checks all plugin capabilities are granted, executes handler with 30s `Promise.race` timeout.
- `getPluginTools()` — flattens all loaded plugins into an array with prefixed names (`corvid_plugin_<name>_<tool>`).

**`loadPluginFromPackage()`** — `await import(packageName)` extracts `default` or named `plugin` export, runs `validateManifest`, verifies tools array and each tool's required fields.

**`validateManifest()`** — validates name regex, version, description, author (all strings), capabilities (must be recognized values).

## Configuration Values

| Constant | Value | Usage |
|----------|-------|-------|
| `TOOL_TIMEOUT_MS` | `30000` | Enforced via `Promise.race` in `executeTool` |

## Related Resources

**DB tables:** `plugins` (name, version, description, author, capabilities JSON, status, loaded_at) and `plugin_capabilities` (plugin_name, capability, granted_at, revoked_at).

**Consumed by:**
- `server/mcp/sdk-tools.ts` — registers plugin tools as MCP tools
- `server/process/manager.ts` — plugin registry in session context
- `server/routes/plugins.ts` — REST API for load/unload/list/capability management
