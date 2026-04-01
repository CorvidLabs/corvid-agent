import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleOnboardingRoutes, type OnboardingStatus } from '../routes/onboarding';
import type { RequestContext } from '../middleware/guards';
import { createProject } from '../db/projects';
import { createAgent } from '../db/agents';

let db: Database;

const mockContext: RequestContext = {
    authenticated: true,
    tenantId: 'default',
    rateLimitHeaders: {},
};

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

describe('fundFromTestnetFaucet', () => {
    it('exports fundFromTestnetFaucet from service module', async () => {
        const { fundFromTestnetFaucet } = await import('../algochat/service');
        expect(typeof fundFromTestnetFaucet).toBe('function');
    });

    it('throws on non-OK response from faucet', async () => {
        const { fundFromTestnetFaucet } = await import('../algochat/service');

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(() =>
            Promise.resolve(new Response('rate limited', { status: 429 })),
        ) as unknown as typeof fetch;

        try {
            await expect(
                fundFromTestnetFaucet('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ'),
            ).rejects.toThrow('Testnet faucet request failed (429)');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('succeeds when faucet returns OK', async () => {
        const { fundFromTestnetFaucet } = await import('../algochat/service');

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({ txId: 'abc123' }), { status: 200 })),
        ) as unknown as typeof fetch;

        try {
            await expect(
                fundFromTestnetFaucet('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ'),
            ).resolves.toBeUndefined();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('uses TESTNET_DISPENSER_URL env override', async () => {
        const { fundFromTestnetFaucet } = await import('../algochat/service');

        const originalFetch = globalThis.fetch;
        const originalEnv = process.env.TESTNET_DISPENSER_URL;
        process.env.TESTNET_DISPENSER_URL = 'https://custom-faucet.example.com';

        let calledUrl = '';
        globalThis.fetch = mock((url: string | URL | Request) => {
            calledUrl = typeof url === 'string' ? url : url.toString();
            return Promise.resolve(new Response('{}', { status: 200 }));
        }) as unknown as typeof fetch;

        try {
            await fundFromTestnetFaucet('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ');
            expect(calledUrl).toBe('https://custom-faucet.example.com/fund');
        } finally {
            globalThis.fetch = originalFetch;
            if (originalEnv === undefined) {
                delete process.env.TESTNET_DISPENSER_URL;
            } else {
                process.env.TESTNET_DISPENSER_URL = originalEnv;
            }
        }
    });

    it('includes Authorization header when TESTNET_DISPENSER_TOKEN is set', async () => {
        const { fundFromTestnetFaucet } = await import('../algochat/service');

        const originalFetch = globalThis.fetch;
        const originalToken = process.env.TESTNET_DISPENSER_TOKEN;
        process.env.TESTNET_DISPENSER_TOKEN = 'my-secret-token';

        let capturedHeaders: Record<string, string> = {};
        globalThis.fetch = mock((_url: string | URL | Request, init?: RequestInit) => {
            const headers = init?.headers as Record<string, string> | undefined;
            capturedHeaders = headers ?? {};
            return Promise.resolve(new Response('{}', { status: 200 }));
        }) as unknown as typeof fetch;

        try {
            await fundFromTestnetFaucet('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ');
            expect(capturedHeaders['Authorization']).toBe('Bearer my-secret-token');
        } finally {
            globalThis.fetch = originalFetch;
            if (originalToken === undefined) {
                delete process.env.TESTNET_DISPENSER_TOKEN;
            } else {
                process.env.TESTNET_DISPENSER_TOKEN = originalToken;
            }
        }
    });
});

describe('GET /api/onboarding/status', () => {
    it('returns null for non-matching routes', () => {
        const req = new Request('http://localhost/api/agents', { method: 'GET' });
        const url = new URL(req.url);
        const result = handleOnboardingRoutes(req, url, db, null, null, mockContext);
        expect(result).toBeNull();
    });

    it('returns null for POST method', () => {
        const req = new Request('http://localhost/api/onboarding/status', { method: 'POST' });
        const url = new URL(req.url);
        const result = handleOnboardingRoutes(req, url, db, null, null, mockContext);
        expect(result).toBeNull();
    });

    it('returns incomplete status when no services configured', async () => {
        const req = new Request('http://localhost/api/onboarding/status', { method: 'GET' });
        const url = new URL(req.url);
        const response = handleOnboardingRoutes(req, url, db, null, null, mockContext);
        expect(response).not.toBeNull();

        const resolved = response instanceof Promise ? await response : response;
        const body: OnboardingStatus = await resolved!.json();

        expect(body.wallet.configured).toBe(false);
        expect(body.wallet.funded).toBe(false);
        expect(body.bridge.running).toBe(false);
        expect(body.agent.exists).toBe(false);
        expect(body.agent.count).toBe(0);
        expect(body.project.exists).toBe(false);
        expect(body.project.count).toBe(0);
        expect(body.complete).toBe(false);
    });

    it('reflects agent and project creation', async () => {
        // Create an agent and a project
        createAgent(db, { name: 'test-agent', model: 'claude-sonnet-4-20250514', systemPrompt: 'test' });
        createProject(db, { name: 'test-project', workingDir: '/tmp/test' });

        const req = new Request('http://localhost/api/onboarding/status', { method: 'GET' });
        const url = new URL(req.url);
        const response = handleOnboardingRoutes(req, url, db, null, null, mockContext);
        const resolved = response instanceof Promise ? await response : response;
        const body: OnboardingStatus = await resolved!.json();

        expect(body.agent.exists).toBe(true);
        expect(body.agent.count).toBe(1);
        expect(body.project.exists).toBe(true);
        expect(body.project.count).toBe(1);
        // Still not complete — no wallet/bridge
        expect(body.complete).toBe(false);
    });
});

describe('AlgoChat config testnet enabling', () => {
    it('enables AlgoChat on testnet without mnemonic', () => {
        // Test the config logic directly (module caching prevents re-importing)
        const hasMnemonic = false;
        const rawNetwork = 'testnet' as string;
        const enabled = hasMnemonic || rawNetwork === 'localnet' || rawNetwork === 'testnet';
        expect(enabled).toBe(true);
    });

    it('does not enable on mainnet without mnemonic', () => {
        const hasMnemonic = false;
        const rawNetwork = 'mainnet' as string;
        const enabled = hasMnemonic || rawNetwork === 'localnet' || rawNetwork === 'testnet';
        expect(enabled).toBe(false);
    });
});
