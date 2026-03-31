---
spec: plugins.spec.md
---

## User Stories

- As an agent developer, I want to extend corvid-agent with third-party plugins loaded from npm packages so that I can add custom tools without modifying the core codebase.
- As an agent operator, I want capability-based permissions (db:read, network:outbound, fs:project-dir, agent:read, session:read) so that plugins are sandboxed to only the resources they need.
- As a platform administrator, I want to grant and revoke plugin capabilities through the database so that I can control what each plugin can access at runtime.
- As an agent developer, I want plugin tools to be namespaced as `corvid_plugin_<pluginname>_<toolname>` so that tool names never collide across plugins or with core tools.
- As an agent operator, I want plugin tool execution to enforce a 30-second timeout so that a misbehaving plugin cannot hang the system indefinitely.
- As a platform administrator, I want to list, load, and unload plugins at runtime so that I can manage the plugin ecosystem without restarting the server.

## Acceptance Criteria

- `isValidPluginName` accepts only names matching `/^[a-z][a-z0-9-]*$/` with a maximum of 50 characters.
- `validateManifest` validates that all required fields (name, version, description, author, capabilities) are present and that capabilities are from the recognized set.
- `loadPluginFromPackage` dynamically imports an npm package and validates it as a `CorvidPlugin` (expects default or named `plugin` export); returns `{ success: false }` with a descriptive error for any validation failure.
- `PluginRegistry.loadPlugin` rejects duplicate plugin names with `{ success: false, error: 'Plugin ... is already loaded' }`.
- `PluginRegistry.loadPlugin` calls the `onLoad` hook before registering; if `onLoad` throws, loading fails and the plugin is not registered.
- `PluginRegistry.unloadPlugin` calls `onUnload` before removal; if `onUnload` throws, the plugin is still removed and a warning is logged.
- `buildPluginToolName` produces names in the format `corvid_plugin_<pluginname>_<toolname>` with hyphens replaced by underscores.
- `executeTool` verifies all capabilities required by the plugin are granted before calling the handler; missing capabilities return an error without executing.
- `executeTool` enforces a 30-second timeout via `Promise.race`; exceeding it returns `{ result: '', error: 'Tool execution timed out after 30000ms' }`.
- `grantCapability` and `revokeCapability` persist changes to the `plugin_capabilities` table with timestamps.
- `getGrantedCapabilities` returns the current list of granted capabilities for a plugin from the database.
- `listAllPlugins` returns all plugin records from the database (including disabled ones), ordered by `loaded_at DESC`.
- Unloading a plugin sets its database status to `'disabled'`.

## Constraints

- Only five capabilities are recognized: `db:read`, `network:outbound`, `fs:project-dir`, `agent:read`, `session:read`; unknown capabilities are rejected.
- Plugin names must be lowercase alphanumeric with hyphens; no uppercase, underscores, or special characters.
- Every plugin tool must have a name (string), description (string), and handler (function); tools with missing fields cause the entire plugin load to fail.
- Tool execution timeout is fixed at 30 seconds (`TOOL_TIMEOUT_MS = 30000`); it is not configurable per-plugin.
- Plugins are loaded from npm packages via dynamic import; local file plugins are not supported.

## Out of Scope

- Plugin marketplace or plugin discovery service (plugins are installed manually via npm).
- Plugin versioning or automatic updates.
- Plugin sandboxing at the OS/container level (capability checks are advisory, enforced at the registry level).
- Plugin-to-plugin communication or shared state.
- UI for plugin management (managed via API routes or direct database access).
- Filesystem write capabilities (only `fs:project-dir` read access is available).
