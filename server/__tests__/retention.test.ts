import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { pruneTable, runRetentionCleanup, RETENTION_POLICIES } from '../db/retention';
import { runMigrations } from '../db/schema';
import { queryCount } from '../db/types';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ── pruneTable ───────────────────────────────────────────────────────

describe('pruneTable', () => {
    test('deletes records older than retention period', () => {
        // Insert old and new audit log entries
        const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(); // 200 days ago
        const newDate = new Date().toISOString(); // today

        db.query(`INSERT INTO audit_log (action, actor, resource_type, timestamp) VALUES (?, ?, ?, ?)`).run(
            'test', 'system', 'agent', oldDate,
        );
        db.query(`INSERT INTO audit_log (action, actor, resource_type, timestamp) VALUES (?, ?, ?, ?)`).run(
            'test', 'system', 'agent', newDate,
        );

        const deleted = pruneTable(db, { table: 'audit_log', timestampColumn: 'timestamp', retentionDays: 180 });
        expect(deleted).toBe(1);

        // New record should still exist
        expect(queryCount(db, 'SELECT COUNT(*) as cnt FROM audit_log')).toBe(1);
    });

    test('returns 0 when no records to prune', () => {
        const newDate = new Date().toISOString();
        db.query(`INSERT INTO audit_log (action, actor, resource_type, timestamp) VALUES (?, ?, ?, ?)`).run(
            'test', 'system', 'agent', newDate,
        );

        const deleted = pruneTable(db, { table: 'audit_log', timestampColumn: 'timestamp', retentionDays: 180 });
        expect(deleted).toBe(0);
    });

    test('handles date-only columns (daily_spending)', () => {
        const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const newDate = new Date().toISOString().split('T')[0];

        db.query(`INSERT INTO daily_spending (date, algo_micro, api_cost_usd) VALUES (?, 0, 0.0)`).run(oldDate);
        db.query(`INSERT OR IGNORE INTO daily_spending (date, algo_micro, api_cost_usd) VALUES (?, 0, 0.0)`).run(newDate);

        const deleted = pruneTable(db, { table: 'daily_spending', timestampColumn: 'date', retentionDays: 90 });
        expect(deleted).toBe(1);

        expect(queryCount(db, 'SELECT COUNT(*) as cnt FROM daily_spending')).toBe(1);
    });

    test('handles empty table', () => {
        const deleted = pruneTable(db, { table: 'audit_log', timestampColumn: 'timestamp', retentionDays: 180 });
        expect(deleted).toBe(0);
    });
});

// ── runRetentionCleanup ──────────────────────────────────────────────

describe('runRetentionCleanup', () => {
    test('runs without error on fresh database', () => {
        // Should not throw even if tables are empty
        expect(() => runRetentionCleanup(db)).not.toThrow();
    });

    test('cleans up old records across multiple tables', () => {
        const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
        const oldDateOnly = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Insert old records in multiple tables
        db.query(`INSERT INTO daily_spending (date, algo_micro, api_cost_usd) VALUES (?, 100, 0.5)`).run(oldDateOnly);
        db.query(`INSERT INTO audit_log (action, actor, resource_type, timestamp) VALUES (?, ?, ?, ?)`).run(
            'old-action', 'system', 'agent', oldDate,
        );

        runRetentionCleanup(db);

        expect(queryCount(db, 'SELECT COUNT(*) as cnt FROM daily_spending')).toBe(0);
        expect(queryCount(db, 'SELECT COUNT(*) as cnt FROM audit_log')).toBe(0);
    });

    test('preserves recent records', () => {
        const today = new Date().toISOString().split('T')[0];
        db.query(`INSERT INTO daily_spending (date, algo_micro, api_cost_usd) VALUES (?, 100, 0.5)`).run(today);

        runRetentionCleanup(db);

        expect(queryCount(db, 'SELECT COUNT(*) as cnt FROM daily_spending')).toBe(1);
    });
});

// ── Policy configuration ──────────────────────────────────────────────

describe('RETENTION_POLICIES', () => {
    test('all policies have valid retention periods', () => {
        for (const policy of RETENTION_POLICIES) {
            expect(policy.retentionDays).toBeGreaterThan(0);
            expect(policy.table).toBeTruthy();
            expect(policy.timestampColumn).toBeTruthy();
        }
    });

    test('includes expected tables', () => {
        const tables = RETENTION_POLICIES.map((p) => p.table);
        expect(tables).toContain('daily_spending');
        expect(tables).toContain('audit_log');
        expect(tables).toContain('credit_transactions');
        expect(tables).toContain('reputation_events');
    });
});
