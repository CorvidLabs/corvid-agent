import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { runMigrations } from '../db/schema';
import { handleDashboardRoutes } from '../routes/dashboard';

let db: Database;

function fakeReq(method: string, path: string): { req: Request; url: URL } {
  const url = new URL(`http://localhost:3000${path}`);
  return { req: new Request(url.toString(), { method }), url };
}

beforeAll(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);

  // Seed projects and agents
  const projId = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  const agentId2 = crypto.randomUUID();
  db.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'DashProject', '/tmp')").run(projId);
  db.query("INSERT INTO agents (id, name) VALUES (?, 'Agent1')").run(agentId);
  db.query("INSERT INTO agents (id, name) VALUES (?, 'Agent2')").run(agentId2);

  // Sessions: 2 running, 1 completed, 1 idle
  const statuses = ['running', 'running', 'completed', 'idle'];
  for (const status of statuses) {
    db.query("INSERT INTO sessions (id, project_id, agent_id, status, source) VALUES (?, ?, ?, ?, 'web')").run(
      crypto.randomUUID(),
      projId,
      agentId,
      status,
    );
  }

  // Council + launch (one active, one complete)
  const councilId = crypto.randomUUID();
  db.query("INSERT INTO councils (id, name, chairman_agent_id) VALUES (?, 'TestCouncil', ?)").run(councilId, agentId);
  db.query(
    "INSERT INTO council_launches (id, council_id, project_id, prompt, stage) VALUES (?, ?, ?, 'test', 'responding')",
  ).run(crypto.randomUUID(), councilId, projId);
  db.query(
    "INSERT INTO council_launches (id, council_id, project_id, prompt, stage) VALUES (?, ?, ?, 'done', 'complete')",
  ).run(crypto.randomUUID(), councilId, projId);

  // Work tasks: 2 pending, 1 running, 1 completed
  const wtStatuses = ['pending', 'pending', 'running', 'completed'];
  for (const status of wtStatuses) {
    db.query("INSERT INTO work_tasks (id, agent_id, project_id, description, status) VALUES (?, ?, ?, 'task', ?)").run(
      crypto.randomUUID(),
      agentId,
      projId,
      status,
    );
  }

  // Audit log entries
  for (let i = 0; i < 5; i++) {
    db.query("INSERT INTO audit_log (action, actor, resource_type, resource_id) VALUES (?, 'system', 'agent', ?)").run(
      'agent_create',
      agentId,
    );
  }
});

afterAll(() => db.close());

describe('Dashboard Summary Routes', () => {
  it('GET /api/dashboard/summary returns aggregated data', async () => {
    const { req, url } = fakeReq('GET', '/api/dashboard/summary');
    const res = handleDashboardRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);

    const data = await res!.json();

    // Agents
    expect(data.agents.total).toBe(2);

    // Sessions
    expect(data.sessions.active).toBe(2);
    expect(data.sessions.byStatus.running).toBe(2);
    expect(data.sessions.byStatus.completed).toBe(1);
    expect(data.sessions.byStatus.idle).toBe(1);

    // Councils
    expect(data.councils.active).toBe(1); // 1 responding, 1 complete

    // Work tasks
    expect(data.workTasks.total).toBe(4);
    expect(data.workTasks.byStatus.pending).toBe(2);
    expect(data.workTasks.byStatus.running).toBe(1);
    expect(data.workTasks.byStatus.completed).toBe(1);

    // Recent activity
    expect(Array.isArray(data.recentActivity)).toBe(true);
    expect(data.recentActivity.length).toBe(5);
    expect(data.recentActivity[0].action).toBe('agent_create');
  });

  it('respects activityLimit parameter', async () => {
    const { req, url } = fakeReq('GET', '/api/dashboard/summary?activityLimit=2');
    const res = handleDashboardRoutes(req, url, db);
    const data = await res!.json();
    expect(data.recentActivity.length).toBe(2);
  });

  it('clamps activityLimit to valid range', async () => {
    const { req, url } = fakeReq('GET', '/api/dashboard/summary?activityLimit=999');
    const res = handleDashboardRoutes(req, url, db);
    const data = await res!.json();
    // Should be clamped to 100, but we only have 5 entries
    expect(data.recentActivity.length).toBe(5);
  });

  it('returns null for unmatched paths', () => {
    const { req, url } = fakeReq('GET', '/api/other');
    expect(handleDashboardRoutes(req, url, db)).toBeNull();
  });

  it('returns null for non-GET methods', () => {
    const { req, url } = fakeReq('POST', '/api/dashboard/summary');
    expect(handleDashboardRoutes(req, url, db)).toBeNull();
  });
});
