import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { recordAudit, queryAuditLog } from '../db/audit';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ─── recordAudit ─────────────────────────────────────────────────────────────

describe('recordAudit', () => {
    test('inserts a minimal audit entry', () => {
        recordAudit(db, 'credit_grant', 'admin', 'credits');

        const result = queryAuditLog(db);
        expect(result.total).toBe(1);
        expect(result.entries).toHaveLength(1);
        expect(result.entries[0].action).toBe('credit_grant');
        expect(result.entries[0].actor).toBe('admin');
        expect(result.entries[0].resourceType).toBe('credits');
        expect(result.entries[0].resourceId).toBeNull();
        expect(result.entries[0].detail).toBeNull();
    });

    test('inserts with all optional fields', () => {
        recordAudit(
            db,
            'work_task_create',
            'agent-123',
            'work_task',
            'task-456',
            'Created work task for PR review',
            'trace-abc-def',
            '127.0.0.1',
        );

        const result = queryAuditLog(db);
        expect(result.total).toBe(1);
        const entry = result.entries[0];
        expect(entry.action).toBe('work_task_create');
        expect(entry.actor).toBe('agent-123');
        expect(entry.resourceType).toBe('work_task');
        expect(entry.resourceId).toBe('task-456');
        expect(entry.detail).toBe('Created work task for PR review');
        expect(entry.traceId).toBe('trace-abc-def');
        expect(entry.ipAddress).toBe('127.0.0.1');
    });

    test('inserts multiple entries and assigns auto-increment IDs', () => {
        recordAudit(db, 'credit_grant', 'admin', 'credits', null, 'first');
        recordAudit(db, 'credit_deduction', 'system', 'credits', null, 'second');
        recordAudit(db, 'schedule_create', 'agent-1', 'schedule', 'sched-1', 'third');

        const result = queryAuditLog(db);
        expect(result.total).toBe(3);
        // Results are ordered by id DESC (most recent first)
        expect(result.entries[0].detail).toBe('third');
        expect(result.entries[1].detail).toBe('second');
        expect(result.entries[2].detail).toBe('first');
        // IDs should be sequential
        expect(result.entries[2].id).toBeLessThan(result.entries[1].id);
        expect(result.entries[1].id).toBeLessThan(result.entries[0].id);
    });

    test('never crashes the caller on error', () => {
        // Close the database to force an error
        const badDb = new Database(':memory:');
        badDb.close();

        // Should not throw — audit logging is fire-and-forget
        expect(() => {
            recordAudit(badDb, 'credit_grant', 'admin', 'credits');
        }).not.toThrow();
    });
});

// ─── queryAuditLog filtering ─────────────────────────────────────────────────

describe('queryAuditLog filtering', () => {
    beforeEach(() => {
        // Seed several entries with different actions, actors, resource types
        recordAudit(db, 'credit_grant', 'admin', 'credits', 'c-1', 'grant 100');
        recordAudit(db, 'credit_deduction', 'system', 'credits', 'c-2', 'deduct 10');
        recordAudit(db, 'schedule_create', 'agent-1', 'schedule', 's-1', 'created sched');
        recordAudit(db, 'schedule_execute', 'agent-1', 'schedule_execution', 'e-1', 'ran sched');
        recordAudit(db, 'work_task_create', 'agent-2', 'work_task', 'wt-1', 'created task');
    });

    test('filter by action', () => {
        const result = queryAuditLog(db, { action: 'credit_grant' });
        expect(result.total).toBe(1);
        expect(result.entries[0].action).toBe('credit_grant');
    });

    test('filter by actor', () => {
        const result = queryAuditLog(db, { actor: 'agent-1' });
        expect(result.total).toBe(2);
        result.entries.forEach(e => expect(e.actor).toBe('agent-1'));
    });

    test('filter by resource type', () => {
        const result = queryAuditLog(db, { resourceType: 'credits' });
        expect(result.total).toBe(2);
        result.entries.forEach(e => expect(e.resourceType).toBe('credits'));
    });

    test('filter by multiple criteria', () => {
        const result = queryAuditLog(db, { actor: 'agent-1', resourceType: 'schedule' });
        expect(result.total).toBe(1);
        expect(result.entries[0].action).toBe('schedule_create');
    });

    test('filter by date range', () => {
        // SQLite datetime('now') returns UTC strings like '2026-02-15 23:30:00'
        // Use a wide range that is guaranteed to include them
        const result = queryAuditLog(db, { startDate: '2000-01-01', endDate: '2099-12-31' });
        expect(result.total).toBe(5);

        // Narrow range far in the future that excludes everything
        const empty = queryAuditLog(db, { startDate: '2099-01-01', endDate: '2099-12-31' });
        expect(empty.total).toBe(0);
        expect(empty.entries).toHaveLength(0);
    });

    test('returns empty results for no matches', () => {
        const result = queryAuditLog(db, { action: 'config_change' });
        expect(result.total).toBe(0);
        expect(result.entries).toHaveLength(0);
    });
});

// ─── Pagination ──────────────────────────────────────────────────────────────

describe('queryAuditLog pagination', () => {
    beforeEach(() => {
        // Create 15 entries
        for (let i = 0; i < 15; i++) {
            recordAudit(db, 'credit_grant', `actor-${i}`, 'credits', `id-${i}`, `entry ${i}`);
        }
    });

    test('defaults to limit 50, offset 0', () => {
        const result = queryAuditLog(db);
        expect(result.total).toBe(15);
        expect(result.entries).toHaveLength(15);
    });

    test('respects custom limit', () => {
        const result = queryAuditLog(db, { limit: 5 });
        expect(result.total).toBe(15);
        expect(result.entries).toHaveLength(5);
    });

    test('respects offset for pagination', () => {
        const page1 = queryAuditLog(db, { limit: 5, offset: 0 });
        const page2 = queryAuditLog(db, { limit: 5, offset: 5 });
        const page3 = queryAuditLog(db, { limit: 5, offset: 10 });

        expect(page1.entries).toHaveLength(5);
        expect(page2.entries).toHaveLength(5);
        expect(page3.entries).toHaveLength(5);

        // No overlap between pages
        const allIds = [
            ...page1.entries.map(e => e.id),
            ...page2.entries.map(e => e.id),
            ...page3.entries.map(e => e.id),
        ];
        const uniqueIds = new Set(allIds);
        expect(uniqueIds.size).toBe(15);
    });

    test('caps limit at 500', () => {
        const result = queryAuditLog(db, { limit: 1000 });
        // Should clamp to 500 but we only have 15 entries
        expect(result.entries).toHaveLength(15);
        expect(result.total).toBe(15);
    });

    test('offset beyond total returns empty entries', () => {
        const result = queryAuditLog(db, { offset: 100 });
        expect(result.total).toBe(15);
        expect(result.entries).toHaveLength(0);
    });
});
