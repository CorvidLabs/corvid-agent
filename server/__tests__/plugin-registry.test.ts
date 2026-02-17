import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { PluginRegistry } from '../plugins/registry';
import { grantCapability, getGrantedCapabilities, revokeCapability, hasCapability, validateCapabilities, isValidCapability } from '../plugins/permissions';

// ─── DB Setup ───────────────────────────────────────────────────────────────

let db: Database;

function setupDb(): Database {
    const d = new Database(':memory:');
    runMigrations(d);

    // Migration 39 tables (manually created for testing since schema.ts is protected)
    d.exec(`
        CREATE TABLE IF NOT EXISTS plugins (
            name TEXT PRIMARY KEY,
            package_name TEXT NOT NULL,
            version TEXT NOT NULL,
            description TEXT DEFAULT '',
            author TEXT DEFAULT '',
            capabilities TEXT NOT NULL DEFAULT '[]',
            status TEXT DEFAULT 'active',
            loaded_at TEXT DEFAULT (datetime('now')),
            config TEXT DEFAULT '{}'
        )
    `);
    d.exec(`
        CREATE TABLE IF NOT EXISTS plugin_capabilities (
            plugin_name TEXT NOT NULL,
            capability TEXT NOT NULL,
            granted INTEGER DEFAULT 0,
            granted_at TEXT DEFAULT NULL,
            PRIMARY KEY (plugin_name, capability)
        )
    `);

    return d;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Plugin Permissions', () => {
    beforeEach(() => {
        db = setupDb();
    });

    test('isValidCapability accepts valid capabilities', () => {
        expect(isValidCapability('db:read')).toBe(true);
        expect(isValidCapability('network:outbound')).toBe(true);
        expect(isValidCapability('fs:project-dir')).toBe(true);
        expect(isValidCapability('agent:read')).toBe(true);
        expect(isValidCapability('session:read')).toBe(true);
    });

    test('isValidCapability rejects invalid capabilities', () => {
        expect(isValidCapability('admin:all')).toBe(false);
        expect(isValidCapability('db:write')).toBe(false);
        expect(isValidCapability('')).toBe(false);
    });

    test('validateCapabilities separates valid and invalid', () => {
        const result = validateCapabilities(['db:read', 'bad:cap', 'network:outbound']);
        expect(result.valid).toEqual(['db:read', 'network:outbound']);
        expect(result.invalid).toEqual(['bad:cap']);
    });

    test('grantCapability and getGrantedCapabilities', () => {
        grantCapability(db, 'test-plugin', 'db:read');
        grantCapability(db, 'test-plugin', 'network:outbound');

        const caps = getGrantedCapabilities(db, 'test-plugin');
        expect(caps).toContain('db:read');
        expect(caps).toContain('network:outbound');
        expect(caps.length).toBe(2);
    });

    test('revokeCapability removes capability', () => {
        grantCapability(db, 'test-plugin', 'db:read');
        expect(hasCapability(db, 'test-plugin', 'db:read')).toBe(true);

        revokeCapability(db, 'test-plugin', 'db:read');
        expect(hasCapability(db, 'test-plugin', 'db:read')).toBe(false);
    });

    test('hasCapability returns false for non-existent', () => {
        expect(hasCapability(db, 'nonexistent', 'db:read')).toBe(false);
    });

    test('grantCapability is idempotent', () => {
        grantCapability(db, 'test-plugin', 'db:read');
        grantCapability(db, 'test-plugin', 'db:read');

        const caps = getGrantedCapabilities(db, 'test-plugin');
        expect(caps.length).toBe(1);
    });
});

describe('Plugin Registry', () => {
    beforeEach(() => {
        db = setupDb();
    });

    test('starts with no loaded plugins', () => {
        const registry = new PluginRegistry(db);
        expect(registry.getLoadedPlugins()).toEqual([]);
    });

    test('getPluginTools returns empty when no plugins loaded', () => {
        const registry = new PluginRegistry(db);
        expect(registry.getPluginTools()).toEqual([]);
    });

    test('isLoaded returns false for unknown plugin', () => {
        const registry = new PluginRegistry(db);
        expect(registry.isLoaded('nonexistent')).toBe(false);
    });

    test('getPlugin returns undefined for unknown plugin', () => {
        const registry = new PluginRegistry(db);
        expect(registry.getPlugin('nonexistent')).toBeUndefined();
    });

    test('loadPlugin fails for nonexistent package', async () => {
        const registry = new PluginRegistry(db);
        const result = await registry.loadPlugin('@corvid-plugin/definitely-does-not-exist');
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });

    test('unloadPlugin fails for non-loaded plugin', async () => {
        const registry = new PluginRegistry(db);
        const result = await registry.unloadPlugin('nonexistent');
        expect(result.success).toBe(false);
        expect(result.error).toContain('not loaded');
    });

    test('executeTool fails for non-existent tool', async () => {
        const registry = new PluginRegistry(db);
        const result = await registry.executeTool('corvid_plugin_test_nope', {}, {
            agentId: 'agent-1',
            sessionId: 'session-1',
            grantedCapabilities: [],
        });
        expect(result.error).toContain('not found');
    });

    test('listAllPlugins returns DB records', () => {
        const registry = new PluginRegistry(db);

        // Insert a test record directly
        db.query(`
            INSERT INTO plugins (name, package_name, version, description, author, capabilities, status)
            VALUES ('test-plugin', '@corvid-plugin/test', '1.0.0', 'Test', 'Tester', '["db:read"]', 'active')
        `).run();

        const all = registry.listAllPlugins();
        expect(all.length).toBe(1);
        expect(all[0].name).toBe('test-plugin');
    });
});
