import { Database } from 'bun:sqlite';
import { chmodSync, existsSync } from 'node:fs';
import { runMigrations } from './schema';

let db: Database | null = null;

function setDbFilePermissions(path: string): void {
    try {
        if (existsSync(path)) chmodSync(path, 0o600);
        if (existsSync(`${path}-wal`)) chmodSync(`${path}-wal`, 0o600);
        if (existsSync(`${path}-shm`)) chmodSync(`${path}-shm`, 0o600);
    } catch {
        // chmod may fail on some platforms (Windows) — non-fatal
    }
}

export function getDb(path: string = 'corvid-agent.db'): Database {
    if (db) return db;

    db = new Database(path, { create: true });
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    setDbFilePermissions(path);

    return db;
}

export function closeDb(): void {
    if (db) {
        db.close();
        db = null;
    }
}
