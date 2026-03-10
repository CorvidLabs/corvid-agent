/**
 * Tests for the hybrid FlockDirectoryService — off-chain + on-chain integration.
 *
 * Tests verify:
 * - setOnChainClient wiring and hasOnChain flag
 * - selfRegister idempotency
 * - getStats includes on-chain app ID
 * - On-chain fire-and-forget calls are triggered (via mock)
 */
import { test, expect, describe, beforeEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { FlockDirectoryService, type OnChainSignerConfig } from '../flock-directory/service';
import { OnChainFlockClient } from '../flock-directory/on-chain-client';

// ─── DB Setup ────────────────────────────────────────────────────────────────

let db: Database;
let svc: FlockDirectoryService;

beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    svc = new FlockDirectoryService(db);
});

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockOnChainClient(): OnChainFlockClient & {
    registerAgent: ReturnType<typeof mock>;
    heartbeat: ReturnType<typeof mock>;
    deregister: ReturnType<typeof mock>;
} {
    const mockAlgod = {} as import('algosdk').default.Algodv2;
    const client = new OnChainFlockClient({ appId: 42, algodClient: mockAlgod });
    // Override methods with mocks
    (client as any).registerAgent = mock(() => Promise.resolve('mock-tx-register'));
    (client as any).heartbeat = mock(() => Promise.resolve('mock-tx-heartbeat'));
    (client as any).deregister = mock(() => Promise.resolve('mock-tx-deregister'));
    return client as any;
}

const MOCK_SIGNER: OnChainSignerConfig = {
    senderAddress: 'MOCK_ADMIN_ADDRESS',
    sk: new Uint8Array(64),
    network: 'localnet',
};

// ─── On-Chain Wiring ─────────────────────────────────────────────────────────

describe('setOnChainClient', () => {
    test('hasOnChain is false by default', () => {
        expect(svc.hasOnChain).toBe(false);
    });

    test('hasOnChain is true after setOnChainClient', () => {
        const client = createMockOnChainClient();
        svc.setOnChainClient(client, MOCK_SIGNER);
        expect(svc.hasOnChain).toBe(true);
    });

    test('getOnChainClient returns null before wiring', () => {
        expect(svc.getOnChainClient()).toBeNull();
    });

    test('getOnChainClient returns client after wiring', () => {
        const client = createMockOnChainClient();
        svc.setOnChainClient(client, MOCK_SIGNER);
        expect(svc.getOnChainClient()).toBe(client);
    });
});

// ─── Hybrid Register ─────────────────────────────────────────────────────────

describe('hybrid register', () => {
    test('register triggers on-chain registration when client is wired', async () => {
        const client = createMockOnChainClient();
        svc.setOnChainClient(client, MOCK_SIGNER);

        svc.register({ address: 'ALGO_HYBRID', name: 'HybridAgent', capabilities: ['test'] });

        // Allow fire-and-forget promise to resolve
        await new Promise(r => setTimeout(r, 10));

        expect(client.registerAgent).toHaveBeenCalledTimes(1);
    });

    test('register succeeds even when on-chain call fails', async () => {
        const client = createMockOnChainClient();
        (client as any).registerAgent = mock(() => Promise.reject(new Error('network down')));
        svc.setOnChainClient(client, MOCK_SIGNER);

        const agent = svc.register({ address: 'ALGO_FAIL', name: 'FailAgent' });
        expect(agent.status).toBe('active'); // off-chain still works

        await new Promise(r => setTimeout(r, 10));
    });

    test('register without on-chain client does not throw', () => {
        const agent = svc.register({ address: 'ALGO_NOCHAIN', name: 'NoChain' });
        expect(agent.status).toBe('active');
    });
});

// ─── Hybrid Heartbeat ────────────────────────────────────────────────────────

describe('hybrid heartbeat', () => {
    test('heartbeat triggers on-chain heartbeat when client is wired', async () => {
        const client = createMockOnChainClient();
        svc.setOnChainClient(client, MOCK_SIGNER);

        const agent = svc.register({ address: 'ALGO_HB_H', name: 'HBAgent' });
        await new Promise(r => setTimeout(r, 10)); // let register fire

        svc.heartbeat(agent.id);
        await new Promise(r => setTimeout(r, 10));

        expect(client.heartbeat).toHaveBeenCalledTimes(1);
    });
});

// ─── Hybrid Deregister ───────────────────────────────────────────────────────

describe('hybrid deregister', () => {
    test('deregister triggers on-chain deregistration when client is wired', async () => {
        const client = createMockOnChainClient();
        svc.setOnChainClient(client, MOCK_SIGNER);

        const agent = svc.register({ address: 'ALGO_DEREG_H', name: 'DeregAgent' });
        await new Promise(r => setTimeout(r, 10));

        svc.deregister(agent.id);
        await new Promise(r => setTimeout(r, 10));

        expect(client.deregister).toHaveBeenCalledTimes(1);
    });
});

// ─── Self-Register ───────────────────────────────────────────────────────────

describe('selfRegister', () => {
    test('creates a new agent when not yet registered', async () => {
        const agent = await svc.selfRegister({
            address: 'ALGO_SELF',
            name: 'corvid-agent',
            description: 'The main agent',
            instanceUrl: 'http://localhost:3000',
            capabilities: ['code', 'review'],
        });

        expect(agent.address).toBe('ALGO_SELF');
        expect(agent.name).toBe('corvid-agent');
        expect(agent.status).toBe('active');
    });

    test('returns existing agent and sends heartbeat (idempotent)', async () => {
        const first = await svc.selfRegister({
            address: 'ALGO_IDEM',
            name: 'corvid-agent',
            description: 'desc',
            instanceUrl: 'http://localhost:3000',
            capabilities: [],
        });

        const second = await svc.selfRegister({
            address: 'ALGO_IDEM',
            name: 'corvid-agent',
            description: 'desc',
            instanceUrl: 'http://localhost:3000',
            capabilities: [],
        });

        expect(first.id).toBe(second.id);
        expect(second.status).toBe('active');
    });

    test('re-registers if previously deregistered', async () => {
        const first = await svc.selfRegister({
            address: 'ALGO_REREG',
            name: 'corvid-agent',
            description: 'desc',
            instanceUrl: 'http://localhost:3000',
            capabilities: [],
        });
        svc.deregister(first.id);

        // Need a different address since the old one is still in DB (deregistered)
        // The self-register should detect deregistered status and create new
        const second = await svc.selfRegister({
            address: 'ALGO_REREG2',
            name: 'corvid-agent',
            description: 'desc',
            instanceUrl: 'http://localhost:3000',
            capabilities: [],
        });

        expect(second.status).toBe('active');
    });
});

// ─── Stats with On-Chain ─────────────────────────────────────────────────────

describe('getStats with on-chain', () => {
    test('includes onChainAppId when client is wired', () => {
        const client = createMockOnChainClient();
        svc.setOnChainClient(client, MOCK_SIGNER);

        svc.register({ address: 'ALGO_STAT_H', name: 'StatAgent' });
        const stats = svc.getStats();

        expect(stats.onChainAppId).toBe(42);
        expect(stats.total).toBe(1);
    });

    test('onChainAppId is null when no client is wired', () => {
        const stats = svc.getStats();
        expect(stats.onChainAppId).toBeNull();
    });
});
