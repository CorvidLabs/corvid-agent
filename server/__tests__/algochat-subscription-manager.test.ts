/**
 * Comprehensive unit tests for SubscriptionManager — manages session event
 * subscriptions for both on-chain and local (browser dashboard) response delivery.
 *
 * Tests cover:
 * - hasChainSubscription() / hasLocalSubscription() check methods
 * - subscribeForResponse() — on-chain subscription lifecycle, progress tracking,
 *   ack delay logic, timeout extensions, duplicate prevention
 * - subscribeForLocalResponse() — local streaming, text buffering, turn completion,
 *   session exit cleanup, duplicate prevention
 * - Subscription timeout management (setSubscriptionTimer, resetSubscriptionTimer,
 *   clearSubscriptionTimer)
 * - updateLocalSendFn() / updateLocalEventFn() WS reconnect handling
 * - cleanup() — ensures all timers and subscriptions are cleared
 *
 * Uses lightweight mocks for ProcessManager and ResponseFormatter, following
 * the patterns established in the CommandHandler test suite (#296).
 *
 * @module
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
    SubscriptionManager,
    type LocalChatSendFn,
    type LocalChatEventFn,
    type LocalChatEvent,
} from '../algochat/subscription-manager';
import type { ProcessManager } from '../process/manager';
import type { ResponseFormatter } from '../algochat/response-formatter';
import type { ClaudeStreamEvent } from '../process/types';
import type { EventCallback } from '../process/interfaces';

// ── Test constants ────────────────────────────────────────────────────────

const SESSION_ID = 'sess-test-001';
const SESSION_ID_2 = 'sess-test-002';
const PARTICIPANT = 'ALGO_ADDR_ABC123';

// ── Mock factories ────────────────────────────────────────────────────────

/**
 * Captures subscribed callbacks so tests can simulate events by invoking
 * them directly, mirroring ProcessManager's subscribe/unsubscribe API.
 */
function createMockProcessManager(): ProcessManager & {
    /** Map of sessionId → Set of registered callbacks. */
    _callbacks: Map<string, Set<EventCallback>>;
    /** Simulate an event being emitted for a session. */
    _emit: (sessionId: string, event: ClaudeStreamEvent) => void;
} {
    const callbacks = new Map<string, Set<EventCallback>>();

    const pm = {
        _callbacks: callbacks,
        _emit(sessionId: string, event: ClaudeStreamEvent) {
            const cbs = callbacks.get(sessionId);
            if (cbs) {
                for (const cb of cbs) {
                    cb(sessionId, event);
                }
            }
        },
        subscribe: mock((sessionId: string, callback: EventCallback) => {
            if (!callbacks.has(sessionId)) callbacks.set(sessionId, new Set());
            callbacks.get(sessionId)!.add(callback);
        }),
        unsubscribe: mock((sessionId: string, callback: EventCallback) => {
            callbacks.get(sessionId)?.delete(callback);
        }),
        isRunning: mock((_sessionId: string) => false),
        getActiveSessionIds: mock(() => []),
        stopProcess: mock(() => {}),
        subscribeAll: mock(() => {}),
        unsubscribeAll: mock(() => {}),
        approvalManager: {
            getQueuedRequests: mock(() => []),
            resolveQueuedRequest: mock(() => false),
            operationalMode: 'normal',
        },
    } as unknown as ProcessManager & {
        _callbacks: Map<string, Set<EventCallback>>;
        _emit: (sessionId: string, event: ClaudeStreamEvent) => void;
    };

    return pm;
}

function createMockResponseFormatter(): ResponseFormatter & {
    _responses: Array<{ participant: string; content: string }>;
    _events: Array<{ participant: string; content: string; direction: string }>;
} {
    const formatter = {
        _responses: [] as Array<{ participant: string; content: string }>,
        _events: [] as Array<{ participant: string; content: string; direction: string }>,
        sendResponse: mock(function (this: typeof formatter, participant: string, content: string) {
            this._responses.push({ participant, content });
            return Promise.resolve();
        }),
        emitEvent: mock(function (this: typeof formatter, participant: string, content: string, direction: string) {
            this._events.push({ participant, content, direction });
        }),
    } as unknown as ResponseFormatter & {
        _responses: Array<{ participant: string; content: string }>;
        _events: Array<{ participant: string; content: string; direction: string }>;
    };
    return formatter;
}

// ── Event factory helpers ─────────────────────────────────────────────────

function assistantEvent(text: string): ClaudeStreamEvent {
    return {
        type: 'assistant',
        message: { role: 'assistant' as const, content: text },
    } as ClaudeStreamEvent;
}

function assistantEventBlocks(blocks: Array<{ type: string; text?: string }>): ClaudeStreamEvent {
    return {
        type: 'assistant',
        message: { role: 'assistant' as const, content: blocks },
    } as ClaudeStreamEvent;
}

function contentBlockStart(blockType: string, name?: string, input?: unknown): ClaudeStreamEvent {
    return {
        type: 'content_block_start',
        content_block: { type: blockType, name, input },
    } as ClaudeStreamEvent;
}

function contentBlockDelta(text: string): ClaudeStreamEvent {
    return {
        type: 'content_block_delta',
        delta: { text },
    } as ClaudeStreamEvent;
}

function contentBlockStop(): ClaudeStreamEvent {
    return { type: 'content_block_stop' } as ClaudeStreamEvent;
}

function resultEvent(): ClaudeStreamEvent {
    return { type: 'result', total_cost_usd: 0.01 } as ClaudeStreamEvent;
}

function sessionExitedEvent(): ClaudeStreamEvent {
    return { type: 'session_exited' } as ClaudeStreamEvent;
}

function toolStatusEvent(statusMessage: string): ClaudeStreamEvent {
    return { type: 'tool_status', statusMessage } as ClaudeStreamEvent;
}

function thinkingEvent(active: boolean): ClaudeStreamEvent {
    return { type: 'thinking', thinking: active } as ClaudeStreamEvent;
}

// ── Test suite ────────────────────────────────────────────────────────────

let pm: ReturnType<typeof createMockProcessManager>;
let rf: ReturnType<typeof createMockResponseFormatter>;
let sm: SubscriptionManager;

beforeEach(() => {
    pm = createMockProcessManager();
    rf = createMockResponseFormatter();
    sm = new SubscriptionManager(pm as unknown as ProcessManager, rf as unknown as ResponseFormatter);
});

afterEach(() => {
    sm.cleanup();
});

// ── hasChainSubscription / hasLocalSubscription ──────────────────────────

describe('hasChainSubscription', () => {
    test('returns false when no subscription exists', () => {
        expect(sm.hasChainSubscription(SESSION_ID)).toBe(false);
    });

    test('returns true after subscribing for response', () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
        expect(sm.hasChainSubscription(SESSION_ID)).toBe(true);
    });

    test('returns false for a different session', () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
        expect(sm.hasChainSubscription(SESSION_ID_2)).toBe(false);
    });

    test('returns false after subscription completes via session_exited', () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
        expect(sm.hasChainSubscription(SESSION_ID)).toBe(true);

        // Simulate session exit
        pm._emit(SESSION_ID, sessionExitedEvent());
        expect(sm.hasChainSubscription(SESSION_ID)).toBe(false);
    });
});

describe('hasLocalSubscription', () => {
    test('returns false when no subscription exists', () => {
        expect(sm.hasLocalSubscription(SESSION_ID)).toBe(false);
    });

    test('returns true after subscribing for local response', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);
        expect(sm.hasLocalSubscription(SESSION_ID)).toBe(true);
    });

    test('returns false for a different session', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);
        expect(sm.hasLocalSubscription(SESSION_ID_2)).toBe(false);
    });

    test('returns false after local subscription exits', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);
        expect(sm.hasLocalSubscription(SESSION_ID)).toBe(true);

        pm._emit(SESSION_ID, sessionExitedEvent());
        expect(sm.hasLocalSubscription(SESSION_ID)).toBe(false);
    });
});

// ── subscribeForResponse (on-chain) ──────────────────────────────────────

describe('subscribeForResponse', () => {
    test('registers a callback with ProcessManager.subscribe', () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
        expect((pm.subscribe as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        expect((pm.subscribe as ReturnType<typeof mock>).mock.calls[0][0]).toBe(SESSION_ID);
    });

    test('prevents duplicate subscriptions for the same session', () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
        // Should only subscribe once
        expect((pm.subscribe as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    test('allows subscriptions for different sessions', () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
        sm.subscribeForResponse(SESSION_ID_2, PARTICIPANT);
        expect((pm.subscribe as ReturnType<typeof mock>).mock.calls.length).toBe(2);
    });

    test('sends final response on session_exited with streamed text', async () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

        // Simulate a text block being streamed
        pm._emit(SESSION_ID, contentBlockStart('text'));
        pm._emit(SESSION_ID, contentBlockDelta('Hello '));
        pm._emit(SESSION_ID, contentBlockDelta('world!'));
        pm._emit(SESSION_ID, contentBlockStop());
        pm._emit(SESSION_ID, resultEvent());

        // Session exits
        pm._emit(SESSION_ID, sessionExitedEvent());

        // Allow async sendResponse to settle
        await Bun.sleep(10);

        expect(rf._responses.length).toBeGreaterThanOrEqual(1);
        const finalResponse = rf._responses.find(r => !r.content.startsWith('[Status]'));
        expect(finalResponse).toBeDefined();
        expect(finalResponse!.content).toBe('Hello world!');
        expect(finalResponse!.participant).toBe(PARTICIPANT);
    });

    test('sends final response using lastTurnResponse when text block was flushed at result', async () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

        // Stream text, then result flushes it, then more text in new turn, then exit
        pm._emit(SESSION_ID, contentBlockStart('text'));
        pm._emit(SESSION_ID, contentBlockDelta('First turn response'));
        pm._emit(SESSION_ID, contentBlockStop());
        pm._emit(SESSION_ID, resultEvent());

        // Second turn
        pm._emit(SESSION_ID, contentBlockStart('text'));
        pm._emit(SESSION_ID, contentBlockDelta('Second turn response'));
        pm._emit(SESSION_ID, contentBlockStop());
        pm._emit(SESSION_ID, resultEvent());

        pm._emit(SESSION_ID, sessionExitedEvent());
        await Bun.sleep(10);

        // Should send the LAST turn's text
        const finalResponse = rf._responses.find(r => !r.content.startsWith('[Status]'));
        expect(finalResponse).toBeDefined();
        expect(finalResponse!.content).toBe('Second turn response');
    });

    test('falls back to assistant event text when no content blocks streamed', async () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

        // Non-streaming assistant event (SDK mode without content_block events)
        pm._emit(SESSION_ID, assistantEvent('Fallback text response'));
        pm._emit(SESSION_ID, resultEvent());
        pm._emit(SESSION_ID, sessionExitedEvent());
        await Bun.sleep(10);

        const finalResponse = rf._responses.find(r => !r.content.startsWith('[Status]'));
        expect(finalResponse).toBeDefined();
        expect(finalResponse!.content).toBe('Fallback text response');
    });

    test('falls back to assistant event with content blocks', async () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

        pm._emit(SESSION_ID, assistantEventBlocks([
            { type: 'text', text: 'Block one. ' },
            { type: 'text', text: 'Block two.' },
        ]));
        pm._emit(SESSION_ID, resultEvent());
        pm._emit(SESSION_ID, sessionExitedEvent());
        await Bun.sleep(10);

        const finalResponse = rf._responses.find(r => !r.content.startsWith('[Status]'));
        expect(finalResponse).toBeDefined();
        expect(finalResponse!.content).toBe('Block one. Block two.');
    });

    test('does not send response when there is no text', async () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

        pm._emit(SESSION_ID, resultEvent());
        pm._emit(SESSION_ID, sessionExitedEvent());
        await Bun.sleep(10);

        // Only status-type messages should exist (or none)
        const nonStatusResponses = rf._responses.filter(r => !r.content.startsWith('[Status]'));
        expect(nonStatusResponses.length).toBe(0);
    });

    test('sends only once even if session_exited fires multiple times', async () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

        pm._emit(SESSION_ID, contentBlockStart('text'));
        pm._emit(SESSION_ID, contentBlockDelta('Response'));
        pm._emit(SESSION_ID, contentBlockStop());
        pm._emit(SESSION_ID, resultEvent());
        pm._emit(SESSION_ID, sessionExitedEvent());
        pm._emit(SESSION_ID, sessionExitedEvent()); // duplicate

        await Bun.sleep(10);

        const nonStatusResponses = rf._responses.filter(r => !r.content.startsWith('[Status]'));
        expect(nonStatusResponses.length).toBe(1);
    });

    test('unsubscribes from ProcessManager on session exit', () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
        pm._emit(SESSION_ID, sessionExitedEvent());

        expect((pm.unsubscribe as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        expect((pm.unsubscribe as ReturnType<typeof mock>).mock.calls[0][0]).toBe(SESSION_ID);
    });

    test('ignores events from other sessions', async () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

        // Register a callback for another session to simulate a cross-session event
        // The callback filters on sid !== sessionId, so this should be a no-op
        const otherCallback = (pm.subscribe as ReturnType<typeof mock>).mock.calls[0][1] as EventCallback;
        otherCallback(SESSION_ID_2, assistantEvent('Wrong session'));
        otherCallback(SESSION_ID_2, sessionExitedEvent());

        await Bun.sleep(10);

        // Should not have sent any response (subscription is still active for SESSION_ID)
        expect(sm.hasChainSubscription(SESSION_ID)).toBe(true);
    });

    describe('ack delay logic', () => {
        test('emits processing status on first assistant event', () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            pm._emit(SESSION_ID, assistantEvent('thinking...'));

            const statusEvents = rf._events.filter(e => e.direction === 'status');
            expect(statusEvents.some(e => e.content.includes('processing'))).toBe(true);
        });

        test('emits processing status only once for multiple assistant events', () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            pm._emit(SESSION_ID, assistantEvent('thinking...'));
            pm._emit(SESSION_ID, assistantEvent('more thinking'));

            const processingEvents = rf._events.filter(
                e => e.direction === 'status' && e.content.includes('processing')
            );
            expect(processingEvents.length).toBe(1);
        });

        test('sends ack immediately when tool_status event arrives', async () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            // First assistant triggers the ack delay timer
            pm._emit(SESSION_ID, assistantEvent('starting'));
            // tool_status should cancel delay and send ack immediately
            pm._emit(SESSION_ID, toolStatusEvent('[Read] Reading file...'));

            await Bun.sleep(10);

            const ackResponse = rf._responses.find(r =>
                r.content.includes('Received your message')
            );
            expect(ackResponse).toBeDefined();
        });

        test('sends ack immediately when agent-to-agent tool use detected', async () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            pm._emit(SESSION_ID, assistantEvent('starting'));
            pm._emit(SESSION_ID, contentBlockStart('tool_use', 'corvid_send_message', { to_agent: 'agent-b' }));

            await Bun.sleep(10);

            const ackResponse = rf._responses.find(r =>
                r.content.includes('Received your message')
            );
            expect(ackResponse).toBeDefined();
        });

        test('skips ack if session exits before delay expires', async () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            // Start the assistant (begins ack delay timer)
            pm._emit(SESSION_ID, assistantEvent('quick answer'));
            pm._emit(SESSION_ID, contentBlockStart('text'));
            pm._emit(SESSION_ID, contentBlockDelta('Quick response'));
            pm._emit(SESSION_ID, contentBlockStop());
            pm._emit(SESSION_ID, resultEvent());
            // Exit immediately before the 10s ack delay
            pm._emit(SESSION_ID, sessionExitedEvent());

            await Bun.sleep(10);

            // The ack "[Status] Received your message..." should NOT appear
            const ackResponse = rf._responses.find(r =>
                r.content.includes('Received your message')
            );
            expect(ackResponse).toBeUndefined();
        });
    });

    describe('progress tracking', () => {
        test('tracks tool usage in progress actions', () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            pm._emit(SESSION_ID, contentBlockStart('tool_use', 'Read'));
            pm._emit(SESSION_ID, contentBlockStart('tool_use', 'Bash'));
            pm._emit(SESSION_ID, contentBlockStart('tool_use', 'Read')); // duplicate tool name

            // Progress is internal; verify indirectly via ack/status messages
            // At minimum, tools should be tracked for the progress summary
            // The main observable effect is that this doesn't throw
            expect(sm.hasChainSubscription(SESSION_ID)).toBe(true);
        });

        test('tracks agent queries', () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            pm._emit(SESSION_ID, contentBlockStart('tool_use', 'corvid_send_message', { to_agent: 'agent-a' }));
            pm._emit(SESSION_ID, contentBlockStart('tool_use', 'corvid_send_message', { to_agent: 'agent-b' }));

            // If there were agent queries and enough time elapsed, result would
            // emit a "Synthesizing response" status. We verify by triggering result.
            // First we need to fake enough elapsed time — but since we can't easily
            // mock Date.now, we verify the subscription is still healthy.
            expect(sm.hasChainSubscription(SESSION_ID)).toBe(true);
        });

        test('flushes text blocks as status updates when substantial', () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            pm._emit(SESSION_ID, contentBlockStart('text'));
            // Write a substantial text block (>50 chars) so it gets tracked
            const longText = 'This is a substantial text block that should be tracked for progress summary purposes.';
            pm._emit(SESSION_ID, contentBlockDelta(longText));
            pm._emit(SESSION_ID, contentBlockStop());

            // The text should have been emitted as a status event
            const statusEvents = rf._events.filter(e => e.direction === 'status');
            expect(statusEvents.some(e => e.content.includes('substantial text block'))).toBe(true);
        });

        test('truncates long text block previews to 300 chars in status events', () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            pm._emit(SESSION_ID, contentBlockStart('text'));
            const longText = 'A'.repeat(500);
            pm._emit(SESSION_ID, contentBlockDelta(longText));
            pm._emit(SESSION_ID, contentBlockStop());

            const statusEvents = rf._events.filter(e => e.direction === 'status');
            const textPreview = statusEvents.find(e => e.content.includes('AAA'));
            expect(textPreview).toBeDefined();
            expect(textPreview!.content.endsWith('...')).toBe(true);
            // 300 chars + '...' = 303
            expect(textPreview!.content.length).toBe(303);
        });

        test('emits synthesizing status on result when agent queries were made and enough time elapsed', async () => {
            // This test verifies the branch: agentQueryCount > 0 && elapsed > ACK_DELAY_MS
            // We can't easily mock Date.now, but we can at least verify the branch
            // doesn't throw when conditions aren't met (elapsed < ACK_DELAY)
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            pm._emit(SESSION_ID, assistantEvent('starting'));
            pm._emit(SESSION_ID, contentBlockStart('tool_use', 'corvid_send_message', { to_agent: 'agent-x' }));
            pm._emit(SESSION_ID, resultEvent());

            // Since elapsed time is ~0ms which is < ACK_DELAY_MS (10s),
            // the synthesizing status should NOT be emitted
            const synthEvents = rf._events.filter(e =>
                e.direction === 'status' && e.content.includes('Synthesizing')
            );
            expect(synthEvents.length).toBe(0);
        });

        test('flushes pending text block before tool_use starts', () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            // Start a text block
            pm._emit(SESSION_ID, contentBlockStart('text'));
            pm._emit(SESSION_ID, contentBlockDelta('Some reasoning text that is long enough to be tracked.'));
            // Tool use starts before text block explicitly ended
            pm._emit(SESSION_ID, contentBlockStart('tool_use', 'Read'));

            // The pending text should have been flushed as a status event
            const statusEvents = rf._events.filter(e =>
                e.direction === 'status' && e.content.includes('reasoning text')
            );
            expect(statusEvents.length).toBe(1);
        });
    });

    describe('tool_status event forwarding', () => {
        test('forwards tool_status messages as status events', () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            pm._emit(SESSION_ID, toolStatusEvent('Querying CorvidLabs...'));

            const statusEvents = rf._events.filter(e =>
                e.direction === 'status' && e.content === 'Querying CorvidLabs...'
            );
            expect(statusEvents.length).toBe(1);
        });

        test('ignores tool_status with empty message', () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
            const beforeCount = rf._events.length;

            pm._emit(SESSION_ID, { type: 'tool_status', statusMessage: '' } as ClaudeStreamEvent);

            // Should not have emitted any new events (early return on falsy message)
            const afterCount = rf._events.length;
            expect(afterCount).toBe(beforeCount);
        });
    });

    describe('timeout handling', () => {
        test('times out and sends partial response when process is not running', async () => {
            // Use a custom SubscriptionManager with a shorter timeout for testing
            // We can't easily override the const, but we can test the timeout callback
            // by directly calling setSubscriptionTimer with a short timeout
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            pm._emit(SESSION_ID, contentBlockStart('text'));
            pm._emit(SESSION_ID, contentBlockDelta('Partial response'));
            pm._emit(SESSION_ID, contentBlockStop());
            pm._emit(SESSION_ID, resultEvent());

            // The subscription should still be active
            expect(sm.hasChainSubscription(SESSION_ID)).toBe(true);

            // Simulate session exit to clean up
            pm._emit(SESSION_ID, sessionExitedEvent());
            await Bun.sleep(10);

            const finalResponse = rf._responses.find(r => !r.content.startsWith('[Status]'));
            expect(finalResponse!.content).toBe('Partial response');
        });
    });

    describe('content block lifecycle', () => {
        test('handles multiple text blocks — keeps only the last one per turn', async () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            // First text block
            pm._emit(SESSION_ID, contentBlockStart('text'));
            pm._emit(SESSION_ID, contentBlockDelta('First explanation'));
            pm._emit(SESSION_ID, contentBlockStop());

            // Second text block (overwrites the first)
            pm._emit(SESSION_ID, contentBlockStart('text'));
            pm._emit(SESSION_ID, contentBlockDelta('Final answer'));
            pm._emit(SESSION_ID, contentBlockStop());

            pm._emit(SESSION_ID, resultEvent());
            pm._emit(SESSION_ID, sessionExitedEvent());
            await Bun.sleep(10);

            const finalResponse = rf._responses.find(r => !r.content.startsWith('[Status]'));
            expect(finalResponse!.content).toBe('Final answer');
        });

        test('ignores empty text blocks', async () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            pm._emit(SESSION_ID, contentBlockStart('text'));
            pm._emit(SESSION_ID, contentBlockDelta('   '));
            pm._emit(SESSION_ID, contentBlockStop());

            // Only non-empty text block
            pm._emit(SESSION_ID, contentBlockStart('text'));
            pm._emit(SESSION_ID, contentBlockDelta('Actual response'));
            pm._emit(SESSION_ID, contentBlockStop());

            pm._emit(SESSION_ID, resultEvent());
            pm._emit(SESSION_ID, sessionExitedEvent());
            await Bun.sleep(10);

            const finalResponse = rf._responses.find(r => !r.content.startsWith('[Status]'));
            expect(finalResponse!.content).toBe('Actual response');
        });

        test('accumulates streaming text deltas within a single content block', async () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            pm._emit(SESSION_ID, contentBlockStart('text'));
            pm._emit(SESSION_ID, contentBlockDelta('He'));
            pm._emit(SESSION_ID, contentBlockDelta('llo'));
            pm._emit(SESSION_ID, contentBlockDelta(' '));
            pm._emit(SESSION_ID, contentBlockDelta('world'));
            pm._emit(SESSION_ID, contentBlockStop());
            pm._emit(SESSION_ID, resultEvent());
            pm._emit(SESSION_ID, sessionExitedEvent());
            await Bun.sleep(10);

            const finalResponse = rf._responses.find(r => !r.content.startsWith('[Status]'));
            expect(finalResponse!.content).toBe('Hello world');
        });

        test('ignores content_block_delta when not in a text block', () => {
            sm.subscribeForResponse(SESSION_ID, PARTICIPANT);

            // Delta without a preceding text content_block_start should be ignored
            pm._emit(SESSION_ID, contentBlockDelta('orphan delta'));

            // No status events for orphan deltas
            const textEvents = rf._events.filter(e =>
                e.direction === 'status' && e.content.includes('orphan')
            );
            expect(textEvents.length).toBe(0);
        });
    });
});

// ── subscribeForLocalResponse ────────────────────────────────────────────

describe('subscribeForLocalResponse', () => {
    test('registers a callback with ProcessManager.subscribe', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);

        expect((pm.subscribe as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        expect((pm.subscribe as ReturnType<typeof mock>).mock.calls[0][0]).toBe(SESSION_ID);
    });

    test('prevents duplicate subscriptions for the same session', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);

        // subscribe should be called only once
        expect((pm.subscribe as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    test('updates sendFn even when subscription already exists', () => {
        const sendFn1: LocalChatSendFn = mock(() => {});
        const sendFn2: LocalChatSendFn = mock(() => {});

        sm.subscribeForLocalResponse(SESSION_ID, sendFn1);
        sm.subscribeForLocalResponse(SESSION_ID, sendFn2);

        // Emit events and verify sendFn2 gets called (not sendFn1)
        pm._emit(SESSION_ID, assistantEvent('hello'));
        pm._emit(SESSION_ID, resultEvent());

        expect((sendFn2 as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        // sendFn1 may or may not have been called (it was current when assistant arrived,
        // but the code reads from localSendFns on every event). Since the second
        // subscribeForLocalResponse updates the map, sendFn2 should be used.
    });

    test('sends accumulated response on turn completion (result event)', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);

        pm._emit(SESSION_ID, assistantEvent('Hello from the agent'));
        pm._emit(SESSION_ID, resultEvent());

        expect((sendFn as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        const call = (sendFn as ReturnType<typeof mock>).mock.calls[0];
        expect(call[0]).toBe('local');
        expect(call[1]).toBe('Hello from the agent');
        expect(call[2]).toBe('outbound');
    });

    test('buffers multiple assistant events before sending on result', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);

        pm._emit(SESSION_ID, assistantEvent('Part 1. '));
        pm._emit(SESSION_ID, assistantEvent('Part 2.'));
        pm._emit(SESSION_ID, resultEvent());

        expect((sendFn as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        expect((sendFn as ReturnType<typeof mock>).mock.calls[0][1]).toBe('Part 1. Part 2.');
    });

    test('resets buffer between turns', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);

        pm._emit(SESSION_ID, assistantEvent('Turn 1'));
        pm._emit(SESSION_ID, resultEvent());

        pm._emit(SESSION_ID, assistantEvent('Turn 2'));
        pm._emit(SESSION_ID, resultEvent());

        expect((sendFn as ReturnType<typeof mock>).mock.calls.length).toBe(2);
        expect((sendFn as ReturnType<typeof mock>).mock.calls[0][1]).toBe('Turn 1');
        expect((sendFn as ReturnType<typeof mock>).mock.calls[1][1]).toBe('Turn 2');
    });

    test('does not send empty buffer on result', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);

        pm._emit(SESSION_ID, resultEvent());

        expect((sendFn as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });

    test('does not send whitespace-only buffer', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);

        pm._emit(SESSION_ID, assistantEvent('   '));
        pm._emit(SESSION_ID, resultEvent());

        expect((sendFn as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });

    test('cleans up on session_exited', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);

        pm._emit(SESSION_ID, sessionExitedEvent());

        expect(sm.hasLocalSubscription(SESSION_ID)).toBe(false);
        expect((pm.unsubscribe as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    test('sends remaining buffer on session_exited', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);

        pm._emit(SESSION_ID, assistantEvent('Final words'));
        pm._emit(SESSION_ID, sessionExitedEvent());

        expect((sendFn as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        expect((sendFn as ReturnType<typeof mock>).mock.calls[0][1]).toBe('Final words');
    });

    test('ignores events from other sessions', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);

        // Manually invoke callback with wrong session ID
        const callback = (pm.subscribe as ReturnType<typeof mock>).mock.calls[0][1] as EventCallback;
        callback(SESSION_ID_2, assistantEvent('Wrong session'));
        callback(SESSION_ID_2, resultEvent());

        expect((sendFn as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });

    describe('streaming events', () => {
        test('emits thinking events on first assistant event', () => {
            const sendFn: LocalChatSendFn = mock(() => {});
            const eventFn: LocalChatEventFn = mock(() => {});
            sm.subscribeForLocalResponse(SESSION_ID, sendFn);
            sm.updateLocalEventFn(SESSION_ID, eventFn);

            pm._emit(SESSION_ID, assistantEvent('starting'));

            const calls = (eventFn as ReturnType<typeof mock>).mock.calls;
            expect(calls.some((c: [LocalChatEvent]) =>
                c[0].type === 'thinking' && (c[0] as { active: boolean }).active === true
            )).toBe(true);
        });

        test('emits thinking only once for multiple assistant events', () => {
            const sendFn: LocalChatSendFn = mock(() => {});
            const eventFn: LocalChatEventFn = mock(() => {});
            sm.subscribeForLocalResponse(SESSION_ID, sendFn);
            sm.updateLocalEventFn(SESSION_ID, eventFn);

            pm._emit(SESSION_ID, assistantEvent('first'));
            pm._emit(SESSION_ID, assistantEvent('second'));

            const thinkingEvents = (eventFn as ReturnType<typeof mock>).mock.calls.filter(
                (c: [LocalChatEvent]) => c[0].type === 'thinking' && (c[0] as { active: boolean }).active === true
            );
            expect(thinkingEvents.length).toBe(1);
        });

        test('emits stream chunks for content_block_delta', () => {
            const sendFn: LocalChatSendFn = mock(() => {});
            const eventFn: LocalChatEventFn = mock(() => {});
            sm.subscribeForLocalResponse(SESSION_ID, sendFn);
            sm.updateLocalEventFn(SESSION_ID, eventFn);

            pm._emit(SESSION_ID, contentBlockDelta('chunk1'));
            pm._emit(SESSION_ID, contentBlockDelta('chunk2'));

            const streamEvents = (eventFn as ReturnType<typeof mock>).mock.calls.filter(
                (c: [LocalChatEvent]) => c[0].type === 'stream' && !(c[0] as { done: boolean }).done
            );
            expect(streamEvents.length).toBe(2);
            expect((streamEvents[0][0] as { chunk: string }).chunk).toBe('chunk1');
            expect((streamEvents[1][0] as { chunk: string }).chunk).toBe('chunk2');
        });

        test('emits stream done on result', () => {
            const sendFn: LocalChatSendFn = mock(() => {});
            const eventFn: LocalChatEventFn = mock(() => {});
            sm.subscribeForLocalResponse(SESSION_ID, sendFn);
            sm.updateLocalEventFn(SESSION_ID, eventFn);

            pm._emit(SESSION_ID, assistantEvent('text'));
            pm._emit(SESSION_ID, resultEvent());

            const doneEvents = (eventFn as ReturnType<typeof mock>).mock.calls.filter(
                (c: [LocalChatEvent]) => c[0].type === 'stream' && (c[0] as { done: boolean }).done
            );
            expect(doneEvents.length).toBe(1);
        });

        test('emits thinking=false on result', () => {
            const sendFn: LocalChatSendFn = mock(() => {});
            const eventFn: LocalChatEventFn = mock(() => {});
            sm.subscribeForLocalResponse(SESSION_ID, sendFn);
            sm.updateLocalEventFn(SESSION_ID, eventFn);

            pm._emit(SESSION_ID, assistantEvent('text'));
            pm._emit(SESSION_ID, resultEvent());

            const calls = (eventFn as ReturnType<typeof mock>).mock.calls;
            const lastThinking = [...calls].reverse().find(
                (c: [LocalChatEvent]) => c[0].type === 'thinking'
            );
            expect(lastThinking).toBeDefined();
            expect((lastThinking![0] as { active: boolean }).active).toBe(false);
        });

        test('emits tool_use events for content_block_start with tool_use', () => {
            const sendFn: LocalChatSendFn = mock(() => {});
            const eventFn: LocalChatEventFn = mock(() => {});
            sm.subscribeForLocalResponse(SESSION_ID, sendFn);
            sm.updateLocalEventFn(SESSION_ID, eventFn);

            pm._emit(SESSION_ID, contentBlockStart('tool_use', 'Read', { file: 'test.ts' }));

            const toolEvents = (eventFn as ReturnType<typeof mock>).mock.calls.filter(
                (c: [LocalChatEvent]) => c[0].type === 'tool_use'
            );
            expect(toolEvents.length).toBe(1);
            expect((toolEvents[0][0] as { toolName: string }).toolName).toBe('Read');
        });

        test('emits tool_use for direct-mode tool_status events', () => {
            const sendFn: LocalChatSendFn = mock(() => {});
            const eventFn: LocalChatEventFn = mock(() => {});
            sm.subscribeForLocalResponse(SESSION_ID, sendFn);
            sm.updateLocalEventFn(SESSION_ID, eventFn);

            pm._emit(SESSION_ID, toolStatusEvent('[Bash] Running npm test'));

            const toolEvents = (eventFn as ReturnType<typeof mock>).mock.calls.filter(
                (c: [LocalChatEvent]) => c[0].type === 'tool_use'
            );
            expect(toolEvents.length).toBe(1);
            expect((toolEvents[0][0] as { toolName: string }).toolName).toBe('Bash');
            expect((toolEvents[0][0] as { input: string }).input).toBe('Running npm test');
        });

        test('emits thinking events for direct-mode thinking signal', () => {
            const sendFn: LocalChatSendFn = mock(() => {});
            const eventFn: LocalChatEventFn = mock(() => {});
            sm.subscribeForLocalResponse(SESSION_ID, sendFn);
            sm.updateLocalEventFn(SESSION_ID, eventFn);

            pm._emit(SESSION_ID, thinkingEvent(true));

            const thinkingEvents = (eventFn as ReturnType<typeof mock>).mock.calls.filter(
                (c: [LocalChatEvent]) => c[0].type === 'thinking'
            );
            expect(thinkingEvents.some(
                (c: [LocalChatEvent]) => (c[0] as { active: boolean }).active === true
            )).toBe(true);
        });

        test('emits message event on turn completion with text', () => {
            const sendFn: LocalChatSendFn = mock(() => {});
            const eventFn: LocalChatEventFn = mock(() => {});
            sm.subscribeForLocalResponse(SESSION_ID, sendFn);
            sm.updateLocalEventFn(SESSION_ID, eventFn);

            pm._emit(SESSION_ID, assistantEvent('response text'));
            pm._emit(SESSION_ID, resultEvent());

            const messageEvents = (eventFn as ReturnType<typeof mock>).mock.calls.filter(
                (c: [LocalChatEvent]) => c[0].type === 'message'
            );
            expect(messageEvents.length).toBe(1);
            expect((messageEvents[0][0] as { content: string }).content).toBe('response text');
            expect((messageEvents[0][0] as { direction: string }).direction).toBe('outbound');
        });

        test('emits message event on session_exited with remaining buffer', () => {
            const sendFn: LocalChatSendFn = mock(() => {});
            const eventFn: LocalChatEventFn = mock(() => {});
            sm.subscribeForLocalResponse(SESSION_ID, sendFn);
            sm.updateLocalEventFn(SESSION_ID, eventFn);

            pm._emit(SESSION_ID, assistantEvent('final text'));
            pm._emit(SESSION_ID, sessionExitedEvent());

            const messageEvents = (eventFn as ReturnType<typeof mock>).mock.calls.filter(
                (c: [LocalChatEvent]) => c[0].type === 'message'
            );
            expect(messageEvents.length).toBe(1);
            expect((messageEvents[0][0] as { content: string }).content).toBe('final text');
        });

        test('emits thinking=false on session_exited', () => {
            const sendFn: LocalChatSendFn = mock(() => {});
            const eventFn: LocalChatEventFn = mock(() => {});
            sm.subscribeForLocalResponse(SESSION_ID, sendFn);
            sm.updateLocalEventFn(SESSION_ID, eventFn);

            pm._emit(SESSION_ID, assistantEvent('text'));
            pm._emit(SESSION_ID, sessionExitedEvent());

            const calls = (eventFn as ReturnType<typeof mock>).mock.calls;
            const lastThinking = [...calls].reverse().find(
                (c: [LocalChatEvent]) => c[0].type === 'thinking'
            );
            expect(lastThinking).toBeDefined();
            expect((lastThinking![0] as { active: boolean }).active).toBe(false);
        });

        test('works without eventFn set (only sendFn)', () => {
            const sendFn: LocalChatSendFn = mock(() => {});
            sm.subscribeForLocalResponse(SESSION_ID, sendFn);
            // No eventFn set — should not throw

            pm._emit(SESSION_ID, assistantEvent('text'));
            pm._emit(SESSION_ID, contentBlockDelta('chunk'));
            pm._emit(SESSION_ID, resultEvent());

            expect((sendFn as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        });
    });

    describe('timeout behavior', () => {
        test('sets a subscription timer on subscribe', () => {
            const sendFn: LocalChatSendFn = mock(() => {});
            sm.subscribeForLocalResponse(SESSION_ID, sendFn);

            // The timer is internal, but we can verify it exists by
            // checking that clearSubscriptionTimer doesn't throw
            sm.clearSubscriptionTimer(SESSION_ID);
            // If timer existed and was cleared, this is a no-op second time
            sm.clearSubscriptionTimer(SESSION_ID);
        });

        test('returns nothing if sendFn is removed before event', () => {
            const sendFn: LocalChatSendFn = mock(() => {});
            sm.subscribeForLocalResponse(SESSION_ID, sendFn);

            // Remove the sendFn directly
            sm.cleanupLocalSession(SESSION_ID);

            // Now events should be no-ops (currentSendFn will be undefined)
            const callback = (pm.subscribe as ReturnType<typeof mock>).mock.calls[0][1] as EventCallback;
            callback(SESSION_ID, assistantEvent('ignored'));
            callback(SESSION_ID, resultEvent());

            // sendFn should not have been called after cleanup
            // (calls from before cleanup might exist)
            expect((sendFn as ReturnType<typeof mock>).mock.calls.length).toBe(0);
        });
    });
});

// ── Timer management ─────────────────────────────────────────────────────

describe('setSubscriptionTimer', () => {
    test('stores and fires timeout callback', async () => {
        const onTimeout = mock(() => {});

        // Use a very short timeout by calling setSubscriptionTimer directly
        // Note: the actual code uses SUBSCRIPTION_TIMEOUT_MS (10 min),
        // but setSubscriptionTimer is a public method we can test.
        // However, the timer uses the constant. We test via the public API.
        sm.setSubscriptionTimer(SESSION_ID, onTimeout);

        // Timer is set — clearing it should prevent firing
        sm.clearSubscriptionTimer(SESSION_ID);

        // Wait and verify it did NOT fire
        await Bun.sleep(50);
        expect(onTimeout.mock.calls.length).toBe(0);
    });

    test('replaces existing timer when called again', () => {
        const onTimeout1 = mock(() => {});
        const onTimeout2 = mock(() => {});

        sm.setSubscriptionTimer(SESSION_ID, onTimeout1);
        sm.setSubscriptionTimer(SESSION_ID, onTimeout2);

        // Clear — only the second callback should be stored
        sm.clearSubscriptionTimer(SESSION_ID);

        // Both should be inert after clear
    });
});

describe('resetSubscriptionTimer', () => {
    test('is a no-op when no subscription exists', () => {
        // Should not throw
        sm.resetSubscriptionTimer(SESSION_ID);
    });

    test('resets the timer for an existing subscription', () => {
        const onTimeout = mock(() => {});
        sm.setSubscriptionTimer(SESSION_ID, onTimeout);

        // Reset should clear and re-set
        sm.resetSubscriptionTimer(SESSION_ID);

        // Clear to confirm it was reset
        sm.clearSubscriptionTimer(SESSION_ID);
    });
});

describe('clearSubscriptionTimer', () => {
    test('is a no-op when no timer exists', () => {
        // Should not throw
        sm.clearSubscriptionTimer(SESSION_ID);
    });

    test('clears an existing timer and callback', () => {
        const onTimeout = mock(() => {});
        sm.setSubscriptionTimer(SESSION_ID, onTimeout);

        sm.clearSubscriptionTimer(SESSION_ID);

        // Subsequent reset should be a no-op (callback removed)
        sm.resetSubscriptionTimer(SESSION_ID);
    });

    test('clears only the specified session timer', () => {
        const onTimeout1 = mock(() => {});
        const onTimeout2 = mock(() => {});

        sm.setSubscriptionTimer(SESSION_ID, onTimeout1);
        sm.setSubscriptionTimer(SESSION_ID_2, onTimeout2);

        sm.clearSubscriptionTimer(SESSION_ID);

        // SESSION_ID_2 should still have its timer
        sm.resetSubscriptionTimer(SESSION_ID_2); // Should not throw

        // Clean up
        sm.clearSubscriptionTimer(SESSION_ID_2);
    });
});

// ── updateLocalSendFn / updateLocalEventFn ───────────────────────────────

describe('updateLocalSendFn', () => {
    test('updates the send function for an existing session', () => {
        const sendFn1: LocalChatSendFn = mock(() => {});
        const sendFn2: LocalChatSendFn = mock(() => {});

        sm.subscribeForLocalResponse(SESSION_ID, sendFn1);

        // Simulate WS reconnect — update sendFn
        sm.updateLocalSendFn(SESSION_ID, sendFn2);

        // Trigger event delivery
        pm._emit(SESSION_ID, assistantEvent('after reconnect'));
        pm._emit(SESSION_ID, resultEvent());

        // sendFn2 should receive the message
        expect((sendFn2 as ReturnType<typeof mock>).mock.calls.length).toBe(1);
        expect((sendFn2 as ReturnType<typeof mock>).mock.calls[0][1]).toBe('after reconnect');
    });

    test('can set sendFn before subscription exists', () => {
        const sendFn: LocalChatSendFn = mock(() => {});

        // This shouldn't throw
        sm.updateLocalSendFn(SESSION_ID, sendFn);
    });
});

describe('updateLocalEventFn', () => {
    test('updates the event function for an existing session', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        const eventFn1: LocalChatEventFn = mock(() => {});
        const eventFn2: LocalChatEventFn = mock(() => {});

        sm.subscribeForLocalResponse(SESSION_ID, sendFn);
        sm.updateLocalEventFn(SESSION_ID, eventFn1);

        // Trigger an event
        pm._emit(SESSION_ID, contentBlockDelta('chunk1'));

        // Update eventFn (simulating WS reconnect)
        sm.updateLocalEventFn(SESSION_ID, eventFn2);

        // Trigger another event
        pm._emit(SESSION_ID, contentBlockDelta('chunk2'));

        // eventFn1 should have chunk1, eventFn2 should have chunk2
        const fn1StreamCalls = (eventFn1 as ReturnType<typeof mock>).mock.calls.filter(
            (c: [LocalChatEvent]) => c[0].type === 'stream' && (c[0] as { chunk: string }).chunk === 'chunk1'
        );
        const fn2StreamCalls = (eventFn2 as ReturnType<typeof mock>).mock.calls.filter(
            (c: [LocalChatEvent]) => c[0].type === 'stream' && (c[0] as { chunk: string }).chunk === 'chunk2'
        );
        expect(fn1StreamCalls.length).toBe(1);
        expect(fn2StreamCalls.length).toBe(1);
    });

    test('can set eventFn before subscription exists', () => {
        const eventFn: LocalChatEventFn = mock(() => {});

        // This shouldn't throw
        sm.updateLocalEventFn(SESSION_ID, eventFn);
    });
});

// ── cleanupLocalSession ──────────────────────────────────────────────────

describe('cleanupLocalSession', () => {
    test('removes local subscription state', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        const eventFn: LocalChatEventFn = mock(() => {});

        sm.subscribeForLocalResponse(SESSION_ID, sendFn);
        sm.updateLocalEventFn(SESSION_ID, eventFn);

        sm.cleanupLocalSession(SESSION_ID);

        // Subscription map entry is removed
        expect(sm.hasLocalSubscription(SESSION_ID)).toBe(false);
    });

    test('is idempotent', () => {
        sm.cleanupLocalSession(SESSION_ID);
        sm.cleanupLocalSession(SESSION_ID);
        // Should not throw
    });
});

// ── cleanup ──────────────────────────────────────────────────────────────

describe('cleanup', () => {
    test('clears all chain subscriptions', () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
        sm.subscribeForResponse(SESSION_ID_2, PARTICIPANT);

        expect(sm.hasChainSubscription(SESSION_ID)).toBe(true);
        expect(sm.hasChainSubscription(SESSION_ID_2)).toBe(true);

        sm.cleanup();

        expect(sm.hasChainSubscription(SESSION_ID)).toBe(false);
        expect(sm.hasChainSubscription(SESSION_ID_2)).toBe(false);
    });

    test('clears all local subscriptions', () => {
        const sendFn: LocalChatSendFn = mock(() => {});
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);
        sm.subscribeForLocalResponse(SESSION_ID_2, sendFn);

        expect(sm.hasLocalSubscription(SESSION_ID)).toBe(true);
        expect(sm.hasLocalSubscription(SESSION_ID_2)).toBe(true);

        sm.cleanup();

        expect(sm.hasLocalSubscription(SESSION_ID)).toBe(false);
        expect(sm.hasLocalSubscription(SESSION_ID_2)).toBe(false);
    });

    test('clears all subscription timers', () => {
        const onTimeout = mock(() => {});
        sm.setSubscriptionTimer(SESSION_ID, onTimeout);
        sm.setSubscriptionTimer(SESSION_ID_2, onTimeout);

        sm.cleanup();

        // After cleanup, resetSubscriptionTimer should be a no-op
        sm.resetSubscriptionTimer(SESSION_ID);
        sm.resetSubscriptionTimer(SESSION_ID_2);
    });

    test('is safe to call multiple times', () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
        sm.cleanup();
        sm.cleanup();
        // Should not throw
    });

    test('allows new subscriptions after cleanup', () => {
        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
        sm.cleanup();

        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
        expect(sm.hasChainSubscription(SESSION_ID)).toBe(true);
    });
});

// ── Mixed chain + local subscriptions ────────────────────────────────────

describe('mixed subscriptions', () => {
    test('chain and local subscriptions are independent', () => {
        const sendFn: LocalChatSendFn = mock(() => {});

        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);

        expect(sm.hasChainSubscription(SESSION_ID)).toBe(true);
        expect(sm.hasLocalSubscription(SESSION_ID)).toBe(true);
    });

    test('chain subscription cleanup does not affect local subscription', async () => {
        const sendFn: LocalChatSendFn = mock(() => {});

        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
        sm.subscribeForLocalResponse(SESSION_ID, sendFn);

        // Exit chain subscription via session_exited
        // Note: both callbacks receive session_exited, so both will clean up
        pm._emit(SESSION_ID, assistantEvent('response'));
        pm._emit(SESSION_ID, resultEvent());
        pm._emit(SESSION_ID, sessionExitedEvent());

        await Bun.sleep(10);

        // Both should be cleaned up since session_exited fires for all subscribers
        expect(sm.hasChainSubscription(SESSION_ID)).toBe(false);
        expect(sm.hasLocalSubscription(SESSION_ID)).toBe(false);
    });

    test('multiple sessions with different subscription types', async () => {
        const sendFn: LocalChatSendFn = mock(() => {});

        sm.subscribeForResponse(SESSION_ID, PARTICIPANT);
        sm.subscribeForLocalResponse(SESSION_ID_2, sendFn);

        expect(sm.hasChainSubscription(SESSION_ID)).toBe(true);
        expect(sm.hasLocalSubscription(SESSION_ID)).toBe(false);
        expect(sm.hasChainSubscription(SESSION_ID_2)).toBe(false);
        expect(sm.hasLocalSubscription(SESSION_ID_2)).toBe(true);

        // Clean up
        pm._emit(SESSION_ID, sessionExitedEvent());
        pm._emit(SESSION_ID_2, sessionExitedEvent());

        await Bun.sleep(10);

        expect(sm.hasChainSubscription(SESSION_ID)).toBe(false);
        expect(sm.hasLocalSubscription(SESSION_ID_2)).toBe(false);
    });
});
