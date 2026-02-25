import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handlePluginRoutes } from '../routes/plugins';
import type { PluginRegistry } from '../plugins/registry';

let db: Database;

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

function createMockRegistry(overrides?: Partial<PluginRegistry>): PluginRegistry {
    return {
        getLoadedPlugins: mock(() => [
            { name: 'test-plugin', version: '1.0.0', description: 'A test plugin' },
        ]),
        listAllPlugins: mock(() => [
            { name: 'test-plugin', packageName: 'test-plugin', version: '1.0.0', status: 'active' },
        ]),
        loadPlugin: mock(() => Promise.resolve({ success: true })),
        unloadPlugin: mock(() => Promise.resolve({ success: true })),
        ...overrides,
    } as unknown as PluginRegistry;
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    // Seed a plugin row so grant/revoke have something to reference
    db.query(
        "INSERT INTO plugins (name, package_name, version) VALUES ('test-plugin', 'test-plugin', '1.0.0')",
    ).run();
});

afterAll(() => db.close());

describe('Plugin Routes', () => {
    it('returns 503 when plugin registry is null', async () => {
        const { req, url } = fakeReq('GET', '/api/plugins');
        const res = await handlePluginRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
        const data = await res!.json();
        expect(data.error).toContain('not available');
    });

    it('returns null for non-plugin paths when registry is null', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handlePluginRoutes(req, url, db, null);
        expect(res).toBeNull();
    });

    it('GET /api/plugins lists all plugins', async () => {
        const registry = createMockRegistry();
        const { req, url } = fakeReq('GET', '/api/plugins');
        const res = await handlePluginRoutes(req, url, db, registry);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.loaded).toBeDefined();
        expect(data.all).toBeDefined();
        expect(data.loaded.length).toBe(1);
    });

    it('POST /api/plugins/load loads a plugin', async () => {
        const registry = createMockRegistry();
        const { req, url } = fakeReq('POST', '/api/plugins/load', { packageName: 'my-plugin' });
        const res = await handlePluginRoutes(req, url, db, registry);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.ok).toBe(true);
        expect(registry.loadPlugin).toHaveBeenCalledWith('my-plugin', false);
    });

    it('POST /api/plugins/load rejects missing packageName', async () => {
        const registry = createMockRegistry();
        const { req, url } = fakeReq('POST', '/api/plugins/load', {});
        const res = await handlePluginRoutes(req, url, db, registry);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toContain('packageName');
    });

    it('POST /api/plugins/:name/unload unloads a plugin', async () => {
        const registry = createMockRegistry();
        const { req, url } = fakeReq('POST', '/api/plugins/test-plugin/unload');
        const res = await handlePluginRoutes(req, url, db, registry);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.ok).toBe(true);
        expect(registry.unloadPlugin).toHaveBeenCalledWith('test-plugin');
    });

    it('POST /api/plugins/:name/grant grants a capability', async () => {
        const registry = createMockRegistry();
        const { req, url } = fakeReq('POST', '/api/plugins/test-plugin/grant', { capability: 'db:read' });
        const res = await handlePluginRoutes(req, url, db, registry);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.ok).toBe(true);
        expect(data.message).toContain('db:read');
    });

    it('POST /api/plugins/:name/grant rejects invalid capability', async () => {
        const registry = createMockRegistry();
        const { req, url } = fakeReq('POST', '/api/plugins/test-plugin/grant', { capability: 'invalid:cap' });
        const res = await handlePluginRoutes(req, url, db, registry);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toContain('capability');
    });

    it('returns null for unmatched paths with registry present', () => {
        const registry = createMockRegistry();
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handlePluginRoutes(req, url, db, registry);
        expect(res).toBeNull();
    });
});
