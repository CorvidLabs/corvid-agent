/**
 * Tests for HealthStore — snapshot persistence, retrieval, trend analysis,
 * and prompt formatting.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
    saveHealthSnapshot,
    getRecentSnapshots,
    computeTrends,
    formatTrendsForPrompt,
    type HealthSnapshot,
} from '../improvement/health-store';
import type { HealthMetrics } from '../improvement/health-collector';

// ─── Helpers ────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.run(`CREATE TABLE IF NOT EXISTS health_snapshots (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        tsc_error_count INTEGER DEFAULT 0,
        tsc_passed INTEGER DEFAULT 0,
        tests_passed INTEGER DEFAULT 0,
        test_failure_count INTEGER DEFAULT 0,
        todo_count INTEGER DEFAULT 0,
        fixme_count INTEGER DEFAULT 0,
        hack_count INTEGER DEFAULT 0,
        large_file_count INTEGER DEFAULT 0,
        outdated_dep_count INTEGER DEFAULT 0,
        collected_at TEXT DEFAULT (datetime('now'))
    )`);
});

/** Build a minimal HealthMetrics object for testing. */
function makeMetrics(overrides: Partial<HealthMetrics> = {}): HealthMetrics {
    return {
        tscErrors: [],
        tscErrorCount: 0,
        tscPassed: true,
        testsPassed: true,
        testSummary: '',
        testFailureCount: 0,
        todoCount: 0,
        fixmeCount: 0,
        hackCount: 0,
        todoSamples: [],
        largeFiles: [],
        outdatedDeps: [],
        collectedAt: new Date().toISOString(),
        collectionTimeMs: 100,
        ...overrides,
    };
}

/** Build a minimal HealthSnapshot for trend tests (bypassing DB). */
function makeSnapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
    return {
        id: crypto.randomUUID(),
        agentId: 'agent-1',
        projectId: 'proj-1',
        tscErrorCount: 0,
        tscPassed: true,
        testsPassed: true,
        testFailureCount: 0,
        todoCount: 0,
        fixmeCount: 0,
        hackCount: 0,
        largeFileCount: 0,
        outdatedDepCount: 0,
        collectedAt: new Date().toISOString(),
        ...overrides,
    };
}

// ─── saveHealthSnapshot ─────────────────────────────────────────────────────

describe('saveHealthSnapshot', () => {
    it('inserts a record and returns the snapshot', () => {
        const metrics = makeMetrics({
            tscErrorCount: 3,
            tscPassed: false,
            testsPassed: true,
            testFailureCount: 1,
            todoCount: 5,
            fixmeCount: 2,
            hackCount: 1,
            largeFiles: [{ file: 'big.ts', lines: 600 }] as any,
            outdatedDeps: [{ name: 'foo', current: '1.0', latest: '2.0' }] as any,
        });

        const snapshot = saveHealthSnapshot(db, 'agent-1', 'proj-1', metrics);

        // Verify returned object
        expect(snapshot.agentId).toBe('agent-1');
        expect(snapshot.projectId).toBe('proj-1');
        expect(snapshot.tscErrorCount).toBe(3);
        expect(snapshot.tscPassed).toBe(false);
        expect(snapshot.testsPassed).toBe(true);
        expect(snapshot.testFailureCount).toBe(1);
        expect(snapshot.todoCount).toBe(5);
        expect(snapshot.fixmeCount).toBe(2);
        expect(snapshot.hackCount).toBe(1);
        expect(snapshot.largeFileCount).toBe(1);
        expect(snapshot.outdatedDepCount).toBe(1);
        expect(snapshot.id).toBeTruthy();

        // Verify actually in the DB
        const row = db.query('SELECT * FROM health_snapshots WHERE id = ?').get(snapshot.id) as any;
        expect(row).toBeTruthy();
        expect(row.agent_id).toBe('agent-1');
        expect(row.tsc_error_count).toBe(3);
        expect(row.tsc_passed).toBe(0); // false -> 0
        expect(row.tests_passed).toBe(1); // true -> 1
    });
});

// ─── getRecentSnapshots ─────────────────────────────────────────────────────

describe('getRecentSnapshots', () => {
    it('returns snapshots in reverse chronological order', () => {
        // Insert 3 snapshots with different collected_at values
        db.run(
            `INSERT INTO health_snapshots (id, agent_id, project_id, tsc_error_count, collected_at)
             VALUES ('s1', 'a1', 'p1', 10, '2025-01-01 00:00:00')`,
        );
        db.run(
            `INSERT INTO health_snapshots (id, agent_id, project_id, tsc_error_count, collected_at)
             VALUES ('s2', 'a1', 'p1', 8, '2025-01-02 00:00:00')`,
        );
        db.run(
            `INSERT INTO health_snapshots (id, agent_id, project_id, tsc_error_count, collected_at)
             VALUES ('s3', 'a1', 'p1', 5, '2025-01-03 00:00:00')`,
        );

        const results = getRecentSnapshots(db, 'a1', 'p1');

        expect(results).toHaveLength(3);
        // DESC order: newest first
        expect(results[0].id).toBe('s3');
        expect(results[1].id).toBe('s2');
        expect(results[2].id).toBe('s1');
    });

    it('respects limit parameter', () => {
        for (let i = 0; i < 5; i++) {
            db.run(
                `INSERT INTO health_snapshots (id, agent_id, project_id, collected_at)
                 VALUES ('s${i}', 'a1', 'p1', '2025-01-0${i + 1} 00:00:00')`,
            );
        }

        const results = getRecentSnapshots(db, 'a1', 'p1', 3);

        expect(results).toHaveLength(3);
        // Should be the 3 most recent
        expect(results[0].id).toBe('s4');
        expect(results[1].id).toBe('s3');
        expect(results[2].id).toBe('s2');
    });
});

// ─── computeTrends ──────────────────────────────────────────────────────────

describe('computeTrends', () => {
    it('returns improving for decreasing error counts', () => {
        // Snapshots in DESC order (as returned by getRecentSnapshots)
        // After internal reverse: chronological = [10, 8, 5, 2]
        const snapshots = [
            makeSnapshot({ tscErrorCount: 2, collectedAt: '2025-01-04' }),
            makeSnapshot({ tscErrorCount: 5, collectedAt: '2025-01-03' }),
            makeSnapshot({ tscErrorCount: 8, collectedAt: '2025-01-02' }),
            makeSnapshot({ tscErrorCount: 10, collectedAt: '2025-01-01' }),
        ];

        const trends = computeTrends(snapshots);
        const tscTrend = trends.find((t) => t.metric === 'tsc_errors');

        expect(tscTrend).toBeTruthy();
        expect(tscTrend!.direction).toBe('improving');
        expect(tscTrend!.values).toEqual([10, 8, 5, 2]);
    });

    it('returns regressing for increasing error counts', () => {
        // After reverse: chronological = [1, 3, 6, 10]
        const snapshots = [
            makeSnapshot({ tscErrorCount: 10, collectedAt: '2025-01-04' }),
            makeSnapshot({ tscErrorCount: 6, collectedAt: '2025-01-03' }),
            makeSnapshot({ tscErrorCount: 3, collectedAt: '2025-01-02' }),
            makeSnapshot({ tscErrorCount: 1, collectedAt: '2025-01-01' }),
        ];

        const trends = computeTrends(snapshots);
        const tscTrend = trends.find((t) => t.metric === 'tsc_errors');

        expect(tscTrend).toBeTruthy();
        expect(tscTrend!.direction).toBe('regressing');
        expect(tscTrend!.values).toEqual([1, 3, 6, 10]);
    });

    it('returns stable for minimal change', () => {
        // After reverse: chronological = [10, 10, 10, 10]
        // first-half avg = 10, second-half avg = 10, diff = 0 < threshold
        const snapshots = [
            makeSnapshot({ tscErrorCount: 10, collectedAt: '2025-01-04' }),
            makeSnapshot({ tscErrorCount: 10, collectedAt: '2025-01-03' }),
            makeSnapshot({ tscErrorCount: 10, collectedAt: '2025-01-02' }),
            makeSnapshot({ tscErrorCount: 10, collectedAt: '2025-01-01' }),
        ];

        const trends = computeTrends(snapshots);
        const tscTrend = trends.find((t) => t.metric === 'tsc_errors');

        expect(tscTrend).toBeTruthy();
        expect(tscTrend!.direction).toBe('stable');
    });

    it('returns empty array for fewer than 2 snapshots', () => {
        const trends = computeTrends([makeSnapshot()]);
        expect(trends).toEqual([]);
    });
});

// ─── formatTrendsForPrompt ──────────────────────────────────────────────────

describe('formatTrendsForPrompt', () => {
    it('formats output correctly with values and direction labels', () => {
        const trends = [
            { metric: 'tsc_errors', direction: 'improving' as const, values: [5, 3, 1] },
            { metric: 'todos', direction: 'stable' as const, values: [4, 4, 4] },
            { metric: 'test_failures', direction: 'regressing' as const, values: [0, 1, 3] },
        ];

        const output = formatTrendsForPrompt(trends);

        expect(output).toContain('tsc_errors: 5 -> 3 -> 1 [IMPROVING]');
        expect(output).toContain('todos: 4 -> 4 -> 4 [STABLE]');
        expect(output).toContain('test_failures: 0 -> 1 -> 3 [REGRESSING]');
    });

    it('returns fallback message when no trends are available', () => {
        const output = formatTrendsForPrompt([]);
        expect(output).toContain('No trend data available');
    });
});
