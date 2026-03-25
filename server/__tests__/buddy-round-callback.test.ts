/**
 * Tests for BuddyService round callback (onRoundComplete).
 *
 * Verifies that the callback is invoked after each agent turn,
 * and that callback errors don't break the conversation loop.
 */
import { describe, test, expect } from 'bun:test';
import { BuddyService } from '../buddy/service';
import type { BuddyRoundEvent } from '../../shared/types/buddy';

/**
 * We test invokeRoundCallback directly since the full conversation loop
 * requires a real ProcessManager. The private method is accessed via
 * bracket notation.
 */
function createService() {
    const service = new BuddyService({
        db: {} as any,
        processManager: {} as any,
    });
    return service;
}

function makeEvent(overrides: Partial<BuddyRoundEvent> = {}): BuddyRoundEvent {
    return {
        buddySessionId: 'bs-1',
        agentId: 'lead-1',
        agentName: 'Lead Agent',
        role: 'lead',
        round: 1,
        maxRounds: 3,
        content: 'Test output',
        approved: false,
        ...overrides,
    };
}

describe('BuddyService.invokeRoundCallback', () => {
    test('calls callback with event', async () => {
        const service = createService();
        const events: BuddyRoundEvent[] = [];
        const callback = async (event: BuddyRoundEvent) => { events.push(event); };

        const event = makeEvent();
        await (service as any).invokeRoundCallback(callback, event);

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual(event);
    });

    test('does nothing when callback is undefined', async () => {
        const service = createService();
        // Should not throw
        await (service as any).invokeRoundCallback(undefined, makeEvent());
    });

    test('catches and logs callback errors without throwing', async () => {
        const service = createService();
        const callback = async () => { throw new Error('Discord API failed'); };

        // Should not throw despite callback error
        await (service as any).invokeRoundCallback(callback, makeEvent());
    });

    test('passes approved=true for buddy approval events', async () => {
        const service = createService();
        const events: BuddyRoundEvent[] = [];
        const callback = async (event: BuddyRoundEvent) => { events.push(event); };

        const event = makeEvent({ role: 'buddy', approved: true, content: 'LGTM' });
        await (service as any).invokeRoundCallback(callback, event);

        expect(events[0].approved).toBe(true);
        expect(events[0].role).toBe('buddy');
    });

    test('passes correct round info for multi-round conversations', async () => {
        const service = createService();
        const events: BuddyRoundEvent[] = [];
        const callback = async (event: BuddyRoundEvent) => { events.push(event); };

        // Simulate round 1 lead, round 1 buddy, round 2 lead
        await (service as any).invokeRoundCallback(callback, makeEvent({ role: 'lead', round: 1 }));
        await (service as any).invokeRoundCallback(callback, makeEvent({ role: 'buddy', round: 1, agentId: 'buddy-1', agentName: 'Buddy Agent' }));
        await (service as any).invokeRoundCallback(callback, makeEvent({ role: 'lead', round: 2 }));

        expect(events).toHaveLength(3);
        expect(events[0].role).toBe('lead');
        expect(events[0].round).toBe(1);
        expect(events[1].role).toBe('buddy');
        expect(events[1].round).toBe(1);
        expect(events[2].role).toBe('lead');
        expect(events[2].round).toBe(2);
    });
});
