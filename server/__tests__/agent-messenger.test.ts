import { test, expect, beforeEach, describe, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import { getAgentMessage, getThreadMessages } from '../db/agent-messages';
import { AgentMessenger } from '../algochat/agent-messenger';
import type { ProcessManager } from '../process/manager';
import type { AlgoChatConfig } from '../algochat/config';
import type { WorkTaskService } from '../work/service';
import { WorkCommandRouter } from '../algochat/work-command-router';
import type { ClaudeStreamEvent } from '../process/types';
import type { Agent, AgentMessage } from '../../shared/types';

// ─── Mock objects ────────────────────────────────────────────────────────────

const mockConfig = {
    network: 'localnet',
    syncInterval: 5000,
    mnemonic: 'test',
} as unknown as AlgoChatConfig;

function createMockProcessManager() {
    return {
        startProcess: mock(() => {}),
        sendMessage: mock(() => true),
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        isRunning: mock(() => false),
        resumeProcess: mock(() => {}),
        subscribeAll: mock(() => {}),
        unsubscribeAll: mock(() => {}),
        extendTimeout: mock(() => true),
        setOwnerCheck: mock(() => {}),
        getMemoryStats: mock(() => ({
            processes: 0,
            subscribers: 0,
            sessionMeta: 0,
            pausedSessions: 0,
            sessionTimeouts: 0,
            stableTimers: 0,
            globalSubscribers: 0,
        })),
        cleanupSessionState: mock(() => {}),
        shutdown: mock(() => {}),
        stopProcess: mock(() => {}),
    } as unknown as ProcessManager;
}

/** Helper: wire a mock WorkTaskService into the messenger via a WorkCommandRouter. */
function wireWorkTaskService(m: AgentMessenger, d: Database, wts: WorkTaskService): void {
    const router = new WorkCommandRouter(d);
    router.setWorkTaskService(wts);
    m.setWorkCommandRouter(router);
}

// ─── Test state ──────────────────────────────────────────────────────────────

let db: Database;
let messenger: AgentMessenger;
let mockProcessManager: ProcessManager;
let projectId: string;
let agentA: Agent;
let agentB: Agent;

beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);

    // Create a default project (required by getDefaultProjectId fallback)
    const project = createProject(db, {
        name: 'Test Project',
        workingDir: '/tmp/test',
    });
    projectId = project.id;

    // Create two agents for testing invocations
    agentA = createAgent(db, { name: 'Agent A' });
    agentB = createAgent(db, { name: 'Agent B' });

    mockProcessManager = createMockProcessManager();

    messenger = new AgentMessenger(
        db,
        mockConfig,
        null, // OnChainTransactor is null for tests (no chain operations)
        mockProcessManager,
    );
});

// ─── invoke() ────────────────────────────────────────────────────────────────

describe('invoke()', () => {
    test('throws when fromAgentId === toAgentId', async () => {
        await expect(
            messenger.invoke({
                fromAgentId: agentA.id,
                toAgentId: agentA.id,
                content: 'hello self',
            }),
        ).rejects.toThrow('An agent cannot invoke itself');
    });

    test('throws when source agent not found', async () => {
        await expect(
            messenger.invoke({
                fromAgentId: 'nonexistent-id',
                toAgentId: agentB.id,
                content: 'hello',
            }),
        ).rejects.toThrow('Source agent nonexistent-id not found');
    });

    test('throws when target agent not found', async () => {
        await expect(
            messenger.invoke({
                fromAgentId: agentA.id,
                toAgentId: 'nonexistent-id',
                content: 'hello',
            }),
        ).rejects.toThrow('Target agent nonexistent-id not found');
    });

    test('creates agent_messages row in DB', async () => {
        const result = await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'Hello Agent B',
            projectId,
        });

        expect(result.message).toBeDefined();
        expect(result.message.fromAgentId).toBe(agentA.id);
        expect(result.message.toAgentId).toBe(agentB.id);
        expect(result.message.content).toBe('Hello Agent B');
        expect(result.sessionId).toBeTruthy();

        // Verify the row persists in DB
        const dbMessage = getAgentMessage(db, result.message.id);
        expect(dbMessage).not.toBeNull();
        expect(dbMessage!.fromAgentId).toBe(agentA.id);
        expect(dbMessage!.toAgentId).toBe(agentB.id);
        expect(dbMessage!.content).toBe('Hello Agent B');
    });

    test('calls processManager.startProcess to start a session', async () => {
        const result = await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'Process this',
            projectId,
        });

        expect(result.sessionId).toBeTruthy();
        expect(mockProcessManager.startProcess).toHaveBeenCalled();
    });

    test('subscribes to session events for response capture', async () => {
        await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'Test subscribe',
            projectId,
        });

        expect(mockProcessManager.subscribe).toHaveBeenCalled();
    });

    test('sets default payment of 1000 microALGO when not specified', async () => {
        const result = await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'Default payment test',
            projectId,
        });

        const dbMessage = getAgentMessage(db, result.message.id);
        expect(dbMessage!.paymentMicro).toBe(1000);
    });

    test('uses custom payment amount when specified', async () => {
        const result = await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'Custom payment test',
            paymentMicro: 5000,
            projectId,
        });

        const dbMessage = getAgentMessage(db, result.message.id);
        expect(dbMessage!.paymentMicro).toBe(5000);
    });

    test('assigns a threadId to the message', async () => {
        const result = await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'Thread test',
            projectId,
        });

        expect(result.message.threadId).toBeTruthy();
    });

    test('uses provided threadId when specified', async () => {
        const customThreadId = crypto.randomUUID();
        const result = await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'Custom thread test',
            threadId: customThreadId,
            projectId,
        });

        expect(result.message.threadId).toBe(customThreadId);
    });

    test('resolves projectId from agent defaultProjectId when not provided', async () => {
        // Create agent with a default project
        const agentWithProject = createAgent(db, {
            name: 'Agent With Project',
            defaultProjectId: projectId,
        });

        const result = await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentWithProject.id,
            content: 'Project resolution test',
        });

        // Session should be created (startProcess called with a session that has a projectId)
        expect(result.sessionId).toBeTruthy();
        expect(mockProcessManager.startProcess).toHaveBeenCalled();
    });

    test('falls back to default project when no projectId available', async () => {
        const result = await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'Fallback project test',
        });

        expect(result.sessionId).toBeTruthy();
        expect(mockProcessManager.startProcess).toHaveBeenCalled();
    });
});

// ─── invoke() with [WORK] prefix ─────────────────────────────────────────────

describe('invoke() with [WORK] prefix', () => {
    test('routes through WorkTaskService when available', async () => {
        const mockWorkCreate = mock(() =>
            Promise.resolve({
                id: 'task-1',
                sessionId: 'session-work-1',
                status: 'running',
                agentId: agentB.id,
                projectId,
                description: 'do something',
                source: 'agent',
            }),
        );

        const mockOnComplete = mock(() => {});

        const mockWorkTaskService = {
            create: mockWorkCreate,
            onComplete: mockOnComplete,
        } as unknown as WorkTaskService;

        wireWorkTaskService(messenger, db, mockWorkTaskService);

        const result = await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: '[WORK] Implement feature X',
            projectId,
        });

        expect(mockWorkCreate).toHaveBeenCalledTimes(1);
        const createCall = (mockWorkCreate.mock.calls as unknown as Array<[Record<string, unknown>]>)[0][0];
        expect(createCall.description).toBe('Implement feature X');
        expect(createCall.source).toBe('agent');
        expect(result.sessionId).toBe('session-work-1');
        expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });

    test('throws when [WORK] prefix has empty description', async () => {
        const mockWorkTaskService = {
            create: mock(() => Promise.resolve({})),
            onComplete: mock(() => {}),
        } as unknown as WorkTaskService;

        wireWorkTaskService(messenger, db, mockWorkTaskService);

        await expect(
            messenger.invoke({
                fromAgentId: agentA.id,
                toAgentId: agentB.id,
                content: '[WORK]',
                projectId,
            }),
        ).rejects.toThrow('[WORK] prefix requires a task description');
    });

    test('[WORK] prefix is ignored when WorkTaskService not set', async () => {
        // No workTaskService set — should proceed as a normal invoke
        const result = await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: '[WORK] This will be sent normally',
            projectId,
        });

        // Should create a normal message, not route through work service
        expect(result.message.content).toBe('[WORK] This will be sent normally');
        expect(mockProcessManager.startProcess).toHaveBeenCalled();
    });

    test('[WORK] marks message as failed when work task creation throws', async () => {
        const mockWorkTaskService = {
            create: mock(() => Promise.reject(new Error('worktree creation failed'))),
            onComplete: mock(() => {}),
        } as unknown as WorkTaskService;

        wireWorkTaskService(messenger, db, mockWorkTaskService);

        await expect(
            messenger.invoke({
                fromAgentId: agentA.id,
                toAgentId: agentB.id,
                content: '[WORK] Will fail',
                projectId,
            }),
        ).rejects.toThrow('worktree creation failed');
    });
});

// ─── sendOnChainBestEffort() ─────────────────────────────────────────────────

describe('sendOnChainBestEffort()', () => {
    test('returns null when OnChainTransactor is null', async () => {
        const txid = await messenger.sendOnChainBestEffort(agentA.id, agentB.id, 'hello');
        expect(txid).toBeNull();
    });

    test('never throws even when internal call would fail', async () => {
        // transactor is null, so delegation returns null — should not throw
        const txid = await messenger.sendOnChainBestEffort(agentA.id, agentB.id, 'test');
        expect(txid).toBeNull();
    });
});

// ─── sendOnChainToSelf() ─────────────────────────────────────────────────────

describe('sendOnChainToSelf()', () => {
    test('returns null when OnChainTransactor is null', async () => {
        const txid = await messenger.sendOnChainToSelf(agentA.id, 'memory content');
        expect(txid).toBeNull();
    });
});

// ─── sendNotificationToAddress() ─────────────────────────────────────────────

describe('sendNotificationToAddress()', () => {
    test('returns null when OnChainTransactor is null', async () => {
        const txid = await messenger.sendNotificationToAddress(agentA.id, 'SOME_ADDRESS', 'notify');
        expect(txid).toBeNull();
    });
});

// ─── onMessageUpdate() ──────────────────────────────────────────────────────

describe('onMessageUpdate()', () => {
    test('registers a callback that receives message updates', async () => {
        const updates: AgentMessage[] = [];
        messenger.onMessageUpdate((msg) => {
            updates.push(msg);
        });

        // Trigger an invoke which internally calls emitMessageUpdate
        await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'trigger update',
            projectId,
        });

        // At least one update should have been emitted (the 'sent' status update)
        expect(updates.length).toBeGreaterThanOrEqual(1);
        expect(updates[0].fromAgentId).toBe(agentA.id);
        expect(updates[0].toAgentId).toBe(agentB.id);
    });

    test('returns an unsubscribe function that removes the callback', async () => {
        const updates: AgentMessage[] = [];
        const unsub = messenger.onMessageUpdate((msg) => {
            updates.push(msg);
        });

        // First invoke — should trigger callback
        await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'first invoke',
            projectId,
        });
        const countAfterFirst = updates.length;
        expect(countAfterFirst).toBeGreaterThanOrEqual(1);

        // Unsubscribe
        unsub();

        // Second invoke — should NOT trigger the callback
        await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'second invoke',
            projectId,
        });
        expect(updates.length).toBe(countAfterFirst);
    });

    test('supports multiple simultaneous listeners', async () => {
        const updates1: AgentMessage[] = [];
        const updates2: AgentMessage[] = [];

        messenger.onMessageUpdate((msg) => updates1.push(msg));
        messenger.onMessageUpdate((msg) => updates2.push(msg));

        await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'multi-listener test',
            projectId,
        });

        expect(updates1.length).toBeGreaterThanOrEqual(1);
        expect(updates2.length).toBeGreaterThanOrEqual(1);
        // Both should receive the same updates
        expect(updates1.length).toBe(updates2.length);
    });

    test('swallows errors thrown by callbacks', async () => {
        messenger.onMessageUpdate(() => {
            throw new Error('callback error');
        });

        // Should not throw even though callback throws
        const result = await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'error callback test',
            projectId,
        });

        expect(result.message).toBeDefined();
    });
});

// ─── Thread history (indirect test via invoke) ───────────────────────────────

describe('thread history building', () => {
    test('includes prior thread messages in the prompt for subsequent invocations', async () => {
        const threadId = crypto.randomUUID();

        // First message in thread
        await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'First message in thread',
            threadId,
            projectId,
        });

        // Verify first thread message exists
        const threadMessages = getThreadMessages(db, threadId);
        expect(threadMessages.length).toBe(1);

        // Second message in same thread — should include history in prompt
        const startProcessMock = mockProcessManager.startProcess as ReturnType<typeof mock>;
        startProcessMock.mockClear();

        await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'Second message in thread',
            threadId,
            projectId,
        });

        // Verify thread now has 2 messages
        const threadMessagesAfter = getThreadMessages(db, threadId);
        expect(threadMessagesAfter.length).toBe(2);

        // The second startProcess call should have a prompt containing thread history
        expect(startProcessMock).toHaveBeenCalledTimes(1);
        const callArgs = startProcessMock.mock.calls[0];
        const prompt = callArgs[1] as string;
        expect(prompt).toContain('Previous messages in this conversation');
        expect(prompt).toContain('First message in thread');
    });

    test('first message in thread has no history prefix', async () => {
        const threadId = crypto.randomUUID();
        const startProcessMock = mockProcessManager.startProcess as ReturnType<typeof mock>;

        await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: 'Lone message',
            threadId,
            projectId,
        });

        expect(startProcessMock).toHaveBeenCalledTimes(1);
        const callArgs = startProcessMock.mock.calls[0];
        const prompt = callArgs[1] as string;
        expect(prompt).not.toContain('Previous messages in this conversation');
        expect(prompt).toContain('Lone message');
    });
});

// ─── invokeAndWait() ─────────────────────────────────────────────────────────

describe('invokeAndWait()', () => {
    test('calls invoke and subscribes for response', async () => {
        // Override subscribe to capture the callback and simulate a response
        const subscribeCallbacks = new Map<string, Set<(sid: string, event: ClaudeStreamEvent) => void>>();

        (mockProcessManager.subscribe as ReturnType<typeof mock>).mockImplementation(
            (sessionId: string, cb: (sid: string, event: ClaudeStreamEvent) => void) => {
                let cbs = subscribeCallbacks.get(sessionId);
                if (!cbs) {
                    cbs = new Set();
                    subscribeCallbacks.set(sessionId, cbs);
                }
                cbs.add(cb);

                // Simulate an immediate response after subscribing
                setTimeout(() => {
                    // Send assistant content
                    cb(sessionId, {
                        type: 'assistant',
                        message: { role: 'assistant', content: 'Here is my response' },
                    });
                    // Send result to mark turn end
                    cb(sessionId, { type: 'result', total_cost_usd: 0.01 });
                    // Send session_exited to finalize
                    cb(sessionId, { type: 'session_exited' });
                }, 10);
            },
        );

        const result = await messenger.invokeAndWait(
            {
                fromAgentId: agentA.id,
                toAgentId: agentB.id,
                content: 'Wait for response',
                projectId,
            },
            5000,
        );

        expect(result.response).toBe('Here is my response');
        expect(result.threadId).toBeTruthy();
    });

    test('returns last turn response when buffer is empty at session exit', async () => {
        (mockProcessManager.subscribe as ReturnType<typeof mock>).mockImplementation(
            (sessionId: string, cb: (sid: string, event: ClaudeStreamEvent) => void) => {
                setTimeout(() => {
                    // Send assistant content
                    cb(sessionId, {
                        type: 'assistant',
                        message: { role: 'assistant', content: 'Turn 1 response' },
                    });
                    // result event resets buffer, saves to lastTurnResponse
                    cb(sessionId, { type: 'result', total_cost_usd: 0 });
                    // session exits with empty responseBuffer
                    cb(sessionId, { type: 'session_exited' });
                }, 10);
            },
        );

        const result = await messenger.invokeAndWait(
            {
                fromAgentId: agentA.id,
                toAgentId: agentB.id,
                content: 'Multi-turn test',
                projectId,
            },
            5000,
        );

        expect(result.response).toBe('Turn 1 response');
    });
});

// ─── setWorkCommandRouter() ──────────────────────────────────────────────────

describe('setWorkCommandRouter()', () => {
    test('enables [WORK] prefix routing after being set', async () => {
        const mockWorkCreate = mock(() =>
            Promise.resolve({
                id: 'task-2',
                sessionId: 'session-work-2',
                status: 'running',
            }),
        );

        const mockWorkTaskService = {
            create: mockWorkCreate,
            onComplete: mock(() => {}),
        } as unknown as WorkTaskService;

        // Before setting — [WORK] should go through normal invoke
        await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: '[WORK] Before set',
            projectId,
        });
        expect(mockWorkCreate).not.toHaveBeenCalled();

        // After setting
        wireWorkTaskService(messenger, db, mockWorkTaskService);
        await messenger.invoke({
            fromAgentId: agentA.id,
            toAgentId: agentB.id,
            content: '[WORK] After set',
            projectId,
        });
        expect(mockWorkCreate).toHaveBeenCalledTimes(1);
    });
});

// ─── DB property access ──────────────────────────────────────────────────────

describe('db property', () => {
    test('exposes the database instance as a readonly property', () => {
        expect(messenger.db).toBe(db);
    });
});
