/**
 * First-run welcome banner — shown once when the server boots with no agents.
 * Helps new users understand what to do after `corvid-agent init`.
 */
import type { Database } from 'bun:sqlite';
import { createLogger } from './logger';

const log = createLogger('Welcome');

/** Check if this is a fresh installation (no agents created yet). */
function isFirstRun(db: Database): boolean {
  try {
    const row = db.query('SELECT COUNT(*) as count FROM agents').get() as { count: number } | null;
    return !row || row.count === 0;
  } catch {
    // Table might not exist yet during initial migration
    return true;
  }
}

/** Print a friendly welcome banner for first-time users. */
export function printFirstRunBanner(db: Database, host: string, port: number): void {
  if (!isFirstRun(db)) return;

  const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;

  log.info('Welcome to corvid-agent! This looks like a fresh install.');
  log.info('');
  log.info('Quick start:');
  log.info(`  1. Open the dashboard: ${url}`);
  log.info('  2. The welcome wizard will guide you through creating your first agent');
  log.info('  3. Or use the CLI: corvid-agent init --mcp  (add tools to your AI editor)');
  log.info('');
  log.info('Useful commands:');
  log.info('  corvid-agent doctor    Check system health and prerequisites');
  log.info('  corvid-agent config    View and change configuration');
  log.info('  corvid-agent           Start an interactive chat session');
  log.info('');
  log.info('Docs: docs/quickstart.md');
}
