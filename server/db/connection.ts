import { Database } from 'bun:sqlite';
import { runMigrations } from './schema';

let db: Database | null = null;

export function getDb(path: string = 'corvid-agent.db'): Database {
    if (db) return db;

    db = new Database(path, { create: true });
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    return db;
}

export function closeDb(): void {
    if (db) {
        db.close();
        db = null;
    }
}
