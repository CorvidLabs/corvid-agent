---
spec: plugins.spec.md
---

## Active Tasks

- [ ] Plugin system MVP: implement plugin install/enable/disable API routes and wire `PluginRegistry` into MCP tool dispatch (#1489)
- [ ] Add plugin management UI to the Settings > Integrations panel: list installed plugins, granted capabilities, and load status (#1623)
- [ ] Document the plugin authoring contract and publish an example plugin package to npm
- [ ] Sandbox plugin `fs:project-dir` access using Bun's built-in permission model

## Completed Tasks

- [x] `PluginRegistry` with load/unload lifecycle and `onLoad`/`onUnload` hooks
- [x] Capability-based permission model: `db:read`, `network:outbound`, `fs:project-dir`, `agent:read`, `session:read`
- [x] Tool namespacing: `corvid_plugin_<pluginname>_<toolname>`
- [x] 30-second execution timeout via `Promise.race`
- [x] `grantCapability` / `revokeCapability` persisted to `plugin_capabilities` table
- [x] `isValidPluginName` and `validateManifest` validation
