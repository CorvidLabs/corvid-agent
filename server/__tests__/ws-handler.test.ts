import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { createWebSocketHandler, broadcastAlgoChatMessage } from '../ws/handler';
import { isClientMessage } from '../../shared/ws-protocol';
import type { ProcessManager, EventCallback } from '../process/manager';

/**
 * WebSocket handler tests.
 *
 * Uses mock ServerWebSocket objects and a mock ProcessManager to verify
 * message parsing, subscription lifecycle, error handling, and each
 * message-type handler.
 */

// ─── Mock helpers ──────────────────────────────────────────────────────────

function createMockWs() {
    const sent: string[] = [];
    const subscribed: string[] = [];
    const unsubscribed: string[] = [];
    return {
        ws: {
            data: { subscriptions: new Map() } as { subscriptions: Map<string, EventCallback>; walletAddress?: string },
            send: mock((msg: string) => { sent.push(msg); }),
            subscribe: mock((topic: string) => { subscribed.push(topic); }),
            unsubscribe: mock((topic: string) => { unsubscribed.push(topic); }),
        } as any,
        sent,
        subscribed,
        unsubscribed,
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
});

// ─── WebSocket handler ─────────────────────────────────────────────────────

describe('createWebSocketHandler', () => {
    let pm: ProcessManager;

    beforeEach(() => {
        pm = createMockProcessManager();
    });

    describe('open', () => {
        it('initializes data and subscribes to global topics', () => {
            const handler = createWebSocketHandler(pm, () => null);
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
    });

    describe('message — parsing', () => {
        it('sends error for invalid JSON', () => {
            const handler = createWebSocketHandler(pm, () => null);
            const { ws, sent } = createMockWs();

            handler.message(ws, 'not{json');

            expect(sent.length).toBe(1);
            const parsed = JSON.parse(sent[0]);
            expect(parsed.type).toBe('error');
            expect(parsed.message).toContain('Invalid JSON');
        });

        it('sends error for invalid message format', () => {
            const handler = createWebSocketHandler(pm, () => null);
            const { ws, sent } = createMockWs();

            handler.message(ws, JSON.stringify({ type: 'bogus' }));

            expect(sent.length).toBe(1);
            const parsed = JSON.parse(sent[0]);
            expect(parsed.type).toBe('error');
            expect(parsed.message).toContain('Invalid message format');
        });

        it('handles Buffer messages', () => {
            const handler = createWebSocketHandler(pm, () => null);
            const { ws, sent } = createMockWs();

            handler.message(ws, Buffer.from(JSON.stringify({ type: 'subscribe', sessionId: 's1' })));

            // Should not send error — subscribe should succeed
            const errors = sent.filter(s => JSON.parse(s).type === 'error');
            expect(errors.length).toBe(0);
        });
    });

    describe('subscribe/unsubscribe lifecycle', () => {
        it('subscribes to a session and receives events', () => {
            const handler = createWebSocketHandler(pm, () => null);
            const { ws, sent } = createMockWs();
            handler.open(ws);

            handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-1' }));

            expect(pm.subscribe).toHaveBeenCalledTimes(1);
            expect(ws.data.subscriptions.has('sess-1')).toBe(true);

            // Simulate an event callback
            const callback = ws.data.subscriptions.get('sess-1')!;
            callback('sess-1', { type: 'result', data: { text: 'done' } });

            expect(sent.length).toBe(1);
            const event = JSON.parse(sent[0]);
            expect(event.type).toBe('session_event');
            expect(event.sessionId).toBe('sess-1');
        });

        it('forwards approval_request as dedicated message', () => {
            const handler = createWebSocketHandler(pm, () => null);
            const { ws, sent } = createMockWs();
            handler.open(ws);

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
            const handler = createWebSocketHandler(pm, () => null);
            const { ws } = createMockWs();
            handler.open(ws);

            handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-1' }));
            handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-1' }));

            expect(pm.subscribe).toHaveBeenCalledTimes(1);
        });

        it('unsubscribes from a session', () => {
            const handler = createWebSocketHandler(pm, () => null);
            const { ws } = createMockWs();
            handler.open(ws);

            handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-1' }));
            handler.message(ws, JSON.stringify({ type: 'unsubscribe', sessionId: 'sess-1' }));

            expect(pm.unsubscribe).toHaveBeenCalledTimes(1);
            expect(ws.data.subscriptions.has('sess-1')).toBe(false);
        });

        it('ignores unsubscribe for non-existent subscription', () => {
            const handler = createWebSocketHandler(pm, () => null);
            const { ws } = createMockWs();
            handler.open(ws);

            handler.message(ws, JSON.stringify({ type: 'unsubscribe', sessionId: 'never-subscribed' }));

            expect(pm.unsubscribe).not.toHaveBeenCalled();
        });
    });

    describe('close', () => {
        it('cleans up all subscriptions', () => {
            const handler = createWebSocketHandler(pm, () => null);
            const { ws } = createMockWs();
            handler.open(ws);

            handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-1' }));
            handler.message(ws, JSON.stringify({ type: 'subscribe', sessionId: 'sess-2' }));

            handler.close(ws);

            expect(pm.unsubscribe).toHaveBeenCalledTimes(2);
            expect(ws.data.subscriptions.size).toBe(0);
        });

        it('handles close with no data gracefully', () => {
            const handler = createWebSocketHandler(pm, () => null);
            const ws = { data: undefined } as any;

            // Should not throw
            handler.close(ws);
        });
    });

    describe('send_message', () => {
        it('sends message to running session', () => {
            const handler = createWebSocketHandler(pm, () => null);
            const { ws, sent } = createMockWs();

            handler.message(ws, JSON.stringify({ type: 'send_message', sessionId: 'sess-1', content: 'hello' }));

            expect(pm.sendMessage).toHaveBeenCalledWith('sess-1', 'hello');
            // No error since sendMessage returns true
            const errors = sent.filter(s => JSON.parse(s).type === 'error');
            expect(errors.length).toBe(0);
        });

        it('sends error when session is not running', () => {
            const pmNotRunning = createMockProcessManager({
                sendMessage: mock(() => false),
            } as any);
            const handler = createWebSocketHandler(pmNotRunning, () => null);
            const { ws, sent } = createMockWs();

            handler.message(ws, JSON.stringify({ type: 'send_message', sessionId: 'sess-1', content: 'hello' }));

            expect(sent.length).toBe(1);
            const msg = JSON.parse(sent[0]);
            expect(msg.type).toBe('error');
            expect(msg.message).toContain('not running');
        });
    });

    describe('chat_send', () => {
        it('sends error when bridge is null', () => {
            const handler = createWebSocketHandler(pm, () => null);
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
            const handler = createWebSocketHandler(pm, () => null);
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
            const handler = createWebSocketHandler(pm, () => null, undefined, undefined);
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
            const handler = createWebSocketHandler(pm, () => null, undefined);
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
            const handler = createWebSocketHandler(pm, () => null);
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
            const handler = createWebSocketHandler(pm, () => null, undefined, undefined, undefined);
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
            const handler = createWebSocketHandler(pm, () => null, undefined, undefined, undefined, undefined);
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
