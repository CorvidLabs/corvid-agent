/**
 * Tests for tenant middleware — extractTenantId, registerApiKey, revokeApiKey.
 *
 * Validates multi-tenant isolation: API key resolution, header extraction,
 * mismatch rejection (403), and single-tenant bypass.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { extractTenantId, registerApiKey, revokeApiKey } from '../tenant/middleware';
import { TenantService } from '../tenant/context';

function createTestDb(): Database {
    const db = new Database(':memory:');
    db.exec('PRAGMA journal_mode = WAL');

    // Minimal schema for tenant middleware tests
    db.exec(`
        CREATE TABLE tenants (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            owner_email TEXT NOT NULL,
            stripe_customer_id TEXT,
            plan TEXT NOT NULL DEFAULT 'free',
            max_agents INTEGER NOT NULL DEFAULT 3,
            max_concurrent_sessions INTEGER NOT NULL DEFAULT 2,
            sandbox_enabled INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

    db.exec(`
        CREATE TABLE api_keys (
            key_hash TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT 'default',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

    return db;
}

function makeRequest(headers: Record<string, string> = {}): Request {
    return new Request('http://localhost/test', { headers });
}

describe('tenant/middleware', () => {
    let db: Database;

    beforeEach(() => {
        db = createTestDb();
    });

    describe('extractTenantId — single-tenant mode', () => {
        it('returns default context regardless of headers', () => {
            const service = new TenantService(db, false);
            const req = makeRequest({ 'x-tenant-id': 'some-tenant' });

            const result = extractTenantId(req, db, service);
            expect(result).not.toBeInstanceOf(Response);
            expect((result as any).tenantId).toBe('default');
        });

        it('returns enterprise plan in single-tenant mode', () => {
            const service = new TenantService(db, false);
            const result = extractTenantId(makeRequest(), db, service);
            expect((result as any).plan).toBe('enterprise');
        });
    });

    describe('extractTenantId — multi-tenant mode', () => {
        let service: TenantService;

        beforeEach(() => {
            service = new TenantService(db, true);
        });

        it('resolves tenant from X-Tenant-ID header', () => {
            const req = makeRequest({ 'x-tenant-id': 'tenant-abc' });
            const result = extractTenantId(req, db, service);

            expect(result).not.toBeInstanceOf(Response);
            expect((result as any).tenantId).toBe('tenant-abc');
        });

        it('resolves tenant from API key (Bearer token)', () => {
            const apiKey = 'test-api-key-12345';
            registerApiKey(db, 'tenant-from-key', apiKey, 'test-key');

            const req = makeRequest({ authorization: `Bearer ${apiKey}` });
            const result = extractTenantId(req, db, service);

            expect(result).not.toBeInstanceOf(Response);
            expect((result as any).tenantId).toBe('tenant-from-key');
        });

        it('API key takes precedence over header when they agree', () => {
            const apiKey = 'matching-key-67890';
            registerApiKey(db, 'tenant-x', apiKey);

            const req = makeRequest({
                authorization: `Bearer ${apiKey}`,
                'x-tenant-id': 'tenant-x',
            });
            const result = extractTenantId(req, db, service);

            expect(result).not.toBeInstanceOf(Response);
            expect((result as any).tenantId).toBe('tenant-x');
        });

        it('returns 403 when API key tenant and header tenant disagree', () => {
            const apiKey = 'conflict-key-11111';
            registerApiKey(db, 'tenant-a', apiKey);

            const req = makeRequest({
                authorization: `Bearer ${apiKey}`,
                'x-tenant-id': 'tenant-b',
            });
            const result = extractTenantId(req, db, service);

            expect(result).toBeInstanceOf(Response);
            const resp = result as Response;
            expect(resp.status).toBe(403);
        });

        it('returns 403 with JSON error body on mismatch', async () => {
            const apiKey = 'mismatch-key-22222';
            registerApiKey(db, 'alpha', apiKey);

            const req = makeRequest({
                authorization: `Bearer ${apiKey}`,
                'x-tenant-id': 'beta',
            });
            const resp = extractTenantId(req, db, service) as Response;
            const body = await resp.json();
            expect(body.error).toContain('does not match');
        });

        it('falls back to default tenant when no header or API key', () => {
            const result = extractTenantId(makeRequest(), db, service);
            expect(result).not.toBeInstanceOf(Response);
            expect((result as any).tenantId).toBe('default');
        });

        it('ignores non-Bearer auth headers', () => {
            const req = makeRequest({
                authorization: 'Basic dXNlcjpwYXNz',
                'x-tenant-id': 'tenant-via-header',
            });
            const result = extractTenantId(req, db, service);

            expect(result).not.toBeInstanceOf(Response);
            expect((result as any).tenantId).toBe('tenant-via-header');
        });

        it('handles unknown API key gracefully (falls through to header)', () => {
            const req = makeRequest({
                authorization: 'Bearer unknown-key',
                'x-tenant-id': 'fallback-tenant',
            });
            const result = extractTenantId(req, db, service);

            expect(result).not.toBeInstanceOf(Response);
            expect((result as any).tenantId).toBe('fallback-tenant');
        });
    });

    describe('registerApiKey', () => {
        it('registers a key that can be resolved', () => {
            const service = new TenantService(db, true);
            const apiKey = 'register-test-key';
            registerApiKey(db, 'my-tenant', apiKey, 'my-label');

            const req = makeRequest({ authorization: `Bearer ${apiKey}` });
            const result = extractTenantId(req, db, service);
            expect((result as any).tenantId).toBe('my-tenant');
        });

        it('overwrites existing key on re-register (INSERT OR REPLACE)', () => {
            const apiKey = 'overwrite-key';
            registerApiKey(db, 'old-tenant', apiKey);
            registerApiKey(db, 'new-tenant', apiKey);

            const service = new TenantService(db, true);
            const req = makeRequest({ authorization: `Bearer ${apiKey}` });
            const result = extractTenantId(req, db, service);
            expect((result as any).tenantId).toBe('new-tenant');
        });
    });

    describe('revokeApiKey', () => {
        it('returns true when key existed', () => {
            const apiKey = 'revoke-me';
            registerApiKey(db, 'some-tenant', apiKey);
            expect(revokeApiKey(db, apiKey)).toBe(true);
        });

        it('returns false when key did not exist', () => {
            expect(revokeApiKey(db, 'nonexistent-key')).toBe(false);
        });

        it('key is no longer resolvable after revocation', () => {
            const service = new TenantService(db, true);
            const apiKey = 'revoked-key';
            registerApiKey(db, 'tenant-z', apiKey);
            revokeApiKey(db, apiKey);

            const req = makeRequest({ authorization: `Bearer ${apiKey}` });
            const result = extractTenantId(req, db, service);
            // Should fall through to default since key is revoked
            expect((result as any).tenantId).toBe('default');
        });
    });
});
