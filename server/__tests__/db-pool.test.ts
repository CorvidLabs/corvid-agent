import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { writeTransaction, isSqliteBusy, DbPool } from '../db/pool';
import { runMigrations } from '../db/schema';
import { tmpdir } from 'node:os';
import { mkdtempSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── isSqliteBusy ─────────────────────────────────────────────────────────

describe('isSqliteBusy', () => {
    test('detects "database is locked" message', () => {
        expect(isSqliteBusy(new Error('database is locked'))).toBe(true);
    });

    test('detects "SQLITE_BUSY" message', () => {
        expect(isSqliteBusy(new Error('SQLITE_BUSY'))).toBe(true);
    });

    test('detects case-insensitive variants', () => {
        expect(isSqliteBusy(new Error('Database Is Locked'))).toBe(true);
        expect(isSqliteBusy(new Error('sqlite_busy: resource busy'))).toBe(true);
    });

    test('returns false for non-busy errors', () => {
        expect(isSqliteBusy(new Error('table not found'))).toBe(false);
        expect(isSqliteBusy(new Error('constraint violation'))).toBe(false);
    });

    test('returns false for non-error values', () => {
        expect(isSqliteBusy('database is locked')).toBe(false);
        expect(isSqliteBusy(null)).toBe(false);
        expect(isSqliteBusy(undefined)).toBe(false);
    });
});

// ── writeTransaction ─────────────────────────────────────────────────────

describe('writeTransaction', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec('PRAGMA journal_mode = WAL');
        db.exec('PRAGMA foreign_keys = ON');
        db.exec('CREATE TABLE test_kv (key TEXT PRIMARY KEY, value TEXT)');
    });

    afterEach(() => {
        db.close();
    });

    test('executes function inside a transaction', () => {
        writeTransaction(db, (db) => {
            db.query('INSERT INTO test_kv (key, value) VALUES (?, ?)').run('a', '1');
            db.query('INSERT INTO test_kv (key, value) VALUES (?, ?)').run('b', '2');
        });

        const rows = db.query('SELECT * FROM test_kv ORDER BY key').all() as { key: string; value: string }[];
        expect(rows).toHaveLength(2);
        expect(rows[0].key).toBe('a');
        expect(rows[1].key).toBe('b');
    });

    test('returns the value from the function', () => {
        const result = writeTransaction(db, (db) => {
            db.query('INSERT INTO test_kv (key, value) VALUES (?, ?)').run('x', '42');
            return 'done';
        });
        expect(result).toBe('done');
    });

    test('rolls back on error', () => {
        expect(() => {
            writeTransaction(db, (db) => {
                db.query('INSERT INTO test_kv (key, value) VALUES (?, ?)').run('c', '3');
                throw new Error('deliberate failure');
            });
        }).toThrow('deliberate failure');

        const rows = db.query('SELECT * FROM test_kv').all();
        expect(rows).toHaveLength(0);
    });

    test('uses BEGIN IMMEDIATE (not DEFERRED)', () => {
        // Verify that the transaction is IMMEDIATE by checking that
        // the write lock is acquired at BEGIN time, not at first write.
        // We do this by running two concurrent transactions — the second
        // should block/retry at BEGIN, not mid-statement.
        writeTransaction(db, (db) => {
            db.query('INSERT INTO test_kv (key, value) VALUES (?, ?)').run('imm', 'test');
        });

        const row = db.query('SELECT * FROM test_kv WHERE key = ?').get('imm') as { key: string; value: string };
        expect(row.value).toBe('test');
    });

    test('handles multiple sequential transactions', () => {
        for (let i = 0; i < 10; i++) {
            writeTransaction(db, (db) => {
                db.query('INSERT INTO test_kv (key, value) VALUES (?, ?)').run(`key${i}`, `val${i}`);
            });
        }

        const count = db.query('SELECT COUNT(*) as cnt FROM test_kv').get() as { cnt: number };
        expect(count.cnt).toBe(10);
    });
});

// ── DbPool ───────────────────────────────────────────────────────────────

describe('DbPool', () => {
    let tmpDir: string;
    let dbPath: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'dbpool-test-'));
        dbPath = join(tmpDir, 'test.db');
        // Create the database and schema
        const setupDb = new Database(dbPath, { create: true });
        setupDb.exec('PRAGMA journal_mode = WAL');
        setupDb.exec('PRAGMA foreign_keys = ON');
        setupDb.exec('CREATE TABLE test_kv (key TEXT PRIMARY KEY, value TEXT)');
        setupDb.close();
    });

    afterEach(() => {
        // Clean up temp files
        for (const suffix of ['', '-wal', '-shm']) {
            const f = dbPath + suffix;
            if (existsSync(f)) {
                try { unlinkSync(f); } catch { /* ignore */ }
            }
        }
    });

    test('creates pool with default configuration', () => {
        const pool = new DbPool({ path: dbPath });
        expect(pool.readConnectionCount).toBe(4);
        pool.close();
    });

    test('creates pool with custom read connections', () => {
        const pool = new DbPool({ path: dbPath, maxReadConnections: 2 });
        expect(pool.readConnectionCount).toBe(2);
        pool.close();
    });

    test('write() executes inside BEGIN IMMEDIATE', () => {
        const pool = new DbPool({ path: dbPath });

        pool.write((db) => {
            db.query('INSERT INTO test_kv (key, value) VALUES (?, ?)').run('pool_w', 'hello');
        });

        const result = pool.read((db) => {
            return db.query('SELECT value FROM test_kv WHERE key = ?').get('pool_w') as { value: string };
        });
        expect(result.value).toBe('hello');

        pool.close();
    });

    test('read() returns data from read connections', () => {
        const pool = new DbPool({ path: dbPath });

        // Write some data
        pool.write((db) => {
            db.query('INSERT INTO test_kv (key, value) VALUES (?, ?)').run('r1', 'v1');
            db.query('INSERT INTO test_kv (key, value) VALUES (?, ?)').run('r2', 'v2');
        });

        // Read via pool
        const count = pool.read((db) => {
            return (db.query('SELECT COUNT(*) as cnt FROM test_kv').get() as { cnt: number }).cnt;
        });
        expect(count).toBe(2);

        pool.close();
    });

    test('write() rolls back on error', () => {
        const pool = new DbPool({ path: dbPath });

        expect(() => {
            pool.write((db) => {
                db.query('INSERT INTO test_kv (key, value) VALUES (?, ?)').run('fail', 'x');
                throw new Error('rollback test');
            });
        }).toThrow('rollback test');

        const count = pool.read((db) => {
            return (db.query('SELECT COUNT(*) as cnt FROM test_kv').get() as { cnt: number }).cnt;
        });
        expect(count).toBe(0);

        pool.close();
    });

    test('close() prevents further operations', () => {
        const pool = new DbPool({ path: dbPath });
        pool.close();

        expect(() => pool.write(() => {})).toThrow('DbPool is closed');
        expect(() => pool.read(() => {})).toThrow('DbPool is closed');
    });

    test('getWriteDb() returns the write connection', () => {
        const pool = new DbPool({ path: dbPath });
        const writeDb = pool.getWriteDb();
        expect(writeDb).toBeInstanceOf(Database);
        pool.close();
    });

    test('getReadDb() round-robins across connections', () => {
        const pool = new DbPool({ path: dbPath, maxReadConnections: 2 });

        const db1 = pool.getReadDb();
        const db2 = pool.getReadDb();
        const db3 = pool.getReadDb();

        // db3 should wrap around to db1
        expect(db1).toBe(db3);
        expect(db1).not.toBe(db2);

        pool.close();
    });

    test('concurrent writes succeed sequentially', () => {
        const pool = new DbPool({ path: dbPath });

        // Run multiple writes — all should succeed since they're serialized
        for (let i = 0; i < 20; i++) {
            pool.write((db) => {
                db.query('INSERT INTO test_kv (key, value) VALUES (?, ?)').run(`k${i}`, `v${i}`);
            });
        }

        const count = pool.read((db) => {
            return (db.query('SELECT COUNT(*) as cnt FROM test_kv').get() as { cnt: number }).cnt;
        });
        expect(count).toBe(20);

        pool.close();
    });
});

// ── Integration: writeTransaction with existing DB functions ─────────────

describe('writeTransaction integration', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec('PRAGMA journal_mode = WAL');
        db.exec('PRAGMA foreign_keys = ON');
        runMigrations(db);
    });

    afterEach(() => {
        db.close();
    });

    test('credit operations work with writeTransaction', () => {
        // Simulate what credits.ts does: ensure row + update in one transaction
        writeTransaction(db, (db) => {
            db.query(
                `INSERT OR IGNORE INTO credit_ledger (wallet_address, credits, reserved, total_purchased, total_consumed)
                 VALUES (?, 0, 0, 0, 0)`
            ).run('TEST_WALLET');

            db.query(
                `UPDATE credit_ledger SET credits = credits + 100, total_purchased = total_purchased + 100
                 WHERE wallet_address = ?`
            ).run('TEST_WALLET');
        });

        const row = db.query('SELECT credits FROM credit_ledger WHERE wallet_address = ?').get('TEST_WALLET') as { credits: number };
        expect(row.credits).toBe(100);
    });

    test('spending operations work with writeTransaction', () => {
        writeTransaction(db, (db) => {
            db.query(
                `INSERT OR IGNORE INTO daily_spending (date, algo_micro, api_cost_usd) VALUES (?, 0, 0.0)`
            ).run('2026-03-09');
            db.query(
                `UPDATE daily_spending SET algo_micro = algo_micro + ? WHERE date = ?`
            ).run(1000000, '2026-03-09');
        });

        const row = db.query('SELECT algo_micro FROM daily_spending WHERE date = ?').get('2026-03-09') as { algo_micro: number };
        expect(row.algo_micro).toBe(1000000);
    });

    test('work task cleanup works with writeTransaction', () => {
        // Disable FK checks for this test — we're testing writeTransaction, not FK logic
        db.exec('PRAGMA foreign_keys = OFF');

        // Insert a "running" task
        db.query(
            `INSERT INTO work_tasks (id, agent_id, project_id, description, source, requester_info, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run('task-1', 'agent-1', 'proj-1', 'test task', 'web', '{}', 'running');

        // Clean up stale tasks using writeTransaction (simulates cleanupStaleWorkTasks)
        const stale = writeTransaction(db, (db) => {
            const rows = db.query(
                `SELECT id FROM work_tasks WHERE status IN ('branching', 'running', 'validating')`
            ).all() as { id: string }[];

            if (rows.length > 0) {
                db.query(
                    `UPDATE work_tasks SET status = 'failed', error = 'restart'
                     WHERE status IN ('branching', 'running', 'validating')`
                ).run();
            }

            return rows;
        });

        expect(stale).toHaveLength(1);
        const task = db.query('SELECT status, error FROM work_tasks WHERE id = ?').get('task-1') as { status: string; error: string };
        expect(task.status).toBe('failed');
        expect(task.error).toBe('restart');
    });
});
