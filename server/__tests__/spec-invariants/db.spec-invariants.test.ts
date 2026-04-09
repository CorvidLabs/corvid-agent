/**
 * Spec invariant tests for db/* modules.
 *
 * Covers: projects-db, work-tasks-db, agents-db
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createAgent, deleteAgent, getAgent, listAgents } from '../../db/agents';
import { createProject, deleteProject } from '../../db/projects';
import { runMigrations } from '../../db/schema';
import { createWorkTask, createWorkTaskAtomic, updateWorkTaskStatus } from '../../db/work-tasks';

const TENANT_ID = 'default';

// ── projects-db invariants ─────────────────────────────────────────────────

describe('projects-db invariants', () => {
  let db: Database;
  let agentId: string; // used for session FK tests

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    const agent = createAgent(db, { name: 'TestAgent', model: 'claude-sonnet-4-6', systemPrompt: 'test' });
    agentId = agent.id;
  });

  afterEach(() => {
    db.close();
  });

  it('spec: createProject generates a UUID primary key', () => {
    const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('spec: cascade deletion — deleteProject removes associated sessions', () => {
    const project = createProject(db, { name: 'CascadeTest', workingDir: '/tmp/cascade' });
    // Insert a session for this project
    db.query(`INSERT INTO sessions (id, name, project_id, agent_id, status, source)
            VALUES ('sess-cascade', 'Test', ?, ?, 'idle', 'web')`).run(project.id, agentId);

    const sessionBefore = db.query(`SELECT id FROM sessions WHERE id = 'sess-cascade'`).get();
    expect(sessionBefore).toBeTruthy();

    deleteProject(db, project.id, TENANT_ID);

    const sessionAfter = db.query(`SELECT id FROM sessions WHERE id = 'sess-cascade'`).get();
    expect(sessionAfter).toBeNull();
  });

  it('spec: UUID primary key is unique per createProject call', () => {
    const proj1 = createProject(db, { name: 'Proj-A', workingDir: '/tmp/a' });
    const proj2 = createProject(db, { name: 'Proj-B', workingDir: '/tmp/b' });
    expect(proj1.id).not.toBe(proj2.id);
    expect(proj1.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(proj2.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

// ── work-tasks-db invariants ───────────────────────────────────────────────

describe('work-tasks-db invariants', () => {
  let db: Database;
  let agentId: string;
  let projectId: string;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    const agent = createAgent(db, { name: 'TestAgent', model: 'claude-sonnet-4-6', systemPrompt: 'test' });
    agentId = agent.id;
    const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
    projectId = project.id;
  });

  afterEach(() => {
    db.close();
  });

  it('spec: createWorkTask — UUID primary key generated', () => {
    const task = createWorkTask(db, { agentId, projectId, description: 'Fix bug' });
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('spec: createWorkTask — default status is "pending"', () => {
    const task = createWorkTask(db, { agentId, projectId, description: 'Fix bug' });
    expect(task.status).toBe('pending');
  });

  it('spec: createWorkTask — source defaults to "web"', () => {
    const task = createWorkTask(db, { agentId, projectId, description: 'Fix bug' });
    expect(task.source).toBe('web');
  });

  it('spec: createWorkTaskAtomic — returns null when active task exists on same project', () => {
    // Create a running task
    const existing = createWorkTask(db, { agentId, projectId, description: 'Running task' });
    updateWorkTaskStatus(db, existing.id, 'running');

    const blocked = createWorkTaskAtomic(db, { agentId, projectId, description: 'New task' });
    expect(blocked).toBeNull();
  });

  it('spec: updateWorkTaskStatus — completed_at set when status is "completed"', () => {
    const task = createWorkTask(db, { agentId, projectId, description: 'Test task' });
    updateWorkTaskStatus(db, task.id, 'completed');
    const row = db.query(`SELECT completed_at FROM work_tasks WHERE id = ?`).get(task.id) as {
      completed_at: string | null;
    };
    expect(row.completed_at).not.toBeNull();
  });

  it('spec: updateWorkTaskStatus — completed_at set when status is "failed"', () => {
    const task = createWorkTask(db, { agentId, projectId, description: 'Test task' });
    updateWorkTaskStatus(db, task.id, 'failed', { error: 'Something went wrong' });
    const row = db.query(`SELECT completed_at FROM work_tasks WHERE id = ?`).get(task.id) as {
      completed_at: string | null;
    };
    expect(row.completed_at).not.toBeNull();
  });

  it('spec: valid work task statuses include all lifecycle states', () => {
    const validStatuses = ['pending', 'queued', 'branching', 'running', 'validating', 'paused', 'completed', 'failed'];
    for (const status of validStatuses) {
      const task = createWorkTask(db, { agentId, projectId, description: `Task with status ${status}` });
      // All statuses can be set without throwing
      expect(() =>
        updateWorkTaskStatus(db, task.id, status as Parameters<typeof updateWorkTaskStatus>[2]),
      ).not.toThrow();
    }
  });
});

// ── agents-db invariants ───────────────────────────────────────────────────

describe('agents-db invariants', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('spec: createAgent generates a UUID primary key', () => {
    const agent = createAgent(db, { name: 'TestAgent', model: 'claude-sonnet-4-6', systemPrompt: 'You are helpful.' });
    expect(agent.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('spec: getAgent returns null for unknown id', () => {
    const result = getAgent(db, 'nonexistent-id');
    expect(result).toBeNull();
  });

  it('spec: deleteAgent removes the agent from listAgents', () => {
    const agent = createAgent(db, { name: 'ToDelete', model: 'claude-sonnet-4-6', systemPrompt: 'test' });
    deleteAgent(db, agent.id);
    const agents = listAgents(db);
    expect(agents.find((a) => a.id === agent.id)).toBeUndefined();
  });
});
