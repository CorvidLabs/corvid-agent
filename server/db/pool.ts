/**
 * SQLite connection pool with IMMEDIATE write transactions and SQLITE_BUSY retry.
 *
 * SQLite in WAL mode supports concurrent readers but serialises writers.
 * This pool:
 *  - Maintains N read-only connections for concurrent read operations
 *  - Uses a single write connection with BEGIN IMMEDIATE to fail-fast on lock contention
 *  - Retries SQLITE_BUSY errors with exponential backoff
 *
 * @see https://www.sqlite.org/wal.html
 * @see Issue #858 — SQLite contention mitigation for parallel work tasks
 */

import { Database } from 'bun:sqlite';

// ── Error detection ──────────────────────────────────────────────────────

/** Check if an error is a SQLITE_BUSY error. */
export function isSqliteBusy(err: unknown): boolean {
    if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        return msg.includes('database is locked') || msg.includes('sqlite_busy');
    }
    return false;
}

// ── IMMEDIATE write transaction with retry ───────────────────────────────

export interface WriteTransactionOptions {
    /** Maximum retry attempts on SQLITE_BUSY (default: 3). */
    maxRetries?: number;
    /** Base delay in ms before first retry (default: 50). */
    baseDelayMs?: number;
    /** Maximum delay cap in ms (default: 2000). */
    maxDelayMs?: number;
}

/**
 * Execute `fn` inside a BEGIN IMMEDIATE transaction with SQLITE_BUSY retry.
 *
 * Unlike `db.transaction()` (which uses DEFERRED), IMMEDIATE acquires the
 * write lock at BEGIN rather than at the first write statement. This avoids
 * mid-transaction SQLITE_BUSY errors that can't be cleanly retried.
 *
 * On SQLITE_BUSY at BEGIN, the entire function is retried with exponential
 * backoff. Non-BUSY errors propagate immediately.
 */
export function writeTransaction<T>(db: Database, fn: (db: Database) => T, options: WriteTransactionOptions = {}): T {
    const { maxRetries = 3, baseDelayMs = 50, maxDelayMs = 2000 } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            db.exec('BEGIN IMMEDIATE');
        } catch (err) {
            if (isSqliteBusy(err) && attempt < maxRetries) {
                const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
                const jitter = Math.random() * delay * 0.2;
                Bun.sleepSync(delay + jitter);
                continue;
            }
            throw err;
        }

        try {
            const result = fn(db);
            db.exec('COMMIT');
            return result;
        } catch (err) {
            db.exec('ROLLBACK');
            throw err;
        }
    }

    // Unreachable, but TypeScript needs it
    throw new Error('writeTransaction: exhausted retries');
}

// ── Connection pool ──────────────────────────────────────────────────────

export interface DbPoolOptions {
    /** Path to the SQLite database file. */
    path: string;
    /** Maximum number of read connections (default: 4). */
    maxReadConnections?: number;
    /** PRAGMA busy_timeout in ms for all connections (default: 5000). */
    busyTimeoutMs?: number;
    /** Write transaction retry options. */
    writeRetry?: WriteTransactionOptions;
}

/**
 * SQLite connection pool optimised for WAL mode.
 *
 * - 1 read-write connection for mutations (uses BEGIN IMMEDIATE + retry)
 * - N read-only connections for queries (round-robin)
 */
export class DbPool {
    private readonly writeDb: Database;
    private readonly readDbs: Database[];
    private readIndex = 0;
    private closed = false;
    private readonly retryOptions: WriteTransactionOptions;

    constructor(options: DbPoolOptions) {
        const { path, maxReadConnections = 4, busyTimeoutMs = 5000, writeRetry = {} } = options;
        this.retryOptions = writeRetry;

        // Write connection
        this.writeDb = DbPool.createConnection(path, busyTimeoutMs, false);

        // Read connections
        this.readDbs = [];
        const readCount = Math.max(1, maxReadConnections);
        for (let i = 0; i < readCount; i++) {
            this.readDbs.push(DbPool.createConnection(path, busyTimeoutMs, true));
        }
    }

    private static createConnection(path: string, busyTimeoutMs: number, readonly: boolean): Database {
        const db = new Database(path, { create: !readonly, readonly });
        db.exec('PRAGMA journal_mode = WAL');
        db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
        db.exec('PRAGMA foreign_keys = ON');
        return db;
    }

    /** Get the write connection (for direct use or legacy compatibility). */
    getWriteDb(): Database {
        if (this.closed) throw new Error('DbPool is closed');
        return this.writeDb;
    }

    /** Get a read connection (round-robin). */
    getReadDb(): Database {
        if (this.closed) throw new Error('DbPool is closed');
        const db = this.readDbs[this.readIndex % this.readDbs.length];
        this.readIndex++;
        return db;
    }

    /** Execute a function inside a BEGIN IMMEDIATE transaction with retry. */
    write<T>(fn: (db: Database) => T): T {
        if (this.closed) throw new Error('DbPool is closed');
        return writeTransaction(this.writeDb, fn, this.retryOptions);
    }

    /** Execute a read-only query on a pooled read connection. */
    read<T>(fn: (db: Database) => T): T {
        if (this.closed) throw new Error('DbPool is closed');
        return fn(this.getReadDb());
    }

    /** Number of active read connections. */
    get readConnectionCount(): number {
        return this.readDbs.length;
    }

    /** Close all connections. */
    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.writeDb.close();
        for (const db of this.readDbs) {
            db.close();
        }
    }
}
