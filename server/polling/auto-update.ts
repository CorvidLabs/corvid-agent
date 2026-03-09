/**
 * AutoUpdateService — checks if origin/main has new commits, pulls, and restarts.
 *
 * Extracted from MentionPollingService to isolate self-update concerns.
 * Runs on a 5-minute interval. Waits for all running sessions to finish
 * before pulling and exiting with code 75 to signal restart.
 */

import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import { resolveExecutable } from '../lib/env';
import { queryCount } from '../db/types';

const log = createLogger('AutoUpdate');

/** How often to check if origin/main has new commits. */
export const AUTO_UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class AutoUpdateService {
    private db: Database;
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(db: Database) {
        this.db = db;
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.timer = setInterval(() => this.check(), AUTO_UPDATE_INTERVAL_MS);
    }

    stop(): void {
        this.running = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Check if origin/main has new commits. If so, wait for all running
     * sessions to finish, pull the changes, and exit so the wrapper
     * script restarts the server with the new code.
     */
    async check(): Promise<void> {
        if (!this.running) return;

        try {
            // Fetch latest from origin
            const fetchResult = Bun.spawnSync([resolveExecutable('git'), 'fetch', 'origin', 'main'], {
                cwd: import.meta.dir + '/..',
                stdout: 'pipe', stderr: 'pipe',
            });
            if (fetchResult.exitCode !== 0) return;

            // Only auto-update if we're on the main branch
            const currentBranch = Bun.spawnSync([resolveExecutable('git'), 'rev-parse', '--abbrev-ref', 'HEAD'], {
                cwd: import.meta.dir + '/..',
                stdout: 'pipe',
            }).stdout.toString().trim();

            if (currentBranch !== 'main') {
                log.debug('Skipping auto-update — not on main branch', { branch: currentBranch });
                return;
            }

            // Compare local main with origin/main
            const localHash = Bun.spawnSync([resolveExecutable('git'), 'rev-parse', 'HEAD'], {
                cwd: import.meta.dir + '/..',
                stdout: 'pipe',
            }).stdout.toString().trim();

            const remoteHash = Bun.spawnSync([resolveExecutable('git'), 'rev-parse', 'origin/main'], {
                cwd: import.meta.dir + '/..',
                stdout: 'pipe',
            }).stdout.toString().trim();

            if (localHash === remoteHash) return;

            log.info('New commits detected on origin/main', { local: localHash.slice(0, 8), remote: remoteHash.slice(0, 8) });

            // Check for running sessions — wait for them to finish
            const activeCount = queryCount(this.db, "SELECT COUNT(*) as cnt FROM sessions WHERE status = 'running' AND pid IS NOT NULL");
            if (activeCount > 0) {
                log.info('Deferring auto-update — waiting for active sessions to finish', { activeCount });
                return;
            }

            // No active sessions — pull and restart
            log.info('No active sessions — pulling and restarting');

            const pullResult = Bun.spawnSync([resolveExecutable('git'), 'pull', '--rebase', 'origin', 'main'], {
                cwd: import.meta.dir + '/..',
                stdout: 'pipe', stderr: 'pipe',
            });

            if (pullResult.exitCode !== 0) {
                log.error('Git pull failed', { stderr: pullResult.stderr.toString().trim() });
                return;
            }

            // Check if bun.lock changed — if so, install updated dependencies
            // before restarting to avoid running with stale node_modules.
            const lockDiff = Bun.spawnSync(
                ['git', 'diff', localHash, 'HEAD', '--name-only', '--', 'bun.lock', 'package.json'],
                { cwd: import.meta.dir + '/..', stdout: 'pipe' },
            );
            const changedFiles = lockDiff.stdout.toString().trim();
            if (changedFiles) {
                log.info('Dependencies changed — running bun install', { changedFiles });
                const installResult = Bun.spawnSync(
                    [resolveExecutable('bun'), 'install', '--frozen-lockfile', '--ignore-scripts'],
                    { cwd: import.meta.dir + '/..', stdout: 'pipe', stderr: 'pipe' },
                );
                if (installResult.exitCode !== 0) {
                    log.error('bun install failed after pull — reverting', {
                        stderr: installResult.stderr.toString().trim(),
                    });
                    // Roll back to the known-good commit so we don't run with mismatched code + deps
                    Bun.spawnSync([resolveExecutable('git'), 'reset', '--hard', localHash], {
                        cwd: import.meta.dir + '/..',
                        stdout: 'pipe', stderr: 'pipe',
                    });
                    return;
                }
                log.info('bun install completed successfully');
            }

            // Verify pull actually advanced HEAD to origin/main
            const newLocalHash = Bun.spawnSync([resolveExecutable('git'), 'rev-parse', 'HEAD'], {
                cwd: import.meta.dir + '/..',
                stdout: 'pipe',
            }).stdout.toString().trim();

            if (newLocalHash === localHash) {
                log.warn('Git pull did not advance HEAD — skipping restart to avoid loop', {
                    hash: localHash.slice(0, 8),
                });
                return;
            }

            log.info('Git pull successful — exiting for restart', {
                oldHash: localHash.slice(0, 8),
                newHash: newLocalHash.slice(0, 8),
            });
            // Exit with code 75 (EX_TEMPFAIL) to signal "restart me"
            // The run-loop.sh wrapper and launchd both treat non-zero as restartable
            process.exit(75);
        } catch (err) {
            log.error('Error in auto-update check', { error: err instanceof Error ? err.message : String(err) });
        }
    }
}
