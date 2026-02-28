/**
 * SQLite database backup utility.
 * Performs a WAL checkpoint then copies the DB file.
 */

import type { Database } from 'bun:sqlite';
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '../lib/logger';

const log = createLogger('DbBackup');

const DEFAULT_BACKUP_DIR = process.env.BACKUP_DIR ?? './backups';
const MAX_KEEP = parseInt(process.env.BACKUP_MAX_KEEP ?? '10', 10);

export interface BackupResult {
    path: string;
    timestamp: string;
    sizeBytes: number;
    pruned: number;
}

export function backupDatabase(db: Database, dbPath: string = 'corvid-agent.db'): BackupResult {
    // Ensure backup directory exists
    const backupDir = DEFAULT_BACKUP_DIR;
    if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
    }

    // WAL checkpoint to flush pending writes
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

    // Generate timestamped backup filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupDir, `corvid-agent-${timestamp}.db`);

    copyFileSync(dbPath, backupPath);

    const stat = Bun.file(backupPath).size;

    log.info('Database backup created', { path: backupPath, sizeBytes: stat });

    const pruned = pruneBackups(backupDir);

    return {
        path: backupPath,
        timestamp: new Date().toISOString(),
        sizeBytes: stat,
        pruned,
    };
}

export function pruneBackups(backupDir: string = DEFAULT_BACKUP_DIR, maxKeep: number = MAX_KEEP): number {
    const files = readdirSync(backupDir)
        .filter(f => f.startsWith('corvid-agent-') && f.endsWith('.db'))
        .sort();

    if (files.length <= maxKeep) return 0;

    const toDelete = files.slice(0, files.length - maxKeep);
    for (const f of toDelete) {
        unlinkSync(join(backupDir, f));
    }

    log.info('Pruned old backups', { deleted: toDelete.length, kept: maxKeep });
    return toDelete.length;
}
