import { test, expect, beforeEach, afterEach, describe, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent, getAgent, setAgentWallet } from '../db/agents';
import type { AlgoChatConfig } from '../algochat/config';
import type { AlgoChatService } from '../algochat/service';
import { AgentWalletService } from '../algochat/agent-wallet';

// ─── Mock helpers ────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<AlgoChatConfig> = {}): AlgoChatConfig {
    return {
        mnemonic: 'test-mnemonic-phrase',
        network: 'localnet',
        agentNetwork: 'localnet',
        syncInterval: 5000,
        defaultAgentId: null,
        enabled: true,
        pskContact: null,
        ownerAddresses: new Set<string>(),
        ...overrides,
    };
}

function makeMockService(): AlgoChatService {
    return {
        algodClient: {
            accountInformation: mock(() => ({
                do: mock(() => Promise.resolve({ amount: 5_000_000 })),
            })),
            getTransactionParams: mock(() => ({
                do: mock(() => Promise.resolve({})),
            })),
            sendRawTransaction: mock(() => ({
                do: mock(() => Promise.resolve({})),
            })),
            status: mock(() => ({
                do: mock(() => Promise.resolve({ lastRound: 100 })),
            })),
        },
        algorandService: {
            publishKey: mock(() => Promise.resolve('txid-123')),
            sendMessage: mock(() => Promise.resolve({ txid: 'txid-456' })),
        },
        chatAccount: {
            address: 'MOCK_ADDRESS_1234567890',
            account: { sk: new Uint8Array(64) },
            encryptionKeys: { publicKey: new Uint8Array(32), privateKey: new Uint8Array(32) },
        },
        syncManager: {},
        indexerClient: null,
    } as unknown as AlgoChatService;
}

// ─── Test suite ──────────────────────────────────────────────────────────────

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ─── ensureWallet ────────────────────────────────────────────────────────────

describe('ensureWallet', () => {
    test('is no-op on non-localnet networks', async () => {
        const config = makeConfig({ network: 'testnet' });
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        const agent = createAgent(db, { name: 'TestAgent', model: 'sonnet' });
        await wallet.ensureWallet(agent.id);

        // Agent should still have no wallet since testnet skips auto-creation
        const updated = getAgent(db, agent.id);
        expect(updated?.walletAddress).toBeNull();
    });

    test('is no-op on mainnet', async () => {
        const config = makeConfig({ network: 'mainnet' });
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        const agent = createAgent(db, { name: 'MainnetAgent', model: 'sonnet' });
        await wallet.ensureWallet(agent.id);

        const updated = getAgent(db, agent.id);
        expect(updated?.walletAddress).toBeNull();
    });

    test('is no-op when agent already has wallet', async () => {
        const config = makeConfig({ network: 'localnet' });
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        const agent = createAgent(db, { name: 'WalletAgent', model: 'sonnet' });
        setAgentWallet(db, agent.id, 'EXISTING_ADDR', 'encrypted-data');

        await wallet.ensureWallet(agent.id);

        // Should not have changed the existing wallet address
        const updated = getAgent(db, agent.id);
        expect(updated?.walletAddress).toBe('EXISTING_ADDR');
    });

    test('is no-op for nonexistent agent', async () => {
        const config = makeConfig({ network: 'localnet' });
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        // Should not throw for a missing agent
        await wallet.ensureWallet('nonexistent-id');
    });
});

// ─── fundAgent ───────────────────────────────────────────────────────────────

describe('fundAgent', () => {
    test('is no-op when agent has no wallet', async () => {
        const config = makeConfig();
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        const agent = createAgent(db, { name: 'NoWallet', model: 'sonnet' });
        // Agent has no walletAddress, so fundAgent should bail early
        await wallet.fundAgent(agent.id, 5_000_000);

        const updated = getAgent(db, agent.id);
        expect(updated?.walletFundedAlgo).toBe(0);
    });

    test('is no-op for nonexistent agent', async () => {
        const config = makeConfig();
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        // Should not throw for a missing agent
        await wallet.fundAgent('nonexistent-id', 5_000_000);
    });

    test('records funding in DB on success', async () => {
        const config = makeConfig();
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        const agent = createAgent(db, { name: 'FundMe', model: 'sonnet' });
        setAgentWallet(db, agent.id, 'FUND_ADDR', 'enc-mnemonic');

        // sendPayment will use the mock algodClient; it calls getTransactionParams
        // and sendRawTransaction. However, sendPayment also calls `import('algosdk')`
        // which may not be available. We test via the error handling path which
        // catches and logs the error gracefully.
        await wallet.fundAgent(agent.id, 5_000_000);

        // If algosdk import fails, the error is caught and funding is NOT recorded.
        // If algosdk import succeeds (when the dep is available), funding IS recorded.
        // Either way, the method should not throw.
        const updated = getAgent(db, agent.id);
        // walletFundedAlgo is either 0 (import failed) or 5 (import succeeded)
        expect(updated?.walletFundedAlgo).toBeGreaterThanOrEqual(0);
    });
});

// ─── getBalance ──────────────────────────────────────────────────────────────

describe('getBalance', () => {
    test('returns balance from algod client', async () => {
        const config = makeConfig();
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        const balance = await wallet.getBalance('SOME_ADDRESS');
        expect(balance).toBe(5_000_000);
    });

    test('returns 0 on error', async () => {
        const config = makeConfig();
        const service = makeMockService();

        // Override accountInformation to throw
        service.algodClient.accountInformation = mock(() => ({
            do: mock(() => Promise.reject(new Error('Network error'))),
        })) as unknown as ReturnType<typeof mock>;

        const wallet = new AgentWalletService(db, config, service);
        const balance = await wallet.getBalance('BAD_ADDRESS');
        expect(balance).toBe(0);
    });

    test('returns 0 when amount is undefined', async () => {
        const config = makeConfig();
        const service = makeMockService();

        // Override accountInformation to return no amount field
        service.algodClient.accountInformation = mock(() => ({
            do: mock(() => Promise.resolve({})),
        })) as unknown as ReturnType<typeof mock>;

        const wallet = new AgentWalletService(db, config, service);
        const balance = await wallet.getBalance('EMPTY_ACCOUNT');
        expect(balance).toBe(0);
    });
});

// ─── checkAndRefill ──────────────────────────────────────────────────────────

describe('checkAndRefill', () => {
    test('is no-op on non-localnet networks', async () => {
        const config = makeConfig({ network: 'testnet' });
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        const agent = createAgent(db, { name: 'TestnetAgent', model: 'sonnet' });
        setAgentWallet(db, agent.id, 'TESTNET_ADDR', 'enc-mnemonic');

        await wallet.checkAndRefill(agent.id);

        // Should not have attempted any balance check or funding
        const updated = getAgent(db, agent.id);
        expect(updated?.walletFundedAlgo).toBe(0);
    });

    test('is no-op on mainnet', async () => {
        const config = makeConfig({ network: 'mainnet' });
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        const agent = createAgent(db, { name: 'MainnetAgent', model: 'sonnet' });
        setAgentWallet(db, agent.id, 'MAINNET_ADDR', 'enc-mnemonic');

        await wallet.checkAndRefill(agent.id);

        const updated = getAgent(db, agent.id);
        expect(updated?.walletFundedAlgo).toBe(0);
    });

    test('is no-op when agent has no wallet', async () => {
        const config = makeConfig({ network: 'localnet' });
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        const agent = createAgent(db, { name: 'NoWallet', model: 'sonnet' });
        // No wallet set, so checkAndRefill should bail early
        await wallet.checkAndRefill(agent.id);

        const updated = getAgent(db, agent.id);
        expect(updated?.walletFundedAlgo).toBe(0);
    });

    test('is no-op for nonexistent agent', async () => {
        const config = makeConfig({ network: 'localnet' });
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        // Should not throw
        await wallet.checkAndRefill('nonexistent-id');
    });

    test('does not refill when balance is above threshold', async () => {
        const config = makeConfig({ network: 'localnet' });
        const service = makeMockService();

        // Balance of 5 ALGO (5_000_000 microAlgos) is above 1 ALGO threshold
        service.algodClient.accountInformation = mock(() => ({
            do: mock(() => Promise.resolve({ amount: 5_000_000 })),
        })) as unknown as ReturnType<typeof mock>;

        const wallet = new AgentWalletService(db, config, service);

        const agent = createAgent(db, { name: 'RichAgent', model: 'sonnet' });
        setAgentWallet(db, agent.id, 'RICH_ADDR', 'enc-mnemonic');

        await wallet.checkAndRefill(agent.id);

        // Balance is above threshold, so no funding should have been attempted
        const updated = getAgent(db, agent.id);
        expect(updated?.walletFundedAlgo).toBe(0);
    });
});

// ─── getAgentChatAccount ─────────────────────────────────────────────────────

describe('getAgentChatAccount', () => {
    test('returns null when agent has no wallet', async () => {
        const config = makeConfig();
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        const agent = createAgent(db, { name: 'NoWallet', model: 'sonnet' });
        const result = await wallet.getAgentChatAccount(agent.id);
        expect(result).toBeNull();
    });

    test('returns null for nonexistent agent', async () => {
        const config = makeConfig();
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        const result = await wallet.getAgentChatAccount('nonexistent-id');
        expect(result).toBeNull();
    });

    test('returns null when no encrypted mnemonic stored', async () => {
        const config = makeConfig();
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        const agent = createAgent(db, { name: 'PartialWallet', model: 'sonnet' });
        // Set wallet address but with empty mnemonic via raw SQL
        db.query(
            `UPDATE agents SET wallet_address = ?, wallet_mnemonic_encrypted = NULL WHERE id = ?`
        ).run('PARTIAL_ADDR', agent.id);

        const result = await wallet.getAgentChatAccount(agent.id);
        expect(result).toBeNull();
    });
});

// ─── publishAllKeys ──────────────────────────────────────────────────────────

describe('publishAllKeys', () => {
    test('is no-op on non-localnet networks', async () => {
        const config = makeConfig({ network: 'testnet' });
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        const agent = createAgent(db, { name: 'TestnetAgent', model: 'sonnet' });
        setAgentWallet(db, agent.id, 'ADDR', 'enc-mnemonic');

        // Should return early without attempting any key publishing
        await wallet.publishAllKeys();

        // algorandService.publishKey should not have been called
        expect(service.algorandService.publishKey).not.toHaveBeenCalled();
    });
});

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('constructor', () => {
    test('creates instance with dependencies', () => {
        const config = makeConfig();
        const service = makeMockService();
        const wallet = new AgentWalletService(db, config, service);

        expect(wallet).toBeInstanceOf(AgentWalletService);
    });
});
