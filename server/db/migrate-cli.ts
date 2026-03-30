#!/usr/bin/env bun
/**
 * Database migration CLI.
 *
 * Usage:
 *   bun run migrate up              Apply all pending migrations
 *   bun run migrate up --to 55      Apply migrations up to version 55
 *   bun run migrate down            Revert the most recent migration
 *   bun run migrate down --to 52    Revert down to version 52
 *   bun run migrate status          Show migration status
 */

import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { createLogger } from '../lib/logger';
import { getCurrentVersion, migrateDown, migrateUp, migrationStatus } from './migrate';

const log = createLogger('migrate-cli');

const DB_PATH = process.env.DB_PATH ?? 'corvid-agent.db';

const args = process.argv.slice(2);
const command = args[0];

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function printUsage(): void {
  console.log(`
Database Migration CLI

Usage:
  bun run migrate up              Apply all pending migrations
  bun run migrate up --to <ver>   Apply migrations up to version
  bun run migrate down            Revert the most recent migration
  bun run migrate down --to <ver> Revert down to version
  bun run migrate status          Show migration status

Environment:
  DB_PATH                         Database file path (default: corvid-agent.db)
`);
}

async function main(): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  const isNew = !existsSync(DB_PATH);
  const db = new Database(DB_PATH, { create: true });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');

  try {
    switch (command) {
      case 'up': {
        const to = getFlag('to');
        const target = to ? parseInt(to, 10) : undefined;
        const before = getCurrentVersion(db);
        log.info(`Current schema version: ${before}`);

        const { applied, to: newVersion } = await migrateUp(db, target);
        if (applied === 0) {
          log.info('Already up to date.');
        } else {
          log.info(`Applied ${applied} migration(s). Schema version: ${before} -> ${newVersion}`);
        }
        break;
      }

      case 'down': {
        const to = getFlag('to');
        const target = to ? parseInt(to, 10) : undefined;
        const before = getCurrentVersion(db);
        log.info(`Current schema version: ${before}`);

        if (before === 0) {
          log.info('No migrations to revert.');
          break;
        }

        const { reverted, to: newVersion } = await migrateDown(db, target);
        if (reverted === 0) {
          log.info('Nothing to revert.');
        } else {
          log.info(`Reverted ${reverted} migration(s). Schema version: ${before} -> ${newVersion}`);
        }
        break;
      }

      case 'status': {
        const current = getCurrentVersion(db);
        const statuses = migrationStatus(db);

        log.info(`Schema version: ${current}`);
        if (isNew) {
          log.info('(new database — no migrations applied yet)');
        }

        if (statuses.length === 0) {
          log.info('No migration files found.');
          break;
        }

        const maxNameLen = Math.max(...statuses.map((s) => s.name.length));
        log.info(`${'Ver'.padStart(4)}  ${'Name'.padEnd(maxNameLen)}  Status`);
        log.info(`${'─'.repeat(4)}  ${'─'.repeat(maxNameLen)}  ${'─'.repeat(10)}`);

        for (const s of statuses) {
          const marker = s.applied ? '  applied' : '  pending';
          log.info(`${String(s.version).padStart(4)}  ${s.name.padEnd(maxNameLen)}${marker}`);
        }

        const pending = statuses.filter((s) => !s.applied);
        if (pending.length > 0) {
          log.info(`${pending.length} pending migration(s).`);
        } else {
          log.info('All migrations applied.');
        }
        break;
      }

      default:
        log.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  log.error(`Migration error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
