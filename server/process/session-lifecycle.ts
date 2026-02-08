import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

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

            // Delete approval requests
            this.db.query(`
                DELETE FROM approval_requests
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

        for (const { project_id, session_count } of overLimitProjects) {
            const excessCount = session_count - this.config.maxSessionsPerProject;

            // Delete oldest sessions for this project
            const oldestSessions = this.db.query(`
                SELECT id FROM sessions
                WHERE project_id = ? AND status != 'running'
                ORDER BY updated_at ASC
                LIMIT ?
            `).all(project_id, excessCount) as Array<{ id: string }>;

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
                });
            }
        }
    }

    /**
     * Update the active session count for monitoring
     */
    private updateActiveSessionCount(): void {
        const result = this.db.query(`
            SELECT COUNT(*) as count FROM sessions WHERE status IN ('running', 'paused')
        `).get() as { count: number };

        this.activeSessionCount = result.count;
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
        const totalResult = this.db.query(`SELECT COUNT(*) as count FROM sessions`).get() as { count: number };

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
            totalSessions: totalResult.count,
            sessionsByStatus,
            oldestSessionAge: oldestResult.oldest ? Date.now() - new Date(oldestResult.oldest + 'Z').getTime() : 0,
        };
    }

    /**
     * Check if a new session can be created for a project
     */
    canCreateSession(projectId: string): boolean {
        const result = this.db.query(`
            SELECT COUNT(*) as count
            FROM sessions
            WHERE project_id = ?
        `).get(projectId) as { count: number };

        return result.count < this.config.maxSessionsPerProject;
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

                // Delete approval requests
                const approvalsResult = this.db.query(`
                    DELETE FROM approval_requests WHERE session_id = ?
                `).run(sessionId);

                // Delete session
                const sessionResult = this.db.query(`
                    DELETE FROM sessions WHERE id = ?
                `).run(sessionId);

                return {
                    messagesDeleted: messagesResult.changes,
                    approvalsDeleted: approvalsResult.changes,
                    sessionDeleted: sessionResult.changes > 0,
                };
            });

            const result = cleanupTransaction();

            if (result.sessionDeleted) {
                log.info(`Force cleaned up session ${sessionId}`, {
                    messagesDeleted: result.messagesDeleted,
                    approvalsDeleted: result.approvalsDeleted,
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