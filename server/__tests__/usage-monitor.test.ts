import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
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
    get subscriberCount() {
      return subscribers.size;
    },
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

  describe('setNotificationService', () => {
    it('accepts a notification service without throwing', () => {
      const pm = createMockProcessManager();
      const monitor = new UsageMonitor(db, pm as never);

      const mockNotify = mock(async () => ({ notificationId: 'n1', channels: [] }));
      const mockService = { notify: mockNotify } as never;

      // Should not throw
      expect(() => monitor.setNotificationService(mockService)).not.toThrow();
    });
  });

  describe('checkCostSpike', () => {
    it('sends alert when session cost exceeds 2x rolling average', async () => {
      const mockNotify = mock(async () => ({ notificationId: 'n1', channels: [] }));
      const mockService = { notify: mockNotify } as never;

      // Insert 3 prior completed executions with low cost ($0.05 each)
      const priorSessionIds: string[] = [];
      const priorExecIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const sid = crypto.randomUUID();
        priorSessionIds.push(sid);
        db.query(`
                    INSERT INTO sessions (id, project_id, agent_id, name, status, total_cost_usd, total_turns)
                    VALUES (?, ?, ?, 'Spike Prior Session', 'stopped', 0.05, 5)
                `).run(sid, projectId, agentId);

        const eid = crypto.randomUUID();
        priorExecIds.push(eid);
        db.query(`
                    INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, session_id, status, cost_usd, started_at, completed_at)
                    VALUES (?, ?, ?, 'work_task', '{}', ?, 'completed', 0.05, datetime('now', '-1 day'), datetime('now', '-1 day'))
                `).run(eid, scheduleId, agentId, sid);
      }

      // Insert the spiking session with high cost ($0.50 = 10x average)
      const spikeSid = crypto.randomUUID();
      db.query(`
                INSERT INTO sessions (id, project_id, agent_id, name, status, total_cost_usd, total_turns)
                VALUES (?, ?, ?, 'Spike Session', 'stopped', 0.50, 20)
            `).run(spikeSid, projectId, agentId);

      const spikeExecId = crypto.randomUUID();
      db.query(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, session_id, status, cost_usd, started_at)
                VALUES (?, ?, ?, 'work_task', '{}', ?, 'completed', 0, datetime('now', '-5 minutes'))
            `).run(spikeExecId, scheduleId, agentId, spikeSid);

      const pm = createMockProcessManager();
      const monitor = new UsageMonitor(db, pm as never);
      monitor.setNotificationService(mockService);
      monitor.start();

      // Emit session_exited to trigger cost update + spike check
      pm.emit(spikeSid, { type: 'session_exited' });

      // Allow microtask (notify is async but .catch'd — give it a tick)
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNotify).toHaveBeenCalledTimes(1);
      const callArgs = (
        mockNotify.mock.calls[0] as unknown as [{ title: string; message: string; level: string; agentId: string }]
      )[0];
      expect(callArgs.title).toBe('Cost Spike Detected');
      expect(callArgs.level).toBe('warning');
      expect(callArgs.agentId).toBe(agentId);

      monitor.stop();
    });

    it('does not alert when cost is within normal range', async () => {
      const mockNotify = mock(async () => ({ notificationId: 'n2', channels: [] }));
      const mockService = { notify: mockNotify } as never;

      // New schedule for isolation
      const scheduleId2 = crypto.randomUUID();
      db.query(`
                INSERT INTO agent_schedules (id, agent_id, name, description, cron_expression, actions, status)
                VALUES (?, ?, 'Normal Schedule', 'For no-spike test', '0 10 * * *', '[]', 'active')
            `).run(scheduleId2, agentId);

      // 3 prior executions at $0.10
      for (let i = 0; i < 3; i++) {
        const sid = crypto.randomUUID();
        db.query(`
                    INSERT INTO sessions (id, project_id, agent_id, name, status, total_cost_usd, total_turns)
                    VALUES (?, ?, ?, 'Normal Session', 'stopped', 0.10, 5)
                `).run(sid, projectId, agentId);
        const eid = crypto.randomUUID();
        db.query(`
                    INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, session_id, status, cost_usd, started_at, completed_at)
                    VALUES (?, ?, ?, 'work_task', '{}', ?, 'completed', 0.10, datetime('now', '-2 days'), datetime('now', '-2 days'))
                `).run(eid, scheduleId2, agentId, sid);
      }

      // Normal-cost session ($0.12 — only 1.2x average, below 2x threshold)
      const normalSid = crypto.randomUUID();
      db.query(`
                INSERT INTO sessions (id, project_id, agent_id, name, status, total_cost_usd, total_turns)
                VALUES (?, ?, ?, 'Normal Cost Session', 'stopped', 0.12, 6)
            `).run(normalSid, projectId, agentId);

      const normalExecId = crypto.randomUUID();
      db.query(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, session_id, status, cost_usd, started_at)
                VALUES (?, ?, ?, 'work_task', '{}', ?, 'completed', 0, datetime('now', '-5 minutes'))
            `).run(normalExecId, scheduleId2, agentId, normalSid);

      const pm = createMockProcessManager();
      const monitor = new UsageMonitor(db, pm as never);
      monitor.setNotificationService(mockService);
      monitor.start();

      pm.emit(normalSid, { type: 'session_exited' });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNotify).not.toHaveBeenCalled();

      monitor.stop();
    });

    it('does not alert when fewer than 3 prior executions exist', async () => {
      const mockNotify = mock(async () => ({ notificationId: 'n3', channels: [] }));
      const mockService = { notify: mockNotify } as never;

      const scheduleId3 = crypto.randomUUID();
      db.query(`
                INSERT INTO agent_schedules (id, agent_id, name, description, cron_expression, actions, status)
                VALUES (?, ?, 'New Schedule', 'Fewer than 3 prior', '0 11 * * *', '[]', 'active')
            `).run(scheduleId3, agentId);

      // Only 2 prior executions
      for (let i = 0; i < 2; i++) {
        const sid = crypto.randomUUID();
        db.query(`
                    INSERT INTO sessions (id, project_id, agent_id, name, status, total_cost_usd, total_turns)
                    VALUES (?, ?, ?, 'Prior Session', 'stopped', 0.05, 3)
                `).run(sid, projectId, agentId);
        const eid = crypto.randomUUID();
        db.query(`
                    INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, session_id, status, cost_usd, started_at, completed_at)
                    VALUES (?, ?, ?, 'work_task', '{}', ?, 'completed', 0.05, datetime('now', '-3 days'), datetime('now', '-3 days'))
                `).run(eid, scheduleId3, agentId, sid);
      }

      const highCostSid = crypto.randomUUID();
      db.query(`
                INSERT INTO sessions (id, project_id, agent_id, name, status, total_cost_usd, total_turns)
                VALUES (?, ?, ?, 'High Cost Session', 'stopped', 5.00, 100)
            `).run(highCostSid, projectId, agentId);

      const highCostExecId = crypto.randomUUID();
      db.query(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, session_id, status, cost_usd, started_at)
                VALUES (?, ?, ?, 'work_task', '{}', ?, 'completed', 0, datetime('now', '-5 minutes'))
            `).run(highCostExecId, scheduleId3, agentId, highCostSid);

      const pm = createMockProcessManager();
      const monitor = new UsageMonitor(db, pm as never);
      monitor.setNotificationService(mockService);
      monitor.start();

      pm.emit(highCostSid, { type: 'session_exited' });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNotify).not.toHaveBeenCalled();

      monitor.stop();
    });
  });

  describe('checkLongRunning', () => {
    it('sends alert for executions running longer than 30 minutes', async () => {
      const mockNotify = mock(async () => ({ notificationId: 'n4', channels: [] }));
      const mockService = { notify: mockNotify } as never;

      // Use an isolated schedule so other tests' executions don't bleed in
      const isolatedScheduleId = crypto.randomUUID();
      db.query(`
                INSERT INTO agent_schedules (id, agent_id, name, description, cron_expression, actions, status)
                VALUES (?, ?, 'Long Running Schedule', 'For long-running test', '0 1 * * *', '[]', 'active')
            `).run(isolatedScheduleId, agentId);

      const longExecId = crypto.randomUUID();
      db.query(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, status, started_at)
                VALUES (?, ?, ?, 'work_task', '{}', 'running', datetime('now', '-45 minutes'))
            `).run(longExecId, isolatedScheduleId, agentId);

      const pm = createMockProcessManager();
      const monitor = new UsageMonitor(db, pm as never);
      monitor.setNotificationService(mockService);

      // Call checkLongRunning directly (private method)
      (monitor as never as { checkLongRunning: () => void }).checkLongRunning();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNotify).toHaveBeenCalledTimes(1);
      const callArgs = (mockNotify.mock.calls[0] as unknown as [{ title: string; level: string; agentId: string }])[0];
      expect(callArgs.title).toBe('Long-Running Session');
      expect(callArgs.level).toBe('warning');
      expect(callArgs.agentId).toBe(agentId);
    });

    it('does not alert for short-running executions', async () => {
      const mockNotify = mock(async () => ({ notificationId: 'n5', channels: [] }));
      const mockService = { notify: mockNotify } as never;

      // Isolated schedule with only a short-running execution
      const isolatedScheduleId = crypto.randomUUID();
      db.query(`
                INSERT INTO agent_schedules (id, agent_id, name, description, cron_expression, actions, status)
                VALUES (?, ?, 'Short Running Schedule', 'For short-running test', '0 2 * * *', '[]', 'active')
            `).run(isolatedScheduleId, agentId);

      const shortExecId = crypto.randomUUID();
      db.query(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, status, started_at)
                VALUES (?, ?, ?, 'work_task', '{}', 'running', datetime('now', '-5 minutes'))
            `).run(shortExecId, isolatedScheduleId, agentId);

      const pm = createMockProcessManager();
      const monitor = new UsageMonitor(db, pm as never);
      monitor.setNotificationService(mockService);

      // Pre-alert the execution so the monitor ignores it (simulates it having been seen before)
      // Actually: just verify the short-running exec itself is not notified.
      // We do this by having the monitor only see this exec (isolated schedule).
      // The monitor scans ALL running execs, so we must mark old execs as completed.
      // Instead, use a fresh in-memory DB for this test.
      const freshDb = new Database(':memory:');
      freshDb.exec('PRAGMA foreign_keys = ON');
      const { runMigrations: runMig } = await import('../db/schema');
      runMig(freshDb);

      const fp = crypto.randomUUID();
      freshDb.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'FP', '/tmp')").run(fp);
      const fa = crypto.randomUUID();
      freshDb.query("INSERT INTO agents (id, name) VALUES (?, 'FA')").run(fa);
      const fs = crypto.randomUUID();
      freshDb
        .query(`
                INSERT INTO agent_schedules (id, agent_id, name, description, cron_expression, actions, status)
                VALUES (?, ?, 'FS', 'fs', '0 0 * * *', '[]', 'active')
            `)
        .run(fs, fa);

      const shortId = crypto.randomUUID();
      freshDb
        .query(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, status, started_at)
                VALUES (?, ?, ?, 'work_task', '{}', 'running', datetime('now', '-5 minutes'))
            `)
        .run(shortId, fs, fa);

      const freshPm = createMockProcessManager();
      const freshMonitor = new UsageMonitor(freshDb, freshPm as never);
      freshMonitor.setNotificationService(mockService);

      (freshMonitor as never as { checkLongRunning: () => void }).checkLongRunning();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNotify).not.toHaveBeenCalled();
      freshDb.close();
    });

    it('does not send duplicate alerts for the same execution', async () => {
      const mockNotify = mock(async () => ({ notificationId: 'n6', channels: [] }));
      const mockService = { notify: mockNotify } as never;

      // Use fresh DB for full isolation
      const freshDb = new Database(':memory:');
      freshDb.exec('PRAGMA foreign_keys = ON');
      const { runMigrations: runMig } = await import('../db/schema');
      runMig(freshDb);

      const fp = crypto.randomUUID();
      freshDb.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'FP2', '/tmp')").run(fp);
      const fa = crypto.randomUUID();
      freshDb.query("INSERT INTO agents (id, name) VALUES (?, 'FA2')").run(fa);
      const fs = crypto.randomUUID();
      freshDb
        .query(`
                INSERT INTO agent_schedules (id, agent_id, name, description, cron_expression, actions, status)
                VALUES (?, ?, 'FS2', 'dup test', '0 0 * * *', '[]', 'active')
            `)
        .run(fs, fa);

      const dupExecId = crypto.randomUUID();
      freshDb
        .query(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, status, started_at)
                VALUES (?, ?, ?, 'work_task', '{}', 'running', datetime('now', '-60 minutes'))
            `)
        .run(dupExecId, fs, fa);

      const pm = createMockProcessManager();
      const monitor = new UsageMonitor(freshDb, pm as never);
      monitor.setNotificationService(mockService);

      const checkFn = (monitor as never as { checkLongRunning: () => void }).checkLongRunning.bind(monitor);

      // Call twice — second call should be de-duped
      checkFn();
      checkFn();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNotify).toHaveBeenCalledTimes(1);
      freshDb.close();
    });

    it('skips alert when no notification service is set', async () => {
      const freshDb = new Database(':memory:');
      freshDb.exec('PRAGMA foreign_keys = ON');
      const { runMigrations: runMig } = await import('../db/schema');
      runMig(freshDb);

      const fa = crypto.randomUUID();
      freshDb.query("INSERT INTO agents (id, name) VALUES (?, 'FA-no-svc')").run(fa);
      const fs = crypto.randomUUID();
      freshDb
        .query(`
                INSERT INTO agent_schedules (id, agent_id, name, description, cron_expression, actions, status)
                VALUES (?, ?, 'FS-no-svc', 'no svc test', '0 0 * * *', '[]', 'active')
            `)
        .run(fs, fa);

      const longExecId = crypto.randomUUID();
      freshDb
        .query(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, status, started_at)
                VALUES (?, ?, ?, 'work_task', '{}', 'running', datetime('now', '-90 minutes'))
            `)
        .run(longExecId, fs, fa);

      const pm = createMockProcessManager();
      const monitor = new UsageMonitor(freshDb, pm as never);
      // No notification service set — should not throw

      expect(() => (monitor as never as { checkLongRunning: () => void }).checkLongRunning()).not.toThrow();
      freshDb.close();
    });
  });

  describe('getScheduleName', () => {
    it('returns the schedule name when found', () => {
      const pm = createMockProcessManager();
      const monitor = new UsageMonitor(db, pm as never);

      const name = (monitor as never as { getScheduleName: (id: string) => string }).getScheduleName(scheduleId);
      expect(name).toBe('Test Schedule');
    });

    it('falls back to schedule ID when not found', () => {
      const pm = createMockProcessManager();
      const monitor = new UsageMonitor(db, pm as never);

      const fakeId = crypto.randomUUID();
      const name = (monitor as never as { getScheduleName: (id: string) => string }).getScheduleName(fakeId);
      expect(name).toBe(fakeId);
    });
  });

  describe('sendAlert', () => {
    it('calls notify with correct parameters', async () => {
      const mockNotify = mock(async () => ({ notificationId: 'n7', channels: [] }));
      const mockService = { notify: mockNotify } as never;

      const pm = createMockProcessManager();
      const monitor = new UsageMonitor(db, pm as never);
      monitor.setNotificationService(mockService);

      type SendAlertFn = (scheduleId: string, title: string, message: string, level: string) => void;
      (monitor as never as { sendAlert: SendAlertFn }).sendAlert(
        scheduleId,
        'Test Alert',
        'Test message body',
        'warning',
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNotify).toHaveBeenCalledTimes(1);
      const args = (
        mockNotify.mock.calls[0] as unknown as [{ agentId: string; title: string; message: string; level: string }]
      )[0];
      expect(args.agentId).toBe(agentId);
      expect(args.title).toBe('Test Alert');
      expect(args.message).toBe('Test message body');
      expect(args.level).toBe('warning');
    });

    it('skips notify when notification service is not set', async () => {
      const pm = createMockProcessManager();
      const monitor = new UsageMonitor(db, pm as never);
      // No setNotificationService called

      type SendAlertFn = (scheduleId: string, title: string, message: string, level: string) => void;
      expect(() =>
        (monitor as never as { sendAlert: SendAlertFn }).sendAlert(scheduleId, 'No Service', 'Should not send', 'info'),
      ).not.toThrow();
    });

    it('skips notify when schedule does not exist', async () => {
      const mockNotify = mock(async () => ({ notificationId: 'n8', channels: [] }));
      const mockService = { notify: mockNotify } as never;

      const pm = createMockProcessManager();
      const monitor = new UsageMonitor(db, pm as never);
      monitor.setNotificationService(mockService);

      type SendAlertFn = (scheduleId: string, title: string, message: string, level: string) => void;
      (monitor as never as { sendAlert: SendAlertFn }).sendAlert(
        crypto.randomUUID(), // non-existent schedule
        'Missing Schedule',
        'Should not send',
        'error',
      );

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockNotify).not.toHaveBeenCalled();
    });
  });
});
