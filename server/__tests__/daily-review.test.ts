import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    getExecutionStatsForDay,
    getPrStatsForDay,
    getHealthDeltaForDay,
} from '../db/daily-review';
import { DailyReviewService } from '../improvement/daily-review';
import { MemoryManager } from '../memory/index';

let db: Database;
const TODAY = '2026-03-05';

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    // Create a minimal agent for FK constraints
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES ('agent-1', 'Test Agent', 'test', 'test')`).run();
    db.query(`INSERT INTO agent_schedules (id, agent_id, name, description, cron_expression, actions, approval_policy, status)
        VALUES ('sched-1', 'agent-1', 'Test', 'Test schedule', '0 0 * * *', '[]', 'auto', 'active')`).run();
});

afterEach(() => {
    db.close();
});

// ── DB Query Helpers ─────────────────────────────────────────────────

describe('getExecutionStatsForDay', () => {
    test('returns zero stats when no executions exist', () => {
        const stats = getExecutionStatsForDay(db, TODAY);
        expect(stats.total).toBe(0);
        expect(stats.completed).toBe(0);
        expect(stats.failed).toBe(0);
        expect(stats.cancelled).toBe(0);
        expect(stats.byActionType).toEqual({});
    });

    test('counts executions by status and action type', () => {
        insertExecution('completed', 'work_task', `${TODAY}T10:00:00.000Z`);
        insertExecution('completed', 'review_prs', `${TODAY}T11:00:00.000Z`);
        insertExecution('failed', 'work_task', `${TODAY}T12:00:00.000Z`);
        insertExecution('cancelled', 'star_repo', `${TODAY}T13:00:00.000Z`);

        const stats = getExecutionStatsForDay(db, TODAY);
        expect(stats.total).toBe(4);
        expect(stats.completed).toBe(2);
        expect(stats.failed).toBe(1);
        expect(stats.cancelled).toBe(1);
        expect(stats.byActionType).toEqual({
            work_task: 2,
            review_prs: 1,
            star_repo: 1,
        });
    });

    test('excludes executions from other days', () => {
        insertExecution('completed', 'work_task', `${TODAY}T10:00:00.000Z`);
        insertExecution('completed', 'work_task', '2026-03-04T10:00:00.000Z');

        const stats = getExecutionStatsForDay(db, TODAY);
        expect(stats.total).toBe(1);
    });
});

describe('getPrStatsForDay', () => {
    test('returns zero stats when no PRs exist', () => {
        const stats = getPrStatsForDay(db, TODAY);
        expect(stats.opened).toBe(0);
        expect(stats.merged).toBe(0);
        expect(stats.closed).toBe(0);
        expect(stats.rejectedRepos).toEqual([]);
    });

    test('counts opened, merged, and closed PRs', () => {
        // Opened today
        insertPrOutcome('open', null, `${TODAY}T09:00:00.000Z`, null);
        insertPrOutcome('open', null, `${TODAY}T10:00:00.000Z`, null);

        // Merged today (created earlier)
        insertPrOutcome('merged', null, '2026-03-04T10:00:00.000Z', `${TODAY}T15:00:00.000Z`);

        // Closed (rejected) today
        insertPrOutcome('closed', 'review_rejection', '2026-03-04T08:00:00.000Z', `${TODAY}T14:00:00.000Z`, 'bad/repo');

        const stats = getPrStatsForDay(db, TODAY);
        expect(stats.opened).toBe(2);
        expect(stats.merged).toBe(1);
        expect(stats.closed).toBe(1);
        expect(stats.rejectedRepos).toEqual(['bad/repo']);
    });
});

describe('getHealthDeltaForDay', () => {
    test('returns default values when no snapshots exist', () => {
        const delta = getHealthDeltaForDay(db, TODAY);
        expect(delta.snapshotCount).toBe(0);
        expect(delta.uptimePercent).toBe(100);
    });

    test('computes uptime from snapshots', () => {
        insertHealthSnapshot('healthy', `${TODAY}T08:00:00.000Z`);
        insertHealthSnapshot('healthy', `${TODAY}T09:00:00.000Z`);
        insertHealthSnapshot('degraded', `${TODAY}T10:00:00.000Z`);
        insertHealthSnapshot('unhealthy', `${TODAY}T11:00:00.000Z`);

        const delta = getHealthDeltaForDay(db, TODAY);
        expect(delta.snapshotCount).toBe(4);
        expect(delta.healthyCount).toBe(2);
        expect(delta.degradedCount).toBe(1);
        expect(delta.unhealthyCount).toBe(1);
        // healthy + degraded = 3/4 = 75%
        expect(delta.uptimePercent).toBe(75);
    });
});

// ── DailyReviewService ───────────────────────────────────────────────

describe('DailyReviewService', () => {
    test('generates a review and saves to memory', () => {
        const memoryManager = new MemoryManager(db);

        insertExecution('completed', 'work_task', `${TODAY}T10:00:00.000Z`);
        insertExecution('failed', 'review_prs', `${TODAY}T12:00:00.000Z`);
        insertHealthSnapshot('healthy', `${TODAY}T08:00:00.000Z`);

        const service = new DailyReviewService(db, memoryManager);
        const result = service.run('agent-1', TODAY);

        expect(result.date).toBe(TODAY);
        expect(result.executions.total).toBe(2);
        expect(result.executions.completed).toBe(1);
        expect(result.executions.failed).toBe(1);
        expect(result.health.snapshotCount).toBe(1);
        expect(result.summary).toContain('Daily Review');
        expect(result.summary).toContain('1 completed');

        // Verify memory was saved
        const memory = memoryManager.recall('agent-1', `review:daily:${TODAY}`);
        expect(memory).not.toBeNull();
        expect(memory!.content).toContain('Daily Review');
    });

    test('generates observations for high failure rate', () => {
        const memoryManager = new MemoryManager(db);
        insertExecution('failed', 'work_task', `${TODAY}T10:00:00.000Z`);
        insertExecution('failed', 'work_task', `${TODAY}T11:00:00.000Z`);

        const service = new DailyReviewService(db, memoryManager);
        const result = service.run('agent-1', TODAY);

        expect(result.observations.some(o => o.includes('failure rate'))).toBe(true);
    });

    test('generates observations for PR rejections', () => {
        const memoryManager = new MemoryManager(db);
        insertPrOutcome('closed', 'review_rejection', '2026-03-04T10:00:00.000Z', `${TODAY}T14:00:00.000Z`, 'bad/repo');

        const service = new DailyReviewService(db, memoryManager);
        const result = service.run('agent-1', TODAY);

        expect(result.observations.some(o => o.includes('bad/repo'))).toBe(true);
    });

    test('generates all-nominal observation when everything is green', () => {
        const memoryManager = new MemoryManager(db);
        insertExecution('completed', 'work_task', `${TODAY}T10:00:00.000Z`);
        insertHealthSnapshot('healthy', `${TODAY}T08:00:00.000Z`);

        const service = new DailyReviewService(db, memoryManager);
        const result = service.run('agent-1', TODAY);

        expect(result.observations.some(o => o.includes('nominal'))).toBe(true);
    });

    test('defaults to today when no date provided', () => {
        const memoryManager = new MemoryManager(db);
        const service = new DailyReviewService(db, memoryManager);
        const result = service.run('agent-1');

        expect(result.date).toBe(new Date().toISOString().slice(0, 10));
    });
});

// ── Test helpers ─────────────────────────────────────────────────────

function insertExecution(status: string, actionType: string, startedAt: string) {
    const id = crypto.randomUUID();
    db.query(`
        INSERT INTO schedule_executions (id, schedule_id, agent_id, status, action_type, started_at)
        VALUES (?, 'sched-1', 'agent-1', ?, ?, ?)
    `).run(id, status, actionType, startedAt);
}

function insertPrOutcome(
    prState: string,
    failureReason: string | null,
    createdAt: string,
    resolvedAt: string | null,
    repo = 'org/repo',
) {
    const id = crypto.randomUUID();
    const workTaskId = crypto.randomUUID();
    db.query(`
        INSERT INTO pr_outcomes (id, work_task_id, pr_url, repo, pr_number, pr_state, failure_reason, created_at, resolved_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(id, workTaskId, `https://github.com/${repo}/pull/1`, repo, prState, failureReason, createdAt, resolvedAt);
}

function insertHealthSnapshot(status: string, timestamp: string) {
    db.query(`
        INSERT INTO server_health_snapshots (status, timestamp, source)
        VALUES (?, ?, 'internal')
    `).run(status, timestamp);
}
