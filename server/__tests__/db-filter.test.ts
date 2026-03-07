import { describe, test, expect, beforeEach } from 'bun:test';
import {
    withTenantFilter,
    enableMultiTenantGuard,
    resetMultiTenantGuard,
    validateTenantOwnership,
    TENANT_SCOPED_TABLES,
} from '../tenant/db-filter';
import { DEFAULT_TENANT_ID } from '../tenant/types';
import { Database } from 'bun:sqlite';

describe('withTenantFilter', () => {
    beforeEach(() => {
        resetMultiTenantGuard();
    });

    test('returns query unchanged for DEFAULT_TENANT_ID', () => {
        const result = withTenantFilter('SELECT * FROM agents', DEFAULT_TENANT_ID);
        expect(result.query).toBe('SELECT * FROM agents');
        expect(result.bindings).toEqual([]);
    });

    test('appends WHERE clause when no WHERE exists', () => {
        const result = withTenantFilter('SELECT * FROM agents', 'tenant-1');
        expect(result.query).toBe('SELECT * FROM agents WHERE tenant_id = ?');
        expect(result.bindings).toEqual(['tenant-1']);
    });

    test('appends AND clause when WHERE already exists', () => {
        const result = withTenantFilter('SELECT * FROM agents WHERE name = ?', 'tenant-2');
        expect(result.query).toBe('SELECT * FROM agents WHERE name = ? AND tenant_id = ?');
        expect(result.bindings).toEqual(['tenant-2']);
    });

    test('inserts before ORDER BY', () => {
        const result = withTenantFilter('SELECT * FROM agents ORDER BY name', 'tenant-3');
        expect(result.query).toBe('SELECT * FROM agents WHERE tenant_id = ? ORDER BY name');
        expect(result.bindings).toEqual(['tenant-3']);
    });

    test('inserts before LIMIT', () => {
        const result = withTenantFilter('SELECT * FROM agents WHERE active = 1 LIMIT 10', 'tenant-4');
        expect(result.query).toBe('SELECT * FROM agents WHERE active = 1 AND tenant_id = ? LIMIT 10');
        expect(result.bindings).toEqual(['tenant-4']);
    });

    test('inserts before GROUP BY', () => {
        const result = withTenantFilter('SELECT status, COUNT(*) FROM work_tasks GROUP BY status', 'tenant-5');
        expect(result.query).toBe('SELECT status, COUNT(*) FROM work_tasks WHERE tenant_id = ? GROUP BY status');
        expect(result.bindings).toEqual(['tenant-5']);
    });
});

describe('multi-tenant guard', () => {
    beforeEach(() => {
        resetMultiTenantGuard();
    });

    test('withTenantFilter throws for DEFAULT_TENANT_ID when guard is enabled', () => {
        enableMultiTenantGuard();
        expect(() => withTenantFilter('SELECT * FROM agents', DEFAULT_TENANT_ID)).toThrow(
            /DEFAULT_TENANT_ID is not allowed/,
        );
    });

    test('withTenantFilter works for non-default tenant when guard is enabled', () => {
        enableMultiTenantGuard();
        const result = withTenantFilter('SELECT * FROM agents', 'real-tenant');
        expect(result.bindings).toEqual(['real-tenant']);
    });
});

describe('validateTenantOwnership', () => {
    let db: Database;

    beforeEach(() => {
        resetMultiTenantGuard();
        db = new Database(':memory:');
        db.exec(`
            CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                name TEXT,
                tenant_id TEXT DEFAULT 'default'
            );
            INSERT INTO projects (id, name, tenant_id) VALUES ('p1', 'Project A', 'tenant-a');
            INSERT INTO projects (id, name, tenant_id) VALUES ('p2', 'Project B', 'tenant-b');
        `);
    });

    test('returns true for DEFAULT_TENANT_ID (backwards compat)', () => {
        expect(validateTenantOwnership(db, 'projects', 'p1', DEFAULT_TENANT_ID)).toBe(true);
    });

    test('returns true when resource belongs to tenant', () => {
        expect(validateTenantOwnership(db, 'projects', 'p1', 'tenant-a')).toBe(true);
    });

    test('returns false when resource belongs to different tenant', () => {
        expect(validateTenantOwnership(db, 'projects', 'p1', 'tenant-b')).toBe(false);
    });

    test('returns false for non-existent resource', () => {
        expect(validateTenantOwnership(db, 'projects', 'p999', 'tenant-a')).toBe(false);
    });

    test('rejects table not in TENANT_SCOPED_TABLES', () => {
        expect(() =>
            validateTenantOwnership(db, 'evil_table', 'p1', 'tenant-a'),
        ).toThrow(/not in TENANT_SCOPED_TABLES/);
    });

    test('rejects invalid idColumn to prevent SQL injection', () => {
        expect(() =>
            validateTenantOwnership(db, 'projects', 'p1', 'tenant-a', 'id; DROP TABLE projects'),
        ).toThrow(/invalid idColumn/);
    });

    test('throws for DEFAULT_TENANT_ID when guard is enabled', () => {
        enableMultiTenantGuard();
        expect(() =>
            validateTenantOwnership(db, 'projects', 'p1', DEFAULT_TENANT_ID),
        ).toThrow(/DEFAULT_TENANT_ID is not allowed/);
    });
});

describe('TENANT_SCOPED_TABLES', () => {
    test('contains expected core tables', () => {
        expect(TENANT_SCOPED_TABLES).toContain('projects');
        expect(TENANT_SCOPED_TABLES).toContain('agents');
        expect(TENANT_SCOPED_TABLES).toContain('sessions');
        expect(TENANT_SCOPED_TABLES).toContain('work_tasks');
    });
});
