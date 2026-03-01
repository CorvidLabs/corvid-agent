import { describe, it, expect, beforeEach } from 'bun:test';
import { SessionEventBus } from '../process/event-bus';
import type { ClaudeStreamEvent } from '../process/types';

/**
 * SessionEventBus tests — subscription lifecycle, event emission,
 * error isolation, and subscriber pruning.
 */

const makeEvent = (type: string): ClaudeStreamEvent =>
    ({ type } as ClaudeStreamEvent);

describe('SessionEventBus', () => {
    let bus: SessionEventBus;

    beforeEach(() => {
        bus = new SessionEventBus();
    });

    // ── subscribe / unsubscribe ─────────────────────────────────────────

    describe('subscribe and unsubscribe', () => {
        it('delivers events to a subscribed callback', () => {
            const received: string[] = [];
            bus.subscribe('s1', (sid, evt) => received.push(`${sid}:${evt.type}`));
            bus.emit('s1', makeEvent('message_start'));
            expect(received).toEqual(['s1:message_start']);
        });

        it('does not deliver events to an unsubscribed callback', () => {
            const received: string[] = [];
            const cb = (sid: string, evt: ClaudeStreamEvent) => received.push(`${sid}:${evt.type}`);
            bus.subscribe('s1', cb);
            bus.unsubscribe('s1', cb);
            bus.emit('s1', makeEvent('message_start'));
            expect(received).toEqual([]);
        });

        it('delivers events only to the matching session', () => {
            const s1Events: string[] = [];
            const s2Events: string[] = [];
            bus.subscribe('s1', (_sid, evt) => s1Events.push(evt.type));
            bus.subscribe('s2', (_sid, evt) => s2Events.push(evt.type));
            bus.emit('s1', makeEvent('message_start'));
            expect(s1Events).toEqual(['message_start']);
            expect(s2Events).toEqual([]);
        });

        it('supports multiple callbacks per session', () => {
            const received: number[] = [];
            bus.subscribe('s1', () => received.push(1));
            bus.subscribe('s1', () => received.push(2));
            bus.emit('s1', makeEvent('message_start'));
            expect(received).toEqual([1, 2]);
        });

        it('unsubscribing one callback does not affect others on the same session', () => {
            const received: number[] = [];
            const cb1 = () => received.push(1);
            const cb2 = () => received.push(2);
            bus.subscribe('s1', cb1);
            bus.subscribe('s1', cb2);
            bus.unsubscribe('s1', cb1);
            bus.emit('s1', makeEvent('message_start'));
            expect(received).toEqual([2]);
        });

        it('unsubscribing from a non-existent session is a no-op', () => {
            expect(() => bus.unsubscribe('nonexistent', () => {})).not.toThrow();
        });

        it('unsubscribing the last callback for a session cleans up the Map entry', () => {
            const cb = () => {};
            bus.subscribe('s1', cb);
            expect(bus.getSubscriberCount()).toBe(1);
            bus.unsubscribe('s1', cb);
            expect(bus.getSubscriberCount()).toBe(0);
        });
    });

    // ── global subscribers ──────────────────────────────────────────────

    describe('subscribeAll / unsubscribeAll (global)', () => {
        it('global subscriber receives events from all sessions', () => {
            const received: string[] = [];
            bus.subscribeAll((sid, evt) => received.push(`${sid}:${evt.type}`));
            bus.emit('s1', makeEvent('message_start'));
            bus.emit('s2', makeEvent('message_delta'));
            expect(received).toEqual(['s1:message_start', 's2:message_delta']);
        });

        it('global subscriber receives events even with no session subscribers', () => {
            const received: string[] = [];
            bus.subscribeAll((sid) => received.push(sid));
            bus.emit('orphan-session', makeEvent('error'));
            expect(received).toEqual(['orphan-session']);
        });

        it('unsubscribeAll stops delivery', () => {
            const received: string[] = [];
            const cb = (sid: string) => received.push(sid);
            bus.subscribeAll(cb);
            bus.unsubscribeAll(cb);
            bus.emit('s1', makeEvent('message_start'));
            expect(received).toEqual([]);
        });

        it('both session and global subscribers receive the same event', () => {
            const sessionEvents: string[] = [];
            const globalEvents: string[] = [];
            bus.subscribe('s1', (_sid, evt) => sessionEvents.push(evt.type));
            bus.subscribeAll((_sid, evt) => globalEvents.push(evt.type));
            bus.emit('s1', makeEvent('tool_use'));
            expect(sessionEvents).toEqual(['tool_use']);
            expect(globalEvents).toEqual(['tool_use']);
        });
    });

    // ── error isolation ─────────────────────────────────────────────────

    describe('error isolation', () => {
        it('a throwing session callback does not prevent other callbacks from firing', () => {
            const received: number[] = [];
            bus.subscribe('s1', () => {
                throw new Error('boom');
            });
            bus.subscribe('s1', () => received.push(2));
            bus.emit('s1', makeEvent('message_start'));
            expect(received).toEqual([2]);
        });

        it('a throwing global callback does not prevent other global callbacks from firing', () => {
            const received: number[] = [];
            bus.subscribeAll(() => {
                throw new Error('global boom');
            });
            bus.subscribeAll(() => received.push(2));
            bus.emit('s1', makeEvent('message_start'));
            expect(received).toEqual([2]);
        });

        it('a throwing session callback does not prevent global callbacks from firing', () => {
            const globalReceived: string[] = [];
            bus.subscribe('s1', () => {
                throw new Error('session boom');
            });
            bus.subscribeAll((sid) => globalReceived.push(sid));
            bus.emit('s1', makeEvent('error'));
            expect(globalReceived).toEqual(['s1']);
        });
    });

    // ── removeSessionSubscribers ────────────────────────────────────────

    describe('removeSessionSubscribers', () => {
        it('removes all subscribers for a session', () => {
            const received: number[] = [];
            bus.subscribe('s1', () => received.push(1));
            bus.subscribe('s1', () => received.push(2));
            bus.removeSessionSubscribers('s1');
            bus.emit('s1', makeEvent('message_start'));
            expect(received).toEqual([]);
        });

        it('does not affect other sessions', () => {
            const received: string[] = [];
            bus.subscribe('s1', () => received.push('s1'));
            bus.subscribe('s2', () => received.push('s2'));
            bus.removeSessionSubscribers('s1');
            bus.emit('s1', makeEvent('message_start'));
            bus.emit('s2', makeEvent('message_start'));
            expect(received).toEqual(['s2']);
        });

        it('removing a non-existent session is a no-op', () => {
            expect(() => bus.removeSessionSubscribers('nonexistent')).not.toThrow();
        });
    });

    // ── clearAllSessionSubscribers ──────────────────────────────────────

    describe('clearAllSessionSubscribers', () => {
        it('removes subscribers for all sessions', () => {
            bus.subscribe('s1', () => {});
            bus.subscribe('s2', () => {});
            bus.clearAllSessionSubscribers();
            expect(bus.getSubscriberCount()).toBe(0);
        });

        it('does not affect global subscribers', () => {
            bus.subscribeAll(() => {});
            bus.subscribe('s1', () => {});
            bus.clearAllSessionSubscribers();
            expect(bus.getGlobalSubscriberCount()).toBe(1);
        });
    });

    // ── pruneSubscribers ────────────────────────────────────────────────

    describe('pruneSubscribers', () => {
        it('removes sessions matching the predicate', () => {
            bus.subscribe('active-1', () => {});
            bus.subscribe('dead-2', () => {});
            bus.subscribe('active-3', () => {});
            const pruned = bus.pruneSubscribers((id) => id.startsWith('dead'));
            expect(pruned).toBe(1);
            expect(bus.getSubscriberCount()).toBe(2);
        });

        it('returns 0 when nothing matches', () => {
            bus.subscribe('s1', () => {});
            const pruned = bus.pruneSubscribers(() => false);
            expect(pruned).toBe(0);
            expect(bus.getSubscriberCount()).toBe(1);
        });

        it('prunes all when predicate always returns true', () => {
            bus.subscribe('s1', () => {});
            bus.subscribe('s2', () => {});
            const pruned = bus.pruneSubscribers(() => true);
            expect(pruned).toBe(2);
            expect(bus.getSubscriberCount()).toBe(0);
        });
    });

    // ── subscriber counts ───────────────────────────────────────────────

    describe('getSubscriberCount / getGlobalSubscriberCount', () => {
        it('counts sessions, not individual callbacks', () => {
            bus.subscribe('s1', () => {});
            bus.subscribe('s1', () => {});
            bus.subscribe('s2', () => {});
            // getSubscriberCount counts sessions (Map entries), not callbacks
            expect(bus.getSubscriberCount()).toBe(2);
        });

        it('global subscriber count is independent', () => {
            bus.subscribeAll(() => {});
            bus.subscribeAll(() => {});
            expect(bus.getGlobalSubscriberCount()).toBe(2);
            expect(bus.getSubscriberCount()).toBe(0);
        });
    });

    // ── emit with no subscribers ────────────────────────────────────────

    describe('emit edge cases', () => {
        it('emitting to a session with no subscribers is a no-op', () => {
            expect(() => bus.emit('nonexistent', makeEvent('message_start'))).not.toThrow();
        });

        it('emitting when bus is completely empty is a no-op', () => {
            expect(() => bus.emit('any', makeEvent('error'))).not.toThrow();
        });
    });
});
