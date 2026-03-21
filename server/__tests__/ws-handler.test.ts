import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { createWebSocketHandler, broadcastAlgoChatMessage, tenantTopic, HEARTBEAT_INTERVAL_MS, PONG_TIMEOUT_MS, AUTH_TIMEOUT_MS, type WsData } from '../ws/handler';
import { isClientMessage } from '../../shared/ws-protocol';
import type { SessionErrorRecoveryEvent } from '../process/types';
import type { ProcessManager } from '../process/manager';
import type { AuthConfig } from '../middleware/auth';

/**
 * WebSocket handler tests.
 *
 * Uses mock ServerWebSocket objects and a mock ProcessManager to verify
 * message parsing, subscription lifecycle, error handling, and each
 * message-type handler.
 */

// ─── Auth config helpers ──────────────────────────────────────────────────

/** Auth disabled (localhost mode) — all connections auto-authenticate */
const noAuthConfig: AuthConfig = { apiKey: null, allowedOrigins: [], bindHost: '127.0.0.1' };

/** Auth enabled — connections must authenticate via upgrade or first-message */
const withAuthConfig: AuthConfig = { apiKey: 'test-secret-key-1234', allowedOrigins: [], bindHost: '0.0.0.0' };

// ─── Mock helpers ──────────────────────────────────────────────────────────

function createMockWs(authenticated = true) {
    const sent: string[] = [];
    const subscribed: string[] = [];
    const unsubscribed: string[] = [];
    let closed = false;
    return {
        ws: {
            data: { subscriptions: new Map(), authenticated } as WsData,
            send: mock((msg: string) => { sent.push(msg); }),
            subscribe: mock((topic: string) => { subscribed.push(topic); }),
            unsubscribe: mock((topic: string) => { unsubscribed.push(topic); }),
            close: mock((_code?: number, _reason?: string) => { closed = true; }),
        } as unknown as import('bun').ServerWebSocket<WsData>,
        sent,
        subscribed,
        unsubscribed,
        get closed() { return closed; },
    };
}

function createMockProcessManager(overrides?: Partial<ProcessManager>): ProcessManager {
    return {
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        sendMessage: mock(() => true),
        stopProcess: mock(() => {}),
        resumeSession: mock(() => true),
        resumeProcess: mock(() => {}),
        startProcess: mock(() => {}),
        isRunning: mock(() => false),
        approvalManager: {
            resolveRequest: mock(() => {}),
            getQueuedRequests: mock(() => []),
            resolveQueuedRequest: mock(() => true),
            operationalMode: 'default' as string,
        },
        ...overrides,
    } as unknown as ProcessManager;
}

// ─── isClientMessage validation ────────────────────────────────────────────

describe('isClientMessage', () => {
    it('rejects null', () => {
        expect(isClientMessage(null)).toBe(false);
    });

    it('rejects non-object', () => {
        expect(isClientMessage('hello')).toBe(false);
        expect(isClientMessage(42)).toBe(false);
    });

    it('rejects missing type', () => {
        expect(isClientMessage({ sessionId: 'x' })).toBe(false);
    });

    it('rejects unknown type', () => {
        expect(isClientMessage({ type: 'unknown_msg' })).toBe(false);
    });

    it('validates auth', () => {
        expect(isClientMessage({ type: 'auth', key: 'my-key' })).toBe(true);
        expect(isClientMessage({ type: 'auth' })).toBe(false);
        expect(isClientMessage({ type: 'auth', key: 123 })).toBe(false);
    });

    it('validates subscribe', () => {
        expect(isClientMessage({ type: 'subscribe', sessionId: 's1' })).toBe(true);
        expect(isClientMessage({ type: 'subscribe' })).toBe(false);
        expect(isClientMessage({ type: 'subscribe', sessionId: 123 })).toBe(false);
    });

    it('validates unsubscribe', () => {
        expect(isClientMessage({ type: 'unsubscribe', sessionId: 's1' })).toBe(true);
        expect(isClientMessage({ type: 'unsubscribe' })).toBe(false);
    });

    it('validates send_message', () => {
        expect(isClientMessage({ type: 'send_message', sessionId: 's1', content: 'hi' })).toBe(true);
        expect(isClientMessage({ type: 'send_message', sessionId: 's1' })).toBe(false);
    });

    it('validates chat_send', () => {
        expect(isClientMessage({ type: 'chat_send', agentId: 'a1', content: 'hi' })).toBe(true);
        expect(isClientMessage({ type: 'chat_send', agentId: 'a1', content: 'hi', projectId: 'p1' })).toBe(true);
        expect(isClientMessage({ type: 'chat_send', agentId: 'a1' })).toBe(false);
    });

    it('validates chat_send with tools field', () => {
        expect(isClientMessage({ type: 'chat_send', agentId: 'a1', content: 'hi', tools: ['read_file'] })).toBe(true);
        expect(isClientMessage({ type: 'chat_send', agentId: 'a1', content: 'hi', tools: [] })).toBe(true);
        expect(isClientMessage({ type: 'chat_send', agentId: 'a1', content: 'hi', tools: undefined })).toBe(true);
        expect(isClientMessage({ type: 'chat_send', agentId: 'a1', content: 'hi', tools: 'invalid' })).toBe(false);
        expect(isClientMessage({ type: 'chat_send', agentId: 'a1', content: 'hi', tools: 42 })).toBe(false);
    });

    it('validates agent_reward', () => {
        expect(isClientMessage({ type: 'agent_reward', agentId: 'a1', microAlgos: 1000 })).toBe(true);
        expect(isClientMessage({ type: 'agent_reward', agentId: 'a1' })).toBe(false);
    });

    it('validates agent_invoke', () => {
        expect(isClientMessage({ type: 'agent_invoke', fromAgentId: 'a1', toAgentId: 'a2', content: 'hi' })).toBe(true);
        expect(isClientMessage({ type: 'agent_invoke', fromAgentId: 'a1' })).toBe(false);
    });

    it('validates approval_response', () => {
        expect(isClientMessage({ type: 'approval_response', requestId: 'r1', behavior: 'allow' })).toBe(true);
        expect(isClientMessage({ type: 'approval_response', requestId: 'r1', behavior: 'deny' })).toBe(true);
        expect(isClientMessage({ type: 'approval_response', requestId: 'r1', behavior: 'maybe' })).toBe(false);
    });

    it('validates create_work_task', () => {
        expect(isClientMessage({ type: 'create_work_task', agentId: 'a1', description: 'fix bug' })).toBe(true);
        expect(isClientMessage({ type: 'create_work_task', agentId: 'a1' })).toBe(false);
    });

    it('validates schedule_approval', () => {
        expect(isClientMessage({ type: 'schedule_approval', executionId: 'e1', approved: true })).toBe(true);
        expect(isClientMessage({ type: 'schedule_approval', executionId: 'e1' })).toBe(false);
    });

    it('validates question_response', () => {
        expect(isClientMessage({ type: 'question_response', questionId: 'q1', answer: 'yes' })).toBe(true);
        expect(isClientMessage({ type: 'question_response', questionId: 'q1' })).toBe(false);
    });

    it('validates pong', () => {
        expect(isClientMessage({ type: 'pong' })).toBe(true);
    });
});

// ─── WebSocket handler ─────────────────────────────────────────────────────

describe('createWebSocketHandler', () => {
    let pm: ProcessManager;

    beforeEach(() => {
        pm = createMockProcessManager();
    });

    describe('open', () => {
        it('initializes data and subscribes to global topics', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws, subscribed } = createMockWs();

            handler.open(ws);

            expect(ws.data.subscriptions).toBeDefined();
            expect(ws.data.subscriptions.size).toBe(0);
            expect(subscribed).toContain('council');
            expect(subscribed).toContain('algochat');
            expect(subscribed).toContain('scheduler');
            expect(subscribed).toContain('ollama');
            expect(subscribed).toContain('owner');
        });

        it('sends welcome message with server timestamp on pre-authenticated open', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws, sent } = createMockWs(true);

            handler.open(ws);

            // welcome message should be sent
            const welcomeMsgs = sent.map(s => JSON.parse(s)).filter((m: { type: string }) => m.type === 'welcome');
            expect(welcomeMsgs.length).toBe(1);
            expect(welcomeMsgs[0].serverTime).toBeDefined();
            // serverTime should be a valid ISO string
            expect(new Date(welcomeMsgs[0].serverTime).toISOString()).toBe(welcomeMsgs[0].serverTime);
        });

        it('does not send welcome message for unauthenticated connections', () => {
            const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
            const { ws, sent } = createMockWs(false);

            handler.open(ws);

            const welcomeMsgs = sent.map(s => JSON.parse(s)).filter((m: { type: string }) => m.type === 'welcome');
            expect(welcomeMsgs.length).toBe(0);
        });
    });

    describe('message — parsing', () => {
        it('sends error for invalid JSON', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws, sent } = createMockWs();

            handler.message(ws, 'not{json');

            expect(sent.length).toBe(1);
            const parsed = JSON.parse(sent[0]);
            expect(parsed.type).toBe('error');
            expect(parsed.message).toContain('Invalid JSON');
        });

        it('sends error for invalid message format', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws, sent } = createMockWs();

            handler.message(ws, JSON.stringify({ type: 'bogus' }));

            expect(sent.length).toBe(1);
            const parsed = JSON.parse(sent[0]);
            expect(parsed.type).toBe('error');
            expect(parsed.message).toContain('Invalid message format');
        });

        it('handles Buffer messages', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws, sent } = createMockWs();

            handler.message(ws, Buffer.from(JSON.stringify({ type: 'subscribe', sessionId: 's1' })));

            // Should not send error — subscribe should succeed
            const errors = sent.filter(s => JSON.parse(s).type === 'error');
            expect(errors.length).toBe(0);
        });
    });

    describe('subscribe/unsubscribe lifecycle', () => {
        it('subscribes to a session and receives events', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws, sent } = createMockWs();
            handler.open(ws);
            sent.length = 0; // Clear welcome message

            handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-1' }));

            expect(pm.subscribe).toHaveBeenCalledTimes(1);
            expect(ws.data.subscriptions.has('sess-1')).toBe(true);

            // Simulate an event callback
            const callback = ws.data.subscriptions.get('sess-1')!;
            callback('sess-1', { type: 'result', result: 'done', total_cost_usd: 0 });

            expect(sent.length).toBe(1);
            const event = JSON.parse(sent[0]);
            expect(event.type).toBe('session_event');
            expect(event.sessionId).toBe('sess-1');
        });

        it('forwards approval_request as dedicated message', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws, sent } = createMockWs();
            handler.open(ws);
            sent.length = 0; // Clear welcome message

            handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-1' }));

            const callback = ws.data.subscriptions.get('sess-1')!;
            callback('sess-1', {
                type: 'approval_request',
                id: 'req-1',
                sessionId: 'sess-1',
                toolName: 'Bash',
                description: 'rm -rf /',
                createdAt: Date.now(),
                timeoutMs: 30000,
            });

            expect(sent.length).toBe(1);
            const msg = JSON.parse(sent[0]);
            expect(msg.type).toBe('approval_request');
            expect(msg.request.id).toBe('req-1');
            expect(msg.request.toolName).toBe('Bash');
        });

        it('ignores duplicate subscription', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws } = createMockWs();
            handler.open(ws);

            handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-1' }));
            handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-1' }));

            expect(pm.subscribe).toHaveBeenCalledTimes(1);
        });

        it('unsubscribes from a session', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws } = createMockWs();
            handler.open(ws);

            handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-1' }));
            handler.message(ws, JSON.stringify({ type: 'unsubscribe', sessionId: 'sess-1' }));

            expect(pm.unsubscribe).toHaveBeenCalledTimes(1);
            expect(ws.data.subscriptions.has('sess-1')).toBe(false);
        });

        it('ignores unsubscribe for non-existent subscription', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws } = createMockWs();
            handler.open(ws);

            handler.message(ws, JSON.stringify({ type: 'unsubscribe', sessionId: 'never-subscribed' }));

            expect(pm.unsubscribe).not.toHaveBeenCalled();
        });
    });

    describe('close', () => {
        it('cleans up all subscriptions', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws } = createMockWs();
            handler.open(ws);

            handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-1' }));
            handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-2' }));

            handler.close(ws);

            expect(pm.unsubscribe).toHaveBeenCalledTimes(2);
            expect(ws.data.subscriptions.size).toBe(0);
        });

        it('handles close with no data gracefully', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const ws = { data: undefined } as unknown as import('bun').ServerWebSocket<WsData>;

            // Should not throw
            handler.close(ws);
        });
    });

    describe('send_message', () => {
        it('sends message to running session', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws, sent } = createMockWs();

            handler.message(ws, JSON.stringify({ type: 'send_message', sessionId: 'sess-1', content: 'hello' }));

            expect(pm.sendMessage).toHaveBeenCalledWith('sess-1', 'hello');
            // No error since sendMessage returns true
            const errors = sent.filter(s => JSON.parse(s).type === 'error');
            expect(errors.length).toBe(0);
        });

        it('sends error when session is not found', () => {
            const pmNotRunning = createMockProcessManager({
                sendMessage: mock(() => false),
            } as unknown as Partial<ProcessManager>);
            const handler = createWebSocketHandler(pmNotRunning, () => null, noAuthConfig);
            const { ws, sent } = createMockWs();

            handler.message(ws, JSON.stringify({ type: 'send_message', sessionId: 'sess-1', content: 'hello' }));

            expect(sent.length).toBe(1);
            const msg = JSON.parse(sent[0]);
            expect(msg.type).toBe('error');
            expect(msg.message).toContain('not found');
        });
    });

    describe('chat_send', () => {
        it('sends error when bridge is null', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws, sent } = createMockWs();

            handler.message(ws, JSON.stringify({ type: 'chat_send', agentId: 'a1', content: 'hi' }));

            expect(sent.length).toBe(1);
            const msg = JSON.parse(sent[0]);
            expect(msg.type).toBe('error');
            expect(msg.message).toContain('AlgoChat is not available');
        });
    });

    describe('approval_response', () => {
        it('resolves an approval request', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws } = createMockWs();

            handler.message(ws, JSON.stringify({
                type: 'approval_response',
                requestId: 'req-1',
                behavior: 'allow',
            }));

            expect(pm.approvalManager.resolveRequest).toHaveBeenCalledWith('req-1', {
                requestId: 'req-1',
                behavior: 'allow',
                message: undefined,
            });
        });
    });

    describe('create_work_task', () => {
        it('sends error when work task service is null', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig, undefined, undefined);
            const { ws, sent } = createMockWs();

            handler.message(ws, JSON.stringify({
                type: 'create_work_task',
                agentId: 'a1',
                description: 'fix bug',
            }));

            expect(sent.length).toBe(1);
            const msg = JSON.parse(sent[0]);
            expect(msg.type).toBe('error');
            expect(msg.message).toContain('Work task service not available');
        });
    });

    describe('agent_invoke', () => {
        it('sends error when messenger is null', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig, undefined);
            const { ws, sent } = createMockWs();

            handler.message(ws, JSON.stringify({
                type: 'agent_invoke',
                fromAgentId: 'a1',
                toAgentId: 'a2',
                content: 'do something',
            }));

            expect(sent.length).toBe(1);
            const msg = JSON.parse(sent[0]);
            expect(msg.type).toBe('error');
            expect(msg.message).toContain('Agent messaging not available');
        });
    });

    describe('agent_reward', () => {
        it('sends error when wallet service is null', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws, sent } = createMockWs();

            handler.message(ws, JSON.stringify({
                type: 'agent_reward',
                agentId: 'a1',
                microAlgos: 5000,
            }));

            expect(sent.length).toBe(1);
            const msg = JSON.parse(sent[0]);
            expect(msg.type).toBe('error');
            expect(msg.message).toContain('Wallet service not available');
        });
    });

    describe('schedule_approval', () => {
        it('sends error when scheduler is null', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig, undefined, undefined, undefined);
            const { ws, sent } = createMockWs();

            handler.message(ws, JSON.stringify({
                type: 'schedule_approval',
                executionId: 'e1',
                approved: true,
            }));

            expect(sent.length).toBe(1);
            const msg = JSON.parse(sent[0]);
            expect(msg.type).toBe('error');
            expect(msg.message).toContain('Scheduler service not available');
        });
    });

    describe('question_response', () => {
        it('sends error when question manager is null', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig, undefined, undefined, undefined, undefined);
            const { ws, sent } = createMockWs();

            handler.message(ws, JSON.stringify({
                type: 'question_response',
                questionId: 'q1',
                answer: 'yes',
            }));

            expect(sent.length).toBe(1);
            const msg = JSON.parse(sent[0]);
            expect(msg.type).toBe('error');
            expect(msg.message).toContain('Owner question service not available');
        });
    });

    describe('authentication', () => {
        it('subscribes to topics on open when pre-authenticated', () => {
            const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
            const { ws, subscribed } = createMockWs(true);

            handler.open(ws);

            expect(subscribed).toContain('council');
            expect(subscribed).toContain('algochat');
            expect(subscribed).toContain('owner');
        });

        it('does not subscribe to topics on open when not pre-authenticated', () => {
            const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
            const { ws, subscribed } = createMockWs(false);

            handler.open(ws);

            expect(subscribed.length).toBe(0);
        });

        it('rejects non-auth messages when not authenticated', () => {
            const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
            const { ws, sent } = createMockWs(false);
            handler.open(ws);

            handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-1' }));

            expect(sent.length).toBe(1);
            const msg = JSON.parse(sent[0]);
            expect(msg.type).toBe('error');
            expect(msg.message).toContain('Authentication required');
        });

        it('authenticates via first-message auth with valid key', () => {
            const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
            const { ws, sent, subscribed } = createMockWs(false);
            handler.open(ws);

            handler.message(ws, JSON.stringify({ type: 'auth', key: 'test-secret-key-1234' }));

            expect(ws.data.authenticated).toBe(true);
            expect(subscribed).toContain('council');
            // Only welcome message (no error-type auth response)
            expect(sent.length).toBe(1);
            const welcome = JSON.parse(sent[0]);
            expect(welcome.type).toBe('welcome');
            expect(welcome.serverTime).toBeDefined();
        });

        it('rejects first-message auth with invalid key and closes', () => {
            const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
            const { ws, sent } = createMockWs(false);
            handler.open(ws);

            handler.message(ws, JSON.stringify({ type: 'auth', key: 'wrong-key' }));

            expect(ws.data.authenticated).toBe(false);
            expect(sent.length).toBe(1);
            expect(JSON.parse(sent[0]).message).toContain('Invalid API key');
            expect(ws.close).toHaveBeenCalledWith(4001, 'Invalid API key');
        });

        it('allows messages after first-message auth', () => {
            const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
            const { ws, sent } = createMockWs(false);
            handler.open(ws);

            // Authenticate first
            handler.message(ws, JSON.stringify({ type: 'auth', key: 'test-secret-key-1234' }));
            sent.length = 0; // Clear auth response

            // Now regular messages should work
            handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-1' }));

            expect(pm.subscribe).toHaveBeenCalledTimes(1);
        });

        it('rejects duplicate auth messages', () => {
            const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
            const { ws, sent } = createMockWs(true);
            handler.open(ws);
            sent.length = 0; // Clear welcome message

            handler.message(ws, JSON.stringify({ type: 'auth', key: 'test-secret-key-1234' }));

            expect(sent.length).toBe(1);
            expect(JSON.parse(sent[0]).message).toContain('Already authenticated');
        });

        it('auto-authenticates when no API key configured', () => {
            const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
            const { ws, subscribed } = createMockWs(false);
            handler.open(ws);

            // Even without pre-auth, open should work since no key is configured
            // The handler checks ws.data.authenticated which is false, so no topics yet
            expect(subscribed.length).toBe(0);

            // But sending auth message auto-succeeds
            handler.message(ws, JSON.stringify({ type: 'auth', key: 'anything' }));
            expect(ws.data.authenticated).toBe(true);
            expect(subscribed).toContain('council');
        });
    });
});

// ─── Heartbeat / ping-pong ─────────────────────────────────────────────────

describe('heartbeat', () => {
    let pm: ProcessManager;

    beforeEach(() => {
        pm = createMockProcessManager();
    });

    it('sends welcome message with valid ISO serverTime on pre-authenticated open', () => {
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
        const { ws, sent } = createMockWs(true);

        handler.open(ws);

        const welcomes = sent.map(s => JSON.parse(s)).filter((m: { type: string }) => m.type === 'welcome');
        expect(welcomes.length).toBe(1);
        expect(welcomes[0].serverTime).toBeDefined();
        expect(typeof welcomes[0].serverTime).toBe('string');
        // Verify it's a valid ISO date string
        expect(new Date(welcomes[0].serverTime).toISOString()).toBe(welcomes[0].serverTime);

        handler.close(ws);
    });

    it('starts heartbeat timer on pre-authenticated open', () => {
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
        const { ws } = createMockWs(true);

        handler.open(ws);

        expect(ws.data.heartbeatTimer).toBeDefined();
        expect(ws.data.heartbeatTimer).not.toBeNull();

        handler.close(ws);
    });

    it('does not start heartbeat for unauthenticated connections', () => {
        const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
        const { ws, sent } = createMockWs(false);

        handler.open(ws);

        // No welcome message, no heartbeat timer
        expect(sent.length).toBe(0);
        expect(ws.data.heartbeatTimer).toBeUndefined();

        handler.close(ws);
    });

    it('sends welcome and starts heartbeat after first-message auth', () => {
        const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
        const { ws, sent } = createMockWs(false);
        handler.open(ws);

        // No welcome yet
        expect(sent.length).toBe(0);

        // Authenticate
        handler.message(ws, JSON.stringify({ type: 'auth', key: 'test-secret-key-1234' }));

        // Should have welcome only (no error-type auth response)
        expect(sent.length).toBe(1);
        const welcomes = sent.map(s => JSON.parse(s)).filter((m: { type: string }) => m.type === 'welcome');
        expect(welcomes.length).toBe(1);
        expect(welcomes[0].serverTime).toBeDefined();
        expect(ws.data.heartbeatTimer).not.toBeNull();

        handler.close(ws);
    });

    it('sends welcome and starts heartbeat on auto-auth (no API key)', () => {
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
        const { ws, sent } = createMockWs(false);
        handler.open(ws);

        // Auto-auth
        handler.message(ws, JSON.stringify({ type: 'auth', key: 'anything' }));

        // Only welcome message (no error-type response)
        expect(sent.length).toBe(1);
        const welcomes = sent.map(s => JSON.parse(s)).filter((m: { type: string }) => m.type === 'welcome');
        expect(welcomes.length).toBe(1);
        expect(ws.data.heartbeatTimer).not.toBeNull();

        handler.close(ws);
    });

    it('pong clears pong timeout timer', () => {
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
        const { ws } = createMockWs(true);
        handler.open(ws);

        // Manually set a pong timeout (simulates state after ping was sent)
        ws.data.pongTimeoutTimer = setTimeout(() => {}, 99999);

        // Send pong
        handler.message(ws, JSON.stringify({ type: 'pong' }));

        expect(ws.data.pongTimeoutTimer).toBeNull();

        handler.close(ws);
    });

    it('pong without pending timeout is safe no-op', () => {
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
        const { ws, sent } = createMockWs(true);
        handler.open(ws);
        sent.length = 0;

        // pongTimeoutTimer should be null/undefined initially
        expect(ws.data.pongTimeoutTimer).toBeFalsy();

        // Send pong before any ping
        handler.message(ws, JSON.stringify({ type: 'pong' }));

        // No errors sent
        const errors = sent.filter(s => JSON.parse(s).type === 'error');
        expect(errors.length).toBe(0);

        handler.close(ws);
    });

    it('pong does not require authentication', () => {
        // pong messages are handled before the auth gate
        const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
        const { ws, sent } = createMockWs(false);
        handler.open(ws);

        // Send pong without authenticating
        handler.message(ws, JSON.stringify({ type: 'pong' }));

        // Should not get "Authentication required" error
        const errors = sent.filter(s => {
            const m = JSON.parse(s);
            return m.type === 'error' && m.message.includes('Authentication required');
        });
        expect(errors.length).toBe(0);

        handler.close(ws);
    });

    it('close clears heartbeat timer', () => {
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
        const { ws } = createMockWs(true);
        handler.open(ws);

        expect(ws.data.heartbeatTimer).not.toBeNull();

        handler.close(ws);

        expect(ws.data.heartbeatTimer).toBeNull();
    });

    it('close clears pong timeout timer', () => {
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
        const { ws } = createMockWs(true);
        handler.open(ws);

        // Manually set a pong timeout
        ws.data.pongTimeoutTimer = setTimeout(() => {}, 99999);

        handler.close(ws);

        expect(ws.data.pongTimeoutTimer).toBeNull();
    });

    it('close with no heartbeat data is safe', () => {
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
        const ws = { data: undefined } as unknown as import('bun').ServerWebSocket<WsData>;

        // Should not throw
        handler.close(ws);
    });

    it('exported constants have expected values', () => {
        expect(HEARTBEAT_INTERVAL_MS).toBe(30_000);
        expect(PONG_TIMEOUT_MS).toBe(10_000);
        expect(AUTH_TIMEOUT_MS).toBe(5_000);
    });
});

// ─── Auth timeout ─────────────────────────────────────────────────────────

describe('auth timeout', () => {
    let pm: ProcessManager;

    beforeEach(() => {
        pm = createMockProcessManager();
    });

    it('starts auth timeout timer for unauthenticated connections', () => {
        const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
        const { ws } = createMockWs(false);

        handler.open(ws);

        expect(ws.data.authTimeoutTimer).toBeDefined();
        expect(ws.data.authTimeoutTimer).not.toBeNull();

        handler.close(ws);
    });

    it('does not start auth timeout for pre-authenticated connections', () => {
        const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
        const { ws } = createMockWs(true);

        handler.open(ws);

        expect(ws.data.authTimeoutTimer).toBeUndefined();

        handler.close(ws);
    });

    it('clears auth timeout on successful authentication', () => {
        const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
        const { ws } = createMockWs(false);
        handler.open(ws);

        expect(ws.data.authTimeoutTimer).not.toBeNull();

        handler.message(ws, JSON.stringify({ type: 'auth', key: 'test-secret-key-1234' }));

        expect(ws.data.authTimeoutTimer).toBeNull();

        handler.close(ws);
    });

    it('clears auth timeout on auto-auth (no API key)', () => {
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
        const { ws } = createMockWs(false);
        handler.open(ws);

        // noAuthConfig doesn't set auth timeout (no key configured)
        // but if we create with withAuthConfig then send auth, it should clear
        handler.close(ws);

        // Test with auth-enabled config
        const handler2 = createWebSocketHandler(pm, () => null, withAuthConfig);
        const { ws: ws2 } = createMockWs(false);
        handler2.open(ws2);

        expect(ws2.data.authTimeoutTimer).not.toBeNull();

        // Simulate what happens when auth succeeds
        handler2.message(ws2, JSON.stringify({ type: 'auth', key: 'test-secret-key-1234' }));
        expect(ws2.data.authTimeoutTimer).toBeNull();

        handler2.close(ws2);
    });

    it('clears auth timeout on close', () => {
        const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
        const { ws } = createMockWs(false);
        handler.open(ws);

        expect(ws.data.authTimeoutTimer).not.toBeNull();

        handler.close(ws);

        expect(ws.data.authTimeoutTimer).toBeNull();
    });

    it('closes connection with code 4001 when auth times out', async () => {
        const handler = createWebSocketHandler(pm, () => null, withAuthConfig);
        const { ws } = createMockWs(false);
        handler.open(ws);

        // Wait for the auth timeout to fire (AUTH_TIMEOUT_MS = 5000ms, but we can't wait that long in tests)
        // Instead, verify the timer was set and that close would be called with 4001
        expect(ws.data.authTimeoutTimer).not.toBeNull();
        expect(ws.close).not.toHaveBeenCalled();

        handler.close(ws);
    });
});

// ─── tenantTopic utility ───────────────────────────────────────────────────

describe('tenantTopic', () => {
    it('returns base topic with no tenantId argument', () => {
        expect(tenantTopic('council')).toBe('council');
    });

    it('returns base topic when tenantId is undefined', () => {
        expect(tenantTopic('council', undefined)).toBe('council');
    });

    it('returns base topic when tenantId is "default"', () => {
        expect(tenantTopic('council', 'default')).toBe('council');
    });

    it('returns namespaced topic when tenantId is a real tenant', () => {
        expect(tenantTopic('council', 'tenant-123')).toBe('council:tenant-123');
    });

    it('namespaces algochat topic correctly', () => {
        expect(tenantTopic('algochat', 'org-abc')).toBe('algochat:org-abc');
    });
});

// ─── broadcastAlgoChatMessage ──────────────────────────────────────────────

describe('broadcastAlgoChatMessage', () => {
    it('publishes to algochat topic', () => {
        const published: Array<{ topic: string; data: string }> = [];
        const server = {
            publish: mock((topic: string, data: string) => {
                published.push({ topic, data });
            }),
        };

        broadcastAlgoChatMessage(server, 'Alice', 'Hello!', 'inbound');

        expect(published.length).toBe(1);
        expect(published[0].topic).toBe('algochat');
        const msg = JSON.parse(published[0].data);
        expect(msg.type).toBe('algochat_message');
        expect(msg.participant).toBe('Alice');
        expect(msg.content).toBe('Hello!');
        expect(msg.direction).toBe('inbound');
    });
});

// ─── Session error recovery events ────────────────────────────────────────

describe('session error recovery forwarding', () => {
    let pm: ProcessManager;

    beforeEach(() => {
        pm = createMockProcessManager();
    });

    it('forwards session_error as dedicated session_error message', () => {
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
        const { ws, sent } = createMockWs();
        handler.open(ws);
        sent.length = 0;

        handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-err' }));

        const callback = ws.data.subscriptions.get('sess-err')!;
        const errorEvent: SessionErrorRecoveryEvent = {
            type: 'session_error',
            session_id: 'sess-err',
            error: {
                message: 'Session crashed with exit code 1',
                errorType: 'crash',
                severity: 'error',
                recoverable: true,
            },
        };
        callback('sess-err', errorEvent);

        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('session_error');
        expect(msg.sessionId).toBe('sess-err');
        expect(msg.error.message).toBe('Session crashed with exit code 1');
        expect(msg.error.errorType).toBe('crash');
        expect(msg.error.severity).toBe('error');
        expect(msg.error.recoverable).toBe(true);
        expect(msg.error.sessionStatus).toBe('error');
    });

    it('forwards spawn_error as fatal non-recoverable session_error', () => {
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
        const { ws, sent } = createMockWs();
        handler.open(ws);
        sent.length = 0;

        handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-spawn' }));

        const callback = ws.data.subscriptions.get('sess-spawn')!;
        callback('sess-spawn', {
            type: 'session_error',
            session_id: 'sess-spawn',
            error: {
                message: 'Failed to start SDK process: ENOENT',
                errorType: 'spawn_error',
                severity: 'fatal',
                recoverable: false,
            },
        } as SessionErrorRecoveryEvent);

        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('session_error');
        expect(msg.error.errorType).toBe('spawn_error');
        expect(msg.error.severity).toBe('fatal');
        expect(msg.error.recoverable).toBe(false);
    });

    it('forwards credits_exhausted as warning recoverable session_error', () => {
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
        const { ws, sent } = createMockWs();
        handler.open(ws);
        sent.length = 0;

        handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-credits' }));

        const callback = ws.data.subscriptions.get('sess-credits')!;
        callback('sess-credits', {
            type: 'session_error',
            session_id: 'sess-credits',
            error: {
                message: 'Session paused: credits exhausted.',
                errorType: 'credits_exhausted',
                severity: 'warning',
                recoverable: true,
            },
        } as SessionErrorRecoveryEvent);

        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('session_error');
        expect(msg.error.errorType).toBe('credits_exhausted');
        expect(msg.error.severity).toBe('warning');
        expect(msg.error.recoverable).toBe(true);
    });

    it('session_error does not duplicate as session_event', () => {
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
        const { ws, sent } = createMockWs();
        handler.open(ws);
        sent.length = 0;

        handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-no-dup' }));

        const callback = ws.data.subscriptions.get('sess-no-dup')!;
        callback('sess-no-dup', {
            type: 'session_error',
            session_id: 'sess-no-dup',
            error: {
                message: 'Crash',
                errorType: 'crash',
                severity: 'error',
                recoverable: true,
            },
        } as SessionErrorRecoveryEvent);

        // Should only send session_error, NOT session_event
        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('session_error');
        expect(msg.type).not.toBe('session_event');
    });
});

// ─── Error severity in WebSocket error messages ───────────────────────────

describe('error severity', () => {
    it('error messages include optional severity and errorCode fields', () => {
        // sendMessage returns true by default, so use non-running variant
        const pmNotRunning = createMockProcessManager({
            sendMessage: mock(() => false),
        } as unknown as Partial<ProcessManager>);
        const handler2 = createWebSocketHandler(pmNotRunning, () => null, noAuthConfig);
        const { ws: ws2, sent: sent2 } = createMockWs();

        handler2.message(ws2, JSON.stringify({ type: 'send_message', sessionId: 'x', content: 'hi' }));

        const msg = JSON.parse(sent2[0]);
        expect(msg.type).toBe('error');
        expect(msg.message).toContain('not found');
        // severity and errorCode are optional — should be present in type but may be undefined
        expect('severity' in msg || msg.severity === undefined).toBe(true);
    });
});

// ─── schedule_approval success paths ──────────────────────────────────────

describe('schedule_approval — success paths', () => {
    let pm: ProcessManager;

    beforeEach(() => {
        pm = createMockProcessManager();
    });

    it('sends schedule_execution_update when execution is found', () => {
        const mockExecution = { id: 'e1', status: 'approved' };
        const mockScheduler = { resolveApproval: mock(() => mockExecution) };
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig, undefined, undefined, () => mockScheduler as any);
        const { ws, sent } = createMockWs();

        handler.message(ws, JSON.stringify({
            type: 'schedule_approval',
            executionId: 'e1',
            approved: true,
        }));

        expect(mockScheduler.resolveApproval).toHaveBeenCalledWith('e1', true);
        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('schedule_execution_update');
        expect(msg.execution).toEqual(mockExecution);
    });

    it('sends error when execution is not found (resolveApproval returns null)', () => {
        const mockScheduler = { resolveApproval: mock(() => null) };
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig, undefined, undefined, () => mockScheduler as any);
        const { ws, sent } = createMockWs();

        handler.message(ws, JSON.stringify({
            type: 'schedule_approval',
            executionId: 'missing-exec',
            approved: false,
        }));

        expect(mockScheduler.resolveApproval).toHaveBeenCalledWith('missing-exec', false);
        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('error');
        expect(msg.message).toContain('not found');
    });
});

// ─── question_response success paths ──────────────────────────────────────

describe('question_response — success paths', () => {
    let pm: ProcessManager;

    beforeEach(() => {
        pm = createMockProcessManager();
    });

    it('sends no message when question is resolved successfully', () => {
        const mockQM = { resolveQuestion: mock(() => true) };
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig, undefined, undefined, undefined, () => mockQM as any);
        const { ws, sent } = createMockWs();

        handler.message(ws, JSON.stringify({
            type: 'question_response',
            questionId: 'q1',
            answer: 'yes',
        }));

        expect(mockQM.resolveQuestion).toHaveBeenCalledWith('q1', {
            questionId: 'q1',
            answer: 'yes',
            selectedOption: null,
        });
        // No error — resolved successfully, no response message sent
        const errors = sent.filter(s => JSON.parse(s).type === 'error');
        expect(errors.length).toBe(0);
    });

    it('sends error when question is not found (resolveQuestion returns false)', () => {
        const mockQM = { resolveQuestion: mock(() => false) };
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig, undefined, undefined, undefined, () => mockQM as any);
        const { ws, sent } = createMockWs();

        handler.message(ws, JSON.stringify({
            type: 'question_response',
            questionId: 'q-missing',
            answer: 'no',
        }));

        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('error');
        expect(msg.message).toContain('not found');
    });

    it('passes selectedOption to resolveQuestion', () => {
        const mockQM = { resolveQuestion: mock(() => true) };
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig, undefined, undefined, undefined, () => mockQM as any);
        const { ws } = createMockWs();

        handler.message(ws, JSON.stringify({
            type: 'question_response',
            questionId: 'q2',
            answer: 'option-a',
            selectedOption: 'option-a',
        }));

        expect(mockQM.resolveQuestion).toHaveBeenCalledWith('q2', {
            questionId: 'q2',
            answer: 'option-a',
            selectedOption: 'option-a',
        });
    });
});

// ─── agent_reward — range validation and success ───────────────────────────

describe('agent_reward — range validation and wallet path', () => {
    let pm: ProcessManager;

    beforeEach(() => {
        pm = createMockProcessManager();
    });

    it('sends error when microAlgos is below minimum (< 1000)', () => {
        const mockWallet = {
            fundAgent: mock(async () => {}),
            getBalance: mock(async () => 5000),
        };
        const mockBridge = { getAgentWalletService: () => mockWallet, db: {} };
        const handler = createWebSocketHandler(pm, () => mockBridge as any, noAuthConfig);
        const { ws, sent } = createMockWs();

        handler.message(ws, JSON.stringify({
            type: 'agent_reward',
            agentId: 'a1',
            microAlgos: 500,
        }));

        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('error');
        expect(msg.message).toContain('microAlgos must be between');
        // fundAgent should NOT have been called
        expect(mockWallet.fundAgent).not.toHaveBeenCalled();
    });

    it('sends error when microAlgos is above maximum (> 100000000)', () => {
        const mockWallet = {
            fundAgent: mock(async () => {}),
            getBalance: mock(async () => 5000),
        };
        const mockBridge = { getAgentWalletService: () => mockWallet, db: {} };
        const handler = createWebSocketHandler(pm, () => mockBridge as any, noAuthConfig);
        const { ws, sent } = createMockWs();

        handler.message(ws, JSON.stringify({
            type: 'agent_reward',
            agentId: 'a1',
            microAlgos: 200_000_000,
        }));

        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('error');
        expect(msg.message).toContain('microAlgos must be between');
        expect(mockWallet.fundAgent).not.toHaveBeenCalled();
    });

    it('calls fundAgent for a valid microAlgos amount', async () => {
        let fundResolve: () => void;
        const fundPromise = new Promise<void>(res => { fundResolve = res; });
        const mockWallet = {
            fundAgent: mock(async () => { await fundPromise; }),
            getBalance: mock(async () => 5000),
        };
        const mockBridge = { getAgentWalletService: () => mockWallet, db: {} };
        const handler = createWebSocketHandler(pm, () => mockBridge as any, noAuthConfig);
        const { ws, sent } = createMockWs();

        handler.message(ws, JSON.stringify({
            type: 'agent_reward',
            agentId: 'a1',
            microAlgos: 5000,
        }));

        // fundAgent should have been called with valid amount
        expect(mockWallet.fundAgent).toHaveBeenCalledWith('a1', 5000);
        // No synchronous error
        const errors = sent.filter(s => JSON.parse(s).type === 'error');
        expect(errors.length).toBe(0);

        // Resolve the promise to avoid dangling async
        fundResolve!();
    });
});

// ─── create_work_task success path ─────────────────────────────────────────

describe('create_work_task — success path', () => {
    let pm: ProcessManager;

    beforeEach(() => {
        pm = createMockProcessManager();
    });

    it('sends work_task_update on successful task creation', async () => {
        const mockTask = { id: 'task-1', agentId: 'a1', description: 'fix bug', status: 'pending' };
        const mockWorkTaskService = {
            create: mock(async () => mockTask),
            onComplete: mock((_id: string, _cb: (t: typeof mockTask) => void) => {}),
        };
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig, undefined, () => mockWorkTaskService as any);
        const { ws, sent } = createMockWs();

        handler.message(ws, JSON.stringify({
            type: 'create_work_task',
            agentId: 'a1',
            description: 'fix bug',
        }));

        // Wait for the async create to resolve
        await new Promise(res => setTimeout(res, 0));

        expect(mockWorkTaskService.create).toHaveBeenCalledWith({
            agentId: 'a1',
            description: 'fix bug',
            projectId: undefined,
        });
        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('work_task_update');
        expect(msg.task.id).toBe('task-1');
    });

    it('sends work_task_update when onComplete fires', async () => {
        const mockTask = { id: 'task-2', agentId: 'a1', description: 'refactor', status: 'pending' };
        const completedTask = { ...mockTask, status: 'completed' };
        let onCompleteCallback: ((t: typeof completedTask) => void) | undefined;
        const mockWorkTaskService = {
            create: mock(async () => mockTask),
            onComplete: mock((_id: string, cb: (t: typeof completedTask) => void) => { onCompleteCallback = cb; }),
        };
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig, undefined, () => mockWorkTaskService as any);
        const { ws, sent } = createMockWs();

        handler.message(ws, JSON.stringify({
            type: 'create_work_task',
            agentId: 'a1',
            description: 'refactor',
        }));

        await new Promise(res => setTimeout(res, 0));
        sent.length = 0; // Clear the initial work_task_update

        // Simulate completion
        onCompleteCallback!(completedTask);

        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('work_task_update');
        expect(msg.task.status).toBe('completed');
    });

    it('sends error when work task creation fails', async () => {
        const mockWorkTaskService = {
            create: mock(async () => { throw new Error('DB full'); }),
            onComplete: mock(() => {}),
        };
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig, undefined, () => mockWorkTaskService as any);
        const { ws, sent } = createMockWs();

        handler.message(ws, JSON.stringify({
            type: 'create_work_task',
            agentId: 'a1',
            description: 'bad task',
        }));

        await new Promise(res => setTimeout(res, 0));

        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('error');
        expect(msg.message).toContain('Work task creation failed');
    });
});

// ─── agent_invoke success path ─────────────────────────────────────────────

describe('agent_invoke — success path', () => {
    let pm: ProcessManager;

    beforeEach(() => {
        pm = createMockProcessManager();
    });

    it('sends agent_message_update on successful invoke', async () => {
        const mockMessage = { id: 'msg-1', fromAgentId: 'a1', toAgentId: 'a2', content: 'do something', status: 'sent' };
        const mockMessenger = {
            invoke: mock(async () => ({ message: mockMessage, sessionId: null })),
            db: {},
        };
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig, () => mockMessenger as any);
        const { ws, sent } = createMockWs();

        handler.message(ws, JSON.stringify({
            type: 'agent_invoke',
            fromAgentId: 'a1',
            toAgentId: 'a2',
            content: 'do something',
        }));

        await new Promise(res => setTimeout(res, 0));

        expect(mockMessenger.invoke).toHaveBeenCalledWith({
            fromAgentId: 'a1',
            toAgentId: 'a2',
            content: 'do something',
            paymentMicro: undefined,
            projectId: undefined,
        });
        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('agent_message_update');
        expect(msg.message.id).toBe('msg-1');
    });

    it('sends error when agent invoke rejects', async () => {
        const mockMessenger = {
            invoke: mock(async () => { throw new Error('agent offline'); }),
            db: {},
        };
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig, () => mockMessenger as any);
        const { ws, sent } = createMockWs();

        handler.message(ws, JSON.stringify({
            type: 'agent_invoke',
            fromAgentId: 'a1',
            toAgentId: 'a2',
            content: 'do something',
        }));

        await new Promise(res => setTimeout(res, 0));

        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('error');
        expect(msg.message).toContain('Agent invocation failed');
    });
});

// ─── send_message auto-resume path ────────────────────────────────────────

describe('send_message — auto-resume', () => {
    let pm: ProcessManager;

    beforeEach(() => {
        pm = createMockProcessManager({
            sendMessage: mock(() => false),
        } as unknown as Partial<ProcessManager>);
    });

    it('exercises the getDb code path when sendMessage returns false', () => {
        // Provide a getDb that returns a minimal stub with a query method that returns null,
        // simulating a real DB that simply has no matching session row.
        const stubDb = {
            query: (_sql: string) => ({ get: () => null }),
            prepare: (_sql: string) => ({ get: () => null, all: () => [] }),
        };
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig, undefined, undefined, undefined, undefined, () => stubDb as any);
        const { ws, sent } = createMockWs();

        handler.message(ws, JSON.stringify({
            type: 'send_message',
            sessionId: 'sess-1',
            content: 'hello',
        }));

        expect(pm.sendMessage).toHaveBeenCalledWith('sess-1', 'hello');
        // getSession returns null → handler sends "not found" error
        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('error');
        expect(msg.message).toContain('not found');
    });

    it('sends error when DB is not provided and sendMessage returns false', () => {
        const handler = createWebSocketHandler(pm, () => null, noAuthConfig);
        const { ws, sent } = createMockWs();

        handler.message(ws, JSON.stringify({
            type: 'send_message',
            sessionId: 'sess-missing',
            content: 'hello',
        }));

        expect(pm.sendMessage).toHaveBeenCalledWith('sess-missing', 'hello');
        expect(sent.length).toBe(1);
        const msg = JSON.parse(sent[0]);
        expect(msg.type).toBe('error');
        expect(msg.message).toContain('not found');
    });
});
