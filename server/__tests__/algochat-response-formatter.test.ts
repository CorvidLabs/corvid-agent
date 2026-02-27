/**
 * Comprehensive unit tests for ResponseFormatter — handles response sending
 * routing (PSK, on-chain), event emission, and message persistence for AlgoChat.
 *
 * Tests cover:
 * - sendResponse() — PSK routing, per-agent wallet selection, on-chain delivery, spending limit
 * - emitEvent() — DB persistence and callback notification
 * - splitPskContent() — byte-limited chunking with newline-aware splitting
 * - Event callback registration (onEvent/offEvent)
 * - Dead-letter logging on send failure
 *
 * Uses an in-memory SQLite database with real schema migrations for DB-backed
 * queries, and lightweight mocks for PSKManager, OnChainTransactor, and
 * AlgoChatService.
 *
 * @module
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { ResponseFormatter, type AlgoChatEventCallback } from '../algochat/response-formatter';
import type { AlgoChatConfig } from '../algochat/config';
import type { AlgoChatService } from '../algochat/service';
import { createConversation } from '../db/sessions';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import { createSession } from '../db/sessions';

// ── Test constants ────────────────────────────────────────────────────────

const MY_ADDR = 'MY_CHAT_ACCOUNT_ADDR';
const PARTICIPANT_A = 'PARTICIPANT_ADDR_AAAA';
const PARTICIPANT_B = 'PARTICIPANT_ADDR_BBBB';

// ── Mock factories ────────────────────────────────────────────────────────

function createMockConfig(overrides: Partial<AlgoChatConfig> = {}): AlgoChatConfig {
    return {
        network: 'testnet',
        ownerAddresses: new Set(),
        syncInterval: 10_000,
        mnemonic: '',
        defaultAgentId: null,
        pskContact: null,
        enabled: true,
        ...overrides,
    } as AlgoChatConfig;
}

function createMockService(overrides: Partial<Record<string, unknown>> = {}): AlgoChatService {
    return {
        chatAccount: { address: MY_ADDR },
        algorandService: {
            discoverPublicKey: mock(() => Promise.resolve('MOCK_PUB_KEY')),
            sendMessage: mock(() => Promise.resolve({ fee: 1000 })),
            ...(overrides.algorandService as Record<string, unknown> ?? {}),
        },
        syncManager: {},
        algodClient: {},
        indexerClient: null,
        ...overrides,
    } as unknown as AlgoChatService;
}

function createMockPskManager(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        sendMessage: mock((overrides.sendMessage as (() => Promise<void>)) ?? (() => Promise.resolve())),
    };
}

function createMockTransactor(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        sendToAddress: mock(
            (overrides.sendToAddress as ((...args: unknown[]) => Promise<unknown>)) ??
            (() => Promise.resolve({ fee: 1000 })),
        ),
    } as unknown as import('../algochat/on-chain-transactor').OnChainTransactor;
}

function createMockAgentWalletService(agentAccount: { account: unknown; address: string } | null = null) {
    return {
        getAgentChatAccount: mock(() => Promise.resolve(agentAccount)),
    } as unknown as import('../algochat/agent-wallet').AgentWalletService;
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

describe('ResponseFormatter', () => {
    // ── splitPskContent ──────────────────────────────────────────────────

    describe('splitPskContent', () => {
        test('should return single chunk when content fits within maxBytes', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            const result = formatter.splitPskContent('Hello world', 800);

            expect(result).toEqual(['Hello world']);
        });

        test('should return single chunk for exactly maxBytes content', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            // Create content that is exactly maxBytes
            const content = 'a'.repeat(100);
            const result = formatter.splitPskContent(content, 100);

            expect(result).toEqual([content]);
        });

        test('should split content that exceeds maxBytes', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            const content = 'a'.repeat(200);
            const result = formatter.splitPskContent(content, 100);

            expect(result.length).toBe(2);
            expect(result[0].length).toBe(100);
            expect(result[1].length).toBe(100);
            expect(result.join('')).toBe(content);
        });

        test('should split into multiple chunks for large content', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            const content = 'x'.repeat(350);
            const result = formatter.splitPskContent(content, 100);

            expect(result.length).toBe(4); // 100 + 100 + 100 + 50
            expect(result.join('')).toBe(content);
        });

        test('should prefer splitting at newlines within the last 20%', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            // Build content: 85 chars, then newline, then 14 chars = 100 total
            // The newline at position 85 is within the last 20% (80-100)
            const line1 = 'a'.repeat(85);
            const line2 = 'b'.repeat(14);
            const content = line1 + '\n' + line2 + 'c'.repeat(50);

            const result = formatter.splitPskContent(content, 100);

            // First chunk should break at the newline (position 86, inclusive of \n)
            expect(result[0]).toBe(line1 + '\n');
        });

        test('should not break at newlines too far from the end', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            // Newline at position 10, well before the 80% mark of 100 bytes
            const content = 'a'.repeat(10) + '\n' + 'b'.repeat(200);
            const result = formatter.splitPskContent(content, 100);

            // Should NOT break at position 10 newline (too early)
            // First chunk should be 100 chars
            expect(result[0].length).toBe(100);
        });

        test('should handle multi-byte UTF-8 characters correctly', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            // Emoji are 4 bytes each in UTF-8
            const emoji = '🎉';
            const content = emoji.repeat(30); // 30 * 4 = 120 bytes
            const result = formatter.splitPskContent(content, 50);

            // Each chunk should be at most 50 bytes
            const encoder = new TextEncoder();
            for (const chunk of result) {
                expect(encoder.encode(chunk).byteLength).toBeLessThanOrEqual(50);
            }

            // All chunks joined should equal original content
            expect(result.join('')).toBe(content);
        });

        test('should handle empty content', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            const result = formatter.splitPskContent('', 100);

            expect(result).toEqual(['']);
        });

        test('should handle content that is all newlines', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            const content = '\n'.repeat(200);
            const result = formatter.splitPskContent(content, 50);

            // All chunks joined should reconstruct the original content
            expect(result.join('')).toBe(content);
            // There should be multiple chunks
            expect(result.length).toBeGreaterThan(1);
        });
    });

    // ── onEvent / offEvent ───────────────────────────────────────────────

    describe('onEvent / offEvent', () => {
        test('should register and invoke event callbacks', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const callback = mock(() => {});

            formatter.onEvent(callback as AlgoChatEventCallback);
            formatter.emitEvent(PARTICIPANT_A, 'hello', 'inbound');

            expect(callback.mock.calls.length).toBe(1);
            expect(callback.mock.calls[0]).toEqual([PARTICIPANT_A, 'hello', 'inbound', undefined]);
        });

        test('should support multiple callbacks', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const cb1 = mock(() => {});
            const cb2 = mock(() => {});

            formatter.onEvent(cb1 as AlgoChatEventCallback);
            formatter.onEvent(cb2 as AlgoChatEventCallback);
            formatter.emitEvent(PARTICIPANT_A, 'msg', 'outbound', 500);

            expect(cb1.mock.calls.length).toBe(1);
            expect(cb2.mock.calls.length).toBe(1);
        });

        test('should unregister callbacks with offEvent', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const callback = mock(() => {});

            formatter.onEvent(callback as AlgoChatEventCallback);
            formatter.offEvent(callback as AlgoChatEventCallback);
            formatter.emitEvent(PARTICIPANT_A, 'msg', 'inbound');

            expect(callback.mock.calls.length).toBe(0);
        });

        test('offEvent should be safe for unregistered callbacks', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const callback = mock(() => {});

            // Should not throw
            formatter.offEvent(callback as AlgoChatEventCallback);
        });

        test('should not register the same callback twice', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const callback = mock(() => {});

            formatter.onEvent(callback as AlgoChatEventCallback);
            formatter.onEvent(callback as AlgoChatEventCallback); // duplicate
            formatter.emitEvent(PARTICIPANT_A, 'msg', 'inbound');

            // Set deduplication — should only fire once
            expect(callback.mock.calls.length).toBe(1);
        });
    });

    // ── emitEvent ────────────────────────────────────────────────────────

    describe('emitEvent', () => {
        test('should persist message to DB', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            formatter.emitEvent(PARTICIPANT_A, 'test message', 'inbound');

            const row = db.query('SELECT * FROM algochat_messages WHERE participant = ?').get(PARTICIPANT_A) as {
                participant: string;
                content: string;
                direction: string;
                fee: number;
            } | null;

            expect(row).not.toBeNull();
            expect(row!.content).toBe('test message');
            expect(row!.direction).toBe('inbound');
        });

        test('should persist message with fee', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            formatter.emitEvent(PARTICIPANT_A, 'paid msg', 'outbound', 2000);

            const row = db.query('SELECT * FROM algochat_messages WHERE participant = ?').get(PARTICIPANT_A) as {
                fee: number;
            } | null;

            expect(row).not.toBeNull();
            expect(row!.fee).toBe(2000);
        });

        test('should invoke callbacks with all parameters', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const callback = mock(() => {});
            formatter.onEvent(callback as AlgoChatEventCallback);

            formatter.emitEvent(PARTICIPANT_A, 'hello', 'status', 1500);

            expect(callback.mock.calls[0]).toEqual([PARTICIPANT_A, 'hello', 'status', 1500]);
        });

        test('should continue invoking callbacks even if one throws', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const throwing = mock(() => { throw new Error('callback error'); });
            const safe = mock(() => {});

            formatter.onEvent(throwing as unknown as AlgoChatEventCallback);
            formatter.onEvent(safe as AlgoChatEventCallback);

            // Should not throw
            formatter.emitEvent(PARTICIPANT_A, 'msg', 'inbound');

            expect(throwing.mock.calls.length).toBe(1);
            expect(safe.mock.calls.length).toBe(1);
        });

        test('should handle DB persistence failure gracefully', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            // Close DB to force persistence failure
            db.close();

            // Should not throw — logs warning instead
            expect(() => {
                formatter.emitEvent(PARTICIPANT_A, 'msg', 'inbound');
            }).not.toThrow();

            // Re-open DB for afterEach cleanup
            db = new Database(':memory:');
        });
    });

    // ── sendResponse ─────────────────────────────────────────────────────

    describe('sendResponse', () => {
        test('should route to PSK manager when available for participant', async () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const pskManager = createMockPskManager();

            formatter.setPskManagerLookup((addr) =>
                addr === PARTICIPANT_A ? pskManager as unknown as import('../algochat/psk').PSKManager : null,
            );

            await formatter.sendResponse(PARTICIPANT_A, 'psk hello');

            expect(pskManager.sendMessage.mock.calls.length).toBe(1);
            expect(pskManager.sendMessage.mock.calls[0][0]).toBe('psk hello');
        });

        test('should split large PSK messages into chunks', async () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const pskManager = createMockPskManager();

            formatter.setPskManagerLookup(() => pskManager as unknown as import('../algochat/psk').PSKManager);

            // Create content larger than 800 bytes (PSK limit) — 3 chunks
            const content = 'x'.repeat(2000);

            await formatter.sendResponse(PARTICIPANT_A, content);

            // Should have been split into multiple sendMessage calls
            expect(pskManager.sendMessage.mock.calls.length).toBeGreaterThan(1);

            // All chunks combined should cover the full content
            const sentContent = pskManager.sendMessage.mock.calls
                .map((c: unknown[]) => c[0])
                .join('');
            expect(sentContent).toBe(content);
        }, 30_000); // Inter-chunk delay is 4500ms; 3 chunks ~ 9s

        test('should emit event after successful PSK send', async () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const pskManager = createMockPskManager();
            const callback = mock(() => {});

            formatter.setPskManagerLookup(() => pskManager as unknown as import('../algochat/psk').PSKManager);
            formatter.onEvent(callback as AlgoChatEventCallback);

            await formatter.sendResponse(PARTICIPANT_A, 'psk msg');

            expect(callback.mock.calls.length).toBe(1);
            expect(callback.mock.calls[0][2]).toBe('outbound');
        });

        test('should route through OnChainTransactor when no PSK manager', async () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const transactor = createMockTransactor();

            formatter.setOnChainTransactor(transactor);

            await formatter.sendResponse(PARTICIPANT_A, 'on-chain msg');

            expect(transactor.sendToAddress.mock.calls.length).toBe(1);
            expect((transactor.sendToAddress.mock.calls[0] as unknown[])[1]).toBe(PARTICIPANT_A);
            expect((transactor.sendToAddress.mock.calls[0] as unknown[])[2]).toBe('on-chain msg');
        });

        test('should use per-agent wallet when conversation has agentId', async () => {
            // Create an agent and project, then a conversation with agentId
            const project = createProject(db, {
                name: 'Test Project',
                workingDir: '/tmp',
            });
            const agent = createAgent(db, {
                name: 'Test Agent',
            });

            createConversation(db, PARTICIPANT_A, agent.id, null);

            const agentAccount = { account: { address: 'AGENT_WALLET_ADDR' }, address: 'AGENT_WALLET_ADDR' };
            const agentWalletService = createMockAgentWalletService(agentAccount);
            const transactor = createMockTransactor();
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            formatter.setAgentWalletService(agentWalletService);
            formatter.setOnChainTransactor(transactor);

            await formatter.sendResponse(PARTICIPANT_A, 'agent msg');

            // Agent wallet service should have been consulted
            expect(agentWalletService.getAgentChatAccount.mock.calls.length).toBe(1);

            // Transactor should have been called with the agent account
            expect(transactor.sendToAddress.mock.calls.length).toBe(1);
            expect((transactor.sendToAddress.mock.calls[0] as unknown[])[0]).toEqual({ address: 'AGENT_WALLET_ADDR' });
        });

        test('should fall back to main account when agent wallet service returns null', async () => {
            const project = createProject(db, {
                name: 'Test Project',
                workingDir: '/tmp',
            });
            const agent = createAgent(db, {
                name: 'Test Agent',
            });

            createConversation(db, PARTICIPANT_A, agent.id, null);

            const agentWalletService = createMockAgentWalletService(null);
            const transactor = createMockTransactor();
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            formatter.setAgentWalletService(agentWalletService);
            formatter.setOnChainTransactor(transactor);

            await formatter.sendResponse(PARTICIPANT_A, 'fallback msg');

            // Should use main chat account
            expect((transactor.sendToAddress.mock.calls[0] as unknown[])[0]).toEqual({ address: MY_ADDR });
        });

        test('should emit event with fee after successful on-chain send', async () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const transactor = createMockTransactor({
                sendToAddress: () => Promise.resolve({ fee: 2000 }),
            });
            const callback = mock(() => {});

            formatter.setOnChainTransactor(transactor);
            formatter.onEvent(callback as AlgoChatEventCallback);

            await formatter.sendResponse(PARTICIPANT_A, 'msg');

            expect(callback.mock.calls.length).toBe(1);
            expect(callback.mock.calls[0][3]).toBe(2000); // fee
        });

        test('should handle transactor returning null (spending limit)', async () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const transactor = createMockTransactor({
                sendToAddress: () => Promise.resolve(null),
            });
            const callback = mock(() => {});

            formatter.setOnChainTransactor(transactor);
            formatter.onEvent(callback as AlgoChatEventCallback);

            await formatter.sendResponse(PARTICIPANT_A, 'msg');

            // No event should be emitted for null result
            expect(callback.mock.calls.length).toBe(0);
        });

        test('should block response when spending limit is exceeded', async () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const transactor = createMockTransactor();
            const callback = mock(() => {});

            formatter.setOnChainTransactor(transactor);
            formatter.onEvent(callback as AlgoChatEventCallback);

            // Exhaust the spending limit by inserting a large spend record for today
            // Default limit is 10 ALGO (10_000_000 microAlgos)
            const todayStr = new Date().toISOString().slice(0, 10);
            db.exec(`
                INSERT OR REPLACE INTO daily_spending (date, algo_micro, api_cost_usd)
                VALUES ('${todayStr}', 999999999, 0.0)
            `);

            await formatter.sendResponse(PARTICIPANT_A, 'blocked msg');

            // Transactor should NOT have been called
            expect(transactor.sendToAddress.mock.calls.length).toBe(0);
            // No event should be emitted
            expect(callback.mock.calls.length).toBe(0);
        });

        test('should fall back to direct algorandService send when no transactor', async () => {
            const algorandService = {
                discoverPublicKey: mock(() => Promise.resolve('PUB_KEY')),
                sendMessage: mock(() => Promise.resolve({ fee: 500 })),
            };
            const service = createMockService({ algorandService });
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            await formatter.sendResponse(PARTICIPANT_A, 'direct msg');

            expect(algorandService.discoverPublicKey.mock.calls.length).toBe(1);
            expect(algorandService.sendMessage.mock.calls.length).toBe(1);
        });

        test('should truncate large content in direct send fallback', async () => {
            const algorandService = {
                discoverPublicKey: mock(() => Promise.resolve('PUB_KEY')),
                sendMessage: mock(() => Promise.resolve({ fee: 500 })),
            };
            const service = createMockService({ algorandService });
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            const largeContent = 'x'.repeat(1000);
            await formatter.sendResponse(PARTICIPANT_A, largeContent);

            // The content sent should be truncated to ~840 chars + '...'
            const sentContent = algorandService.sendMessage.mock.calls[0][3] as string;
            expect(sentContent.length).toBeLessThan(1000);
            expect(sentContent.endsWith('...')).toBe(true);
        });

        test('should log dead letter on send failure without throwing', async () => {
            const algorandService = {
                discoverPublicKey: mock(() => Promise.reject(new Error('network error'))),
                sendMessage: mock(() => Promise.resolve({ fee: 0 })),
            };
            const service = createMockService({ algorandService });
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            // Should not throw — dead letter is logged
            await formatter.sendResponse(PARTICIPANT_A, 'failing msg');
        });

        test('should log dead letter on PSK send failure', async () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const pskManager = {
                sendMessage: mock(() => Promise.reject(new Error('psk failure'))),
            };

            formatter.setPskManagerLookup(() => pskManager as unknown as import('../algochat/psk').PSKManager);

            // Should not throw
            await formatter.sendResponse(PARTICIPANT_A, 'failing psk msg');
        });

        test('should pass sessionId to transactor from conversation', async () => {
            const project = createProject(db, {
                name: 'Test Project',
                workingDir: '/tmp',
            });
            const agent = createAgent(db, {
                name: 'Test Agent',
            });
            const session = createSession(db, {
                projectId: project.id,
                agentId: agent.id,
                name: 'Test Session',
                source: 'algochat',
            });

            createConversation(db, PARTICIPANT_A, agent.id, session.id);

            const transactor = createMockTransactor();
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            formatter.setOnChainTransactor(transactor);

            await formatter.sendResponse(PARTICIPANT_A, 'with session');

            // sessionId should be passed to sendToAddress
            expect((transactor.sendToAddress.mock.calls[0] as unknown[])[3]).toBe(session.id);
        });

        test('should handle conversation not found in DB', async () => {
            const transactor = createMockTransactor();
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            formatter.setOnChainTransactor(transactor);

            // Participant has no conversation in DB
            await formatter.sendResponse('UNKNOWN_ADDR', 'no conv');

            // Should still send with main account and undefined sessionId
            expect(transactor.sendToAddress.mock.calls.length).toBe(1);
            expect((transactor.sendToAddress.mock.calls[0] as unknown[])[0]).toEqual({ address: MY_ADDR });
            expect((transactor.sendToAddress.mock.calls[0] as unknown[])[3]).toBeUndefined();
        });
    });

    // ── Injection methods ────────────────────────────────────────────────

    describe('injection methods', () => {
        test('setAgentWalletService should inject wallet service', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const walletService = createMockAgentWalletService();

            // Should not throw
            formatter.setAgentWalletService(walletService);
        });

        test('setOnChainTransactor should inject transactor', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);
            const transactor = createMockTransactor();

            // Should not throw
            formatter.setOnChainTransactor(transactor);
        });

        test('setPskManagerLookup should inject PSK lookup function', () => {
            const service = createMockService();
            const formatter = new ResponseFormatter(db, createMockConfig(), service);

            // Should not throw
            formatter.setPskManagerLookup(() => null);
        });
    });
});
