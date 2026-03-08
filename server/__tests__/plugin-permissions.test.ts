/**
 * Tests for plugin permissions — capability validation, grant/revoke lifecycle,
 * and sandbox enforcement.
 *
 * Uses in-memory SQLite with the plugin_capabilities schema.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
    isValidCapability,
    validateCapabilities,
    getGrantedCapabilities,
    grantCapability,
    revokeCapability,
    grantAllCapabilities,
    hasCapability,
} from '../plugins/permissions';

function createTestDb(): Database {
    const db = new Database(':memory:');
    db.exec('PRAGMA journal_mode = WAL');

    db.exec(`
        CREATE TABLE plugin_capabilities (
            plugin_name TEXT NOT NULL,
            capability TEXT NOT NULL,
            granted INTEGER NOT NULL DEFAULT 0,
            granted_at TEXT,
            PRIMARY KEY (plugin_name, capability)
        )
    `);

    return db;
}

describe('plugins/permissions', () => {
    let db: Database;

    beforeEach(() => {
        db = createTestDb();
    });

    describe('isValidCapability', () => {
        it('accepts all defined capabilities', () => {
            expect(isValidCapability('db:read')).toBe(true);
            expect(isValidCapability('network:outbound')).toBe(true);
            expect(isValidCapability('fs:project-dir')).toBe(true);
            expect(isValidCapability('agent:read')).toBe(true);
            expect(isValidCapability('session:read')).toBe(true);
        });

        it('rejects unknown capabilities', () => {
            expect(isValidCapability('db:write')).toBe(false);
            expect(isValidCapability('network:inbound')).toBe(false);
            expect(isValidCapability('fs:root')).toBe(false);
            expect(isValidCapability('')).toBe(false);
            expect(isValidCapability('admin:all')).toBe(false);
        });
    });

    describe('validateCapabilities', () => {
        it('separates valid from invalid capabilities', () => {
            const result = validateCapabilities([
                'db:read',
                'fs:root',
                'network:outbound',
                'unknown',
            ]);
            expect(result.valid).toEqual(['db:read', 'network:outbound']);
            expect(result.invalid).toEqual(['fs:root', 'unknown']);
        });

        it('returns all valid when input is clean', () => {
            const result = validateCapabilities(['db:read', 'agent:read']);
            expect(result.valid).toEqual(['db:read', 'agent:read']);
            expect(result.invalid).toEqual([]);
        });

        it('returns all invalid for unknown capabilities', () => {
            const result = validateCapabilities(['foo', 'bar']);
            expect(result.valid).toEqual([]);
            expect(result.invalid).toEqual(['foo', 'bar']);
        });

        it('handles empty input', () => {
            const result = validateCapabilities([]);
            expect(result.valid).toEqual([]);
            expect(result.invalid).toEqual([]);
        });
    });

    describe('grantCapability / hasCapability', () => {
        it('grants a capability that can be checked', () => {
            grantCapability(db, 'my-plugin', 'db:read');
            expect(hasCapability(db, 'my-plugin', 'db:read')).toBe(true);
        });

        it('returns false for ungranted capability', () => {
            expect(hasCapability(db, 'my-plugin', 'db:read')).toBe(false);
        });

        it('returns false for different plugin', () => {
            grantCapability(db, 'plugin-a', 'db:read');
            expect(hasCapability(db, 'plugin-b', 'db:read')).toBe(false);
        });

        it('idempotent — granting twice does not error', () => {
            grantCapability(db, 'my-plugin', 'db:read');
            grantCapability(db, 'my-plugin', 'db:read');
            expect(hasCapability(db, 'my-plugin', 'db:read')).toBe(true);
        });
    });

    describe('revokeCapability', () => {
        it('revokes a previously granted capability', () => {
            grantCapability(db, 'my-plugin', 'network:outbound');
            expect(hasCapability(db, 'my-plugin', 'network:outbound')).toBe(true);

            revokeCapability(db, 'my-plugin', 'network:outbound');
            expect(hasCapability(db, 'my-plugin', 'network:outbound')).toBe(false);
        });

        it('revoking non-existent capability does not error', () => {
            // Should not throw
            revokeCapability(db, 'no-plugin', 'db:read');
        });

        it('can re-grant after revocation', () => {
            grantCapability(db, 'my-plugin', 'db:read');
            revokeCapability(db, 'my-plugin', 'db:read');
            expect(hasCapability(db, 'my-plugin', 'db:read')).toBe(false);

            grantCapability(db, 'my-plugin', 'db:read');
            expect(hasCapability(db, 'my-plugin', 'db:read')).toBe(true);
        });
    });

    describe('grantAllCapabilities', () => {
        it('grants multiple capabilities at once', () => {
            grantAllCapabilities(db, 'multi-plugin', ['db:read', 'agent:read', 'session:read']);

            expect(hasCapability(db, 'multi-plugin', 'db:read')).toBe(true);
            expect(hasCapability(db, 'multi-plugin', 'agent:read')).toBe(true);
            expect(hasCapability(db, 'multi-plugin', 'session:read')).toBe(true);
            expect(hasCapability(db, 'multi-plugin', 'network:outbound')).toBe(false);
        });

        it('handles empty array', () => {
            grantAllCapabilities(db, 'empty-plugin', []);
            expect(getGrantedCapabilities(db, 'empty-plugin')).toEqual([]);
        });
    });

    describe('getGrantedCapabilities', () => {
        it('returns all granted capabilities for a plugin', () => {
            grantCapability(db, 'p1', 'db:read');
            grantCapability(db, 'p1', 'network:outbound');
            grantCapability(db, 'p1', 'fs:project-dir');

            const caps = getGrantedCapabilities(db, 'p1');
            expect(caps).toContain('db:read');
            expect(caps).toContain('network:outbound');
            expect(caps).toContain('fs:project-dir');
            expect(caps.length).toBe(3);
        });

        it('excludes revoked capabilities', () => {
            grantCapability(db, 'p1', 'db:read');
            grantCapability(db, 'p1', 'network:outbound');
            revokeCapability(db, 'p1', 'db:read');

            const caps = getGrantedCapabilities(db, 'p1');
            expect(caps).toEqual(['network:outbound']);
        });

        it('returns empty array for unknown plugin', () => {
            expect(getGrantedCapabilities(db, 'unknown')).toEqual([]);
        });

        it('isolates capabilities between plugins', () => {
            grantCapability(db, 'p1', 'db:read');
            grantCapability(db, 'p2', 'network:outbound');

            expect(getGrantedCapabilities(db, 'p1')).toEqual(['db:read']);
            expect(getGrantedCapabilities(db, 'p2')).toEqual(['network:outbound']);
        });
    });
});
