---
module: backup
version: 1
status: draft
files:
  - server/db/backup.ts
db_tables: []
depends_on: []
---

# Backup

## Purpose
Provides SQLite database backup and retention management. Performs a WAL checkpoint to flush pending writes, copies the database file to a timestamped backup, and prunes old backups to stay within a configurable retention limit.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `backupDatabase` | `db: Database, dbPath?: string` | `BackupResult` | Checkpoints WAL, copies the DB file to a timestamped backup in the backup directory, prunes old backups, and returns metadata about the operation. `dbPath` defaults to `'corvid-agent.db'`. |
| `pruneBackups` | `backupDir?: string, maxKeep?: number` | `number` | Deletes the oldest backup files that exceed `maxKeep` count; returns the number of files deleted. Defaults to `BACKUP_DIR` env var (or `'./backups'`) and `BACKUP_MAX_KEEP` env var (or `10`). |

### Exported Types
| Type | Description |
|------|-------------|
| `BackupResult` | `{ path: string; timestamp: string; sizeBytes: number; pruned: number }` — metadata about a completed backup operation |

## Invariants
1. `backupDatabase` always runs `PRAGMA wal_checkpoint(TRUNCATE)` before copying to ensure the backup contains all committed data.
2. The backup directory is created with `{ recursive: true }` if it does not exist.
3. Backup filenames follow the pattern `corvid-agent-{ISO-timestamp}.db` where colons and dots in the timestamp are replaced with hyphens.
4. `pruneBackups` only deletes files matching the `corvid-agent-*.db` naming pattern; other files in the backup directory are not touched.
5. Files are sorted lexicographically (which is chronological for ISO timestamps) and the oldest files beyond `maxKeep` are deleted.
6. `pruneBackups` is automatically called by `backupDatabase` after every backup.
7. The backup directory defaults to `BACKUP_DIR` env var or `'./backups'`; the retention count defaults to `BACKUP_MAX_KEEP` env var or `10`.

## Behavioral Examples
### Scenario: Creating a backup
- **Given** a running database at `'corvid-agent.db'` and the backup directory does not yet exist
- **When** `backupDatabase(db)` is called
- **Then** the backup directory is created, WAL is checkpointed, the DB file is copied to `backups/corvid-agent-2026-03-04T12-00-00-000Z.db`, and a `BackupResult` is returned with the path, size, and number of pruned files

### Scenario: Pruning old backups
- **Given** the backup directory contains 13 backup files and `maxKeep` is 10
- **When** `pruneBackups()` is called
- **Then** the 3 oldest backup files are deleted and the function returns `3`

### Scenario: No pruning needed
- **Given** the backup directory contains 5 backup files and `maxKeep` is 10
- **When** `pruneBackups()` is called
- **Then** no files are deleted and the function returns `0`

## Error Cases
| Condition | Behavior |
|-----------|----------|
| Database file does not exist at `dbPath` | `copyFileSync` throws a filesystem error |
| Backup directory is not writable | `mkdirSync` or `copyFileSync` throws a filesystem error |
| WAL checkpoint fails | `db.exec` throws a SQLite error |
| No backup files match the naming pattern during pruning | Returns `0`, no files deleted |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type for WAL checkpoint |
| `node:fs` | `copyFileSync`, `existsSync`, `mkdirSync`, `readdirSync`, `unlinkSync` for file operations |
| `node:path` | `join` for path construction |
| `lib/logger` | `createLogger('DbBackup')` for structured logging |
| `Bun.file` | Used to get the backup file size |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/routes/index.ts` | Registers the backup route that calls `backupDatabase` |

## Database Tables
This module does not define or manage any database tables. It operates on the database file at the filesystem level.

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
