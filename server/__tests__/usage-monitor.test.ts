import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { UsageMonitor } from '../usage/monitor';

// Minimal mock ProcessManager that supports subscribe/unsubscribe
function createMockProcessManager() {
    const subscribers = new Set<(sessionId: string, event: unknown) => void>();
    return {
        subscribeAll(cb: (sessionId: string, event: unknown) => void) {
            subscribers.add(cb);
        },
        unsubscribeAll(cb: (sessionId: string, event: unknown) => void) {
            subscribers.delete(cb);
        },
        emit(sessionId: string, event: unknown) {
            for (const cb of subscribers) cb(sessionId, event);
        },
        get subscriberCount() { return subscribers.size; },
    };
}

let db: Database;
let agentId: string;
let scheduleId: string;
let projectId: string;

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    projectId = crypto.randomUUID();
    db.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'Test Project', '/tmp')").run(projectId);

    agentId = crypto.randomUUID();
    db.query("INSERT INTO agents (id, name) VALUES (?, 'Test Agent')").run(agentId);

    scheduleId = crypto.randomUUID();
    db.query(`
        INSERT INTO agent_schedules (id, agent_id, name, description, cron_expression, actions, status)
        VALUES (?, ?, 'Test Schedule', 'For testing', '0 9 * * *', '[]', 'active')
    `).run(scheduleId, agentId);
});

afterAll(() => db.close());

describe('UsageMonitor', () => {
    describe('backfillCosts', () => {
        it('updates execution cost_usd from linked session', () => {
            const sessionId = crypto.randomUUID();
            db.query(`
                INSERT INTO sessions (id, project_id, agent_id, name, status, total_cost_usd, total_turns)
                VALUES (?, ?, ?, 'Test Session', 'stopped', 0.123, 15)
            `).run(sessionId, projectId, agentId);

            const execId = crypto.randomUUID();
            db.query(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, session_id, status, cost_usd, completed_at)
                VALUES (?, ?, ?, 'work_task', '{}', ?, 'completed', 0, datetime('now'))
            `).run(execId, scheduleId, agentId, sessionId);

            const pm = createMockProcessManager();
            const monitor = new UsageMonitor(db, pm as never);

            const updated = monitor.backfillCosts();
            expect(updated).toBe(1);

            // Verify the cost was updated
            const row = db.query('SELECT cost_usd FROM schedule_executions WHERE id = ?').get(execId) as { cost_usd: number };
            expect(row.cost_usd).toBe(0.123);
        });

        it('does not overwrite non-zero costs', () => {
            const sessionId = crypto.randomUUID();
            db.query(`
                INSERT INTO sessions (id, project_id, agent_id, name, status, total_cost_usd, total_turns)
                VALUES (?, ?, ?, 'Test Session 2', 'stopped', 0.999, 5)
            `).run(sessionId, projectId, agentId);

            const execId = crypto.randomUUID();
            db.query(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, session_id, status, cost_usd, completed_at)
                VALUES (?, ?, ?, 'work_task', '{}', ?, 'completed', 0.5, datetime('now'))
            `).run(execId, scheduleId, agentId, sessionId);

            const pm = createMockProcessManager();
            const monitor = new UsageMonitor(db, pm as never);

            monitor.backfillCosts();

            // Original cost should remain
            const row = db.query('SELECT cost_usd FROM schedule_executions WHERE id = ?').get(execId) as { cost_usd: number };
            expect(row.cost_usd).toBe(0.5);
        });
    });

    describe('session event handling', () => {
        it('updates execution cost when session exits', () => {
            const sessionId = crypto.randomUUID();
            db.query(`
                INSERT INTO sessions (id, project_id, agent_id, name, status, total_cost_usd, total_turns)
                VALUES (?, ?, ?, 'Event Session', 'stopped', 0.075, 8)
            `).run(sessionId, projectId, agentId);

            const execId = crypto.randomUUID();
            db.query(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, session_id, status, cost_usd)
                VALUES (?, ?, ?, 'review_prs', '{}', ?, 'completed', 0)
            `).run(execId, scheduleId, agentId, sessionId);

            const pm = createMockProcessManager();
            const monitor = new UsageMonitor(db, pm as never);
            monitor.start();

            // Emit session_exited event
            pm.emit(sessionId, { type: 'session_exited' });

            const row = db.query('SELECT cost_usd FROM schedule_executions WHERE id = ?').get(execId) as { cost_usd: number };
            expect(row.cost_usd).toBe(0.075);

            monitor.stop();
        });

        it('ignores non-schedule sessions', () => {
            const sessionId = crypto.randomUUID();
            db.query(`
                INSERT INTO sessions (id, project_id, agent_id, name, status, total_cost_usd, total_turns)
                VALUES (?, ?, ?, 'Non-Schedule Session', 'stopped', 1.0, 50)
            `).run(sessionId, projectId, agentId);

            // No schedule_execution linked to this session

            const pm = createMockProcessManager();
            const monitor = new UsageMonitor(db, pm as never);
            monitor.start();

            // Should not throw
            pm.emit(sessionId, { type: 'session_exited' });

            monitor.stop();
        });

        it('ignores non-exit events', () => {
            const pm = createMockProcessManager();
            const monitor = new UsageMonitor(db, pm as never);
            monitor.start();

            // Should not throw for non-exit events
            pm.emit('some-session', { type: 'message_delta', text: 'hello' });

            monitor.stop();
        });
    });

    describe('lifecycle', () => {
        it('subscribes on start and unsubscribes on stop', () => {
            const pm = createMockProcessManager();
            const monitor = new UsageMonitor(db, pm as never);

            expect(pm.subscriberCount).toBe(0);

            monitor.start();
            expect(pm.subscriberCount).toBe(1);

            monitor.stop();
            expect(pm.subscriberCount).toBe(0);
        });
    });
});
