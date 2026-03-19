import { describe, test, expect, beforeEach } from 'bun:test';
import {
    SessionCheerleadingDetector,
    type IEventSubscribable,
} from '../process/session-cheerleading-detector';
import type { ClaudeStreamEvent, AssistantEvent, ResultEvent, SessionExitedEvent } from '../process/types';
import type { EventCallback } from '../process/interfaces';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Creates a mock event source that captures subscribe/unsubscribe calls. */
function createMockEventSource() {
    const callbacks: EventCallback[] = [];
    const source: IEventSubscribable = {
        subscribeAll(cb: EventCallback) {
            callbacks.push(cb);
        },
        unsubscribeAll(cb: EventCallback) {
            const idx = callbacks.indexOf(cb);
            if (idx >= 0) callbacks.splice(idx, 1);
        },
    };
    return { source, callbacks };
}

/** Emit an event to all subscribed callbacks. */
function emit(callbacks: EventCallback[], sessionId: string, event: ClaudeStreamEvent) {
    for (const cb of callbacks) {
        cb(sessionId, event);
    }
}

/** Create a cheerleading assistant event (short text with forward-commitment). */
function cheerleadingAssistantEvent(): AssistantEvent {
    return {
        type: 'assistant',
        message: { role: 'assistant', content: "I'll look into that right away!" },
    };
}

/** Create a substantive assistant event (long text with code). */
function substantiveAssistantEvent(): AssistantEvent {
    return {
        type: 'assistant',
        message: {
            role: 'assistant',
            content: 'Here is the implementation:\n```ts\nfunction solve() { return 42; }\n```\nThis resolves the issue by computing the correct value.',
        },
    };
}

function resultEvent(): ResultEvent {
    return { type: 'result', total_cost_usd: 0.01 };
}

function sessionExitedEvent(): SessionExitedEvent {
    return { type: 'session_exited' };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('SessionCheerleadingDetector', () => {
    let mockSource: ReturnType<typeof createMockEventSource>;
    let detector: SessionCheerleadingDetector;

    beforeEach(() => {
        mockSource = createMockEventSource();
        detector = new SessionCheerleadingDetector(mockSource.source);
    });

    test('returns 0 for unknown session', () => {
        expect(detector.getConsecutiveCheerleadingCount('unknown-session')).toBe(0);
    });

    test('subscribes to event source on construction', () => {
        expect(mockSource.callbacks.length).toBe(1);
    });

    test('accumulates events and resets on result', () => {
        const sid = 'session-1';
        // Send a substantive response turn
        emit(mockSource.callbacks, sid, substantiveAssistantEvent());
        emit(mockSource.callbacks, sid, resultEvent());

        // After a substantive turn, count should be 0
        expect(detector.getConsecutiveCheerleadingCount(sid)).toBe(0);
    });

    test('counts consecutive cheerleading turns', () => {
        const sid = 'session-2';

        // First cheerleading turn
        emit(mockSource.callbacks, sid, cheerleadingAssistantEvent());
        emit(mockSource.callbacks, sid, resultEvent());
        expect(detector.getConsecutiveCheerleadingCount(sid)).toBe(1);

        // Second cheerleading turn
        emit(mockSource.callbacks, sid, cheerleadingAssistantEvent());
        emit(mockSource.callbacks, sid, resultEvent());
        expect(detector.getConsecutiveCheerleadingCount(sid)).toBe(2);

        // Third cheerleading turn
        emit(mockSource.callbacks, sid, cheerleadingAssistantEvent());
        emit(mockSource.callbacks, sid, resultEvent());
        expect(detector.getConsecutiveCheerleadingCount(sid)).toBe(3);
    });

    test('resets count on non-cheerleading turn', () => {
        const sid = 'session-3';

        // Build up cheerleading count
        emit(mockSource.callbacks, sid, cheerleadingAssistantEvent());
        emit(mockSource.callbacks, sid, resultEvent());
        expect(detector.getConsecutiveCheerleadingCount(sid)).toBe(1);

        // Substantive turn resets count
        emit(mockSource.callbacks, sid, substantiveAssistantEvent());
        emit(mockSource.callbacks, sid, resultEvent());
        expect(detector.getConsecutiveCheerleadingCount(sid)).toBe(0);
    });

    test('cleans up session state on end event', () => {
        const sid = 'session-4';

        // Accumulate some state
        emit(mockSource.callbacks, sid, cheerleadingAssistantEvent());
        emit(mockSource.callbacks, sid, resultEvent());
        expect(detector.getConsecutiveCheerleadingCount(sid)).toBe(1);

        // Session end clears state
        emit(mockSource.callbacks, sid, sessionExitedEvent());
        expect(detector.getConsecutiveCheerleadingCount(sid)).toBe(0);
    });

    test('cleans up on session_stopped event', () => {
        const sid = 'session-5';

        emit(mockSource.callbacks, sid, cheerleadingAssistantEvent());
        emit(mockSource.callbacks, sid, resultEvent());
        expect(detector.getConsecutiveCheerleadingCount(sid)).toBe(1);

        emit(mockSource.callbacks, sid, { type: 'session_stopped' } as ClaudeStreamEvent);
        expect(detector.getConsecutiveCheerleadingCount(sid)).toBe(0);
    });

    test('destroy() unsubscribes and clears state', () => {
        const sid = 'session-6';

        // Build some state
        emit(mockSource.callbacks, sid, cheerleadingAssistantEvent());
        emit(mockSource.callbacks, sid, resultEvent());
        expect(detector.getConsecutiveCheerleadingCount(sid)).toBe(1);

        // Destroy
        detector.destroy(mockSource.source);

        // Callback removed
        expect(mockSource.callbacks.length).toBe(0);

        // State cleared
        expect(detector.getConsecutiveCheerleadingCount(sid)).toBe(0);
    });

    test('tracks multiple sessions independently', () => {
        const sid1 = 'session-a';
        const sid2 = 'session-b';

        // Cheerleading on session a
        emit(mockSource.callbacks, sid1, cheerleadingAssistantEvent());
        emit(mockSource.callbacks, sid1, resultEvent());

        // Substantive on session b
        emit(mockSource.callbacks, sid2, substantiveAssistantEvent());
        emit(mockSource.callbacks, sid2, resultEvent());

        expect(detector.getConsecutiveCheerleadingCount(sid1)).toBe(1);
        expect(detector.getConsecutiveCheerleadingCount(sid2)).toBe(0);
    });
});
