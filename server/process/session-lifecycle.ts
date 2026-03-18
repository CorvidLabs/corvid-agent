import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import { queryCount } from '../db/types';

const log = createLogger('SessionLifecycle');

// Configuration for session lifecycle management
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_MAX_SESSIONS_PER_PROJECT = 100;

export interface SessionLifecycleConfig {
    sessionTtlMs: number;
    cleanupIntervalMs: number;
    maxSessionsPerProject: number;
}

export interface SessionCleanupStats {
    expiredSessions: number;
    orphanedProcesses: number;
    staleSubscriptions: number;
    memoryFreedMB: number;
}

/**
 * Manages session lifecycle to prevent memory leaks and unbounded growth.
 * Handles:
 * - Automatic cleanup of expired sessions
 * - Memory management for process maps
 * - Cleanup of orphaned timers and subscriptions
 * - Session count limits per project
 */
export class SessionLifecycleManager {
    private db: Database;
    private config: SessionLifecycleConfig;
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;
    private activeSessionCount = 0;

    constructor(db: Database, config: Partial<SessionLifecycleConfig> = {}) {
        this.db = db;
        this.config = {
            sessionTtlMs: config.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS,
            cleanupIntervalMs: config.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS,
            maxSessionsPerProject: config.maxSessionsPerProject ?? DEFAULT_MAX_SESSIONS_PER_PROJECT,
        };

        log.info('Session lifecycle manager initialized', {
            sessionTtlDays: Math.round(this.config.sessionTtlMs / (24 * 60 * 60 * 1000)),
            cleanupIntervalMin: Math.round(this.config.cleanupIntervalMs / (60 * 1000)),
            maxSessionsPerProject: this.config.maxSessionsPerProject,
        });
    }

    /**
     * Start the automatic cleanup process
     */
    start(): void {
        if (this.cleanupTimer) {
            log.warn('Session lifecycle manager already running');
            return;
        }

        // Reap stale sessions left behind by a previous server crash or forced restart.
        // This must run synchronously before we start accepting work, so that the
        // process manager doesn't see ghost "running" sessions from a previous life.
        this.reapStaleSessions();

        // Run initial cleanup
        this.runCleanup().catch(err => {
            log.error('Initial session cleanup failed', { error: err instanceof Error ? err.message : String(err) });
        });

        // Schedule periodic cleanup
        this.cleanupTimer = setInterval(() => {
            this.runCleanup().catch(err => {
                log.error('Scheduled session cleanup failed', { error: err instanceof Error ? err.message : String(err) });
            });
        }, this.config.cleanupIntervalMs);

        log.info('Session lifecycle cleanup started', {
            intervalMs: this.config.cleanupIntervalMs
        });
    }

    /**
     * Reap sessions stuck in 'running' status from a previous server instance.
     *
     * After a crash or forced restart (e.g. launchctl kickstart -k), child
     * processes die but their DB status remains 'running'. This method finds
     * those orphans and marks them 'stopped' so they show correct state in the
     * UI and can be resumed.
     *
     * Detection: for each session with status='running' and a non-null pid,
     * check if the process is still alive via kill(pid, 0). If the PID is dead
     * (or belongs to a different process — unlikely to collide on macOS),
     * mark the session stopped.
     */
    private reapStaleSessions(): void {
        const staleSessions = this.db.query(`
            SELECT id, pid, name, agent_id, source
            FROM sessions
            WHERE status = 'running'
        `).all() as Array<{ id: string; pid: number | null; name: string; agent_id: string; source: string }>;

        if (staleSessions.length === 0) return;

        let reaped = 0;
        for (const session of staleSessions) {
            let alive = false;

            if (session.pid) {
                try {
                    // kill(pid, 0) doesn't send a signal — just checks if the
                    // process exists and we have permission to signal it.
                    process.kill(session.pid, 0);
                    alive = true;
                } catch {
                    // ESRCH = no such process, EPERM = exists but we can't signal it
                    // In both cases, treat as dead for our purposes
                    alive = false;
                }
            }

            if (!alive) {
                this.db.query(`
                    UPDATE sessions SET status = 'stopped', pid = NULL, updated_at = datetime('now')
                    WHERE id = ?
                `).run(session.id);
                reaped++;
                log.info('Reaped stale session from previous server instance', {
                    sessionId: session.id,
                    name: session.name,
                    pid: session.pid,
                    source: session.source,
                });
            }
        }

        if (reaped > 0) {
            log.info(`Reaped ${reaped} stale session(s) from previous server instance`);
        }
    }

    /**
     * Stop the automatic cleanup process
     */
    stop(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
            log.info('Session lifecycle cleanup stopped');
        }
    }

    /**
     * Run a comprehensive cleanup cycle
     */
    async runCleanup(): Promise<SessionCleanupStats> {
        const startTime = Date.now();
        const memoryBefore = process.memoryUsage().heapUsed;

        log.debug('Starting session cleanup cycle');

        const stats: SessionCleanupStats = {
            expiredSessions: 0,
            orphanedProcesses: 0,
            staleSubscriptions: 0,
            memoryFreedMB: 0,
        };

        try {
            // 1. Clean up expired sessions
            stats.expiredSessions = await this.cleanupExpiredSessions();

            // 2. Clean up orphaned session messages
            await this.cleanupOrphanedMessages();

            // 3. Enforce session limits per project
            await this.enforceSessionLimits();

            // 4. Update memory statistics
            const memoryAfter = process.memoryUsage().heapUsed;
            stats.memoryFreedMB = Math.max(0, (memoryBefore - memoryAfter) / (1024 * 1024));

            // 5. Update active session count
            this.updateActiveSessionCount();

            const elapsedMs = Date.now() - startTime;
            log.info('Session cleanup completed', {
                ...stats,
                elapsedMs,
                activeSessionCount: this.activeSessionCount,
            });

        } catch (error) {
            log.error('Session cleanup failed', {
                error: error instanceof Error ? error.message : String(error),
                elapsedMs: Date.now() - startTime
            });
        }

        return stats;
    }

    /**
     * Clean up sessions that have exceeded their TTL
     */
    private async cleanupExpiredSessions(): Promise<number> {
        const ttlSeconds = Math.round(this.config.sessionTtlMs / 1000);

        // Find expired sessions — compare in SQLite's datetime domain since
        // updated_at stores ISO strings from datetime('now'), not epoch millis.
        const expiredSessions = this.db.query(`
            SELECT id, project_id, status
            FROM sessions
            WHERE status IN ('idle', 'completed', 'error', 'stopped')
            AND updated_at < datetime('now', '-' || ? || ' seconds')
            ORDER BY updated_at ASC
            LIMIT 100
        `).all(ttlSeconds) as Array<{ id: string; project_id: string; status: string }>;

        if (expiredSessions.length === 0) {
            return 0;
        }

        log.debug(`Found ${expiredSessions.length} expired sessions to clean up`);

        // Delete expired sessions and related data
        const sessionIds = expiredSessions.map(s => s.id);
        const placeholders = sessionIds.map(() => '?').join(',');

        // Use a transaction for consistency
        const deleteTransaction = this.db.transaction(() => {
            // Null out FK references from algochat_conversations
            this.db.query(`
                UPDATE algochat_conversations SET session_id = NULL
                WHERE session_id IN (${placeholders})
            `).run(...sessionIds);

            // Delete session messages
            this.db.query(`
                DELETE FROM session_messages
                WHERE session_id IN (${placeholders})
            `).run(...sessionIds);

            // Delete escalation queue entries
            this.db.query(`
                DELETE FROM escalation_queue
                WHERE session_id IN (${placeholders})
            `).run(...sessionIds);

            // Delete sessions
            this.db.query(`
                DELETE FROM sessions
                WHERE id IN (${placeholders})
            `).run(...sessionIds);
        });

        deleteTransaction();

        log.info(`Cleaned up ${expiredSessions.length} expired sessions`, {
            ttlDays: Math.round(ttlSeconds / (24 * 60 * 60)),
            projectsAffected: new Set(expiredSessions.map(s => s.project_id)).size,
        });

        return expiredSessions.length;
    }

    /**
     * Clean up orphaned session messages that no longer have parent sessions
     */
    private async cleanupOrphanedMessages(): Promise<void> {
        const orphanedMessages = this.db.query(`
            DELETE FROM session_messages
            WHERE session_id NOT IN (SELECT id FROM sessions)
        `).run();

        if (orphanedMessages.changes > 0) {
            log.info(`Cleaned up ${orphanedMessages.changes} orphaned session messages`);
        }
    }

    /**
     * Enforce maximum number of sessions per project
     */
    private async enforceSessionLimits(): Promise<void> {
        // Find projects with too many sessions
        const overLimitProjects = this.db.query(`
            SELECT project_id, COUNT(*) as session_count
            FROM sessions
            WHERE status != 'running'
            GROUP BY project_id
            HAVING session_count > ?
        `).all(this.config.maxSessionsPerProject) as Array<{ project_id: string; session_count: number }>;

        // Protect sessions younger than 24 hours from limit-based cleanup.
        // Without this guard, a burst of new sessions can push out recently-created
        // sessions that the user still expects to be resumable.
        const MIN_AGE_SECONDS = 24 * 60 * 60; // 24 hours

        for (const { project_id, session_count } of overLimitProjects) {
            const excessCount = session_count - this.config.maxSessionsPerProject;

            // Delete oldest sessions for this project, but only if older than MIN_AGE
            const oldestSessions = this.db.query(`
                SELECT id FROM sessions
                WHERE project_id = ? AND status != 'running'
                AND updated_at < datetime('now', '-' || ? || ' seconds')
                ORDER BY updated_at ASC
                LIMIT ?
            `).all(project_id, MIN_AGE_SECONDS, excessCount) as Array<{ id: string }>;

            if (oldestSessions.length > 0) {
                const sessionIds = oldestSessions.map(s => s.id);
                const placeholders = sessionIds.map(() => '?').join(',');

                const limitTransaction = this.db.transaction(() => {
                    // Null out FK references from algochat_conversations
                    this.db.query(`
                        UPDATE algochat_conversations SET session_id = NULL
                        WHERE session_id IN (${placeholders})
                    `).run(...sessionIds);

                    // Delete session messages
                    this.db.query(`
                        DELETE FROM session_messages
                        WHERE session_id IN (${placeholders})
                    `).run(...sessionIds);

                    // Delete escalation queue entries
                    this.db.query(`
                        DELETE FROM escalation_queue
                        WHERE session_id IN (${placeholders})
                    `).run(...sessionIds);

                    // Delete sessions
                    this.db.query(`
                        DELETE FROM sessions
                        WHERE id IN (${placeholders})
                    `).run(...sessionIds);
                });

                limitTransaction();

                log.info(`Enforced session limit for project ${project_id}`, {
                    deletedSessions: sessionIds.length,
                    remainingSessions: this.config.maxSessionsPerProject,
                    skippedYoungSessions: excessCount - sessionIds.length,
                });
            }
        }
    }

    /**
     * Update the active session count for monitoring
     */
    private updateActiveSessionCount(): void {
        this.activeSessionCount = queryCount(this.db, "SELECT COUNT(*) as cnt FROM sessions WHERE status IN ('running', 'paused')");
    }

    /**
     * Get current session statistics
     */
    getStats(): {
        activeSessions: number;
        totalSessions: number;
        sessionsByStatus: Record<string, number>;
        oldestSessionAge: number;
    } {
        const totalSessions = queryCount(this.db, 'SELECT COUNT(*) as cnt FROM sessions');

        const statusResults = this.db.query(`
            SELECT status, COUNT(*) as count
            FROM sessions
            GROUP BY status
        `).all() as Array<{ status: string; count: number }>;

        const oldestResult = this.db.query(`
            SELECT MIN(created_at) as oldest FROM sessions
        `).get() as { oldest: string | null };

        const sessionsByStatus: Record<string, number> = {};
        for (const { status, count } of statusResults) {
            sessionsByStatus[status] = count;
        }

        return {
            activeSessions: this.activeSessionCount,
            totalSessions,
            sessionsByStatus,
            oldestSessionAge: oldestResult.oldest ? Date.now() - new Date(oldestResult.oldest + 'Z').getTime() : 0,
        };
    }

    /**
     * Check if a new session can be created for a project
     */
    canCreateSession(projectId: string): boolean {
        return queryCount(this.db, 'SELECT COUNT(*) as cnt FROM sessions WHERE project_id = ?', projectId) < this.config.maxSessionsPerProject;
    }

    /**
     * Force cleanup of a specific session and its resources
     */
    async cleanupSession(sessionId: string): Promise<boolean> {
        try {
            const cleanupTransaction = this.db.transaction(() => {
                // Null out FK references from algochat_conversations
                this.db.query(`
                    UPDATE algochat_conversations SET session_id = NULL WHERE session_id = ?
                `).run(sessionId);

                // Delete session messages
                const messagesResult = this.db.query(`
                    DELETE FROM session_messages WHERE session_id = ?
                `).run(sessionId);

                // Delete escalation queue entries
                const escalationsResult = this.db.query(`
                    DELETE FROM escalation_queue WHERE session_id = ?
                `).run(sessionId);

                // Delete session
                const sessionResult = this.db.query(`
                    DELETE FROM sessions WHERE id = ?
                `).run(sessionId);

                return {
                    messagesDeleted: messagesResult.changes,
                    escalationsDeleted: escalationsResult.changes,
                    sessionDeleted: sessionResult.changes > 0,
                };
            });

            const result = cleanupTransaction();

            if (result.sessionDeleted) {
                log.info(`Force cleaned up session ${sessionId}`, {
                    messagesDeleted: result.messagesDeleted,
                    escalationsDeleted: result.escalationsDeleted,
                });
                return true;
            }

            return false;
        } catch (error) {
            log.error(`Failed to force cleanup session ${sessionId}`, {
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }
}