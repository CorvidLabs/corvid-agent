import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    parsePrUrl,
    createPrOutcome,
    getPrOutcome,
    getPrOutcomeByWorkTask,
    listOpenPrOutcomes,
    listPrOutcomes,
    updatePrOutcomeState,
    markPrChecked,
    getOutcomeStatsByRepo,
    getFailureReasonBreakdown,
    getOverallOutcomeStats,
} from '../db/pr-outcomes';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

/** Helper to create a PR outcome with sensible defaults. */
function makePr(overrides: Partial<{ workTaskId: string; prUrl: string; repo: string; prNumber: number }> = {}) {
    return createPrOutcome(db, {
        workTaskId: overrides.workTaskId ?? crypto.randomUUID(),
        prUrl: overrides.prUrl ?? 'https://github.com/org/repo/pull/1',
        repo: overrides.repo ?? 'org/repo',
        prNumber: overrides.prNumber ?? 1,
    });
}

// ── parsePrUrl ───────────────────────────────────────────────────────

describe('parsePrUrl', () => {
    test('parses valid GitHub PR URL', () => {
        const result = parsePrUrl('https://github.com/CorvidLabs/corvid-agent/pull/511');
        expect(result).toEqual({ repo: 'CorvidLabs/corvid-agent', prNumber: 511 });
    });

    test('parses URL with trailing path', () => {
        const result = parsePrUrl('https://github.com/org/repo/pull/42/files');
        expect(result).toEqual({ repo: 'org/repo', prNumber: 42 });
    });

    test('returns null for non-PR URL', () => {
        expect(parsePrUrl('https://github.com/org/repo/issues/1')).toBeNull();
    });

    test('returns null for invalid URL', () => {
        expect(parsePrUrl('not a url')).toBeNull();
    });
});

// ── CRUD ─────────────────────────────────────────────────────────────

describe('PR outcome CRUD', () => {
    test('createPrOutcome creates with correct defaults', () => {
        const pr = makePr({ prNumber: 42, repo: 'org/repo' });
        expect(pr.id).toBeTruthy();
        expect(pr.prNumber).toBe(42);
        expect(pr.repo).toBe('org/repo');
        expect(pr.prState).toBe('open');
        expect(pr.failureReason).toBeNull();
        expect(pr.checkedAt).toBeNull();
        expect(pr.resolvedAt).toBeNull();
    });

    test('getPrOutcome returns by id', () => {
        const pr = makePr();
        const fetched = getPrOutcome(db, pr.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.id).toBe(pr.id);
    });

    test('getPrOutcome returns null for unknown id', () => {
        expect(getPrOutcome(db, 'nonexistent')).toBeNull();
    });

    test('getPrOutcomeByWorkTask finds by work task id', () => {
        const taskId = 'wt-123';
        const pr = makePr({ workTaskId: taskId });
        const fetched = getPrOutcomeByWorkTask(db, taskId);
        expect(fetched).not.toBeNull();
        expect(fetched!.id).toBe(pr.id);
    });

    test('getPrOutcomeByWorkTask returns null for unknown task', () => {
        expect(getPrOutcomeByWorkTask(db, 'unknown')).toBeNull();
    });
});

// ── State updates ────────────────────────────────────────────────────

describe('state updates', () => {
    test('updatePrOutcomeState sets merged state with resolvedAt', () => {
        const pr = makePr();
        updatePrOutcomeState(db, pr.id, 'merged');

        const updated = getPrOutcome(db, pr.id)!;
        expect(updated.prState).toBe('merged');
        expect(updated.resolvedAt).toBeTruthy();
        expect(updated.checkedAt).toBeTruthy();
        expect(updated.failureReason).toBeNull();
    });

    test('updatePrOutcomeState sets closed with failure reason', () => {
        const pr = makePr();
        updatePrOutcomeState(db, pr.id, 'closed', 'ci_fail');

        const updated = getPrOutcome(db, pr.id)!;
        expect(updated.prState).toBe('closed');
        expect(updated.failureReason).toBe('ci_fail');
        expect(updated.resolvedAt).toBeTruthy();
    });

    test('updatePrOutcomeState to open does not set resolvedAt', () => {
        const pr = makePr();
        // First close it
        updatePrOutcomeState(db, pr.id, 'closed', 'stale');
        // Then reopen
        updatePrOutcomeState(db, pr.id, 'open');

        const updated = getPrOutcome(db, pr.id)!;
        expect(updated.prState).toBe('open');
        expect(updated.resolvedAt).toBeNull();
    });

    test('markPrChecked updates checkedAt without changing state', () => {
        const pr = makePr();
        markPrChecked(db, pr.id);

        const updated = getPrOutcome(db, pr.id)!;
        expect(updated.prState).toBe('open');
        expect(updated.checkedAt).toBeTruthy();
    });
});

// ── Listing ──────────────────────────────────────────────────────────

describe('listing', () => {
    test('listOpenPrOutcomes returns only open PRs', () => {
        const p1 = makePr({ prNumber: 1 });
        const p2 = makePr({ prNumber: 2 });
        updatePrOutcomeState(db, p2.id, 'merged');

        const open = listOpenPrOutcomes(db);
        expect(open).toHaveLength(1);
        expect(open[0].id).toBe(p1.id);
    });

    test('listPrOutcomes filters by repo', () => {
        makePr({ repo: 'org/repo-a', prNumber: 1 });
        makePr({ repo: 'org/repo-b', prNumber: 2 });

        const list = listPrOutcomes(db, { repo: 'org/repo-a' });
        expect(list).toHaveLength(1);
        expect(list[0].repo).toBe('org/repo-a');
    });

    test('listPrOutcomes filters by state', () => {
        const p1 = makePr({ prNumber: 1 });
        makePr({ prNumber: 2 });
        updatePrOutcomeState(db, p1.id, 'merged');

        const list = listPrOutcomes(db, { prState: 'merged' });
        expect(list).toHaveLength(1);
        expect(list[0].prState).toBe('merged');
    });

    test('listPrOutcomes respects limit', () => {
        for (let i = 0; i < 5; i++) makePr({ prNumber: i + 1 });
        expect(listPrOutcomes(db, { limit: 2 })).toHaveLength(2);
    });
});

// ── Aggregate Stats ──────────────────────────────────────────────────

describe('aggregate stats', () => {
    test('getOverallOutcomeStats calculates merge rate', () => {
        const p1 = makePr({ prNumber: 1 });
        const p2 = makePr({ prNumber: 2 });
        makePr({ prNumber: 3 }); // stays open
        updatePrOutcomeState(db, p1.id, 'merged');
        updatePrOutcomeState(db, p2.id, 'closed', 'ci_fail');

        const stats = getOverallOutcomeStats(db);
        expect(stats.total).toBe(3);
        expect(stats.merged).toBe(1);
        expect(stats.closed).toBe(1);
        expect(stats.open).toBe(1);
        expect(stats.mergeRate).toBe(0.5); // 1 merged / 2 resolved
    });

    test('getOverallOutcomeStats returns 0 merge rate when no resolved PRs', () => {
        makePr();
        const stats = getOverallOutcomeStats(db);
        expect(stats.mergeRate).toBe(0);
    });

    test('getOverallOutcomeStats returns zeros for empty table', () => {
        const stats = getOverallOutcomeStats(db);
        expect(stats.total).toBe(0);
        expect(stats.mergeRate).toBe(0);
    });

    test('getOutcomeStatsByRepo groups by repo', () => {
        const p1 = makePr({ repo: 'org/a', prNumber: 1 });
        const p2 = makePr({ repo: 'org/a', prNumber: 2 });
        const p3 = makePr({ repo: 'org/b', prNumber: 1 });
        updatePrOutcomeState(db, p1.id, 'merged');
        updatePrOutcomeState(db, p2.id, 'closed', 'review_rejection');
        updatePrOutcomeState(db, p3.id, 'merged');

        const stats = getOutcomeStatsByRepo(db);
        expect(stats['org/a'].total).toBe(2);
        expect(stats['org/a'].mergeRate).toBe(0.5);
        expect(stats['org/b'].total).toBe(1);
        expect(stats['org/b'].mergeRate).toBe(1);
    });

    test('getFailureReasonBreakdown counts failure reasons', () => {
        const p1 = makePr({ prNumber: 1 });
        const p2 = makePr({ prNumber: 2 });
        const p3 = makePr({ prNumber: 3 });
        updatePrOutcomeState(db, p1.id, 'closed', 'ci_fail');
        updatePrOutcomeState(db, p2.id, 'closed', 'ci_fail');
        updatePrOutcomeState(db, p3.id, 'closed', 'review_rejection');

        const breakdown = getFailureReasonBreakdown(db);
        expect(breakdown['ci_fail']).toBe(2);
        expect(breakdown['review_rejection']).toBe(1);
    });

    test('getFailureReasonBreakdown counts null reason as unknown', () => {
        const p1 = makePr({ prNumber: 1 });
        updatePrOutcomeState(db, p1.id, 'closed');

        const breakdown = getFailureReasonBreakdown(db);
        expect(breakdown['unknown']).toBe(1);
    });
});
