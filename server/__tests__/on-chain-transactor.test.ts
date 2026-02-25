import { test, expect, beforeEach, describe, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { OnChainTransactor } from '../algochat/on-chain-transactor';
import type { AlgoChatService } from '../algochat/service';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { AgentDirectory } from '../algochat/agent-directory';
import { recordAlgoSpend, getSpendingLimits } from '../db/spending';

// ─── Mock objects ────────────────────────────────────────────────────────────

function createMockWalletService() {
    return {
        getAgentChatAccount: mock(() => Promise.resolve(null)),
        ensureWallet: mock(() => Promise.resolve()),
        fundAgent: mock(() => Promise.resolve()),
        getBalance: mock(() => Promise.resolve(0)),
    } as unknown as AgentWalletService;
}

function createMockDirectory() {
    return {
        resolve: mock(() => Promise.resolve(null)),
        findAgentByAddress: mock(() => null),
        listAvailable: mock(() => Promise.resolve([])),
        clearCache: mock(() => {}),
    } as unknown as AgentDirectory;
}

function createMockAlgoChatService() {
    return {
        algorandService: {
            discoverPublicKey: mock(() => Promise.resolve(new Uint8Array(32))),
            sendMessage: mock(() => Promise.resolve({ txid: 'mock-txid', fee: 1000 })),
        },
        chatAccount: {
            address: 'MOCK_ADDRESS',
            account: {
                sk: new Uint8Array(64),
                addr: 'MOCK_ADDRESS',
                encryptionKeys: {
                    publicKey: new Uint8Array(32),
                    secretKey: new Uint8Array(32),
                },
            },
            encryptionKeys: {
                publicKey: new Uint8Array(32),
                secretKey: new Uint8Array(32),
            },
        },
        algodClient: {
            getTransactionParams: mock(() => ({
                do: () => Promise.resolve({ flatFee: true, fee: 1000, firstRound: 1, lastRound: 1000, genesisHash: '', genesisID: '' }),
            })),
            sendRawTransaction: mock(() => ({
                do: () => Promise.resolve({ txid: 'mock-group-txid' }),
            })),
        },
        indexerClient: null,
    } as unknown as AlgoChatService;
}

// ─── Test state ──────────────────────────────────────────────────────────────

let db: Database;
let mockWalletService: AgentWalletService;
let mockDirectory: AgentDirectory;

beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    mockWalletService = createMockWalletService();
    mockDirectory = createMockDirectory();
});

// ─── Constructor & null service ──────────────────────────────────────────────

describe('OnChainTransactor with null service', () => {
    test('sendMessage returns null txid when service is null', async () => {
        const transactor = new OnChainTransactor(db, null, mockWalletService, mockDirectory);
        const result = await transactor.sendMessage({
            fromAgentId: 'agent-a',
            toAgentId: 'agent-b',
            content: 'hello',
            paymentMicro: 1000,
        });
        expect(result.txid).toBeNull();
    });

    test('sendToSelf returns null when service is null', async () => {
        const transactor = new OnChainTransactor(db, null, mockWalletService, mockDirectory);
        const result = await transactor.sendToSelf('agent-a', 'memory content');
        expect(result).toBeNull();
    });

    test('sendNotificationToAddress returns null when service is null', async () => {
        const transactor = new OnChainTransactor(db, null, mockWalletService, mockDirectory);
        const result = await transactor.sendNotificationToAddress('agent-a', 'SOME_ADDRESS', 'notify');
        expect(result).toBeNull();
    });

    test('sendBestEffort returns null when service is null', async () => {
        const transactor = new OnChainTransactor(db, null, mockWalletService, mockDirectory);
        const result = await transactor.sendBestEffort('agent-a', 'agent-b', 'hello');
        expect(result).toBeNull();
    });

    test('sendToAddress returns null when service is null', async () => {
        const transactor = new OnChainTransactor(db, null, mockWalletService, mockDirectory);
        const mockAccount = { address: 'MOCK', account: { sk: new Uint8Array(64) } } as any;
        const result = await transactor.sendToAddress(mockAccount, 'RECIPIENT', 'hello');
        expect(result).toBeNull();
    });
});

// ─── sendMessage with no wallet ──────────────────────────────────────────────

describe('sendMessage wallet resolution', () => {
    test('returns null when sender has no wallet', async () => {
        const service = createMockAlgoChatService();
        const transactor = new OnChainTransactor(db, service, mockWalletService, mockDirectory);

        const result = await transactor.sendMessage({
            fromAgentId: 'agent-a',
            toAgentId: 'agent-b',
            content: 'hello',
            paymentMicro: 1000,
        });

        // mockWalletService.getAgentChatAccount returns null by default
        expect(result.txid).toBeNull();
    });

    test('returns null when recipient has no wallet address', async () => {
        const service = createMockAlgoChatService();

        // Sender has a wallet
        const walletService = createMockWalletService();
        (walletService.getAgentChatAccount as ReturnType<typeof mock>).mockImplementation(
            () => Promise.resolve({
                account: service.chatAccount,
                address: 'SENDER_ADDRESS',
            }),
        );

        // Directory returns no wallet address
        const directory = createMockDirectory();
        (directory.resolve as ReturnType<typeof mock>).mockImplementation(
            () => Promise.resolve({ agentId: 'agent-b', walletAddress: null }),
        );

        const transactor = new OnChainTransactor(db, service, walletService, directory);

        const result = await transactor.sendMessage({
            fromAgentId: 'agent-a',
            toAgentId: 'agent-b',
            content: 'hello',
            paymentMicro: 1000,
        });

        expect(result.txid).toBeNull();
    });
});

// ─── sendBestEffort ──────────────────────────────────────────────────────────

describe('sendBestEffort()', () => {
    test('never throws even when sendMessage would throw', async () => {
        const service = createMockAlgoChatService();
        const walletService = createMockWalletService();
        (walletService.getAgentChatAccount as ReturnType<typeof mock>).mockImplementation(
            () => Promise.reject(new Error('wallet explosion')),
        );

        const transactor = new OnChainTransactor(db, service, walletService, mockDirectory);
        const result = await transactor.sendBestEffort('agent-a', 'agent-b', 'hello');
        expect(result).toBeNull();
    });
});

// ─── sendToSelf ──────────────────────────────────────────────────────────────

describe('sendToSelf()', () => {
    test('returns null when agent has no wallet', async () => {
        const service = createMockAlgoChatService();
        const transactor = new OnChainTransactor(db, service, mockWalletService, mockDirectory);
        const result = await transactor.sendToSelf('agent-a', 'memory');
        expect(result).toBeNull();
    });
});

// ─── sendNotificationToAddress ───────────────────────────────────────────────

describe('sendNotificationToAddress()', () => {
    test('returns null when sender has no wallet', async () => {
        const service = createMockAlgoChatService();
        const transactor = new OnChainTransactor(db, service, mockWalletService, mockDirectory);
        const result = await transactor.sendNotificationToAddress('agent-a', 'SOME_ADDRESS', 'notify');
        expect(result).toBeNull();
    });

    test('never throws on failure', async () => {
        const service = createMockAlgoChatService();
        const walletService = createMockWalletService();
        (walletService.getAgentChatAccount as ReturnType<typeof mock>).mockImplementation(
            () => Promise.reject(new Error('wallet error')),
        );

        const transactor = new OnChainTransactor(db, service, walletService, mockDirectory);
        const result = await transactor.sendNotificationToAddress('agent-a', 'SOME_ADDRESS', 'notify');
        expect(result).toBeNull();
    });
});

// ─── Public key caching ──────────────────────────────────────────────────────

describe('discoverPublicKey()', () => {
    test('throws when service is null', async () => {
        const transactor = new OnChainTransactor(db, null, mockWalletService, mockDirectory);
        await expect(transactor.discoverPublicKey('SOME_ADDRESS')).rejects.toThrow('AlgoChatService not found');
    });

    test('caches public keys', async () => {
        const service = createMockAlgoChatService();
        const discoverMock = service.algorandService.discoverPublicKey as ReturnType<typeof mock>;
        const transactor = new OnChainTransactor(db, service, mockWalletService, mockDirectory);

        // First call should hit the service
        await transactor.discoverPublicKey('ADDRESS_1');
        expect(discoverMock).toHaveBeenCalledTimes(1);

        // Second call should use cache
        await transactor.discoverPublicKey('ADDRESS_1');
        expect(discoverMock).toHaveBeenCalledTimes(1);

        // Different address should hit the service again
        await transactor.discoverPublicKey('ADDRESS_2');
        expect(discoverMock).toHaveBeenCalledTimes(2);
    });
});

// ─── Spending limit enforcement ──────────────────────────────────────────────

describe('spending limit enforcement', () => {
    test('sendMessage returns blockedByLimit when over daily limit', async () => {
        const service = createMockAlgoChatService();
        const walletService = createMockWalletService();
        (walletService.getAgentChatAccount as ReturnType<typeof mock>).mockImplementation(
            () => Promise.resolve({
                account: service.chatAccount,
                address: 'SENDER_ADDRESS',
            }),
        );

        const directory = createMockDirectory();
        (directory.resolve as ReturnType<typeof mock>).mockImplementation(
            () => Promise.resolve({ agentId: 'agent-b', walletAddress: 'RECIPIENT_ADDRESS' }),
        );

        const transactor = new OnChainTransactor(db, service, walletService, directory);

        // Pre-spend up to just below the daily limit, then try to exceed it
        const limit = getSpendingLimits().algoMicro;
        recordAlgoSpend(db, limit - 1);

        const result = await transactor.sendMessage({
            fromAgentId: 'agent-a',
            toAgentId: 'agent-b',
            content: 'hello',
            paymentMicro: 2, // This would push us over the limit
        });

        expect(result.txid).toBeNull();
        expect(result.blockedByLimit).toBe(true);
        expect(result.limitError).toBeTruthy();
    });

    test('sendMessage with 0 payment skips spending check', async () => {
        const service = createMockAlgoChatService();
        const transactor = new OnChainTransactor(db, service, mockWalletService, mockDirectory);

        // Pre-spend up to the daily limit
        const limit = getSpendingLimits().algoMicro;
        recordAlgoSpend(db, limit);

        const result = await transactor.sendMessage({
            fromAgentId: 'agent-a',
            toAgentId: 'agent-b',
            content: 'hello',
            paymentMicro: 0,
        });

        // Should not be blocked by limit (blocked by no wallet instead)
        expect(result.blockedByLimit).toBeUndefined();
    });
});
