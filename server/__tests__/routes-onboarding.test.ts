import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleOnboardingRoutes } from '../routes/onboarding';
import type { RequestContext } from '../middleware/guards';

let db: Database;

const ctx: RequestContext = { authenticated: true, tenantId: 'default' };

function fakeReq(method: string, path: string): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    return { req: new Request(url.toString(), { method }), url };
}

function makeBridge(opts: { address: string | null; balance: number; network: string }) {
    return {
        getStatus: async () => ({
            enabled: true,
            address: opts.address,
            network: opts.network,
            balance: opts.balance,
            syncInterval: 10000,
            activeConversations: 0,
        }),
    } as unknown as import('../algochat/bridge').AlgoChatBridge;
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => db.close());

describe('Onboarding Routes', () => {
    it('returns null for non-onboarding paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleOnboardingRoutes(req, url, db, null, null, ctx);
        expect(res).toBeNull();
    });

    it('returns null for POST /api/onboarding/status', () => {
        const { req, url } = fakeReq('POST', '/api/onboarding/status');
        const res = handleOnboardingRoutes(req, url, db, null, null, ctx);
        expect(res).toBeNull();
    });

    it('GET /api/onboarding/status with no bridge — incomplete state', async () => {
        const { req, url } = fakeReq('GET', '/api/onboarding/status');
        const res = await handleOnboardingRoutes(req, url, db, null, null, ctx);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();

        expect(data.wallet.configured).toBe(false);
        expect(data.wallet.address).toBeNull();
        expect(data.wallet.funded).toBe(false);
        expect(data.bridge.running).toBe(false);
        expect(data.bridge.network).toBeNull();
        expect(data.agent.exists).toBe(false);
        expect(data.agent.count).toBe(0);
        expect(data.project.exists).toBe(false);
        expect(data.project.count).toBe(0);
        expect(data.complete).toBe(false);
    });

    it('GET /api/onboarding/status with funded bridge but no agents/projects — incomplete', async () => {
        const bridge = makeBridge({ address: 'TESTADDR', balance: 1000, network: 'localnet' });
        const { req, url } = fakeReq('GET', '/api/onboarding/status');
        const res = await handleOnboardingRoutes(req, url, db, bridge, null, ctx);
        const data = await (res as Response).json();

        expect(data.wallet.configured).toBe(true);
        expect(data.wallet.address).toBe('TESTADDR');
        expect(data.wallet.funded).toBe(true);
        expect(data.bridge.running).toBe(true);
        expect(data.bridge.network).toBe('localnet');
        // Still incomplete — no agents or projects
        expect(data.complete).toBe(false);
    });

    it('GET /api/onboarding/status with bridge but zero balance — not funded', async () => {
        const bridge = makeBridge({ address: 'TESTADDR', balance: 0, network: 'localnet' });
        const { req, url } = fakeReq('GET', '/api/onboarding/status');
        const res = await handleOnboardingRoutes(req, url, db, bridge, null, ctx);
        const data = await (res as Response).json();

        expect(data.wallet.configured).toBe(true);
        expect(data.wallet.funded).toBe(false);
        expect(data.complete).toBe(false);
    });

    it('GET /api/onboarding/status with all components — complete', async () => {
        // Seed an agent and a project
        const agentId = crypto.randomUUID();
        db.query("INSERT INTO agents (id, name, tenant_id) VALUES (?, 'TestAgent', 'default')").run(agentId);
        const projectId = crypto.randomUUID();
        db.query("INSERT INTO projects (id, name, working_dir, tenant_id) VALUES (?, 'TestProject', '/tmp', 'default')").run(projectId);

        const bridge = makeBridge({ address: 'FULLADDR', balance: 5000, network: 'localnet' });
        const { req, url } = fakeReq('GET', '/api/onboarding/status');
        const res = await handleOnboardingRoutes(req, url, db, bridge, null, ctx);
        const data = await (res as Response).json();

        expect(data.wallet.configured).toBe(true);
        expect(data.wallet.funded).toBe(true);
        expect(data.bridge.running).toBe(true);
        expect(data.agent.exists).toBe(true);
        expect(data.agent.count).toBeGreaterThanOrEqual(1);
        expect(data.project.exists).toBe(true);
        expect(data.project.count).toBeGreaterThanOrEqual(1);
        expect(data.complete).toBe(true);
    });

    it('agent.walletConfigured reflects wallet_address on agent', async () => {
        const agentId = crypto.randomUUID();
        db.query("INSERT INTO agents (id, name, tenant_id, wallet_address) VALUES (?, 'WalletAgent', 'default', 'AGENTADDR')").run(agentId);

        const { req, url } = fakeReq('GET', '/api/onboarding/status');
        const res = await handleOnboardingRoutes(req, url, db, null, null, ctx);
        const data = await (res as Response).json();

        expect(data.agent.walletConfigured).toBe(true);
    });
});
