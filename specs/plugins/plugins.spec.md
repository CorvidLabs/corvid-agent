---
module: plugins
version: 1
status: draft
files:
  - server/plugins/loader.ts
  - server/plugins/permissions.ts
  - server/plugins/registry.ts
  - server/plugins/types.ts
db_tables:
  - plugins
  - plugin_capabilities
depends_on:
  - specs/lib/infra.spec.md
  - specs/db/connection.spec.md
implements: [1489]
---

# Plugins

## Purpose

Provides a plugin system for corvid-agent: defines the plugin interface, validates manifests, loads plugins dynamically from npm packages, manages capability-based permissions via the database, and orchestrates plugin lifecycle and tool execution through a central registry.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `isValidPluginName` | `name: string` | `boolean` | Checks if a plugin name matches the required pattern (lowercase alphanumeric with hyphens, max 50 chars) |
| `validateManifest` | `manifest: unknown` | `ManifestValidationResult` | Validates a plugin manifest object for required fields and valid capabilities |
| `loadPluginFromPackage` | `packageName: string` | `Promise<LoadResult>` | Dynamically imports an npm package and validates it as a CorvidPlugin (expects default or named `plugin` export) |
| `buildPluginToolName` | `pluginName: string, toolName: string` | `string` | Builds a namespaced tool name in the format `corvid_plugin_<pluginname>_<toolname>` (hyphens replaced with underscores) |
| `isValidCapability` | `cap: string` | `cap is PluginCapability` | Type guard checking if a string is a recognized PluginCapability |
| `validateCapabilities` | `caps: string[]` | `{ valid: PluginCapability[]; invalid: string[] }` | Splits an array of capability strings into valid and invalid lists |
| `getGrantedCapabilities` | `db: Database, pluginName: string` | `PluginCapability[]` | Queries the database for all granted capabilities for a plugin |
| `grantCapability` | `db: Database, pluginName: string, capability: PluginCapability` | `void` | Grants a single capability to a plugin (upserts into `plugin_capabilities`) |
| `revokeCapability` | `db: Database, pluginName: string, capability: PluginCapability` | `void` | Revokes a single capability from a plugin |
| `grantAllCapabilities` | `db: Database, pluginName: string, capabilities: PluginCapability[]` | `void` | Grants all specified capabilities to a plugin |
| `hasCapability` | `db: Database, pluginName: string, capability: PluginCapability` | `boolean` | Checks whether a plugin has a specific capability granted |

### Exported Types

| Type | Description |
|------|-------------|
| `PluginManifest` | Interface for plugin metadata: name, version, description, author, capabilities |
| `PluginCapability` | Union type of recognized capability strings: `'db:read'`, `'network:outbound'`, `'fs:project-dir'`, `'agent:read'`, `'session:read'` |
| `CorvidPluginTool` | Interface for a tool provided by a plugin: name, description, inputSchema (Zod), handler function |
| `PluginToolContext` | Interface for the context passed to plugin tool handlers: agentId, sessionId, grantedCapabilities |
| `CorvidPlugin` | Interface for a complete plugin: manifest, tools array, optional onLoad/onUnload hooks |
| `PluginStatus` | Union type: `'active' \| 'disabled' \| 'error'` |
| `PluginRecord` | Interface for a plugin row from the `plugins` DB table |
| `PluginCapabilityRecord` | Interface for a row from the `plugin_capabilities` DB table |
| `ManifestValidationResult` | Interface: `{ valid: boolean; errors: string[] }` |
| `LoadResult` | Interface: `{ success: boolean; plugin?: CorvidPlugin; error?: string }` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `PluginRegistry` | Central registry that manages plugin lifecycle (load/unload), exposes plugin tools with namespaced names, executes tools with capability checks and timeouts, and persists plugin state to the database |

#### PluginRegistry Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database` | `PluginRegistry` | Creates a new registry backed by the given SQLite database |
| `loadPlugin` | `packageName: string, autoGrant?: boolean` | `Promise<{ success: boolean; error?: string }>` | Loads a plugin from an npm package, validates it, calls its onLoad hook, registers it in the DB, and optionally auto-grants all requested capabilities |
| `unloadPlugin` | `name: string` | `Promise<{ success: boolean; error?: string }>` | Unloads a plugin by name, calls its onUnload hook, removes it from the in-memory map, and sets DB status to `'disabled'` |
| `getPluginTools` | _(none)_ | `Array<{ name, description, inputSchema, pluginName, handler }>` | Returns all tools from all loaded plugins with namespaced names prefixed with `corvid_plugin_` |
| `executeTool` | `toolName: string, input: unknown, context: PluginToolContext` | `Promise<{ result: string; error?: string }>` | Finds a tool by its namespaced name, checks capability grants, and executes the handler with a 30-second timeout |
| `getLoadedPlugins` | _(none)_ | `Array<{ name, version, description, toolCount }>` | Returns metadata for all currently loaded plugins |
| `isLoaded` | `name: string` | `boolean` | Checks if a plugin is currently loaded in memory |
| `getPlugin` | `name: string` | `CorvidPlugin \| undefined` | Returns the raw CorvidPlugin object for a loaded plugin |
| `listAllPlugins` | _(none)_ | `PluginRecord[]` | Queries the DB for all plugin records (including disabled ones), ordered by loaded_at descending |

## Invariants

1. Plugin names must match `/^[a-z][a-z0-9-]*$/` and be at most 50 characters.
2. All manifest fields (name, version, description, author, capabilities) are validated before a plugin is loaded.
3. Capabilities must be one of the five recognized values: `db:read`, `network:outbound`, `fs:project-dir`, `agent:read`, `session:read`.
4. A plugin cannot be loaded twice (duplicate names are rejected).
5. Every plugin tool must have a name (string), description (string), and handler (function).
6. Tool names are namespaced as `corvid_plugin_<pluginname>_<toolname>` (hyphens in plugin name become underscores).
7. Tool execution enforces a 30-second timeout (`TOOL_TIMEOUT_MS = 30000`).
8. Tool execution verifies that all capabilities required by the plugin are granted before calling the handler.
9. The `onLoad` hook is called before a plugin is registered; if it throws, loading fails.
10. The `onUnload` hook is called before removal; if it throws, the plugin is still removed (warning logged).
11. Capability grants and revocations are persisted in the `plugin_capabilities` table with timestamps.

## Behavioral Examples

### Scenario: Loading a valid plugin with auto-grant
- **Given** a valid npm package exporting a CorvidPlugin with capabilities `['db:read', 'network:outbound']`
- **When** `registry.loadPlugin('my-package', true)` is called
- **Then** the plugin is dynamically imported, manifest validated, onLoad called, plugin inserted/updated in the `plugins` table with status `'active'`, all requested capabilities are granted in `plugin_capabilities`, and the method returns `{ success: true }`

### Scenario: Executing a plugin tool with missing capabilities
- **Given** a loaded plugin `my-plugin` with tool `fetch-data` requiring `network:outbound`
- **When** `executeTool('corvid_plugin_my_plugin_fetch_data', input, context)` is called but `network:outbound` is not granted
- **Then** the method returns `{ result: '', error: 'Plugin my-plugin missing capabilities: network:outbound' }` without calling the handler

### Scenario: Plugin tool exceeds timeout
- **Given** a loaded plugin tool whose handler takes longer than 30 seconds
- **When** `executeTool(...)` is called
- **Then** the Promise.race resolves with a timeout error: `Tool execution timed out after 30000ms`

### Scenario: Validating an invalid manifest
- **Given** a manifest object with `name: 'INVALID'` (uppercase) and missing `author`
- **When** `validateManifest(manifest)` is called
- **Then** it returns `{ valid: false, errors: ['manifest.name must be...', 'manifest.author must be a string'] }`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Package does not export a CorvidPlugin | `loadPluginFromPackage` returns `{ success: false, error: '...does not export a CorvidPlugin...' }` |
| Plugin missing manifest | `loadPluginFromPackage` returns `{ success: false, error: 'Plugin does not have a manifest' }` |
| Invalid manifest fields | `loadPluginFromPackage` returns `{ success: false, error: 'Invalid manifest: ...' }` |
| Plugin tools array missing | `loadPluginFromPackage` returns `{ success: false, error: 'Plugin does not export a tools array' }` |
| Tool missing name/description/handler | `loadPluginFromPackage` returns `{ success: false, error: 'All plugin tools must have a name' }` (or similar) |
| Dynamic import fails | `loadPluginFromPackage` catches error and returns `{ success: false, error: 'Failed to import ...' }` |
| Plugin already loaded | `loadPlugin` returns `{ success: false, error: 'Plugin ... is already loaded' }` |
| onLoad hook throws | `loadPlugin` returns `{ success: false, error: 'onLoad failed: ...' }` |
| Plugin not loaded when unloading | `unloadPlugin` returns `{ success: false, error: 'Plugin ... is not loaded' }` |
| Tool not found during execution | `executeTool` returns `{ result: '', error: 'Tool ... not found in any loaded plugin' }` |
| Missing capabilities during execution | `executeTool` returns `{ result: '', error: 'Plugin ... missing capabilities: ...' }` |
| Tool handler throws | `executeTool` catches error and returns `{ result: '', error: '<message>' }` |
| Tool handler exceeds 30s | `executeTool` returns `{ result: '', error: 'Tool execution timed out after 30000ms' }` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `lib/logger` | `createLogger` for structured logging |
| `bun:sqlite` | `Database` type for SQLite operations |
| `zod` | `z.ZodType` for tool input schema typing (types only) |

### Consumed By

| Module | What is used |
|--------|-------------|
| `mcp/sdk-tools` | Plugin tools are registered as MCP tools (likely consumer) |
| `process/manager` | Plugin registry integrated into session process management (likely consumer) |
| `routes/*` | API routes for plugin management (likely consumer) |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
