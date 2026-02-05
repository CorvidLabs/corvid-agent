import type { Database } from 'bun:sqlite';
import { createLogger } from './logger';

const log = createLogger('RateLimiter');

export interface RateLimitRule {
    /** Daily ALGO spending limit (in ALGO, not microALGOs) */
    dailyAlgoLimit: number;
    /** Operations per minute limit */
    operationsPerMinute: number;
    /** Maximum concurrent sessions */
    maxConcurrentSessions: number;
    /** Maximum work tasks per day */
    maxWorkTasksPerDay: number;
}

export interface RateLimitViolation {
    type: 'daily_algo_limit' | 'operations_per_minute' | 'concurrent_sessions' | 'work_tasks_per_day';
    message: string;
    currentValue: number;
    limit: number;
    resetTime?: Date;
}

export interface RateLimitStatus {
    allowed: boolean;
    violation?: RateLimitViolation;
}

// Default rate limits (conservative for security)
const DEFAULT_RATE_LIMITS: RateLimitRule = {
    dailyAlgoLimit: 0.1, // 0.1 ALGO per day (~$0.02 at current prices)
    operationsPerMinute: 10, // 10 operations per minute
    maxConcurrentSessions: 3, // Max 3 concurrent sessions
    maxWorkTasksPerDay: 5, // Max 5 work tasks per day
};

interface OperationCount {
    count: number;
    windowStart: number;
}

/**
 * Rate limiting service for CorvidAgent operations
 * Prevents abuse and ensures fair resource usage across agents
 */
export class RateLimiter {
    private db: Database;
    private operationCounts: Map<string, OperationCount> = new Map();
    private rateLimits: Map<string, RateLimitRule> = new Map();
    private activeSessions: Map<string, Set<string>> = new Map(); // agentId -> Set<sessionId>
    private cleanupTimerHandle: ReturnType<typeof setInterval> | null = null;

    // Window size for operations per minute (in milliseconds)
    private readonly MINUTE_WINDOW = 60 * 1000;

    constructor(db: Database) {
        this.db = db;
        this.setupDatabase();
        this.startCleanupTimer();
    }

    private setupDatabase(): void {
        // Create rate limiting tables if they don't exist
        try {
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS agent_rate_limits (
                    agent_id TEXT PRIMARY KEY,
                    daily_algo_limit REAL NOT NULL DEFAULT ${DEFAULT_RATE_LIMITS.dailyAlgoLimit},
                    operations_per_minute INTEGER NOT NULL DEFAULT ${DEFAULT_RATE_LIMITS.operationsPerMinute},
                    max_concurrent_sessions INTEGER NOT NULL DEFAULT ${DEFAULT_RATE_LIMITS.maxConcurrentSessions},
                    max_work_tasks_per_day INTEGER NOT NULL DEFAULT ${DEFAULT_RATE_LIMITS.maxWorkTasksPerDay},
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS daily_operation_counts (
                    agent_id TEXT NOT NULL,
                    date TEXT NOT NULL,
                    work_tasks_created INTEGER DEFAULT 0,
                    algo_spent REAL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (agent_id, date)
                );

                CREATE INDEX IF NOT EXISTS idx_daily_operations_date
                ON daily_operation_counts(date);

                CREATE INDEX IF NOT EXISTS idx_daily_operations_agent_date
                ON daily_operation_counts(agent_id, date);
            `);

            log.info('Rate limiting database tables initialized');
        } catch (error) {
            log.error('Failed to setup rate limiting tables', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Get rate limit configuration for an agent
     */
    getRateLimits(agentId: string): RateLimitRule {
        // Check if we have cached limits
        const cached = this.rateLimits.get(agentId);
        if (cached) {
            return cached;
        }

        // Load from database or use defaults
        try {
            const stmt = this.db.prepare(`
                SELECT daily_algo_limit, operations_per_minute, max_concurrent_sessions, max_work_tasks_per_day
                FROM agent_rate_limits
                WHERE agent_id = ?
            `);
            const row = stmt.get(agentId) as any;

            const limits: RateLimitRule = row ? {
                dailyAlgoLimit: row.daily_algo_limit,
                operationsPerMinute: row.operations_per_minute,
                maxConcurrentSessions: row.max_concurrent_sessions,
                maxWorkTasksPerDay: row.max_work_tasks_per_day,
            } : DEFAULT_RATE_LIMITS;

            // Cache the limits
            this.rateLimits.set(agentId, limits);
            return limits;
        } catch (error) {
            log.warn('Failed to load rate limits from database, using defaults', {
                agentId,
                error: error instanceof Error ? error.message : String(error)
            });
            return DEFAULT_RATE_LIMITS;
        }
    }

    /**
     * Set custom rate limits for an agent
     */
    setRateLimits(agentId: string, limits: Partial<RateLimitRule>): void {
        const current = this.getRateLimits(agentId);
        const updated = { ...current, ...limits };

        try {
            const stmt = this.db.prepare(`
                INSERT INTO agent_rate_limits (
                    agent_id, daily_algo_limit, operations_per_minute,
                    max_concurrent_sessions, max_work_tasks_per_day
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(agent_id) DO UPDATE SET
                    daily_algo_limit = excluded.daily_algo_limit,
                    operations_per_minute = excluded.operations_per_minute,
                    max_concurrent_sessions = excluded.max_concurrent_sessions,
                    max_work_tasks_per_day = excluded.max_work_tasks_per_day,
                    updated_at = CURRENT_TIMESTAMP
            `);

            stmt.run(
                agentId,
                updated.dailyAlgoLimit,
                updated.operationsPerMinute,
                updated.maxConcurrentSessions,
                updated.maxWorkTasksPerDay
            );

            // Update cache
            this.rateLimits.set(agentId, updated);

            log.info('Rate limits updated for agent', { agentId, limits: updated });
        } catch (error) {
            log.error('Failed to update rate limits', {
                agentId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Check if an operation is allowed for an agent
     */
    checkOperationLimit(agentId: string): RateLimitStatus {
        const limits = this.getRateLimits(agentId);
        const now = Date.now();

        // Get or create operation count for this agent
        let opCount = this.operationCounts.get(agentId);

        // Reset window if needed
        if (!opCount || now - opCount.windowStart >= this.MINUTE_WINDOW) {
            opCount = { count: 0, windowStart: now };
            this.operationCounts.set(agentId, opCount);
        }

        // Check if within limits
        if (opCount.count >= limits.operationsPerMinute) {
            const resetTime = new Date(opCount.windowStart + this.MINUTE_WINDOW);
            return {
                allowed: false,
                violation: {
                    type: 'operations_per_minute',
                    message: `Operation rate limit exceeded. Limit: ${limits.operationsPerMinute} operations per minute`,
                    currentValue: opCount.count,
                    limit: limits.operationsPerMinute,
                    resetTime
                }
            };
        }

        return { allowed: true };
    }

    /**
     * Record an operation (increments the counter if within limits)
     */
    recordOperation(agentId: string): RateLimitStatus {
        const status = this.checkOperationLimit(agentId);

        if (status.allowed) {
            const opCount = this.operationCounts.get(agentId);
            if (opCount) {
                opCount.count++;
            }
        }

        return status;
    }

    /**
     * Check if an ALGO spending operation is allowed
     */
    checkAlgoSpending(agentId: string, algoAmount: number): RateLimitStatus {
        const limits = this.getRateLimits(agentId);
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

        try {
            const stmt = this.db.prepare(`
                SELECT algo_spent
                FROM daily_operation_counts
                WHERE agent_id = ? AND date = ?
            `);
            const row = stmt.get(agentId, today) as any;
            const currentSpent = row ? row.algo_spent : 0;
            const newTotal = currentSpent + algoAmount;

            if (newTotal > limits.dailyAlgoLimit) {
                const resetTime = new Date();
                resetTime.setDate(resetTime.getDate() + 1);
                resetTime.setHours(0, 0, 0, 0);

                return {
                    allowed: false,
                    violation: {
                        type: 'daily_algo_limit',
                        message: `Daily ALGO spending limit exceeded. Limit: ${limits.dailyAlgoLimit} ALGO, would spend: ${newTotal} ALGO`,
                        currentValue: newTotal,
                        limit: limits.dailyAlgoLimit,
                        resetTime
                    }
                };
            }

            return { allowed: true };
        } catch (error) {
            log.error('Failed to check ALGO spending limit', {
                agentId,
                algoAmount,
                error: error instanceof Error ? error.message : String(error)
            });

            // Fail safe - deny the operation if we can't check limits
            return {
                allowed: false,
                violation: {
                    type: 'daily_algo_limit',
                    message: 'Unable to verify spending limits - operation denied for safety',
                    currentValue: 0,
                    limit: limits.dailyAlgoLimit
                }
            };
        }
    }

    /**
     * Record ALGO spending for an agent
     */
    recordAlgoSpending(agentId: string, algoAmount: number): RateLimitStatus {
        const status = this.checkAlgoSpending(agentId, algoAmount);

        if (!status.allowed) {
            return status;
        }

        const today = new Date().toISOString().split('T')[0];

        try {
            const stmt = this.db.prepare(`
                INSERT INTO daily_operation_counts (agent_id, date, algo_spent)
                VALUES (?, ?, ?)
                ON CONFLICT(agent_id, date) DO UPDATE SET
                    algo_spent = algo_spent + excluded.algo_spent
            `);
            stmt.run(agentId, today, algoAmount);

            log.debug('ALGO spending recorded', { agentId, algoAmount, date: today });
            return { allowed: true };
        } catch (error) {
            log.error('Failed to record ALGO spending', {
                agentId,
                algoAmount,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Check concurrent session limits
     */
    checkConcurrentSessions(agentId: string): RateLimitStatus {
        const limits = this.getRateLimits(agentId);
        const currentSessions = this.activeSessions.get(agentId)?.size || 0;

        if (currentSessions >= limits.maxConcurrentSessions) {
            return {
                allowed: false,
                violation: {
                    type: 'concurrent_sessions',
                    message: `Concurrent session limit exceeded. Limit: ${limits.maxConcurrentSessions} sessions`,
                    currentValue: currentSessions,
                    limit: limits.maxConcurrentSessions
                }
            };
        }

        return { allowed: true };
    }

    /**
     * Register a new session for an agent
     */
    addActiveSession(agentId: string, sessionId: string): RateLimitStatus {
        const status = this.checkConcurrentSessions(agentId);

        if (status.allowed) {
            const sessions = this.activeSessions.get(agentId) || new Set();
            sessions.add(sessionId);
            this.activeSessions.set(agentId, sessions);

            log.debug('Active session registered', {
                agentId,
                sessionId,
                totalSessions: sessions.size
            });
        }

        return status;
    }

    /**
     * Remove a session for an agent
     */
    removeActiveSession(agentId: string, sessionId: string): void {
        const sessions = this.activeSessions.get(agentId);
        if (sessions) {
            sessions.delete(sessionId);
            if (sessions.size === 0) {
                this.activeSessions.delete(agentId);
            }

            log.debug('Active session removed', {
                agentId,
                sessionId,
                remainingSessions: sessions.size
            });
        }
    }

    /**
     * Check work task creation limits
     */
    checkWorkTaskLimit(agentId: string): RateLimitStatus {
        const limits = this.getRateLimits(agentId);
        const today = new Date().toISOString().split('T')[0];

        try {
            const stmt = this.db.prepare(`
                SELECT work_tasks_created
                FROM daily_operation_counts
                WHERE agent_id = ? AND date = ?
            `);
            const row = stmt.get(agentId, today) as any;
            const currentTasks = row ? row.work_tasks_created : 0;

            if (currentTasks >= limits.maxWorkTasksPerDay) {
                const resetTime = new Date();
                resetTime.setDate(resetTime.getDate() + 1);
                resetTime.setHours(0, 0, 0, 0);

                return {
                    allowed: false,
                    violation: {
                        type: 'work_tasks_per_day',
                        message: `Daily work task limit exceeded. Limit: ${limits.maxWorkTasksPerDay} tasks per day`,
                        currentValue: currentTasks,
                        limit: limits.maxWorkTasksPerDay,
                        resetTime
                    }
                };
            }

            return { allowed: true };
        } catch (error) {
            log.error('Failed to check work task limit', {
                agentId,
                error: error instanceof Error ? error.message : String(error)
            });
            return {
                allowed: false,
                violation: {
                    type: 'work_tasks_per_day',
                    message: 'Unable to verify task limits - operation denied for safety',
                    currentValue: 0,
                    limit: limits.maxWorkTasksPerDay
                }
            };
        }
    }

    /**
     * Record work task creation
     */
    recordWorkTask(agentId: string): RateLimitStatus {
        const status = this.checkWorkTaskLimit(agentId);

        if (!status.allowed) {
            return status;
        }

        const today = new Date().toISOString().split('T')[0];

        try {
            const stmt = this.db.prepare(`
                INSERT INTO daily_operation_counts (agent_id, date, work_tasks_created)
                VALUES (?, ?, 1)
                ON CONFLICT(agent_id, date) DO UPDATE SET
                    work_tasks_created = work_tasks_created + 1
            `);
            stmt.run(agentId, today);

            log.debug('Work task creation recorded', { agentId, date: today });
            return { allowed: true };
        } catch (error) {
            log.error('Failed to record work task creation', {
                agentId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Get current usage statistics for an agent
     */
    getUsageStats(agentId: string): {
        operationsThisMinute: number;
        algoSpentToday: number;
        activeSessions: number;
        workTasksToday: number;
        limits: RateLimitRule;
    } {
        const limits = this.getRateLimits(agentId);
        const today = new Date().toISOString().split('T')[0];

        // Get current operation count
        const opCount = this.operationCounts.get(agentId);
        const operationsThisMinute = opCount ? opCount.count : 0;

        // Get active sessions
        const activeSessions = this.activeSessions.get(agentId)?.size || 0;

        // Get today's stats from database
        try {
            const stmt = this.db.prepare(`
                SELECT algo_spent, work_tasks_created
                FROM daily_operation_counts
                WHERE agent_id = ? AND date = ?
            `);
            const row = stmt.get(agentId, today) as any;

            return {
                operationsThisMinute,
                algoSpentToday: row ? row.algo_spent : 0,
                activeSessions,
                workTasksToday: row ? row.work_tasks_created : 0,
                limits
            };
        } catch (error) {
            log.error('Failed to get usage stats', {
                agentId,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                operationsThisMinute,
                algoSpentToday: 0,
                activeSessions,
                workTasksToday: 0,
                limits
            };
        }
    }

    /**
     * Clean up old data and reset expired windows
     */
    private startCleanupTimer(): void {
        // Clean up every 5 minutes
        this.cleanupTimerHandle = setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }

    /**
     * Stop cleanup timer and release resources
     */
    destroy(): void {
        if (this.cleanupTimerHandle) {
            clearInterval(this.cleanupTimerHandle);
            this.cleanupTimerHandle = null;
        }
    }

    private cleanup(): void {
        const now = Date.now();

        // Clean up expired operation count windows
        for (const [agentId, opCount] of this.operationCounts.entries()) {
            if (now - opCount.windowStart >= this.MINUTE_WINDOW) {
                this.operationCounts.delete(agentId);
            }
        }

        // Clean up old daily operation counts (keep last 30 days)
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];

            const stmt = this.db.prepare(`
                DELETE FROM daily_operation_counts
                WHERE date < ?
            `);
            const result = stmt.run(cutoffDate);

            if (result.changes > 0) {
                log.info('Cleaned up old operation count records', { deleted: result.changes });
            }
        } catch (error) {
            log.warn('Failed to cleanup old operation counts', {
                error: error instanceof Error ? error.message : String(error)
            });
        }

        log.debug('Rate limiter cleanup completed', {
            activeOperationWindows: this.operationCounts.size,
            agentsWithActiveSessions: this.activeSessions.size
        });
    }
}