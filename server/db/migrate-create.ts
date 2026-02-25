#!/usr/bin/env bun
/**
 * Create a new migration file.
 *
 * Usage:
 *   bun run migrate:create add_user_preferences
 *
 * Creates: server/db/migrations/NNN_add_user_preferences.ts
 */

import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { discoverMigrations } from './migrate';

const MIGRATION_DIR = resolve(import.meta.dir, 'migrations');

const name = process.argv[2];
if (!name) {
    console.error('Usage: bun run migrate:create <name>');
    console.error('  e.g. bun run migrate:create add_user_preferences');
    process.exit(1);
}

// Validate name
if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    console.error('Migration name must be lowercase alphanumeric with underscores (e.g. add_user_preferences)');
    process.exit(1);
}

// Determine next version number
const existing = discoverMigrations();
const lastVersion = existing.length > 0 ? existing[existing.length - 1].version : 0;
const nextVersion = lastVersion + 1;
const paddedVersion = String(nextVersion).padStart(3, '0');
const filename = `${paddedVersion}_${name}.ts`;
const filepath = resolve(MIGRATION_DIR, filename);

const template = `import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    // TODO: Add your migration SQL here
    // db.exec(\`CREATE TABLE IF NOT EXISTS ...\`);
}

export function down(db: Database): void {
    // TODO: Revert the migration
    // db.exec(\`DROP TABLE IF EXISTS ...\`);
}
`;

writeFileSync(filepath, template);
console.log(`Created: server/db/migrations/${filename}`);
