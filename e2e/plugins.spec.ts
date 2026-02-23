import { test, expect } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

test.describe('Plugin System API', () => {
    test('GET /api/plugins returns plugin list or 503 if unavailable', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/plugins`);
        // Accept 200 (plugins available) or 503 (plugin system not initialized)
        expect([200, 503]).toContain(res.status);

        if (res.status === 200) {
            const data = await res.json();
            expect(data.loaded).toBeDefined();
            expect(Array.isArray(data.loaded)).toBe(true);
            expect(data.all).toBeDefined();
            expect(Array.isArray(data.all)).toBe(true);
        } else {
            const data = await res.json();
            expect(data.error).toContain('not available');
        }
    });

    test('POST /api/plugins/load rejects missing packageName', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/plugins/load`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        // 400 (validation error) or 503 (plugin system not available)
        expect([400, 503]).toContain(res.status);
    });

    test('POST /api/plugins/load rejects nonexistent package', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/plugins/load`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packageName: 'nonexistent-e2e-plugin-9999' }),
        });
        // 400 (load failed) or 503 (plugin system not available)
        expect([400, 503]).toContain(res.status);
    });

    test('POST /api/plugins/:name/unload returns 404 for unknown plugin', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/plugins/nonexistent-plugin/unload`, {
            method: 'POST',
        });
        // 404 (not found) or 503 (plugin system not available)
        expect([404, 503]).toContain(res.status);
    });

    test('POST /api/plugins/:name/grant rejects invalid capability', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/plugins/test-plugin/grant`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ capability: 'invalid:capability' }),
        });
        // 400 (invalid capability) or 503 (plugin system not available)
        expect([400, 503]).toContain(res.status);

        if (res.status === 400) {
            const data = await res.json();
            expect(data.error).toContain('Invalid capability');
        }
    });

    test('POST /api/plugins/:name/grant accepts valid capability names', async ({}) => {
        const validCapabilities = ['db:read', 'network:outbound', 'fs:project-dir', 'agent:read', 'session:read'];

        for (const cap of validCapabilities) {
            const res = await fetch(`${BASE_URL}/api/plugins/e2e-test-plugin/grant`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ capability: cap }),
            });
            // 200 (granted) or 503 (plugin system not available)
            expect([200, 503]).toContain(res.status);

            if (res.status === 200) {
                const data = await res.json();
                expect(data.ok).toBe(true);
            }
        }
    });

    test('POST /api/plugins/:name/revoke rejects invalid capability', async ({}) => {
        const res = await fetch(`${BASE_URL}/api/plugins/test-plugin/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ capability: 'bogus:cap' }),
        });
        // 400 (invalid) or 503 (not available)
        expect([400, 503]).toContain(res.status);
    });
});
