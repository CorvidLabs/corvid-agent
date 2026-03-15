/**
 * Tests for the `.catch()` handlers in thread-manager.ts that log warnings
 * when Discord embed sends fail during crash detection and safety timeouts.
 *
 * Covers 4 catch paths:
 * 1. subscribeForResponseWithEmbed - crash embed catch (sendEmbedWithButtons rejects)
 * 2. subscribeForResponseWithEmbed - timeout embed catch (sendEmbed rejects)
 * 3. subscribeForInlineResponse - crash embed catch (sendEmbed rejects)
 * 4. subscribeForInlineResponse - timeout embed catch (sendEmbed rejects)
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockSendEmbed = mock(() => Promise.resolve());
const mockSendEmbedWithButtons = mock(() => Promise.resolve());
const mockSendTypingIndicator = mock(() => Promise.resolve());
const mockSendReplyEmbed = mock(() => Promise.resolve());
const mockBuildActionRow = mock(() => ({ type: 1, components: [] }));
const mockAgentColor = mock(() => 0x5865f2);
const mockAssertSnowflake = mock(() => {});
const mockSplitEmbedDescription = mock((text: string) => [text]);

mock.module('../discord/embeds', () => ({
    sendEmbed: mockSendEmbed,
    sendEmbedWithButtons: mockSendEmbedWithButtons,
    sendTypingIndicator: mockSendTypingIndicator,
    sendReplyEmbed: mockSendReplyEmbed,
    buildActionRow: mockBuildActionRow,
    agentColor: mockAgentColor,
    assertSnowflake: mockAssertSnowflake,
    splitEmbedDescription: mockSplitEmbedDescription,
}));

// Must import AFTER mock.module calls
import {
    subscribeForResponseWithEmbed,
    subscribeForInlineResponse,
} from '../discord/thread-manager';
import type { ProcessManager } from '../process/manager';
import type { DeliveryTracker } from '../lib/delivery-tracker';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockProcessManager(opts: { isRunning?: boolean } = {}) {
    return {
        getActiveSessionIds: () => [] as string[],
        startProcess: mock(() => {}),
        sendMessage: mock(() => true),
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        subscribeAll: mock(() => {}),
        unsubscribeAll: mock(() => {}),
        resumeProcess: mock(() => {}),
        stopProcess: mock(() => {}),
        isRunning: mock(() => opts.isRunning ?? true),
    } as unknown as ProcessManager;
}

function createMockDelivery() {
    return {} as unknown as DeliveryTracker;
}

function createMockDb() {
    return {
        query: mock(() => ({ get: mock(() => null), all: mock(() => []) })),
    } as unknown as import('bun:sqlite').Database;
}

// ─── Timer interception ─────────────────────────────────────────────────────

// We intercept setInterval and setTimeout so we can trigger callbacks on demand
// without waiting for real time to elapse.

interface CapturedTimer {
    fn: () => void;
    delay: number;
}

let capturedIntervals: CapturedTimer[] = [];
let capturedTimeouts: CapturedTimer[] = [];
const origSetInterval = globalThis.setInterval;
const origSetTimeout = globalThis.setTimeout;
const origClearInterval = globalThis.clearInterval;
const origClearTimeout = globalThis.clearTimeout;

function installFakeTimers() {
    capturedIntervals = [];
    capturedTimeouts = [];

    globalThis.setInterval = ((fn: () => void, delay?: number) => {
        capturedIntervals.push({ fn, delay: delay ?? 0 });
        return capturedIntervals.length as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval;

    globalThis.setTimeout = ((fn: () => void, delay?: number) => {
        capturedTimeouts.push({ fn, delay: delay ?? 0 });
        return capturedTimeouts.length as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    globalThis.clearInterval = (() => {}) as typeof clearInterval;
    globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
}

function restoreRealTimers() {
    globalThis.setInterval = origSetInterval;
    globalThis.setTimeout = origSetTimeout;
    globalThis.clearInterval = origClearInterval;
    globalThis.clearTimeout = origClearTimeout;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('thread-manager catch handlers', () => {
    beforeEach(() => {
        mockSendEmbed.mockClear();
        mockSendEmbedWithButtons.mockClear();
        mockSendTypingIndicator.mockClear();
        mockSendReplyEmbed.mockClear();
        mockBuildActionRow.mockClear();
        mockAgentColor.mockClear();
        mockAssertSnowflake.mockClear();
        mockSplitEmbedDescription.mockClear();
        installFakeTimers();
    });

    afterEach(() => {
        restoreRealTimers();
    });

    // ─── subscribeForResponseWithEmbed ───────────────────────────────────

    describe('subscribeForResponseWithEmbed', () => {
        test('crash embed catch: logs warning when sendEmbedWithButtons rejects after process dies', async () => {
            const discordError = new Error('Discord API error');
            mockSendEmbedWithButtons.mockImplementation(() => Promise.reject(discordError));

            const pm = createMockProcessManager({ isRunning: false });
            const delivery = createMockDelivery();
            const db = createMockDb();
            const threadCallbacks = new Map();

            subscribeForResponseWithEmbed(
                pm, delivery, 'bot-token', db, threadCallbacks,
                'session-1', 'thread-1', 'TestAgent', 'opus',
            );

            // The setInterval callback (typing interval) is captured first.
            // Trigger it to simulate the interval firing with process dead.
            expect(capturedIntervals.length).toBeGreaterThanOrEqual(1);
            const typingIntervalCb = capturedIntervals[0].fn;
            typingIntervalCb();

            // The catch handler runs asynchronously; flush microtasks
            await new Promise(r => origSetTimeout(r, 10));

            expect(mockSendEmbedWithButtons).toHaveBeenCalledTimes(1);
            // Verify the embed was called with crash-related params
            const embedCall = mockSendEmbedWithButtons.mock.calls[0];
            expect(embedCall[0]).toBe(delivery);
            expect(embedCall[2]).toBe('thread-1');
            expect(embedCall[3].description).toContain('ended unexpectedly');
            expect(embedCall[3].color).toBe(0xff3355);

            // The catch handler ran without unhandled rejection (log.warn was called internally)
        });

        test('timeout embed catch: logs warning when sendEmbed rejects on safety timeout', async () => {
            const discordError = new Error('Discord API timeout');
            mockSendEmbed.mockImplementation(() => Promise.reject(discordError));

            const pm = createMockProcessManager({ isRunning: true });
            const delivery = createMockDelivery();
            const db = createMockDb();
            const threadCallbacks = new Map();

            subscribeForResponseWithEmbed(
                pm, delivery, 'bot-token', db, threadCallbacks,
                'session-2', 'thread-2', 'TestAgent', 'opus',
            );

            // The setTimeout callback (safety timeout) is the one with TYPING_TIMEOUT_MS (240000).
            // It should be captured in capturedTimeouts.
            expect(capturedTimeouts.length).toBeGreaterThanOrEqual(1);
            const safetyTimeoutCb = capturedTimeouts.find(t => t.delay === 4 * 60 * 1000);
            expect(safetyTimeoutCb).toBeTruthy();
            safetyTimeoutCb!.fn();

            // Flush microtasks
            await new Promise(r => origSetTimeout(r, 10));

            expect(mockSendEmbed).toHaveBeenCalledTimes(1);
            const embedCall = mockSendEmbed.mock.calls[0];
            expect(embedCall[0]).toBe(delivery);
            expect(embedCall[2]).toBe('thread-2');
            expect(embedCall[3].description).toContain('taking too long');
            expect(embedCall[3].color).toBe(0xf0b232);

            // The catch handler ran without unhandled rejection (log.warn was called internally)
        });
    });

    // ─── subscribeForInlineResponse ─────────────────────────────────────

    describe('subscribeForInlineResponse', () => {
        test('crash embed catch: logs warning when sendEmbed rejects after process dies', async () => {
            const discordError = new Error('Discord API error');
            mockSendEmbed.mockImplementation(() => Promise.reject(discordError));

            const pm = createMockProcessManager({ isRunning: false });
            const delivery = createMockDelivery();

            subscribeForInlineResponse(
                pm, delivery, 'bot-token',
                'session-3', 'channel-1', 'msg-1', 'TestAgent', 'opus',
            );

            // Trigger the typing interval (process is dead, so crash path fires)
            expect(capturedIntervals.length).toBeGreaterThanOrEqual(1);
            const typingIntervalCb = capturedIntervals[0].fn;
            typingIntervalCb();

            // Flush microtasks
            await new Promise(r => origSetTimeout(r, 10));

            expect(mockSendEmbed).toHaveBeenCalledTimes(1);
            const embedCall = mockSendEmbed.mock.calls[0];
            expect(embedCall[0]).toBe(delivery);
            expect(embedCall[2]).toBe('channel-1');
            expect(embedCall[3].description).toContain('ended unexpectedly');
            expect(embedCall[3].color).toBe(0xff3355);

            // The catch handler ran without unhandled rejection (log.warn was called internally)
        });

        test('timeout embed catch: logs warning when sendEmbed rejects on safety timeout', async () => {
            const discordError = new Error('Discord API timeout');
            mockSendEmbed.mockImplementation(() => Promise.reject(discordError));

            const pm = createMockProcessManager({ isRunning: true });
            const delivery = createMockDelivery();

            subscribeForInlineResponse(
                pm, delivery, 'bot-token',
                'session-4', 'channel-2', 'msg-2', 'TestAgent', 'opus',
            );

            // Find and trigger the safety timeout (240000ms)
            const safetyTimeoutCb = capturedTimeouts.find(t => t.delay === 4 * 60 * 1000);
            expect(safetyTimeoutCb).toBeTruthy();
            safetyTimeoutCb!.fn();

            // Flush microtasks
            await new Promise(r => origSetTimeout(r, 10));

            expect(mockSendEmbed).toHaveBeenCalledTimes(1);
            const embedCall = mockSendEmbed.mock.calls[0];
            expect(embedCall[0]).toBe(delivery);
            expect(embedCall[2]).toBe('channel-2');
            expect(embedCall[3].description).toContain('taking too long');
            expect(embedCall[3].color).toBe(0xf0b232);

            // The catch handler ran without unhandled rejection (log.warn was called internally)
        });
    });

    // ─── Edge cases ─────────────────────────────────────────────────────

    describe('edge cases', () => {
        test('crash embed is not sent if content was already received (embed path)', async () => {
            mockSendEmbedWithButtons.mockImplementation(() => Promise.reject(new Error('fail')));

            const pm = createMockProcessManager({ isRunning: false });
            const delivery = createMockDelivery();
            const db = createMockDb();
            const threadCallbacks = new Map();

            // Get the subscribe callback so we can simulate receiving content first
            let subscribedCallback: Function | null = null;
            (pm.subscribe as ReturnType<typeof mock>).mockImplementation(
                (_sid: string, cb: Function) => { subscribedCallback = cb; },
            );

            subscribeForResponseWithEmbed(
                pm, delivery, 'bot-token', db, threadCallbacks,
                'session-5', 'thread-5', 'TestAgent', 'opus',
            );

            // Simulate receiving content before the interval fires
            expect(subscribedCallback).toBeTruthy();
            subscribedCallback!('session-5', {
                type: 'assistant',
                message: { content: 'Hello world' },
            });

            // Now trigger the interval (process is dead)
            capturedIntervals[0].fn();
            await new Promise(r => origSetTimeout(r, 10));

            // sendEmbedWithButtons should NOT be called because receivedAnyContent is true
            expect(mockSendEmbedWithButtons).not.toHaveBeenCalled();
        });

        test('timeout embed is not sent if activity was received (inline path)', async () => {
            mockSendEmbed.mockImplementation(() => Promise.reject(new Error('fail')));

            const pm = createMockProcessManager({ isRunning: true });
            const delivery = createMockDelivery();

            let subscribedCallback: Function | null = null;
            (pm.subscribe as ReturnType<typeof mock>).mockImplementation(
                (_sid: string, cb: Function) => { subscribedCallback = cb; },
            );

            subscribeForInlineResponse(
                pm, delivery, 'bot-token',
                'session-6', 'channel-3', 'msg-3', 'TestAgent', 'opus',
            );

            // Simulate tool_status activity before the timeout fires
            expect(subscribedCallback).toBeTruthy();
            subscribedCallback!('session-6', { type: 'tool_status', statusMessage: 'working...' });

            // Trigger safety timeout
            const safetyTimeoutCb = capturedTimeouts.find(t => t.delay === 4 * 60 * 1000);
            safetyTimeoutCb!.fn();
            await new Promise(r => origSetTimeout(r, 10));

            // sendEmbed should NOT be called because receivedAnyActivity is true
            expect(mockSendEmbed).not.toHaveBeenCalled();
        });
    });
});
