/**
 * Comprehensive unit tests for MessageRouter — the core incoming message
 * routing pipeline for AlgoChat.
 *
 * Tests cover:
 * - handleIncomingMessage() — trace ID extraction, device name envelope parsing,
 *   raw group chunk safety guard, approval/question response routing,
 *   agent-to-agent filtering, owner authorization, command dispatch,
 *   session creation/resumption
 * - handleLocalMessage() — browser dashboard chat flow
 * - setupMessageHandler() — SyncManager message dedup and group chunk separation
 * - bufferGroupChunk() — group message buffering with stale cleanup
 * - setupSessionNotifications() — approval request forwarding, error notification
 * - sendApprovalRequest() — formatting and on-chain dispatch
 * - parseQuestionResponseFromChat() — question response parsing
 * - onMessage() — ChannelAdapter handler registration
 *
 * Uses an in-memory SQLite database with real schema migrations and lightweight
 * mocks for all dependencies.
 *
 * @module
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { MessageRouter } from '../algochat/message-router';
import type { ProcessManager } from '../process/manager';
import type { AlgoChatConfig } from '../algochat/config';
import type { AlgoChatService } from '../algochat/service';
import type { ResponseFormatter } from '../algochat/response-formatter';
import type { CommandHandler } from '../algochat/command-handler';
import type { SubscriptionManager } from '../algochat/subscription-manager';
import type { DiscoveryService } from '../algochat/discovery-service';
import type { PSKContactManager } from '../algochat/psk-contact-manager';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { AgentDirectory } from '../algochat/agent-directory';
import type { ApprovalManager } from '../process/approval-manager';
import type { OwnerQuestionManager } from '../process/owner-question-manager';
import type { ClaudeStreamEvent } from '../process/types';
import type { SessionMessage } from '../channels/types';

// ── Test constants ────────────────────────────────────────────────────────

const OWNER_ADDR = 'OWNER_ADDR_ABC123';
const NON_OWNER_ADDR = 'NON_OWNER_XYZ789';
const AGENT_ADDR = 'AGENT_WALLET_ADDR';
const PSK_CONTACT_ADDR = 'PSK_CONTACT_ADDR';
const PROJECT_ID = 'proj-1';
const AGENT_ID = 'agent-1';

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
        agentNetwork: 'testnet',
        ...overrides,
    } as AlgoChatConfig;
}

function createMockProcessManager(overrides: Partial<Record<string, unknown>> = {}): ProcessManager {
    return {
        getActiveSessionIds: mock(() => overrides.activeSessionIds ?? []),
        isRunning: mock((id: string) =>
            overrides.runningSessions
                ? (overrides.runningSessions as string[]).includes(id)
                : false
        ),
        startProcess: mock(() => {}),
        stopProcess: mock(() => {}),
        sendMessage: mock((_sessionId: string, _content: string) =>
            overrides.sendMessageResult ?? true
        ),
        resumeProcess: mock(() => {}),
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        subscribeAll: mock(() => {}),
        unsubscribeAll: mock(() => {}),
        approvalManager: {
            getQueuedRequests: mock(() => overrides.queuedRequests ?? []),
            resolveQueuedRequest: mock(() => overrides.resolveResult ?? false),
            setSenderAddress: mock(() => {}),
            operationalMode: 'normal',
        },
        ...overrides,
    } as unknown as ProcessManager;
}

function createMockResponseFormatter(): ResponseFormatter & {
    calls: Array<{ participant: string; content: string }>;
} {
    const calls: Array<{ participant: string; content: string }> = [];
    return {
        calls,
        sendResponse: mock(function (participant: string, content: string) {
            calls.push({ participant, content });
            return Promise.resolve();
        }),
        emitEvent: mock(() => {}),
    } as unknown as ResponseFormatter & {
        calls: Array<{ participant: string; content: string }>;
    };
}

function createMockCommandHandler(overrides: {
    isOwnerResult?: boolean | ((addr: string) => boolean);
    handleCommandResult?: boolean;
} = {}): CommandHandler {
    const isOwnerFn = typeof overrides.isOwnerResult === 'function'
        ? mock(overrides.isOwnerResult)
        : mock((_addr: string) => overrides.isOwnerResult ?? false);
    return {
        isOwner: isOwnerFn,
        handleCommand: mock(
            (_participant: string, _content: string, _responseFn?: (text: string) => void) =>
                overrides.handleCommandResult ?? false
        ),
        setWorkCommandRouter: mock(() => {}),
        setAgentMessenger: mock(() => {}),
        setSchedulerService: mock(() => {}),
    } as unknown as CommandHandler;
}

function createMockSubscriptionManager(): SubscriptionManager {
    return {
        hasLocalSubscription: mock(() => false),
        subscribeForResponse: mock(() => {}),
        subscribeForLocalResponse: mock(() => {}),
        updateLocalSendFn: mock(() => {}),
        updateLocalEventFn: mock(() => {}),
        cleanupLocalSession: mock(() => {}),
        cleanup: mock(() => {}),
    } as unknown as SubscriptionManager;
}

function createMockDiscoveryService(overrides: {
    agentWalletAddresses?: Set<string>;
    findAgentResult?: string | null;
    defaultProjectId?: string;
} = {}): DiscoveryService {
    return {
        getAgentWalletAddresses: mock(() => overrides.agentWalletAddresses ?? new Set<string>()),
        findAgentForNewConversation: mock(() => overrides.findAgentResult ?? AGENT_ID),
        getDefaultProjectId: mock(() => overrides.defaultProjectId ?? PROJECT_ID),
        startFastPolling: mock(() => {}),
        stopFastPolling: mock(() => {}),
        seedConversations: mock(() => {}),
        startDiscoveryPolling: mock(() => {}),
        stopDiscoveryPolling: mock(() => {}),
    } as unknown as DiscoveryService;
}

function createMockPSKContactManager(overrides: {
    pskContacts?: Set<string>;
} = {}): PSKContactManager {
    return {
        isPskContact: mock((addr: string) => overrides.pskContacts?.has(addr) ?? false),
        createPSKContact: mock(() => ({ id: 'c1', uri: '', nickname: 'Test' })),
        listPSKContacts: mock(() => []),
    } as unknown as PSKContactManager;
}

function createMockAlgoChatService(): AlgoChatService & { messageHandler?: (participant: string, messages: unknown[]) => void } {
    const svc: AlgoChatService & { messageHandler?: (participant: string, messages: unknown[]) => void } = {
        messageHandler: undefined,
        syncManager: {
            on: mock((event: string, handler: (participant: string, messages: unknown[]) => void) => {
                if (event === 'onMessagesReceived') {
                    svc.messageHandler = handler;
                }
            }),
            getOrCreateConversation: mock(() => ({
                setLastFetchedRound: mock(() => {}),
            })),
        },
        algorandService: {
            sendMessage: mock(() => Promise.resolve({ txid: 'txid-1' })),
        },
        algodClient: {},
    } as unknown as AlgoChatService & { messageHandler?: (participant: string, messages: unknown[]) => void };
    return svc;
}

function createMockAgentWalletService(): AgentWalletService {
    return {
        fundAgent: mock(() => Promise.resolve()),
    } as unknown as AgentWalletService;
}

function createMockAgentDirectory(overrides: {
    agentAddresses?: Map<string, string>;
} = {}): AgentDirectory {
    return {
        findAgentByAddress: mock((addr: string) => overrides.agentAddresses?.get(addr) ?? null),
    } as unknown as AgentDirectory;
}

function createMockApprovalManager(overrides: {
    resolveByShortIdResult?: boolean;
} = {}): ApprovalManager {
    return {
        resolveByShortId: mock(() => overrides.resolveByShortIdResult ?? false),
        setSenderAddress: mock(() => {}),
        getQueuedRequests: mock(() => []),
    } as unknown as ApprovalManager;
}

function createMockOwnerQuestionManager(overrides: {
    findByShortIdResult?: { options?: string[] } | null;
    resolveByShortIdResult?: boolean;
} = {}): OwnerQuestionManager {
    return {
        findByShortId: mock(() => overrides.findByShortIdResult ?? null),
        resolveByShortId: mock(() => overrides.resolveByShortIdResult ?? false),
    } as unknown as OwnerQuestionManager;
}

// ── Helper: seed DB with agent and project ────────────────────────────────

function seedAgentAndProject(db: Database, agentId = AGENT_ID, projectId = PROJECT_ID): void {
    db.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'Test Project', '/tmp')").run(projectId);
    db.query("INSERT INTO agents (id, name, algochat_enabled, default_project_id) VALUES (?, 'TestAgent', 1, ?)").run(agentId, projectId);
}

// ── Test suite ────────────────────────────────────────────────────────────

let db: Database;
let config: AlgoChatConfig;
let pm: ProcessManager;
let rf: ReturnType<typeof createMockResponseFormatter>;
let ch: CommandHandler;
let sm: SubscriptionManager;
let ds: DiscoveryService;
let cm: PSKContactManager;
let svc: ReturnType<typeof createMockAlgoChatService>;
let router: MessageRouter;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    seedAgentAndProject(db);

    config = createMockConfig();
    pm = createMockProcessManager();
    rf = createMockResponseFormatter();
    ch = createMockCommandHandler();
    sm = createMockSubscriptionManager();
    ds = createMockDiscoveryService();
    cm = createMockPSKContactManager();
    svc = createMockAlgoChatService();

    router = new MessageRouter(db, pm, config, svc as unknown as AlgoChatService, rf, ch, sm, ds, cm);
});

afterEach(() => {
    db.close();
});

// ── parseQuestionResponseFromChat (module-private, tested via handleIncomingMessage) ──

describe('handleIncomingMessage', () => {
    describe('trace ID extraction', () => {
        test('extracts trace ID from message prefix and strips it from content', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, '[trace:aabbccdd11223344aabbccdd11223344]\nHello', 1000);

            const handleCalls = (ch.handleCommand as ReturnType<typeof mock>).mock.calls;
            expect(handleCalls.length).toBe(1);
            expect(handleCalls[0][1]).toBe('Hello');
        });

        test('processes messages without trace ID normally', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, 'Hello world', 1000);

            const handleCalls = (ch.handleCommand as ReturnType<typeof mock>).mock.calls;
            expect(handleCalls.length).toBe(1);
            expect(handleCalls[0][1]).toBe('Hello world');
        });
    });

    describe('device name envelope parsing', () => {
        test('extracts message and device name from JSON envelope', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            const envelope = JSON.stringify({ m: 'Hello from phone', d: 'iPhone' });
            await router.handleIncomingMessage(OWNER_ADDR, envelope, 1000);

            const handleCalls = (ch.handleCommand as ReturnType<typeof mock>).mock.calls;
            expect(handleCalls.length).toBe(1);
            expect(handleCalls[0][1]).toBe('Hello from phone');
        });

        test('handles JSON envelope without device name', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            const envelope = JSON.stringify({ m: 'Hello from browser' });
            await router.handleIncomingMessage(OWNER_ADDR, envelope, 1000);

            const handleCalls = (ch.handleCommand as ReturnType<typeof mock>).mock.calls;
            expect(handleCalls.length).toBe(1);
            expect(handleCalls[0][1]).toBe('Hello from browser');
        });

        test('treats invalid JSON starting with { as plain text', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, '{invalid json', 1000);

            const handleCalls = (ch.handleCommand as ReturnType<typeof mock>).mock.calls;
            expect(handleCalls.length).toBe(1);
            expect(handleCalls[0][1]).toBe('{invalid json');
        });

        test('treats JSON without "m" field as plain text', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            const envelope = JSON.stringify({ foo: 'bar' });
            await router.handleIncomingMessage(OWNER_ADDR, envelope, 1000);

            const handleCalls = (ch.handleCommand as ReturnType<typeof mock>).mock.calls;
            expect(handleCalls.length).toBe(1);
            expect(handleCalls[0][1]).toBe(envelope);
        });
    });

    describe('raw group chunk safety guard', () => {
        test('rejects raw group chunks that were not reassembled', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, '[GRP:1/3]Hello', 1000);

            expect((ch.handleCommand as ReturnType<typeof mock>).mock.calls.length).toBe(0);
            expect((pm.startProcess as ReturnType<typeof mock>).mock.calls.length).toBe(0);
        });

        test('allows non-group messages through', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, 'Normal message', 1000);

            expect((ch.handleCommand as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });
    });

    describe('approval response routing', () => {
        test('routes approval "yes" response to ApprovalManager', async () => {
            const am = createMockApprovalManager({ resolveByShortIdResult: true });
            router.setApprovalManager(am);

            await router.handleIncomingMessage(OWNER_ADDR, 'yes abcdef12', 1000);

            const resolveCalls = (am.resolveByShortId as ReturnType<typeof mock>).mock.calls;
            expect(resolveCalls.length).toBe(1);
            expect(resolveCalls[0][0]).toBe('abcdef12');
            expect(resolveCalls[0][1]).toEqual({ behavior: 'allow' });
            expect(resolveCalls[0][2]).toBe(OWNER_ADDR);
        });

        test('routes approval "no" response to ApprovalManager', async () => {
            const am = createMockApprovalManager({ resolveByShortIdResult: true });
            router.setApprovalManager(am);

            await router.handleIncomingMessage(OWNER_ADDR, 'no abcdef12', 1000);

            const resolveCalls = (am.resolveByShortId as ReturnType<typeof mock>).mock.calls;
            expect(resolveCalls.length).toBe(1);
            expect(resolveCalls[0][0]).toBe('abcdef12');
            expect(resolveCalls[0][1]).toEqual({ behavior: 'deny' });
        });

        test('stops fast polling after successful approval resolution', async () => {
            const am = createMockApprovalManager({ resolveByShortIdResult: true });
            router.setApprovalManager(am);

            await router.handleIncomingMessage(OWNER_ADDR, 'yes abcdef12', 1000);

            expect((ds.stopFastPolling as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });

        test('does not short-circuit when approval resolution fails', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);
            const am = createMockApprovalManager({ resolveByShortIdResult: false });
            router.setApprovalManager(am);

            await router.handleIncomingMessage(OWNER_ADDR, 'yes abcdef12', 1000);

            expect((am.resolveByShortId as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });

        test('skips approval routing when no ApprovalManager is set', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, 'yes abc123', 1000);

            expect((ch.handleCommand as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });
    });

    describe('question response routing', () => {
        test('routes question response to OwnerQuestionManager', async () => {
            const oqm = createMockOwnerQuestionManager({
                findByShortIdResult: null,
                resolveByShortIdResult: true,
            });
            router.setOwnerQuestionManager(oqm);

            await router.handleIncomingMessage(OWNER_ADDR, '[ANS:abcd1234] My answer', 1000);

            const resolveCalls = (oqm.resolveByShortId as ReturnType<typeof mock>).mock.calls;
            expect(resolveCalls.length).toBe(1);
            expect(resolveCalls[0][0]).toBe('abcd1234');
            expect(resolveCalls[0][1]).toEqual({ answer: 'My answer', selectedOption: null });
        });

        test('parses numeric answer as option index when question has options', async () => {
            const oqm = createMockOwnerQuestionManager({
                findByShortIdResult: { options: ['Option A', 'Option B', 'Option C'] },
                resolveByShortIdResult: true,
            });
            router.setOwnerQuestionManager(oqm);

            await router.handleIncomingMessage(OWNER_ADDR, '[ANS:abcd1234] 2', 1000);

            const resolveCalls = (oqm.resolveByShortId as ReturnType<typeof mock>).mock.calls;
            expect(resolveCalls.length).toBe(1);
            expect(resolveCalls[0][1]).toEqual({ answer: 'Option B', selectedOption: 1 });
        });

        test('sends confirmation after resolving question', async () => {
            const oqm = createMockOwnerQuestionManager({
                findByShortIdResult: null,
                resolveByShortIdResult: true,
            });
            router.setOwnerQuestionManager(oqm);

            await router.handleIncomingMessage(OWNER_ADDR, '[ANS:abcd1234] done', 1000);

            expect(rf.calls.length).toBe(1);
            expect(rf.calls[0].content).toBe('[Question answered]');
            expect(rf.calls[0].participant).toBe(OWNER_ADDR);
        });

        test('skips question routing when OwnerQuestionManager is not set', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, '[ANS:abcd1234] test', 1000);

            expect((ch.handleCommand as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });

        test('falls through when question resolution fails', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);
            const oqm = createMockOwnerQuestionManager({
                findByShortIdResult: null,
                resolveByShortIdResult: false,
            });
            router.setOwnerQuestionManager(oqm);

            await router.handleIncomingMessage(OWNER_ADDR, '[ANS:abcd1234] test', 1000);

            expect((ch.handleCommand as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });
    });

    describe('agent-to-agent message filtering', () => {
        test('filters messages from known agent addresses', async () => {
            const ad = createMockAgentDirectory({ agentAddresses: new Map([[AGENT_ADDR, 'agent-2']]) });
            router.setAgentDirectory(ad);

            await router.handleIncomingMessage(AGENT_ADDR, 'Hello from agent', 1000);

            expect((ch.isOwner as ReturnType<typeof mock>).mock.calls.length).toBe(0);
            expect((ch.handleCommand as ReturnType<typeof mock>).mock.calls.length).toBe(0);
        });

        test('allows messages from non-agent addresses', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);
            const ad = createMockAgentDirectory({ agentAddresses: new Map() });
            router.setAgentDirectory(ad);

            await router.handleIncomingMessage(OWNER_ADDR, 'Hello from human', 1000);

            expect((ch.handleCommand as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });
    });

    describe('owner authorization', () => {
        test('allows messages from owner addresses', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000);

            expect((ch.handleCommand as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });

        test('allows messages from PSK contacts', async () => {
            const pskCm = createMockPSKContactManager({ pskContacts: new Set([PSK_CONTACT_ADDR]) });
            router = new MessageRouter(db, pm, config, svc as unknown as AlgoChatService, rf, ch, sm, ds, pskCm);

            await router.handleIncomingMessage(PSK_CONTACT_ADDR, 'Hello', 1000);

            expect((ch.handleCommand as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });

        test('rejects messages from non-owner, non-PSK addresses when allowlist is non-empty', async () => {
            // Add an unrelated address to the allowlist so it's no longer open mode
            db.exec("INSERT INTO algochat_allowlist (address, label) VALUES ('SOME_OTHER_ADDR', 'test')");

            await router.handleIncomingMessage(NON_OWNER_ADDR, 'Hello', 1000);

            expect((ch.handleCommand as ReturnType<typeof mock>).mock.calls.length).toBe(0);
            expect((pm.startProcess as ReturnType<typeof mock>).mock.calls.length).toBe(0);
        });

        test('allows messages from non-owner addresses when allowlist is empty (open mode)', async () => {
            await router.handleIncomingMessage(NON_OWNER_ADDR, 'Hello', 1000);

            // In open mode (empty allowlist), non-owners are allowed through
            expect((ch.handleCommand as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });
    });

    describe('feed event emission', () => {
        test('emits inbound feed event for authorized messages', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000, 5000);

            const emitCalls = (rf.emitEvent as ReturnType<typeof mock>).mock.calls;
            expect(emitCalls.length).toBe(1);
            expect(emitCalls[0][0]).toBe(OWNER_ADDR);
            expect(emitCalls[0][1]).toBe('Hello');
            expect(emitCalls[0][2]).toBe('inbound');
            expect(emitCalls[0][3]).toBe(5000);
        });

        test('does not emit feed event for rejected messages', async () => {
            // Add an unrelated address to the allowlist so it's no longer open mode
            db.exec("INSERT OR IGNORE INTO algochat_allowlist (address, label) VALUES ('SOME_OTHER_ADDR', 'test')");

            await router.handleIncomingMessage(NON_OWNER_ADDR, 'Hello', 1000);

            expect((rf.emitEvent as ReturnType<typeof mock>).mock.calls.length).toBe(0);
        });
    });

    describe('ChannelAdapter message handler notification', () => {
        test('notifies registered message handlers for authorized messages', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);
            const handler = mock((_msg: SessionMessage) => {});
            router.onMessage(handler);

            await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000, 100);

            expect(handler.mock.calls.length).toBe(1);
            const msg = handler.mock.calls[0][0];
            expect(msg.channelType).toBe('algochat');
            expect(msg.participant).toBe(OWNER_ADDR);
            expect(msg.content).toBe('Hello');
            expect(msg.direction).toBe('inbound');
            expect(msg.metadata).toEqual({ amount: 100 });
        });

        test('catches errors thrown by message handlers', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);
            const badHandler = mock(() => { throw new Error('handler error'); });
            router.onMessage(badHandler);

            await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000);

            expect(badHandler.mock.calls.length).toBe(1);
        });
    });

    describe('command dispatch', () => {
        test('delegates to CommandHandler for slash commands', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);
            (ch.handleCommand as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, '/status', 1000);

            const handleCalls = (ch.handleCommand as ReturnType<typeof mock>).mock.calls;
            expect(handleCalls.length).toBe(1);
            expect(handleCalls[0][0]).toBe(OWNER_ADDR);
            expect(handleCalls[0][1]).toBe('/status');
        });

        test('short-circuits when CommandHandler handles the message', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);
            (ch.handleCommand as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, '/status', 1000);

            expect((pm.startProcess as ReturnType<typeof mock>).mock.calls.length).toBe(0);
        });

        test('continues to session logic when CommandHandler returns false', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);
            (ch.handleCommand as ReturnType<typeof mock>).mockReturnValue(false);

            await router.handleIncomingMessage(OWNER_ADDR, 'Just a chat message', 1000);

            expect((pm.startProcess as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });
    });

    describe('session creation for new conversations', () => {
        test('creates session and conversation for new participant', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000);

            expect((pm.startProcess as ReturnType<typeof mock>).mock.calls.length).toBe(1);
            expect((sm.subscribeForResponse as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });

        test('returns early when no agent is found for new conversation', async () => {
            const freshDb = new Database(':memory:');
            freshDb.exec('PRAGMA foreign_keys = ON');
            runMigrations(freshDb);

            const ownerCh = createMockCommandHandler({ isOwnerResult: true });
            const noDisco = createMockDiscoveryService({ findAgentResult: null });
            const freshPm = createMockProcessManager();
            const freshRouter = new MessageRouter(freshDb, freshPm, config, svc as unknown as AlgoChatService, rf, ownerCh, sm, noDisco, cm);

            await freshRouter.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000);

            expect((freshPm.startProcess as ReturnType<typeof mock>).mock.calls.length).toBe(0);
            freshDb.close();
        });

        test('sends error when process start fails for new conversation', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);
            (pm.startProcess as ReturnType<typeof mock>).mockImplementation(() => {
                throw new Error('Process start failed');
            });

            await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000);

            expect(rf.calls.some(c => c.content.includes('[Error:'))).toBe(true);
        });
    });

    describe('session resumption for existing conversations', () => {
        test('sends message to running session', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000);
            await router.handleIncomingMessage(OWNER_ADDR, 'Follow up', 1001);

            expect((pm.sendMessage as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });

        test('resumes process when sendMessage returns false', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000);

            (pm.sendMessage as ReturnType<typeof mock>).mockReturnValue(false);

            await router.handleIncomingMessage(OWNER_ADDR, 'Follow up', 1001);

            expect((pm.resumeProcess as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });

        test('subscribes for response on every message for existing conversation', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000);
            await router.handleIncomingMessage(OWNER_ADDR, 'Follow up', 1001);

            expect((sm.subscribeForResponse as ReturnType<typeof mock>).mock.calls.length).toBe(2);
        });
    });

    describe('device name prepending for agent context', () => {
        test('prepends device name to agent content', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            const envelope = JSON.stringify({ m: 'Hello', d: 'MyDevice' });
            await router.handleIncomingMessage(OWNER_ADDR, envelope, 1000);

            const startCalls = (pm.startProcess as ReturnType<typeof mock>).mock.calls;
            expect(startCalls.length).toBe(1);
            expect(startCalls[0][1]).toBe('[From: MyDevice] Hello');
        });

        test('does not prepend when no device name', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, 'Plain message', 1000);

            const startCalls = (pm.startProcess as ReturnType<typeof mock>).mock.calls;
            expect(startCalls.length).toBe(1);
            expect(startCalls[0][1]).toBe('Plain message');
        });
    });

    describe('localnet auto micro-fund', () => {
        test('auto-funds agent wallet on localnet for existing conversations', async () => {
            const localConfig = createMockConfig({ network: 'localnet' });
            const aws = createMockAgentWalletService();
            router = new MessageRouter(db, pm, localConfig, svc as unknown as AlgoChatService, rf, ch, sm, ds, cm);
            router.setAgentWalletService(aws);
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000);
            await router.handleIncomingMessage(OWNER_ADDR, 'Follow up', 1001);

            expect((aws.fundAgent as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThanOrEqual(0);
        });

        test('does not auto-fund on non-localnet', async () => {
            const testnetConfig = createMockConfig({ network: 'testnet' });
            const aws = createMockAgentWalletService();
            router = new MessageRouter(db, pm, testnetConfig, svc as unknown as AlgoChatService, rf, ch, sm, ds, cm);
            router.setAgentWalletService(aws);
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000);

            expect((aws.fundAgent as ReturnType<typeof mock>).mock.calls.length).toBe(0);
        });
    });

    describe('conversation round update', () => {
        test('updates conversation round after processing', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 42000);

            const { getConversationByParticipant } = await import('../db/sessions');
            const conv = getConversationByParticipant(db, OWNER_ADDR);
            expect(conv).not.toBeNull();
            expect(conv!.lastRound).toBe(42000);
        });
    });

    describe('existing conversation with no session', () => {
        test('creates new session for conversation with null sessionId', async () => {
            (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

            const { createConversation } = await import('../db/sessions');
            createConversation(db, OWNER_ADDR, AGENT_ID, null);

            await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000);

            expect((pm.startProcess as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });
    });
});

// ── handleLocalMessage ─────────────────────────────────────────────────────

describe('handleLocalMessage', () => {
    let sendFn: ReturnType<typeof mock>;
    let eventFn: ReturnType<typeof mock>;

    beforeEach(() => {
        sendFn = mock((_source: string, _content: string, _direction: string) => {});
        eventFn = mock((_event: unknown) => {});
    });

    test('returns early if agent is not found', async () => {
        await router.handleLocalMessage('nonexistent-agent', 'Hello', sendFn, undefined, eventFn);

        expect(sendFn.mock.calls.length).toBe(0);
        expect((pm.startProcess as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });

    test('routes slash commands through CommandHandler', async () => {
        (ch.handleCommand as ReturnType<typeof mock>).mockReturnValue(true);

        await router.handleLocalMessage(AGENT_ID, '/status', sendFn, undefined, eventFn);

        const handleCalls = (ch.handleCommand as ReturnType<typeof mock>).mock.calls;
        expect(handleCalls.length).toBe(1);
        expect(handleCalls[0][0]).toBe('local');
        expect(handleCalls[0][1]).toBe('/status');
    });

    test('does not create session when command is handled', async () => {
        (ch.handleCommand as ReturnType<typeof mock>).mockReturnValue(true);

        await router.handleLocalMessage(AGENT_ID, '/help', sendFn, undefined, eventFn);

        expect((pm.startProcess as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });

    test('echoes inbound message via sendFn', async () => {
        await router.handleLocalMessage(AGENT_ID, 'Hello', sendFn, undefined, eventFn);

        const inboundCalls = sendFn.mock.calls.filter(
            (c: string[]) => c[2] === 'inbound'
        );
        expect(inboundCalls.length).toBe(1);
        expect(inboundCalls[0][1]).toBe('Hello');
    });

    test('emits inbound event via eventFn', async () => {
        await router.handleLocalMessage(AGENT_ID, 'Hello', sendFn, undefined, eventFn);

        const inboundEvents = eventFn.mock.calls.filter(
            (c: unknown[]) => (c[0] as Record<string, unknown>).type === 'message' && (c[0] as Record<string, unknown>).direction === 'inbound'
        );
        expect(inboundEvents.length).toBe(1);
    });

    test('creates new session for first message', async () => {
        await router.handleLocalMessage(AGENT_ID, 'Hello', sendFn, undefined, eventFn);

        expect((pm.startProcess as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    test('sends message to existing session on subsequent messages', async () => {
        await router.handleLocalMessage(AGENT_ID, 'Hello', sendFn, undefined, eventFn);
        await router.handleLocalMessage(AGENT_ID, 'Follow up', sendFn, undefined, eventFn);

        expect((pm.sendMessage as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    test('creates new session when existing process is not running', async () => {
        await router.handleLocalMessage(AGENT_ID, 'Hello', sendFn, undefined, eventFn);

        (pm.sendMessage as ReturnType<typeof mock>).mockReturnValue(false);

        await router.handleLocalMessage(AGENT_ID, 'New conversation', sendFn, undefined, eventFn);

        expect((pm.startProcess as ReturnType<typeof mock>).mock.calls.length).toBe(2);
    });

    test('emits session_info event when session is created', async () => {
        await router.handleLocalMessage(AGENT_ID, 'Hello', sendFn, undefined, eventFn);

        const sessionInfoEvents = eventFn.mock.calls.filter(
            (c: unknown[]) => (c[0] as Record<string, unknown>).type === 'session_info'
        );
        expect(sessionInfoEvents.length).toBe(1);
        expect((sessionInfoEvents[0][0] as Record<string, unknown>).sessionId).toBeTruthy();
    });

    test('uses provided projectId over defaults', async () => {
        const customProjectId = 'custom-proj';
        db.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'Custom', '/tmp/custom')").run(customProjectId);

        await router.handleLocalMessage(AGENT_ID, 'Hello', sendFn, customProjectId, eventFn);

        const startCalls = (pm.startProcess as ReturnType<typeof mock>).mock.calls;
        expect(startCalls.length).toBe(1);
        const session = startCalls[0][0];
        expect(session.projectId).toBe(customProjectId);
    });

    test('auto micro-funds agent wallet on localnet', async () => {
        const localConfig = createMockConfig({ network: 'localnet' });
        const aws = createMockAgentWalletService();
        router = new MessageRouter(db, pm, localConfig, svc as unknown as AlgoChatService, rf, ch, sm, ds, cm);
        router.setAgentWalletService(aws);

        db.query("UPDATE agents SET wallet_address = 'WALLET123' WHERE id = ?").run(AGENT_ID);

        await router.handleLocalMessage(AGENT_ID, 'Hello', sendFn, undefined, eventFn);

        expect((aws.fundAgent as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    test('updates local sendFn on subsequent messages', async () => {
        await router.handleLocalMessage(AGENT_ID, 'Hello', sendFn, undefined, eventFn);

        const newSendFn = mock(() => {});
        await router.handleLocalMessage(AGENT_ID, 'Follow up', newSendFn, undefined, eventFn);

        expect((sm.updateLocalSendFn as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThanOrEqual(1);
    });
});

// ── setupMessageHandler ────────────────────────────────────────────────────

describe('setupMessageHandler', () => {
    test('registers onMessagesReceived handler on SyncManager', () => {
        router.setupMessageHandler();

        const onCalls = (svc.syncManager.on as ReturnType<typeof mock>).mock.calls;
        expect(onCalls.length).toBe(1);
        expect(onCalls[0][0]).toBe('onMessagesReceived');
    });

    test('filters out sent messages', () => {
        (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);
        router.setupMessageHandler();

        const messages = [
            { content: 'Outgoing', direction: 'sent', confirmedRound: 100 },
            { content: 'Incoming', direction: 'received', confirmedRound: 100 },
        ];

        svc.messageHandler!('participant1', messages);
    });

    test('filters out messages from agent wallet addresses', () => {
        const dsWithWallets = createMockDiscoveryService({
            agentWalletAddresses: new Set([AGENT_ADDR]),
        });
        router = new MessageRouter(db, pm, config, svc as unknown as AlgoChatService, rf, ch, sm, dsWithWallets, cm);
        (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);
        router.setupMessageHandler();

        const messages = [
            { content: 'From agent', direction: 'received', confirmedRound: 100, sender: AGENT_ADDR },
        ];

        svc.messageHandler!('participant1', messages);
    });

    test('separates group chunks from regular messages', () => {
        (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);
        router.setupMessageHandler();

        const messages = [
            { content: '[GRP:1/2]Hello ', direction: 'received', confirmedRound: 100 },
            { content: '[GRP:2/2]World', direction: 'received', confirmedRound: 100 },
        ];

        svc.messageHandler!('participant1', messages);
    });
});

// ── setupSessionNotifications ──────────────────────────────────────────────

describe('setupSessionNotifications', () => {
    test('subscribes to processManager events', () => {
        router.setupSessionNotifications();

        expect((pm.subscribeAll as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    test('forwards approval request events for AlgoChat sessions', async () => {
        const am = createMockApprovalManager();
        router.setApprovalManager(am);
        (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

        await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000);

        router.setupSessionNotifications();

        const callback = (pm.subscribeAll as ReturnType<typeof mock>).mock.calls[0][0] as (sessionId: string, event: ClaudeStreamEvent) => void;
        const { listConversations } = await import('../db/sessions');
        const conversations = listConversations(db);
        const conv = conversations[0];

        callback(conv.sessionId!, {
            type: 'approval_request',
            id: 'approval-id-123',
            sessionId: conv.sessionId!,
            toolName: 'bash',
            description: 'Run npm install',
            createdAt: Date.now(),
            timeoutMs: 120_000,
        } as ClaudeStreamEvent);

        expect((am.setSenderAddress as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    test('sends error notification for AlgoChat session errors', async () => {
        (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

        await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000);

        router.setupSessionNotifications();

        const callback = (pm.subscribeAll as ReturnType<typeof mock>).mock.calls[0][0] as (sessionId: string, event: ClaudeStreamEvent) => void;
        const { listConversations } = await import('../db/sessions');
        const conversations = listConversations(db);
        const conv = conversations[0];

        callback(conv.sessionId!, {
            type: 'error',
            error: { message: 'Something went wrong' },
        } as ClaudeStreamEvent);

        expect(rf.calls.some(c => c.content.includes('[Error:'))).toBe(true);
        expect(rf.calls.some(c => c.participant === OWNER_ADDR)).toBe(true);
    });

    test('ignores events for unknown sessions', () => {
        router.setupSessionNotifications();

        const callback = (pm.subscribeAll as ReturnType<typeof mock>).mock.calls[0][0] as (sessionId: string, event: ClaudeStreamEvent) => void;

        callback('nonexistent-session', {
            type: 'error',
            error: { message: 'Error' },
        } as ClaudeStreamEvent);

        expect(rf.calls.length).toBe(0);
    });

    test('ignores non-relevant event types', () => {
        router.setupSessionNotifications();

        const callback = (pm.subscribeAll as ReturnType<typeof mock>).mock.calls[0][0] as (sessionId: string, event: ClaudeStreamEvent) => void;

        callback('some-session', {
            type: 'message',
            content: 'Hello',
        } as unknown as ClaudeStreamEvent);

        expect(rf.calls.length).toBe(0);
    });
});

// ── cleanupSessionNotifications ────────────────────────────────────────────

describe('cleanupSessionNotifications', () => {
    test('unsubscribes session notification handler', () => {
        router.setupSessionNotifications();
        router.cleanupSessionNotifications();

        expect((pm.unsubscribeAll as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    test('does nothing when no handler is set', () => {
        router.cleanupSessionNotifications();

        expect((pm.unsubscribeAll as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });
});

// ── sendApprovalRequest ────────────────────────────────────────────────────

describe('sendApprovalRequest', () => {
    test('formats and sends approval request on-chain', async () => {
        await router.sendApprovalRequest(OWNER_ADDR, {
            id: 'abcdef1234567890',
            sessionId: 'sess-1',
            toolName: 'bash',
            description: 'Run npm install',
            createdAt: Date.now(),
            timeoutMs: 120_000,
        });

        expect(rf.calls.length).toBe(1);
        expect(rf.calls[0].participant).toBe(OWNER_ADDR);
        expect(rf.calls[0].content).toContain('[APPROVE?:abcdef12]');
        expect(rf.calls[0].content).toContain('Run npm install');
    });

    test('starts fast polling after sending approval request', async () => {
        await router.sendApprovalRequest(OWNER_ADDR, {
            id: 'abcdef1234567890',
            sessionId: 'sess-1',
            toolName: 'bash',
            description: 'Test',
            createdAt: Date.now(),
            timeoutMs: 120_000,
        });

        expect((ds.startFastPolling as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });
});

// ── onMessage (ChannelAdapter) ─────────────────────────────────────────────

describe('onMessage', () => {
    test('registers a handler for inbound messages', () => {
        const handler = mock(() => {});
        router.onMessage(handler);
    });
});

// ── channelType ────────────────────────────────────────────────────────────

describe('channelType', () => {
    test('has channelType of "algochat"', () => {
        expect(router.channelType).toBe('algochat');
    });
});

// ── Dependency injection ───────────────────────────────────────────────────

describe('dependency injection', () => {
    test('setAgentWalletService stores service for later use', async () => {
        const aws = createMockAgentWalletService();
        router.setAgentWalletService(aws);
        expect(true).toBe(true);
    });

    test('setAgentDirectory stores directory for agent filtering', async () => {
        const ad = createMockAgentDirectory({ agentAddresses: new Map([['ADDR', 'agent-x']]) });
        router.setAgentDirectory(ad);

        await router.handleIncomingMessage('ADDR', 'Hello', 1000);

        expect((ch.isOwner as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });

    test('setApprovalManager enables approval routing', async () => {
        const am = createMockApprovalManager({ resolveByShortIdResult: true });
        router.setApprovalManager(am);

        await router.handleIncomingMessage(OWNER_ADDR, 'yes abcdef12', 1000);

        expect((am.resolveByShortId as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    test('setOwnerQuestionManager enables question routing', async () => {
        const oqm = createMockOwnerQuestionManager({ resolveByShortIdResult: true });
        router.setOwnerQuestionManager(oqm);

        await router.handleIncomingMessage(OWNER_ADDR, '[ANS:abcd1234] yes', 1000);

        expect((oqm.resolveByShortId as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });
});

// ── Combined trace + envelope ──────────────────────────────────────────────

describe('combined trace ID + device envelope', () => {
    test('strips trace and parses envelope from same message', async () => {
        (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

        const envelope = JSON.stringify({ m: 'Hello', d: 'Phone' });
        const content = `[trace:aabbccdd11223344aabbccdd11223344]\n${envelope}`;

        await router.handleIncomingMessage(OWNER_ADDR, content, 1000);

        const handleCalls = (ch.handleCommand as ReturnType<typeof mock>).mock.calls;
        expect(handleCalls.length).toBe(1);
        expect(handleCalls[0][1]).toBe('Hello');

        const startCalls = (pm.startProcess as ReturnType<typeof mock>).mock.calls;
        expect(startCalls.length).toBe(1);
        expect(startCalls[0][1]).toBe('[From: Phone] Hello');
    });
});

// ── Edge cases ─────────────────────────────────────────────────────────────

describe('edge cases', () => {
    test('handles empty message content', async () => {
        (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

        await router.handleIncomingMessage(OWNER_ADDR, '', 1000);
    });

    test('handles approval-like message with no ApprovalManager', async () => {
        (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

        await router.handleIncomingMessage(OWNER_ADDR, 'approve abc12345', 1000);

        expect((ch.handleCommand as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    test('handles question-like message with no OwnerQuestionManager', async () => {
        (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

        await router.handleIncomingMessage(OWNER_ADDR, '[ANS:abcd1234] test', 1000);

        expect((ch.handleCommand as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    test('handles message with amount metadata', async () => {
        (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);

        await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000, 50000);

        const emitCalls = (rf.emitEvent as ReturnType<typeof mock>).mock.calls;
        expect(emitCalls.length).toBe(1);
        expect(emitCalls[0][3]).toBe(50000);
    });

    test('handles multiple ChannelAdapter message handlers', async () => {
        (ch.isOwner as ReturnType<typeof mock>).mockReturnValue(true);
        const handler1 = mock(() => {});
        const handler2 = mock(() => {});
        router.onMessage(handler1);
        router.onMessage(handler2);

        await router.handleIncomingMessage(OWNER_ADDR, 'Hello', 1000);

        expect(handler1.mock.calls.length).toBe(1);
        expect(handler2.mock.calls.length).toBe(1);
    });
});
