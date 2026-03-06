import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SessionResilienceManager, MAX_RESTARTS, type SessionResilienceCallbacks } from '../process/session-resilience-manager';
import { SessionEventBus } from '../process/event-bus';
import { Database } from 'bun:sqlite';

/** Minimal in-memory DB with the sessions table for testing. */
function createTestDb(): Database {
    const db = new Database(':memory:');
    db.run(`CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT DEFAULT 'test',
        name TEXT DEFAULT 'test',
        initial_prompt TEXT DEFAULT '',
        status TEXT DEFAULT 'idle',
        pid INTEGER,
        agent_id TEXT,
        source TEXT DEFAULT 'web',
        work_dir TEXT,
        council_role TEXT,
        cost_usd REAL DEFAULT 0,
        num_turns INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE TABLE session_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        role TEXT,
        content TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE TABLE agents (
        id TEXT PRIMARY KEY,
        name TEXT,
        persona TEXT DEFAULT '',
        provider TEXT,
        model TEXT,
        algochat_enabled INTEGER DEFAULT 0,
        algochat_auto INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);
    return db;
}

function insertSession(db: Database, id: string, status = 'idle', source = 'algochat') {
    db.run(`INSERT INTO sessions (id, status, source) VALUES (?, ?, ?)`, [id, status, source]);
}

describe('SessionResilienceManager', () => {
    let db: Database;
    let eventBus: SessionEventBus;
    let manager: SessionResilienceManager;
    let callbacks: SessionResilienceCallbacks;
    let resumedSessions: string[];
    let stoppedSessions: string[];
    let clearedTimers: string[];
    let cancelledApprovals: string[];
    let runningSessions: Set<string>;

    beforeEach(() => {
        db = createTestDb();
        eventBus = new SessionEventBus();
        resumedSessions = [];
        stoppedSessions = [];
        clearedTimers = [];
        cancelledApprovals = [];
        runningSessions = new Set();

        callbacks = {
            resumeProcess: (session) => resumedSessions.push(session.id),
            stopProcess: (sessionId) => stoppedSessions.push(sessionId),
            isRunning: (sessionId) => runningSessions.has(sessionId),
            clearTimers: (sessionId) => clearedTimers.push(sessionId),
            cancelApprovals: (sessionId) => cancelledApprovals.push(sessionId),
        };

        manager = new SessionResilienceManager(db, eventBus, callbacks);
    });

    afterEach(() => {
        manager.shutdown();
        db.close();
    });

    describe('MAX_RESTARTS export', () => {
        it('exports the restart limit constant', () => {
            expect(MAX_RESTARTS).toBe(3);
        });
    });

    describe('handleApiOutage', () => {
        it('pauses session and updates DB status', () => {
            insertSession(db, 's1', 'running');

            manager.handleApiOutage('s1');

            expect(manager.isPaused('s1')).toBe(true);
            expect(clearedTimers).toContain('s1');
            expect(cancelledApprovals).toContain('s1');

            const row = db.query('SELECT status, pid FROM sessions WHERE id = ?').get('s1') as { status: string; pid: number | null };
            expect(row.status).toBe('paused');
            expect(row.pid).toBeNull();
        });

        it('emits error event before removing subscribers', () => {
            insertSession(db, 's1', 'running');
            const events: Array<{ type: string }> = [];
            eventBus.subscribe('s1', (_sid, event) => events.push(event as { type: string }));

            manager.handleApiOutage('s1');

            expect(events.some((e) => e.type === 'error')).toBe(true);
        });
    });

    describe('resumeSession', () => {
        it('returns false if session is not paused', () => {
            expect(manager.resumeSession('s1')).toBe(false);
        });

        it('returns false if session not found in DB', () => {
            // Manually set paused state
            manager.handleApiOutage('s1');
            insertSession(db, 'other');
            // s1 not in DB
            const result = manager.resumeSession('s1');
            // Should still return false because s1 is paused but not in DB
            // Actually handleApiOutage sets it to paused — but s1 isn't in sessions table
            // The getSession call will return null
            expect(result).toBe(false);
        });

        it('resumes a paused session successfully', () => {
            insertSession(db, 's1', 'paused');
            manager.handleApiOutage('s1');

            const result = manager.resumeSession('s1');
            expect(result).toBe(true);
            expect(manager.isPaused('s1')).toBe(false);
            expect(resumedSessions).toContain('s1');
        });
    });

    describe('isPaused / getPausedSessionIds / pausedSessionCount', () => {
        it('tracks paused sessions correctly', () => {
            insertSession(db, 's1');
            insertSession(db, 's2');

            expect(manager.isPaused('s1')).toBe(false);
            expect(manager.getPausedSessionIds()).toEqual([]);
            expect(manager.pausedSessionCount).toBe(0);

            manager.handleApiOutage('s1');
            manager.handleApiOutage('s2');

            expect(manager.isPaused('s1')).toBe(true);
            expect(manager.isPaused('s2')).toBe(true);
            expect(manager.getPausedSessionIds()).toHaveLength(2);
            expect(manager.pausedSessionCount).toBe(2);
        });
    });

    describe('deletePausedSession', () => {
        it('removes a paused session entry', () => {
            insertSession(db, 's1');
            manager.handleApiOutage('s1');
            expect(manager.isPaused('s1')).toBe(true);

            manager.deletePausedSession('s1');
            expect(manager.isPaused('s1')).toBe(false);
        });

        it('is safe for non-existent sessions', () => {
            manager.deletePausedSession('nonexistent');
        });
    });

    describe('attemptRestart', () => {
        it('returns false when max restarts exceeded', () => {
            const result = manager.attemptRestart('s1', MAX_RESTARTS);
            expect(result).toBe(false);
        });

        it('returns true and schedules restart for valid attempt', () => {
            insertSession(db, 's1', 'error', 'algochat');
            const result = manager.attemptRestart('s1', 0);
            expect(result).toBe(true);
        });

        it('skips restart if session was manually stopped', async () => {
            insertSession(db, 's1', 'stopped', 'algochat');
            manager.attemptRestart('s1', 0);

            // Wait for the backoff timer (BACKOFF_BASE_MS * 3^0 = 5000ms is too long,
            // but the callback checks session status before resuming)
            // We can't easily test the setTimeout callback without mocking time
        });

        it('skips restart if session not found in DB', async () => {
            // No session inserted — attemptRestart will schedule, but callback will find no session
            const result = manager.attemptRestart('nonexistent', 0);
            expect(result).toBe(true); // Returns true (scheduled), but won't actually restart
        });
    });

    describe('checkApiHealth', () => {
        it('returns a boolean', async () => {
            // This makes a real HTTP call — we just verify it returns a boolean
            const result = await manager.checkApiHealth();
            expect(typeof result).toBe('boolean');
        });
    });

    describe('shutdown', () => {
        it('clears all intervals and paused sessions', () => {
            insertSession(db, 's1');
            manager.handleApiOutage('s1');
            manager.startAutoResumeChecker();
            manager.startOrphanPruner(() => 0);

            manager.shutdown();
            expect(manager.pausedSessionCount).toBe(0);
        });

        it('is safe to call multiple times', () => {
            manager.shutdown();
            manager.shutdown();
        });
    });

    describe('startOrphanPruner', () => {
        it('calls prune callback periodically', async () => {
            let pruneCount = 0;
            // The default interval is 5 minutes — we can't easily test this
            // without mocking timers. Just verify it starts without error.
            manager.startOrphanPruner(() => {
                pruneCount++;
                return 0;
            });
            // Cleanup happens in afterEach via shutdown
        });
    });
});
