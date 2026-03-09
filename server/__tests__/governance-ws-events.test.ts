import { describe, test, expect, afterEach } from 'bun:test';
import {
    onGovernanceVoteCast,
    onGovernanceVoteResolved,
    onGovernanceQuorumReached,
    broadcastGovernanceVoteCast,
    broadcastGovernanceVoteResolved,
    broadcastGovernanceQuorumReached,
    type GovernanceVoteCastEvent,
    type GovernanceVoteResolvedEvent,
    type GovernanceQuorumReachedEvent,
} from '../councils/discussion';

// ── Governance vote cast events ──────────────────────────────────────────────

describe('governance WS events', () => {
    describe('broadcastGovernanceVoteCast', () => {
        let unsub: () => void;

        afterEach(() => {
            unsub?.();
        });

        test('notifies listeners when a vote is cast', () => {
            const received: GovernanceVoteCastEvent[] = [];
            unsub = onGovernanceVoteCast((event) => received.push(event));

            const event: GovernanceVoteCastEvent = {
                launchId: 'launch-1',
                agentId: 'agent-1',
                vote: 'approve',
                weight: 85,
                weightedApprovalRatio: 0.625,
                totalVotesCast: 3,
                totalMembers: 4,
            };

            broadcastGovernanceVoteCast(event);

            expect(received).toHaveLength(1);
            expect(received[0]).toEqual(event);
        });

        test('supports multiple listeners', () => {
            let count = 0;
            unsub = onGovernanceVoteCast(() => count++);
            const unsub2 = onGovernanceVoteCast(() => count++);

            broadcastGovernanceVoteCast({
                launchId: 'launch-1',
                agentId: 'agent-1',
                vote: 'reject',
                weight: 60,
                weightedApprovalRatio: 0.4,
                totalVotesCast: 2,
                totalMembers: 4,
            });

            expect(count).toBe(2);
            unsub2();
        });

        test('unsubscribe removes listener', () => {
            let called = false;
            unsub = onGovernanceVoteCast(() => { called = true; });
            unsub();

            broadcastGovernanceVoteCast({
                launchId: 'launch-1',
                agentId: 'agent-1',
                vote: 'abstain',
                weight: 50,
                weightedApprovalRatio: 0,
                totalVotesCast: 1,
                totalMembers: 3,
            });

            expect(called).toBe(false);
            // Prevent double-unsub in afterEach
            unsub = () => {};
        });

        test('swallows listener errors without affecting other listeners', () => {
            const received: GovernanceVoteCastEvent[] = [];
            const unsub1 = onGovernanceVoteCast(() => { throw new Error('boom'); });
            unsub = onGovernanceVoteCast((event) => received.push(event));

            broadcastGovernanceVoteCast({
                launchId: 'launch-1',
                agentId: 'agent-1',
                vote: 'approve',
                weight: 70,
                weightedApprovalRatio: 0.7,
                totalVotesCast: 1,
                totalMembers: 2,
            });

            expect(received).toHaveLength(1);
            unsub1();
        });
    });

    // ── Governance vote resolved events ──────────────────────────────────────

    describe('broadcastGovernanceVoteResolved', () => {
        let unsub: () => void;

        afterEach(() => {
            unsub?.();
        });

        test('notifies listeners when a vote is resolved as approved', () => {
            const received: GovernanceVoteResolvedEvent[] = [];
            unsub = onGovernanceVoteResolved((event) => received.push(event));

            const event: GovernanceVoteResolvedEvent = {
                launchId: 'launch-1',
                status: 'approved',
                weightedApprovalRatio: 0.85,
                effectiveThreshold: 0.75,
                reason: 'Approved: 85% weighted approval meets Structural tier threshold',
            };

            broadcastGovernanceVoteResolved(event);

            expect(received).toHaveLength(1);
            expect(received[0]).toEqual(event);
        });

        test('notifies listeners when a vote is resolved as rejected', () => {
            const received: GovernanceVoteResolvedEvent[] = [];
            unsub = onGovernanceVoteResolved((event) => received.push(event));

            broadcastGovernanceVoteResolved({
                launchId: 'launch-2',
                status: 'rejected',
                weightedApprovalRatio: 0.45,
                effectiveThreshold: 0.75,
                reason: 'Weighted approval 45% below 75% threshold',
            });

            expect(received).toHaveLength(1);
            expect(received[0].status).toBe('rejected');
        });

        test('notifies listeners when awaiting human approval', () => {
            const received: GovernanceVoteResolvedEvent[] = [];
            unsub = onGovernanceVoteResolved((event) => received.push(event));

            broadcastGovernanceVoteResolved({
                launchId: 'launch-3',
                status: 'awaiting_human',
                weightedApprovalRatio: 0.80,
                effectiveThreshold: 0.75,
                reason: 'Weighted vote passed (80%) but awaiting human approval',
            });

            expect(received).toHaveLength(1);
            expect(received[0].status).toBe('awaiting_human');
        });

        test('unsubscribe removes listener', () => {
            let called = false;
            unsub = onGovernanceVoteResolved(() => { called = true; });
            unsub();

            broadcastGovernanceVoteResolved({
                launchId: 'launch-1',
                status: 'approved',
                weightedApprovalRatio: 0.9,
                effectiveThreshold: 0.75,
                reason: 'Approved',
            });

            expect(called).toBe(false);
            unsub = () => {};
        });
    });

    // ── Governance quorum reached events ─────────────────────────────────────

    describe('broadcastGovernanceQuorumReached', () => {
        let unsub: () => void;

        afterEach(() => {
            unsub?.();
        });

        test('notifies listeners when quorum is reached', () => {
            const received: GovernanceQuorumReachedEvent[] = [];
            unsub = onGovernanceQuorumReached((event) => received.push(event));

            const event: GovernanceQuorumReachedEvent = {
                launchId: 'launch-1',
                weightedApprovalRatio: 0.80,
                threshold: 0.75,
            };

            broadcastGovernanceQuorumReached(event);

            expect(received).toHaveLength(1);
            expect(received[0]).toEqual(event);
        });

        test('unsubscribe removes listener', () => {
            let called = false;
            unsub = onGovernanceQuorumReached(() => { called = true; });
            unsub();

            broadcastGovernanceQuorumReached({
                launchId: 'launch-1',
                weightedApprovalRatio: 0.80,
                threshold: 0.75,
            });

            expect(called).toBe(false);
            unsub = () => {};
        });

        test('swallows listener errors', () => {
            const received: GovernanceQuorumReachedEvent[] = [];
            const unsub1 = onGovernanceQuorumReached(() => { throw new Error('fail'); });
            unsub = onGovernanceQuorumReached((event) => received.push(event));

            broadcastGovernanceQuorumReached({
                launchId: 'launch-1',
                weightedApprovalRatio: 0.80,
                threshold: 0.75,
            });

            expect(received).toHaveLength(1);
            unsub1();
        });
    });
});
