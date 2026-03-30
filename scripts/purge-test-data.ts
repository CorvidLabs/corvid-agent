#!/usr/bin/env bun
/**
 * Purge test/sample data from the production database.
 *
 * Usage:
 *   bun scripts/purge-test-data.ts          # dry run (preview)
 *   bun scripts/purge-test-data.ts --force   # actually delete
 *
 * See #1013.
 */

import { getDb } from '../server/db/connection';
import { purgeTestData } from '../server/db/purge-test-data';

const dryRun = !process.argv.includes('--force');

if (dryRun) {
  console.log('=== DRY RUN (pass --force to actually delete) ===\n');
}

const db = getDb();
const result = purgeTestData(db, { dryRun });

console.log('\nResults:');
console.log(`  Councils:         ${result.councils}`);
console.log(`  Council launches: ${result.councilLaunches}`);
console.log(`  Sessions:         ${result.sessions}`);
console.log(`  Session messages: ${result.sessionMessages}`);
console.log(`  Dry run:          ${result.dryRun}`);

if (dryRun) {
  console.log('\nRe-run with --force to delete these rows.');
}
