---
module: db-plugins
version: 1
status: draft
files:
  - server/db/plugins.ts
db_tables:
  - plugins
  - plugin_capabilities
depends_on:
  - server/plugins/types.ts
---

# DB Plugins

## Purpose
Provides CRUD and query operations for the `plugins` and `plugin_capabilities` database tables, exposing functions to look up, list, delete, and update status of registered plugins and their granted capabilities.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getPlugin` | `db: Database, name: string` | `PluginRecord \| null` | Retrieves a single plugin by its unique name, or null if not found. |
| `listPlugins` | `db: Database` | `PluginRecord[]` | Returns all plugins ordered by `loaded_at` descending (most recent first). |
| `deletePlugin` | `db: Database, name: string` | `boolean` | Deletes a plugin by name. Returns true if a row was deleted, false otherwise. Cascades to `plugin_capabilities` via FK. |
| `getPluginCapabilities` | `db: Database, pluginName: string` | `PluginCapabilityRecord[]` | Returns all capability records for a given plugin name. |
| `setPluginStatus` | `db: Database, name: string, status: string` | `boolean` | Updates the status field of a plugin. Returns true if a row was updated, false otherwise. |

### Exported Types
| Type | Description |
|------|-------------|
| (none — types are imported from `server/plugins/types.ts`) | `PluginRecord` and `PluginCapabilityRecord` are defined externally and re-used here. |

## Invariants
1. All functions require a `bun:sqlite` `Database` instance as the first parameter.
2. `getPlugin` and `deletePlugin` match on the `name` primary key exactly.
3. `deletePlugin` returns a boolean based on `changes > 0`, not an error on miss.
4. `setPluginStatus` accepts any string for status (no validation at this layer).
5. `listPlugins` always returns results ordered by `loaded_at DESC`.
6. `getPluginCapabilities` selects only `plugin_name, capability, granted, granted_at` columns (not `SELECT *`).

## Behavioral Examples
### Scenario: Retrieve a loaded plugin
- **Given** a plugin named `"my-tool"` exists in the `plugins` table
- **When** `getPlugin(db, "my-tool")` is called
- **Then** it returns a `PluginRecord` with all columns for that plugin

### Scenario: Delete a plugin with capabilities
- **Given** a plugin `"my-tool"` exists with two entries in `plugin_capabilities`
- **When** `deletePlugin(db, "my-tool")` is called
- **Then** the plugin row is removed, capabilities are cascade-deleted, and the function returns `true`

### Scenario: Disable a plugin
- **Given** a plugin `"my-tool"` exists with status `"active"`
- **When** `setPluginStatus(db, "my-tool", "disabled")` is called
- **Then** the plugin's status column becomes `"disabled"` and the function returns `true`

### Scenario: Query capabilities for a plugin with none granted
- **Given** a plugin `"my-tool"` has no rows in `plugin_capabilities`
- **When** `getPluginCapabilities(db, "my-tool")` is called
- **Then** it returns an empty array

## Error Cases
| Condition | Behavior |
|-----------|----------|
| `getPlugin` with non-existent name | Returns `null` |
| `deletePlugin` with non-existent name | Returns `false` |
| `setPluginStatus` with non-existent name | Returns `false` |
| `getPluginCapabilities` with non-existent plugin | Returns empty array `[]` |
| Database not initialized or table missing | Throws SQLite error (not handled in this module) |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type for all query operations |
| `server/plugins/types.ts` | `PluginRecord`, `PluginCapabilityRecord` type interfaces |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/__tests__/plugins.test.ts` | All five exported functions for unit testing |
| `server/plugins/registry.ts` | Accesses `plugins` table directly via raw SQL rather than importing this module (parallel implementation) |
| `server/routes/plugins.ts` | Uses `PluginRegistry` which reads/writes the same tables |

## Database Tables
### plugins
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| name | TEXT | PRIMARY KEY | Unique plugin identifier |
| package_name | TEXT | NOT NULL | npm package name used to load the plugin |
| version | TEXT | NOT NULL | Semver version string |
| description | TEXT | DEFAULT '' | Human-readable plugin description |
| author | TEXT | DEFAULT '' | Plugin author name |
| capabilities | TEXT | NOT NULL DEFAULT '[]' | JSON array of requested capabilities |
| status | TEXT | DEFAULT 'active' | Plugin status: 'active', 'disabled', or 'error' |
| loaded_at | TEXT | DEFAULT datetime('now') | ISO timestamp of when the plugin was loaded |
| config | TEXT | DEFAULT '{}' | JSON object of plugin configuration |

### plugin_capabilities
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| plugin_name | TEXT | NOT NULL, FK -> plugins(name) ON DELETE CASCADE | References the owning plugin |
| capability | TEXT | NOT NULL | Capability identifier (e.g., 'db:read', 'network:outbound') |
| granted | INTEGER | DEFAULT 0 | Whether the capability is granted (0 = no, 1 = yes) |
| granted_at | TEXT | DEFAULT NULL | ISO timestamp of when the capability was granted |
| | | PRIMARY KEY (plugin_name, capability) | Composite primary key |

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
