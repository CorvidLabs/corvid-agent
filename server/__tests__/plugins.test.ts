import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    getPlugin,
    listPlugins,
    deletePlugin,
    getPluginCapabilities,
    setPluginStatus,
} from '../db/plugins';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

function insertPlugin(name: string, overrides: Record<string, string> = {}) {
    db.query(`INSERT INTO plugins (name, package_name, version, description, author, capabilities, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        name,
        overrides.packageName ?? `@corvid/${name}`,
        overrides.version ?? '1.0.0',
        overrides.description ?? `Plugin ${name}`,
        overrides.author ?? 'corvid',
        overrides.capabilities ?? '["db:read"]',
        overrides.status ?? 'active',
    );
}

function insertCapability(pluginName: string, capability: string, granted: boolean) {
    db.query(`INSERT INTO plugin_capabilities (plugin_name, capability, granted, granted_at)
              VALUES (?, ?, ?, ?)`).run(
        pluginName,
        capability,
        granted ? 1 : 0,
        granted ? new Date().toISOString() : null,
    );
}

// ── getPlugin / listPlugins ──────────────────────────────────────────

describe('getPlugin and listPlugins', () => {
    test('getPlugin returns plugin by name', () => {
        insertPlugin('test-plugin');
        const plugin = getPlugin(db, 'test-plugin');
        expect(plugin).not.toBeNull();
        expect(plugin!.name).toBe('test-plugin');
        expect(plugin!.version).toBe('1.0.0');
        expect(plugin!.status).toBe('active');
    });

    test('getPlugin returns null for unknown', () => {
        expect(getPlugin(db, 'nonexistent')).toBeNull();
    });

    test('listPlugins returns all plugins', () => {
        insertPlugin('plugin-a');
        insertPlugin('plugin-b');
        expect(listPlugins(db)).toHaveLength(2);
    });

    test('listPlugins returns empty when none', () => {
        expect(listPlugins(db)).toHaveLength(0);
    });
});

// ── deletePlugin ─────────────────────────────────────────────────────

describe('deletePlugin', () => {
    test('deletes existing plugin', () => {
        insertPlugin('test-plugin');
        expect(deletePlugin(db, 'test-plugin')).toBe(true);
        expect(getPlugin(db, 'test-plugin')).toBeNull();
    });

    test('returns false for unknown plugin', () => {
        expect(deletePlugin(db, 'nonexistent')).toBe(false);
    });

    test('cascades to plugin_capabilities', () => {
        insertPlugin('test-plugin');
        insertCapability('test-plugin', 'db:read', true);
        deletePlugin(db, 'test-plugin');
        expect(getPluginCapabilities(db, 'test-plugin')).toHaveLength(0);
    });
});

// ── getPluginCapabilities ────────────────────────────────────────────

describe('getPluginCapabilities', () => {
    test('returns capabilities for plugin', () => {
        insertPlugin('test-plugin');
        insertCapability('test-plugin', 'db:read', true);
        insertCapability('test-plugin', 'network:outbound', false);

        const caps = getPluginCapabilities(db, 'test-plugin');
        expect(caps).toHaveLength(2);

        const granted = caps.find(c => c.capability === 'db:read');
        expect(granted!.granted).toBeTruthy();
        // Raw SQLite returns snake_case column names
        expect((granted as Record<string, unknown>).granted_at).toBeTruthy();

        const denied = caps.find(c => c.capability === 'network:outbound');
        expect(denied!.granted).toBeFalsy();
    });

    test('returns empty for unknown plugin', () => {
        expect(getPluginCapabilities(db, 'nonexistent')).toHaveLength(0);
    });
});

// ── setPluginStatus ──────────────────────────────────────────────────

describe('setPluginStatus', () => {
    test('updates status', () => {
        insertPlugin('test-plugin');
        expect(setPluginStatus(db, 'test-plugin', 'disabled')).toBe(true);
        expect(getPlugin(db, 'test-plugin')!.status).toBe('disabled');
    });

    test('returns false for unknown plugin', () => {
        expect(setPluginStatus(db, 'nonexistent', 'disabled')).toBe(false);
    });
});
