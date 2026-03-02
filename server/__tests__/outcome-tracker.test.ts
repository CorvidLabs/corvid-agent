/**
 * Tests for OutcomeTrackerService and PR outcome DB operations.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
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
import { OutcomeTrackerService } from '../feedback/outcome-tracker';

// ─── Helpers ────────────────────────────────────────────────────────────────

let db: Database;

function createSchema(): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS pr_outcomes (
            id              TEXT    PRIMARY KEY,
            work_task_id    TEXT    NOT NULL,
            pr_url          TEXT    NOT NULL,
            repo            TEXT    NOT NULL,
            pr_number       INTEGER NOT NULL,
            pr_state        TEXT    NOT NULL DEFAULT 'open',
            failure_reason  TEXT    DEFAULT NULL,
            checked_at      TEXT    DEFAULT NULL,
            resolved_at     TEXT    DEFAULT NULL,
            created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS work_tasks (
            id              TEXT    PRIMARY KEY,
            agent_id        TEXT    NOT NULL,
            project_id      TEXT    NOT NULL,
            session_id      TEXT,
            source          TEXT    DEFAULT 'web',
            source_id       TEXT,
            requester_info  TEXT    DEFAULT '{}',
            description     TEXT    NOT NULL,
            branch_name     TEXT,
            status          TEXT    DEFAULT 'pending',
            pr_url          TEXT,
            summary         TEXT,
            error           TEXT,
            original_branch TEXT,
            worktree_dir    TEXT,
            iteration_count INTEGER DEFAULT 0,
            created_at      TEXT    DEFAULT (datetime('now')),
            completed_at    TEXT
        )
    `);
}

function insertWorkTask(id: string, status: string = 'completed', prUrl: string | null = null): void {
    db.query(
        `INSERT INTO work_tasks (id, agent_id, project_id, description, status, pr_url)
         VALUES (?, 'agent-1', 'proj-1', 'test task', ?, ?)`
    ).run(id, status, prUrl);
}

function insertPrOutcome(
    workTaskId: string,
    repo: string,
    prNumber: number,
    prState: string = 'open',
    failureReason: string | null = null,
    createdAt?: string,
): string {
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO pr_outcomes (id, work_task_id, pr_url, repo, pr_number, pr_state, failure_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        id,
        workTaskId,
        `https://github.com/${repo}/pull/${prNumber}`,
        repo,
        prNumber,
        prState,
        failureReason,
        createdAt ?? new Date().toISOString(),
    );
    return id;
}

beforeEach(() => {
    db = new Database(':memory:');
    createSchema();
});

// ─── parsePrUrl ─────────────────────────────────────────────────────────────

describe('parsePrUrl', () => {
    it('parses a valid GitHub PR URL', () => {
        const result = parsePrUrl('https://github.com/CorvidLabs/corvid-agent/pull/123');
        expect(result).toEqual({ repo: 'CorvidLabs/corvid-agent', prNumber: 123 });
    });

    it('returns null for non-GitHub URLs', () => {
        expect(parsePrUrl('https://gitlab.com/foo/bar/merge_requests/1')).toBeNull();
    });

    it('returns null for malformed URLs', () => {
        expect(parsePrUrl('not a url')).toBeNull();
    });

    it('handles URLs with trailing paths', () => {
        const result = parsePrUrl('https://github.com/owner/repo/pull/42/files');
        expect(result).toEqual({ repo: 'owner/repo', prNumber: 42 });
    });
});

// ─── PR Outcome CRUD ────────────────────────────────────────────────────────

describe('PR Outcome CRUD', () => {
    it('creates and retrieves a PR outcome', () => {
        const outcome = createPrOutcome(db, {
            workTaskId: 'task-1',
            prUrl: 'https://github.com/CorvidLabs/corvid-agent/pull/100',
            repo: 'CorvidLabs/corvid-agent',
            prNumber: 100,
        });

        expect(outcome.id).toBeTruthy();
        expect(outcome.prState).toBe('open');
        expect(outcome.failureReason).toBeNull();

        const fetched = getPrOutcome(db, outcome.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.prNumber).toBe(100);
    });

    it('retrieves by work task ID', () => {
        insertPrOutcome('task-1', 'owner/repo', 1);
        const result = getPrOutcomeByWorkTask(db, 'task-1');
        expect(result).not.toBeNull();
        expect(result!.repo).toBe('owner/repo');
    });

    it('returns null for nonexistent work task', () => {
        expect(getPrOutcomeByWorkTask(db, 'nonexistent')).toBeNull();
    });

    it('lists open PR outcomes', () => {
        insertPrOutcome('task-1', 'owner/repo', 1, 'open');
        insertPrOutcome('task-2', 'owner/repo', 2, 'merged');
        insertPrOutcome('task-3', 'owner/repo', 3, 'open');

        const open = listOpenPrOutcomes(db);
        expect(open.length).toBe(2);
    });

    it('lists PR outcomes with filters', () => {
        insertPrOutcome('task-1', 'CorvidLabs/corvid-agent', 1, 'merged');
        insertPrOutcome('task-2', 'CorvidLabs/corvid-agent', 2, 'closed');
        insertPrOutcome('task-3', 'other/repo', 3, 'merged');

        const merged = listPrOutcomes(db, { prState: 'merged' });
        expect(merged.length).toBe(2);

        const byRepo = listPrOutcomes(db, { repo: 'CorvidLabs/corvid-agent' });
        expect(byRepo.length).toBe(2);
    });

    it('updates PR state to merged', () => {
        const id = insertPrOutcome('task-1', 'owner/repo', 1);
        updatePrOutcomeState(db, id, 'merged');

        const outcome = getPrOutcome(db, id);
        expect(outcome!.prState).toBe('merged');
        expect(outcome!.resolvedAt).not.toBeNull();
    });

    it('updates PR state to closed with failure reason', () => {
        const id = insertPrOutcome('task-1', 'owner/repo', 1);
        updatePrOutcomeState(db, id, 'closed', 'ci_fail');

        const outcome = getPrOutcome(db, id);
        expect(outcome!.prState).toBe('closed');
        expect(outcome!.failureReason).toBe('ci_fail');
        expect(outcome!.resolvedAt).not.toBeNull();
    });

    it('marks PR as checked', () => {
        const id = insertPrOutcome('task-1', 'owner/repo', 1);
        markPrChecked(db, id);

        const outcome = getPrOutcome(db, id);
        expect(outcome!.checkedAt).not.toBeNull();
    });
});

// ─── Aggregate Queries ──────────────────────────────────────────────────────

describe('Aggregate Queries', () => {
    beforeEach(() => {
        insertPrOutcome('t1', 'CorvidLabs/corvid-agent', 1, 'merged');
        insertPrOutcome('t2', 'CorvidLabs/corvid-agent', 2, 'merged');
        insertPrOutcome('t3', 'CorvidLabs/corvid-agent', 3, 'closed', 'ci_fail');
        insertPrOutcome('t4', 'other/repo', 4, 'merged');
        insertPrOutcome('t5', 'other/repo', 5, 'closed', 'review_rejection');
        insertPrOutcome('t6', 'other/repo', 6, 'open');
    });

    it('computes outcome stats by repo', () => {
        const stats = getOutcomeStatsByRepo(db);

        expect(stats['CorvidLabs/corvid-agent'].total).toBe(3);
        expect(stats['CorvidLabs/corvid-agent'].merged).toBe(2);
        expect(stats['CorvidLabs/corvid-agent'].closed).toBe(1);
        expect(stats['CorvidLabs/corvid-agent'].mergeRate).toBeCloseTo(2 / 3);

        expect(stats['other/repo'].total).toBe(3);
        expect(stats['other/repo'].merged).toBe(1);
        expect(stats['other/repo'].mergeRate).toBe(0.5);
    });

    it('computes overall outcome stats', () => {
        const stats = getOverallOutcomeStats(db);
        expect(stats.total).toBe(6);
        expect(stats.merged).toBe(3);
        expect(stats.closed).toBe(2);
        expect(stats.open).toBe(1);
        expect(stats.mergeRate).toBe(0.6);
    });

    it('computes failure reason breakdown', () => {
        const breakdown = getFailureReasonBreakdown(db);
        expect(breakdown['ci_fail']).toBe(1);
        expect(breakdown['review_rejection']).toBe(1);
    });

    it('returns empty stats when no outcomes exist', () => {
        const emptyDb = new Database(':memory:');
        createSchemaOn(emptyDb);

        const stats = getOverallOutcomeStats(emptyDb);
        expect(stats.total).toBe(0);
        expect(stats.mergeRate).toBe(0);
    });
});

function createSchemaOn(targetDb: Database): void {
    targetDb.exec(`
        CREATE TABLE IF NOT EXISTS pr_outcomes (
            id              TEXT    PRIMARY KEY,
            work_task_id    TEXT    NOT NULL,
            pr_url          TEXT    NOT NULL,
            repo            TEXT    NOT NULL,
            pr_number       INTEGER NOT NULL,
            pr_state        TEXT    NOT NULL DEFAULT 'open',
            failure_reason  TEXT    DEFAULT NULL,
            checked_at      TEXT    DEFAULT NULL,
            resolved_at     TEXT    DEFAULT NULL,
            created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    `);
}

// ─── OutcomeTrackerService ──────────────────────────────────────────────────

describe('OutcomeTrackerService', () => {
    let service: OutcomeTrackerService;

    beforeEach(() => {
        service = new OutcomeTrackerService(db);
    });

    describe('recordPrFromWorkTask', () => {
        it('records a PR outcome from a work task', () => {
            const outcome = service.recordPrFromWorkTask(
                'task-1',
                'https://github.com/CorvidLabs/corvid-agent/pull/123',
            );
            expect(outcome).not.toBeNull();
            expect(outcome!.repo).toBe('CorvidLabs/corvid-agent');
            expect(outcome!.prNumber).toBe(123);
            expect(outcome!.prState).toBe('open');
        });

        it('returns existing outcome if already recorded', () => {
            const first = service.recordPrFromWorkTask(
                'task-1',
                'https://github.com/CorvidLabs/corvid-agent/pull/123',
            );
            const second = service.recordPrFromWorkTask(
                'task-1',
                'https://github.com/CorvidLabs/corvid-agent/pull/123',
            );
            expect(first!.id).toBe(second!.id);
        });

        it('returns null for unparseable PR URL', () => {
            const result = service.recordPrFromWorkTask('task-1', 'not-a-url');
            expect(result).toBeNull();
        });
    });

    describe('analyzeWeekly', () => {
        it('produces analysis with zero outcomes', () => {
            const analysis = service.analyzeWeekly('agent-1');
            expect(analysis.overall.total).toBe(0);
            expect(analysis.topInsights).toContain('No PRs tracked this period.');
        });

        it('produces analysis with outcomes and work tasks', () => {
            insertWorkTask('t1', 'completed', 'https://github.com/owner/repo/pull/1');
            insertWorkTask('t2', 'failed');
            insertWorkTask('t3', 'completed', 'https://github.com/owner/repo/pull/3');
            insertPrOutcome('t1', 'owner/repo', 1, 'merged');
            insertPrOutcome('t3', 'owner/repo', 3, 'closed', 'ci_fail');

            const analysis = service.analyzeWeekly('agent-1');
            expect(analysis.overall.total).toBe(2);
            expect(analysis.workTaskStats.total).toBe(3);
            expect(analysis.workTaskStats.completed).toBe(2);
            expect(analysis.workTaskStats.failed).toBe(1);
        });
    });

    describe('getOutcomeContext', () => {
        it('returns empty string when no outcomes exist', () => {
            const context = service.getOutcomeContext();
            expect(context).toBe('');
        });

        it('returns formatted context with outcomes', () => {
            insertPrOutcome('t1', 'CorvidLabs/corvid-agent', 1, 'merged');
            insertPrOutcome('t2', 'CorvidLabs/corvid-agent', 2, 'closed', 'ci_fail');

            const context = service.getOutcomeContext();
            expect(context).toContain('PR Outcome Feedback');
            expect(context).toContain('Merged: 1');
            expect(context).toContain('Closed: 1');
            expect(context).toContain('Merge rate: 50%');
        });
    });

    describe('getMetrics', () => {
        it('returns complete metrics', () => {
            insertWorkTask('t1', 'completed');
            insertWorkTask('t2', 'failed');
            insertPrOutcome('t1', 'owner/repo', 1, 'merged');

            const metrics = service.getMetrics();
            expect(metrics.overall.total).toBe(1);
            expect(metrics.overall.merged).toBe(1);
            expect(metrics.workTaskSuccessRate).toBe(0.5);
        });
    });
});
