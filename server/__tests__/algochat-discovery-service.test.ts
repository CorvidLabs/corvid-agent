/**
 * Comprehensive unit tests for DiscoveryService — handles agent/sender
 * discovery, conversation seeding, and polling for AlgoChat.
 *
 * Tests cover:
 * - seedConversations() — populates SyncManager from DB
 * - startDiscoveryPolling() / stopDiscoveryPolling() — periodic sender discovery
 * - discoverNewSenders() — indexer query for new participants
 * - startFastPolling() / stopFastPolling() — 5s approval response polling
 * - getAgentWalletAddresses() — cached agent wallet lookup (60s TTL)
 * - findAgentForNewConversation() — default agent resolution logic
 * - getDefaultProjectId() — project creation fallback
 * - cleanup() — timer teardown
 *
 * Uses an in-memory SQLite database with real schema migrations for DB-backed
 * queries, and lightweight mocks for AlgoChatService, SyncManager, and indexer.
 *
 * @module
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { DiscoveryService, type IsOwnerFn } from '../algochat/discovery-service';
import type { AlgoChatConfig } from '../algochat/config';
import type { AlgoChatService } from '../algochat/service';
import { createConversation, updateConversationRound } from '../db/sessions';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';

// ── Test constants ────────────────────────────────────────────────────────

const MY_ADDR = 'MY_CHAT_ACCOUNT_ADDR';
const SENDER_A = 'SENDER_ADDR_AAAA';
const SENDER_B = 'SENDER_ADDR_BBBB';
const OWNER_ADDR = 'OWNER_ADDR_ABC123';

// ── Mock factories ────────────────────────────────────────────────────────

function createMockConfig(overrides: Partial<AlgoChatConfig> = {}): AlgoChatConfig {
    return {
        network: 'testnet',
        ownerAddresses: new Set([OWNER_ADDR]),
        syncInterval: 10_000,
        mnemonic: '',
        defaultAgentId: null,
        pskContact: null,
        enabled: true,
        ...overrides,
    } as AlgoChatConfig;
}

interface MockConversation {
    participant: string;
    lastFetchedRound?: number;
}

function createMockSyncManager(existing: MockConversation[] = []) {
    const conversations = new Map<string, { participant: string; setLastFetchedRound: ReturnType<typeof mock> }>();

    // Pre-populate with existing conversations
    for (const conv of existing) {
        conversations.set(conv.participant, {
            participant: conv.participant,
            setLastFetchedRound: mock(() => {}),
        });
    }

    return {
        getOrCreateConversation: mock((participant: string) => {
            if (!conversations.has(participant)) {
                conversations.set(participant, {
                    participant,
                    setLastFetchedRound: mock(() => {}),
                });
            }
            return conversations.get(participant)!;
        }),
        getConversations: mock(() => Array.from(conversations.values())),
        sync: mock(() => Promise.resolve()),
        _conversations: conversations,
    };
}

function createMockIndexerClient(transactions: Array<{ sender: string; note?: string }> = []) {
    return {
        searchForTransactions: mock(() => ({
            address: mock(function (this: unknown) { return this; }),
            addressRole: mock(function (this: unknown) { return this; }),
            limit: mock(function (this: unknown) { return this; }),
            do: mock(() => Promise.resolve({ transactions })),
        })),
    };
}

function createMockService(overrides: Partial<Record<string, unknown>> = {}): AlgoChatService {
    const syncManager = overrides.syncManager ?? createMockSyncManager();
    return {
        chatAccount: { address: MY_ADDR },
        algorandService: {},
        syncManager,
        algodClient: {},
        indexerClient: overrides.indexerClient ?? null,
    } as unknown as AlgoChatService;
}

function createMockApprovalManager(hasPending = false) {
    return {
        hasPendingRequests: mock(() => hasPending),
    } as unknown as import('../process/approval-manager').ApprovalManager;
}

// ── Test suite ────────────────────────────────────────────────────────────

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ── seedConversations ─────────────────────────────────────────────────────

describe('DiscoveryService', () => {
    describe('seedConversations', () => {
        test('should seed SyncManager with conversations from DB', () => {
            // Create conversations in DB
            createConversation(db, SENDER_A, null, null);
            createConversation(db, SENDER_B, null, null);

            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager });
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            discovery.seedConversations();

            expect(syncManager.getOrCreateConversation.mock.calls.length).toBe(2);
            const calledAddrs = syncManager.getOrCreateConversation.mock.calls.map(
                (c: unknown[]) => c[0],
            );
            expect(calledAddrs).toContain(SENDER_A);
            expect(calledAddrs).toContain(SENDER_B);
        });

        test('should set lastFetchedRound to lastRound + 1 for conversations with lastRound > 0', () => {
            const conv = createConversation(db, SENDER_A, null, null);
            updateConversationRound(db, conv.id, 12345);

            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager });
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            discovery.seedConversations();

            const mockConv = syncManager._conversations.get(SENDER_A)!;
            expect(mockConv.setLastFetchedRound.mock.calls.length).toBe(1);
            expect(mockConv.setLastFetchedRound.mock.calls[0][0]).toBe(12346);
        });

        test('should not set lastFetchedRound for conversations with lastRound = 0', () => {
            createConversation(db, SENDER_A, null, null);

            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager });
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            discovery.seedConversations();

            const mockConv = syncManager._conversations.get(SENDER_A)!;
            expect(mockConv.setLastFetchedRound.mock.calls.length).toBe(0);
        });

        test('should handle empty conversations list', () => {
            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager });
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            discovery.seedConversations();

            expect(syncManager.getOrCreateConversation.mock.calls.length).toBe(0);
        });
    });

    // ── discoverNewSenders ────────────────────────────────────────────────

    describe('discoverNewSenders', () => {
        test('should return early if no indexer client', async () => {
            const service = createMockService({ indexerClient: null });
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            await discovery.discoverNewSenders();
            // No error thrown = success
        });

        test('should discover new senders from indexer transactions', async () => {
            const transactions = [
                { sender: SENDER_A, note: 'hello' },
                { sender: SENDER_B, note: 'world' },
            ];
            const indexerClient = createMockIndexerClient(transactions);
            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager, indexerClient });
            const isOwner: IsOwnerFn = () => true;

            const discovery = new DiscoveryService(db, createMockConfig(), service, isOwner);

            await discovery.discoverNewSenders();

            // Both senders should be registered
            expect(syncManager.getOrCreateConversation.mock.calls.length).toBe(2);
        });

        test('should skip transactions from our own address', async () => {
            const transactions = [
                { sender: MY_ADDR, note: 'self-send' },
                { sender: SENDER_A, note: 'hello' },
            ];
            const indexerClient = createMockIndexerClient(transactions);
            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager, indexerClient });

            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            await discovery.discoverNewSenders();

            // Only SENDER_A should be registered, not MY_ADDR
            expect(syncManager.getOrCreateConversation.mock.calls.length).toBe(1);
            expect(syncManager.getOrCreateConversation.mock.calls[0][0]).toBe(SENDER_A);
        });

        test('should skip transactions without notes', async () => {
            const transactions = [
                { sender: SENDER_A }, // no note field
                { sender: SENDER_B, note: 'has note' },
            ];
            const indexerClient = createMockIndexerClient(transactions);
            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager, indexerClient });

            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            await discovery.discoverNewSenders();

            expect(syncManager.getOrCreateConversation.mock.calls.length).toBe(1);
            expect(syncManager.getOrCreateConversation.mock.calls[0][0]).toBe(SENDER_B);
        });

        test('should skip already-known participants', async () => {
            const existing = [{ participant: SENDER_A }];
            const transactions = [
                { sender: SENDER_A, note: 'already known' },
                { sender: SENDER_B, note: 'new sender' },
            ];
            const indexerClient = createMockIndexerClient(transactions);
            const syncManager = createMockSyncManager(existing);
            const service = createMockService({ syncManager, indexerClient });

            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            await discovery.discoverNewSenders();

            // getOrCreateConversation should only be called for SENDER_B (new)
            // SENDER_A was already known
            const newCalls = syncManager.getOrCreateConversation.mock.calls.filter(
                (c: unknown[]) => c[0] === SENDER_B,
            );
            expect(newCalls.length).toBe(1);
        });

        test('should skip non-owner senders', async () => {
            const transactions = [
                { sender: SENDER_A, note: 'from owner' },
                { sender: SENDER_B, note: 'from non-owner' },
            ];
            const indexerClient = createMockIndexerClient(transactions);
            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager, indexerClient });
            const isOwner: IsOwnerFn = (p) => p === SENDER_A;

            const discovery = new DiscoveryService(db, createMockConfig(), service, isOwner);

            await discovery.discoverNewSenders();

            expect(syncManager.getOrCreateConversation.mock.calls.length).toBe(1);
            expect(syncManager.getOrCreateConversation.mock.calls[0][0]).toBe(SENDER_A);
        });

        test('should deduplicate multiple transactions from the same sender', async () => {
            const transactions = [
                { sender: SENDER_A, note: 'msg1' },
                { sender: SENDER_A, note: 'msg2' },
                { sender: SENDER_A, note: 'msg3' },
            ];
            const indexerClient = createMockIndexerClient(transactions);
            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager, indexerClient });

            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            await discovery.discoverNewSenders();

            // Should only register SENDER_A once
            expect(syncManager.getOrCreateConversation.mock.calls.length).toBe(1);
        });

        test('should handle empty transaction list', async () => {
            const indexerClient = createMockIndexerClient([]);
            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager, indexerClient });

            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            await discovery.discoverNewSenders();

            expect(syncManager.getOrCreateConversation.mock.calls.length).toBe(0);
        });

        test('should handle response with no transactions field', async () => {
            const indexerClient = {
                searchForTransactions: mock(() => ({
                    address: mock(function (this: unknown) { return this; }),
                    addressRole: mock(function (this: unknown) { return this; }),
                    limit: mock(function (this: unknown) { return this; }),
                    do: mock(() => Promise.resolve({})), // no transactions key
                })),
            };
            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager, indexerClient });

            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            await discovery.discoverNewSenders();

            expect(syncManager.getOrCreateConversation.mock.calls.length).toBe(0);
        });
    });

    // ── startDiscoveryPolling / stopDiscoveryPolling ───────────────────────

    describe('startDiscoveryPolling / stopDiscoveryPolling', () => {
        test('should start polling and run discoverNewSenders immediately', async () => {
            const indexerClient = createMockIndexerClient([]);
            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager, indexerClient });
            const discovery = new DiscoveryService(db, createMockConfig({ syncInterval: 60_000 }), service, () => true);

            discovery.startDiscoveryPolling();

            // Wait a tick for the immediate call to complete
            await new Promise((r) => setTimeout(r, 50));

            // The indexer should have been queried
            expect(indexerClient.searchForTransactions.mock.calls.length).toBeGreaterThanOrEqual(1);

            discovery.stopDiscoveryPolling();
        });

        test('should not start duplicate polling if already running', async () => {
            const indexerClient = createMockIndexerClient([]);
            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager, indexerClient });
            const discovery = new DiscoveryService(db, createMockConfig({ syncInterval: 60_000 }), service, () => true);

            discovery.startDiscoveryPolling();
            discovery.startDiscoveryPolling(); // second call should be a no-op

            await new Promise((r) => setTimeout(r, 50));

            // Only one immediate call should have happened
            expect(indexerClient.searchForTransactions.mock.calls.length).toBe(1);

            discovery.stopDiscoveryPolling();
        });

        test('stopDiscoveryPolling should clear the timer', () => {
            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig({ syncInterval: 60_000 }), service, () => true);

            discovery.startDiscoveryPolling();
            discovery.stopDiscoveryPolling();

            // Calling stop again should be safe (no-op)
            discovery.stopDiscoveryPolling();
        });
    });

    // ── startFastPolling / stopFastPolling ─────────────────────────────────

    describe('startFastPolling / stopFastPolling', () => {
        test('should start fast polling and trigger sync when approvals pending', async () => {
            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager });
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);
            const approvalMgr = createMockApprovalManager(true);
            discovery.setApprovalManager(approvalMgr);

            discovery.startFastPolling();

            // Wait for at least one interval tick (5s interval)
            await new Promise((r) => setTimeout(r, 5200));

            expect(syncManager.sync.mock.calls.length).toBeGreaterThanOrEqual(1);

            discovery.stopFastPolling();
        }, 10_000);

        test('should auto-stop when no pending approvals', async () => {
            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager });
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);
            const approvalMgr = createMockApprovalManager(false);
            discovery.setApprovalManager(approvalMgr);

            discovery.startFastPolling();

            // After one tick, it should check and stop because no pending
            await new Promise((r) => setTimeout(r, 5200));

            // sync should not have been called since it stops before syncing
            expect(syncManager.sync.mock.calls.length).toBe(0);

            // Calling stop again should be safe
            discovery.stopFastPolling();
        }, 10_000);

        test('should not start duplicate fast polling if already running', () => {
            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            discovery.startFastPolling();
            discovery.startFastPolling(); // no-op

            discovery.stopFastPolling();
        });

        test('stopFastPolling should be safe to call when not polling', () => {
            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            // Not started — should not throw
            discovery.stopFastPolling();
        });

        test('should handle null approvalManager gracefully', async () => {
            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager });
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);
            // Don't set approval manager

            discovery.startFastPolling();

            await new Promise((r) => setTimeout(r, 5200));

            // With null approvalManager, hasPendingRequests() returns undefined (falsy),
            // so fast polling should auto-stop without syncing
            expect(syncManager.sync.mock.calls.length).toBe(0);

            discovery.stopFastPolling();
        }, 10_000);
    });

    // ── getAgentWalletAddresses ───────────────────────────────────────────

    describe('getAgentWalletAddresses', () => {
        test('should return set containing main chat account address', () => {
            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            const addrs = discovery.getAgentWalletAddresses();

            expect(addrs.has(MY_ADDR)).toBe(true);
        });

        test('should include agent wallet addresses from DB', () => {
            const agent1 = createAgent(db, { name: 'Agent 1' });
            db.exec(`UPDATE agents SET wallet_address = 'AGENT_WALLET_1' WHERE id = '${agent1.id}'`);

            const agent2 = createAgent(db, { name: 'Agent 2' });
            db.exec(`UPDATE agents SET wallet_address = 'AGENT_WALLET_2' WHERE id = '${agent2.id}'`);

            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            const addrs = discovery.getAgentWalletAddresses();

            expect(addrs.has(MY_ADDR)).toBe(true);
            expect(addrs.has('AGENT_WALLET_1')).toBe(true);
            expect(addrs.has('AGENT_WALLET_2')).toBe(true);
        });

        test('should skip agents without wallet addresses', () => {
            createAgent(db, { name: 'Agent No Wallet' });

            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            const addrs = discovery.getAgentWalletAddresses();

            // Only the main chat account
            expect(addrs.size).toBe(1);
            expect(addrs.has(MY_ADDR)).toBe(true);
        });

        test('should cache results for 60 seconds', () => {
            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            const first = discovery.getAgentWalletAddresses();

            // Add a new agent after first call
            const lateAgent = createAgent(db, { name: 'Late Agent' });
            db.exec(`UPDATE agents SET wallet_address = 'LATE_WALLET' WHERE id = '${lateAgent.id}'`);

            const second = discovery.getAgentWalletAddresses();

            // Should be the same cached set (no LATE_WALLET)
            expect(second).toBe(first); // same reference
            expect(second.has('LATE_WALLET')).toBe(false);
        });

        test('should refresh cache after TTL expires', () => {
            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            const first = discovery.getAgentWalletAddresses();

            // Add a new agent
            const lateAgent = createAgent(db, { name: 'Late Agent' });
            db.exec(`UPDATE agents SET wallet_address = 'LATE_WALLET' WHERE id = '${lateAgent.id}'`);

            // Simulate TTL expiration by manipulating internal state
            // Access the private field via any cast
            (discovery as unknown as { cachedAgentWalletsAt: number }).cachedAgentWalletsAt = 0;

            const refreshed = discovery.getAgentWalletAddresses();

            expect(refreshed).not.toBe(first); // different reference
            expect(refreshed.has('LATE_WALLET')).toBe(true);
        });
    });

    // ── findAgentForNewConversation ───────────────────────────────────────

    describe('findAgentForNewConversation', () => {
        test('should return configured defaultAgentId when set', () => {
            const config = createMockConfig({ defaultAgentId: 'default-agent' });
            const service = createMockService();
            const discovery = new DiscoveryService(db, config, service, () => true);

            expect(discovery.findAgentForNewConversation()).toBe('default-agent');
        });

        test('should return algochat auto-enabled agent when no default configured', () => {
            createAgent(db, {
                name: 'Manual Agent',
                algochatEnabled: true,
                algochatAuto: false,
            });

            const autoAgent = createAgent(db, {
                name: 'Auto Agent',
                algochatEnabled: true,
                algochatAuto: true,
            });

            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            expect(discovery.findAgentForNewConversation()).toBe(autoAgent.id);
        });

        test('should fall back to first algochat-enabled agent if none are auto', () => {
            const agent = createAgent(db, {
                name: 'Enabled Agent',
                algochatEnabled: true,
                algochatAuto: false,
            });

            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            expect(discovery.findAgentForNewConversation()).toBe(agent.id);
        });

        test('should return null when no agents exist', () => {
            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            expect(discovery.findAgentForNewConversation()).toBeNull();
        });

        test('should return null when agents exist but none are algochat-enabled', () => {
            createAgent(db, {
                name: 'Non-Chat Agent',
                algochatEnabled: false,
            });

            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            expect(discovery.findAgentForNewConversation()).toBeNull();
        });
    });

    // ── getDefaultProjectId ──────────────────────────────────────────────

    describe('getDefaultProjectId', () => {
        test('should return existing project ID when projects exist', () => {
            const project = createProject(db, {
                name: 'Existing Project',
                workingDir: '/tmp/test',
            });

            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            expect(discovery.getDefaultProjectId()).toBe(project.id);
        });

        test('should create a new project when none exist', () => {
            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            const projectId = discovery.getDefaultProjectId();

            expect(projectId).toBeTruthy();
            expect(typeof projectId).toBe('string');
        });

        test('should return the same project on repeated calls', () => {
            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            const first = discovery.getDefaultProjectId();
            const second = discovery.getDefaultProjectId();

            expect(first).toBe(second);
        });
    });

    // ── cleanup ──────────────────────────────────────────────────────────

    describe('cleanup', () => {
        test('should stop both fast and discovery polling', () => {
            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig({ syncInterval: 60_000 }), service, () => true);

            discovery.startFastPolling();
            discovery.startDiscoveryPolling();

            // Should not throw
            discovery.cleanup();

            // Calling cleanup again should be safe
            discovery.cleanup();
        });

        test('should be safe to call when no timers are active', () => {
            const service = createMockService();
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);

            // No timers started — should not throw
            discovery.cleanup();
        });
    });

    // ── setApprovalManager ───────────────────────────────────────────────

    describe('setApprovalManager', () => {
        test('should inject the approval manager for fast-polling checks', async () => {
            const syncManager = createMockSyncManager();
            const service = createMockService({ syncManager });
            const discovery = new DiscoveryService(db, createMockConfig(), service, () => true);
            const approvalMgr = createMockApprovalManager(true);

            discovery.setApprovalManager(approvalMgr);
            discovery.startFastPolling();

            await new Promise((r) => setTimeout(r, 5200));

            // Approval manager was checked
            expect((approvalMgr.hasPendingRequests as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThanOrEqual(1);

            discovery.stopFastPolling();
        }, 10_000);
    });
});
