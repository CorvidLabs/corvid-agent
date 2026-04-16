---
spec: plugins.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/plugin-loader.test.ts` | Unit | `loadPluginFromPackage` happy path, missing export, invalid manifest, missing tools array, bad tool fields, dynamic import failure |
| `server/__tests__/plugin-permissions.test.ts` | Unit | `isValidCapability`, `validateCapabilities`, `grantCapability`, `revokeCapability`, `hasCapability`, `getGrantedCapabilities` DB interactions |
| `server/__tests__/plugin-registry.test.ts` | Unit | `loadPlugin` with/without auto-grant, `unloadPlugin`, `executeTool` timeout/missing-capabilities/handler-throws, `getPluginTools` namespacing, `isLoaded`, `listAllPlugins` |
| `server/__tests__/plugins.test.ts` | Integration | Full plugin lifecycle via DB, capability enforcement end-to-end |
| `server/__tests__/routes-plugins.test.ts` | Integration | REST endpoints: load, unload, list, capability grant/revoke |

## Manual Testing

- [ ] Load a minimal valid npm package that exports a `CorvidPlugin` and confirm it appears in `GET /api/plugins`
- [ ] Call `executeTool` for a loaded plugin tool without granting its required capabilities and confirm the error message names the missing capability
- [ ] Verify that `buildPluginToolName('my-plugin', 'fetch-data')` returns `corvid_plugin_my_plugin_fetch_data`
- [ ] Load a plugin that takes longer than 30 seconds in its handler and confirm timeout error is returned
- [ ] Call `unloadPlugin` and confirm the plugin is no longer in `getLoadedPlugins` and DB status is `'disabled'`

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Plugin name with uppercase letters | `isValidPluginName` returns false; `validateManifest` reports error |
| Plugin name exactly 50 characters | Valid |
| Plugin name 51 characters | `isValidPluginName` returns false |
| Duplicate plugin load attempt | `loadPlugin` returns `{ success: false, error: '...already loaded' }` |
| `onLoad` hook throws | `loadPlugin` returns `{ success: false, error: 'onLoad failed: ...' }` |
| `onUnload` hook throws during unload | Plugin still removed; warning logged |
| Tool not found during `executeTool` | Returns `{ result: '', error: 'Tool ... not found in any loaded plugin' }` |
| All manifest capabilities are invalid strings | `validateManifest` reports all as invalid |
| Dynamic `import()` fails (package not installed) | `loadPluginFromPackage` returns `{ success: false, error: 'Failed to import ...' }` |
| Plugin exports both `default` and named `plugin` | `default` export takes precedence |
