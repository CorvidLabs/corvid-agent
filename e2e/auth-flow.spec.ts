import { test, expect , authedFetch } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

test.describe('Auth Flow — Device Authorization', () => {
    test('POST /api/auth/device initiates device auth flow', async ({}) => {
        const res = await authedFetch(`${BASE_URL}/api/auth/device`, { method: 'POST' });
        expect(res.ok).toBe(true);
        const data = await res.json();

        expect(data.deviceCode).toBeTruthy();
        expect(typeof data.deviceCode).toBe('string');
        expect(data.userCode).toBeTruthy();
        expect(typeof data.userCode).toBe('string');
        expect(data.userCode.length).toBe(8);
        expect(data.verificationUrl).toContain('/api/auth/verify');
        expect(typeof data.expiresIn).toBe('number');
        expect(data.expiresIn).toBeGreaterThan(0);
        expect(typeof data.interval).toBe('number');
    });

    test('POST /api/auth/device/token returns pending for new device code', async ({}) => {
        // First initiate a device auth
        const initRes = await authedFetch(`${BASE_URL}/api/auth/device`, { method: 'POST' });
        const { deviceCode } = await initRes.json();

        // Poll for token — should be pending
        const tokenRes = await authedFetch(`${BASE_URL}/api/auth/device/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceCode }),
        });
        expect(tokenRes.status).toBe(400);
        const data = await tokenRes.json();
        expect(data.error).toBe('authorization_pending');
    });

    test('POST /api/auth/device/token rejects missing deviceCode', async ({}) => {
        const res = await authedFetch(`${BASE_URL}/api/auth/device/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
    });

    test('POST /api/auth/device/token rejects invalid deviceCode', async ({}) => {
        const res = await authedFetch(`${BASE_URL}/api/auth/device/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceCode: 'nonexistent-code' }),
        });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe('expired');
    });

    test('full device auth flow: initiate → authorize → get token', async ({}) => {
        // Step 1: Initiate
        const initRes = await authedFetch(`${BASE_URL}/api/auth/device`, { method: 'POST' });
        expect(initRes.ok).toBe(true);
        const { deviceCode, userCode } = await initRes.json();

        // Step 2: Authorize (simulate web UI approval)
        const authRes = await authedFetch(`${BASE_URL}/api/auth/device/authorize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userCode,
                tenantId: 'e2e-tenant',
                email: 'e2e@test.com',
                approve: true,
            }),
        });
        expect(authRes.ok).toBe(true);
        const authData = await authRes.json();
        expect(authData.ok).toBe(true);
        expect(authData.status).toBe('authorized');

        // Step 3: Poll for token — should now succeed
        const tokenRes = await authedFetch(`${BASE_URL}/api/auth/device/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceCode }),
        });
        expect(tokenRes.ok).toBe(true);
        const tokenData = await tokenRes.json();
        expect(tokenData.accessToken).toBeTruthy();
        expect(tokenData.accessToken).toMatch(/^ca_/);
        expect(tokenData.tenantId).toBe('e2e-tenant');
        expect(tokenData.email).toBe('e2e@test.com');
    });

    test('device auth flow: deny prevents token retrieval', async ({}) => {
        // Initiate
        const initRes = await authedFetch(`${BASE_URL}/api/auth/device`, { method: 'POST' });
        const { deviceCode, userCode } = await initRes.json();

        // Deny
        const denyRes = await authedFetch(`${BASE_URL}/api/auth/device/authorize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userCode,
                tenantId: 'e2e-tenant',
                email: 'e2e@test.com',
                approve: false,
            }),
        });
        expect(denyRes.ok).toBe(true);
        const denyData = await denyRes.json();
        expect(denyData.status).toBe('denied');

        // Token poll should return denied
        const tokenRes = await authedFetch(`${BASE_URL}/api/auth/device/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceCode }),
        });
        expect(tokenRes.status).toBe(400);
        const tokenData = await tokenRes.json();
        expect(tokenData.error).toBe('denied');
    });

    test('POST /api/auth/device/authorize rejects missing userCode', async ({}) => {
        const res = await authedFetch(`${BASE_URL}/api/auth/device/authorize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId: 'test', email: 'test@test.com', approve: true }),
        });
        expect(res.status).toBe(400);
    });

    test('POST /api/auth/device/authorize rejects invalid userCode', async ({}) => {
        const res = await authedFetch(`${BASE_URL}/api/auth/device/authorize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userCode: 'INVALID1', tenantId: 'test', email: 'test@test.com', approve: true }),
        });
        expect(res.status).toBe(404);
    });

    test('GET /api/auth/verify returns HTML verification page', async ({}) => {
        const res = await authedFetch(`${BASE_URL}/api/auth/verify?code=TESTCODE`);
        expect(res.ok).toBe(true);
        expect(res.headers.get('content-type')).toContain('text/html');

        const html = await res.text();
        expect(html).toContain('Device Authorization');
        expect(html).toContain('TESTCODE');
        expect(html).toContain('Authorize');
    });

    test('GET /api/auth/verify sanitizes XSS in code param', async ({}) => {
        const res = await authedFetch(`${BASE_URL}/api/auth/verify?code=<script>alert(1)</script>`);
        expect(res.ok).toBe(true);
        const html = await res.text();
        // Code should be empty (fails alphanumeric validation) or escaped
        expect(html).not.toContain('<script>alert(1)</script>');
    });
});
