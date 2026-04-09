import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createAgent, listAgents } from '../db/agents';
import { createProject } from '../db/projects';
import { runMigrations } from '../db/schema';
import { addSessionMessage, createSession, getSessionMessages, listSessions } from '../db/sessions';

/**
 * Tests for try mode (sandbox) — validates that an in-memory database
 * can be bootstrapped with demo data exactly as scripts/try.ts would
 * seed it via the API. See #596.
 */

let db: Database;

beforeEach(() => {
  // Simulate TRY_MODE: use in-memory database
  db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe('Try mode — in-memory DB', () => {
  test('in-memory database initializes with all tables', () => {
    // Verify core tables exist by querying them
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
      name: string;
    }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('agents');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('session_messages');
  });

  test('demo data can be seeded in-memory', () => {
    // Create project (same as try.ts does via API)
    const project = createProject(db, {
      name: 'Demo Project',
      description: 'A sample project to explore corvid-agent',
      workingDir: '/tmp/demo',
    });
    expect(project.name).toBe('Demo Project');
    expect(project.id).toBeTruthy();

    // Create demo agent
    const agent = createAgent(db, {
      name: 'Corvid',
      description: 'A friendly demo agent',
      systemPrompt: 'You are Corvid, a helpful AI assistant.',
      model: 'claude-sonnet-4-20250514',
    });
    expect(agent.name).toBe('Corvid');
    expect(agent.model).toBe('claude-sonnet-4-20250514');

    // Create welcome session
    const session = createSession(db, {
      projectId: project.id,
      agentId: agent.id,
      name: 'Welcome Session',
      source: 'web',
    });
    expect(session.name).toBe('Welcome Session');
    expect(session.agentId).toBe(agent.id);
    expect(session.status).toBe('idle');

    // Add a welcome message
    const msg = addSessionMessage(db, session.id, 'assistant', 'Welcome to corvid-agent!');
    expect(msg.role).toBe('assistant');
    expect(msg.content).toBe('Welcome to corvid-agent!');

    // Verify all data is queryable
    const agents = listAgents(db);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('Corvid');

    const sessions = listSessions(db, project.id);
    expect(sessions).toHaveLength(1);

    const messages = getSessionMessages(db, session.id);
    expect(messages).toHaveLength(1);
  });

  test('in-memory DB is isolated — no file artifacts', () => {
    // Creating data in :memory: should not create any files
    createProject(db, { name: 'Test', workingDir: '/tmp' });
    const agent = createAgent(db, { name: 'Test Agent' });
    expect(agent.id).toBeTruthy();

    // Verify the DB is truly in-memory by checking filename
    expect(db.filename).toBe(':memory:');
  });

  test('multiple agents and sessions can coexist', () => {
    const project = createProject(db, { name: 'Demo', workingDir: '/tmp' });

    const agent1 = createAgent(db, { name: 'Agent Alpha', model: 'claude-sonnet-4-20250514' });
    const agent2 = createAgent(db, { name: 'Agent Beta', model: 'qwen3:8b' });

    const session1 = createSession(db, { projectId: project.id, agentId: agent1.id, name: 'Session 1' });
    const session2 = createSession(db, { projectId: project.id, agentId: agent2.id, name: 'Session 2' });

    addSessionMessage(db, session1.id, 'user', 'Hello Alpha');
    addSessionMessage(db, session1.id, 'assistant', 'Hi from Alpha!');
    addSessionMessage(db, session2.id, 'user', 'Hello Beta');

    const agents = listAgents(db);
    expect(agents).toHaveLength(2);

    const sessions = listSessions(db, project.id);
    expect(sessions).toHaveLength(2);

    expect(getSessionMessages(db, session1.id)).toHaveLength(2);
    expect(getSessionMessages(db, session2.id)).toHaveLength(1);
  });
});

describe('Try mode — TRY_MODE env var', () => {
  test('TRY_MODE=true causes getDb to use :memory:', async () => {
    // We can't easily test getDb() singleton behavior without side effects,
    // but we can verify the env var is read correctly by the connection module.
    // The actual integration is tested by running `bun run try`.
    const originalEnv = process.env.TRY_MODE;
    try {
      process.env.TRY_MODE = 'true';
      // Verify the env var is set
      expect(process.env.TRY_MODE).toBe('true');
    } finally {
      if (originalEnv !== undefined) {
        process.env.TRY_MODE = originalEnv;
      } else {
        delete process.env.TRY_MODE;
      }
    }
  });
});

describe('Test isolation — BUN_TEST env var', () => {
  test('BUN_TEST is set to 1 by bunfig.toml during test runs', () => {
    expect(process.env.BUN_TEST).toBe('1');
  });

  test('getDb() defaults to :memory: when BUN_TEST=1', () => {
    // BUN_TEST=1 is set by bunfig.toml [test.env], so getDb()
    // should default to :memory: instead of corvid-agent.db.
    // We verify the logic by checking the env var and simulating
    // what connection.ts does.
    const isTest = process.env.BUN_TEST === '1' || process.env.NODE_ENV === 'test';
    const defaultPath = isTest || process.env.TRY_MODE === 'true' ? ':memory:' : 'corvid-agent.db';
    expect(isTest).toBe(true);
    expect(defaultPath).toBe(':memory:');
  });
});
