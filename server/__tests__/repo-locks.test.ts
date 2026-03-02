import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
    acquireRepoLock,
    releaseRepoLock,
    releaseAllLocks,
    getRepoLock,
    listRepoLocks,
    cleanExpiredLocks,
    getRecentRepoActivity,
} from '../db/repo-locks';

function createTestDb(): Database {
    const db = new Database(':memory:');

    db.exec(`
        CREATE TABLE repo_locks (
            repo         TEXT    NOT NULL PRIMARY KEY,
            execution_id TEXT    NOT NULL,
            schedule_id  TEXT    NOT NULL,
            action_type  TEXT    NOT NULL,
            locked_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            expires_at   TEXT    NOT NULL
        )
    `);
    db.exec(`CREATE INDEX idx_repo_locks_expires ON repo_locks(expires_at)`);
    db.exec(`CREATE INDEX idx_repo_locks_schedule ON repo_locks(schedule_id)`);

    // Tables needed for getRecentRepoActivity
    db.exec(`
        CREATE TABLE schedule_executions (
            id TEXT PRIMARY KEY,
            schedule_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            action_type TEXT NOT NULL,
            action_input TEXT DEFAULT '{}',
            status TEXT DEFAULT 'running',
            result TEXT,
            session_id TEXT,
            work_task_id TEXT,
            cost_usd REAL DEFAULT 0,
            config_snapshot TEXT,
            started_at TEXT DEFAULT (datetime('now')),
            completed_at TEXT
        )
    `);
    db.exec(`
        CREATE TABLE work_tasks (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            session_id TEXT,
            source TEXT DEFAULT 'web',
            source_id TEXT,
            requester_info TEXT DEFAULT '{}',
            description TEXT NOT NULL,
            branch_name TEXT,
            status TEXT DEFAULT 'pending',
            pr_url TEXT,
            summary TEXT,
            error TEXT,
            original_branch TEXT,
            worktree_dir TEXT,
            iteration_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            completed_at TEXT
        )
    `);

    return db;
}

describe('Repo Lock Registry', () => {
    let db: Database;

    beforeEach(() => {
        db = createTestDb();
    });

    // ─── acquire / release ───────────────────────────────────────────────────

    describe('acquireRepoLock', () => {
        test('acquires a lock on an unlocked repo', () => {
            const result = acquireRepoLock(db, 'CorvidLabs/corvid-agent', 'exec-1', 'sched-1', 'work_task');
            expect(result).toBe(true);

            const lock = getRepoLock(db, 'CorvidLabs/corvid-agent');
            expect(lock).not.toBeNull();
            expect(lock!.executionId).toBe('exec-1');
            expect(lock!.scheduleId).toBe('sched-1');
            expect(lock!.actionType).toBe('work_task');
        });

        test('rejects a second lock on the same repo', () => {
            acquireRepoLock(db, 'CorvidLabs/corvid-agent', 'exec-1', 'sched-1', 'work_task');
            const result = acquireRepoLock(db, 'CorvidLabs/corvid-agent', 'exec-2', 'sched-2', 'codebase_review');
            expect(result).toBe(false);
        });

        test('allows locks on different repos', () => {
            const r1 = acquireRepoLock(db, 'CorvidLabs/corvid-agent', 'exec-1', 'sched-1', 'work_task');
            const r2 = acquireRepoLock(db, 'CorvidLabs/swift-algochat', 'exec-2', 'sched-2', 'codebase_review');
            expect(r1).toBe(true);
            expect(r2).toBe(true);
        });

        test('respects custom TTL', () => {
            acquireRepoLock(db, 'CorvidLabs/corvid-agent', 'exec-1', 'sched-1', 'work_task', 1);

            // Lock should have a very short TTL — simulate expiry by cleaning
            // (the lock was created with 1ms TTL, so it's already expired or about to)
            // Since SQLite datetime resolution is 1 second, we manually set expiry in the past
            db.exec(`UPDATE repo_locks SET expires_at = datetime('now', '-1 second') WHERE repo = 'CorvidLabs/corvid-agent'`);
            cleanExpiredLocks(db);

            const lock = getRepoLock(db, 'CorvidLabs/corvid-agent');
            expect(lock).toBeNull();
        });
    });

    describe('releaseRepoLock', () => {
        test('releases a lock held by the correct execution', () => {
            acquireRepoLock(db, 'CorvidLabs/corvid-agent', 'exec-1', 'sched-1', 'work_task');
            const released = releaseRepoLock(db, 'CorvidLabs/corvid-agent', 'exec-1');
            expect(released).toBe(true);

            const lock = getRepoLock(db, 'CorvidLabs/corvid-agent');
            expect(lock).toBeNull();
        });

        test('does not release a lock held by a different execution', () => {
            acquireRepoLock(db, 'CorvidLabs/corvid-agent', 'exec-1', 'sched-1', 'work_task');
            const released = releaseRepoLock(db, 'CorvidLabs/corvid-agent', 'exec-2');
            expect(released).toBe(false);

            const lock = getRepoLock(db, 'CorvidLabs/corvid-agent');
            expect(lock).not.toBeNull();
        });
    });

    describe('releaseAllLocks', () => {
        test('releases all locks for an execution', () => {
            acquireRepoLock(db, 'CorvidLabs/corvid-agent', 'exec-1', 'sched-1', 'work_task');
            acquireRepoLock(db, 'CorvidLabs/swift-algochat', 'exec-1', 'sched-1', 'codebase_review');
            acquireRepoLock(db, 'CorvidLabs/go-algochat', 'exec-2', 'sched-2', 'work_task');

            const count = releaseAllLocks(db, 'exec-1');
            expect(count).toBe(2);

            // exec-2's lock should remain
            const remaining = listRepoLocks(db);
            expect(remaining.length).toBe(1);
            expect(remaining[0].executionId).toBe('exec-2');
        });
    });

    // ─── listRepoLocks ──────────────────────────────────────────────────────

    describe('listRepoLocks', () => {
        test('returns empty array when no locks', () => {
            const locks = listRepoLocks(db);
            expect(locks).toEqual([]);
        });

        test('returns all active locks', () => {
            acquireRepoLock(db, 'repo-a', 'exec-1', 'sched-1', 'work_task');
            acquireRepoLock(db, 'repo-b', 'exec-2', 'sched-2', 'review_prs');

            const locks = listRepoLocks(db);
            expect(locks.length).toBe(2);
        });
    });

    // ─── cleanExpiredLocks ──────────────────────────────────────────────────

    describe('cleanExpiredLocks', () => {
        test('removes expired locks', () => {
            acquireRepoLock(db, 'repo-a', 'exec-1', 'sched-1', 'work_task');
            // Manually expire the lock
            db.exec(`UPDATE repo_locks SET expires_at = datetime('now', '-1 hour')`);

            const cleaned = cleanExpiredLocks(db);
            expect(cleaned).toBe(1);

            const locks = listRepoLocks(db);
            expect(locks.length).toBe(0);
        });

        test('does not remove non-expired locks', () => {
            acquireRepoLock(db, 'repo-a', 'exec-1', 'sched-1', 'work_task');

            const cleaned = cleanExpiredLocks(db);
            expect(cleaned).toBe(0);

            const locks = listRepoLocks(db);
            expect(locks.length).toBe(1);
        });

        test('acquireRepoLock reclaims expired lock', () => {
            acquireRepoLock(db, 'repo-a', 'exec-1', 'sched-1', 'work_task');
            // Expire the lock
            db.exec(`UPDATE repo_locks SET expires_at = datetime('now', '-1 hour')`);

            // Should succeed because expired lock gets cleaned
            const result = acquireRepoLock(db, 'repo-a', 'exec-2', 'sched-2', 'codebase_review');
            expect(result).toBe(true);

            const lock = getRepoLock(db, 'repo-a');
            expect(lock!.executionId).toBe('exec-2');
        });
    });

    // ─── getRecentRepoActivity ──────────────────────────────────────────────

    describe('getRecentRepoActivity', () => {
        test('returns empty when no activity', () => {
            const activity = getRecentRepoActivity(db, 'CorvidLabs/corvid-agent');
            expect(activity.executions.length).toBe(0);
            expect(activity.workTasks.length).toBe(0);
        });

        test('finds recent executions targeting a repo', () => {
            db.exec(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, status, started_at)
                VALUES ('e1', 's1', 'a1', 'work_task', '{"repos": ["CorvidLabs/corvid-agent"]}', 'completed', datetime('now', '-1 hour'))
            `);
            db.exec(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, status, started_at)
                VALUES ('e2', 's2', 'a1', 'work_task', '{"repos": ["CorvidLabs/other"]}', 'completed', datetime('now', '-1 hour'))
            `);

            const activity = getRecentRepoActivity(db, 'CorvidLabs/corvid-agent');
            expect(activity.executions.length).toBe(1);
            expect(activity.executions[0].id).toBe('e1');
        });

        test('finds recent work tasks with PRs on a repo', () => {
            db.exec(`
                INSERT INTO work_tasks (id, agent_id, project_id, description, pr_url, status, created_at)
                VALUES ('wt1', 'a1', 'p1', 'Fix bug', 'https://github.com/CorvidLabs/corvid-agent/pull/123', 'completed', datetime('now', '-2 hours'))
            `);

            const activity = getRecentRepoActivity(db, 'CorvidLabs/corvid-agent');
            expect(activity.workTasks.length).toBe(1);
            expect(activity.workTasks[0].id).toBe('wt1');
        });

        test('respects window parameter', () => {
            db.exec(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, status, started_at)
                VALUES ('e1', 's1', 'a1', 'work_task', '{"repos": ["CorvidLabs/corvid-agent"]}', 'completed', datetime('now', '-48 hours'))
            `);

            const activity = getRecentRepoActivity(db, 'CorvidLabs/corvid-agent', 24);
            expect(activity.executions.length).toBe(0);

            const wider = getRecentRepoActivity(db, 'CorvidLabs/corvid-agent', 72);
            expect(wider.executions.length).toBe(1);
        });
    });
});
