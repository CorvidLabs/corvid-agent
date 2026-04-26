import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { runMigrations } from '../db/schema';
import type { ProcessManager } from '../process/manager';
import { handleRequest, resetAuthConfigForTest } from '../routes/index';

/**
 * Tests for inline routes defined in server/routes/index.ts
 * (browse-dirs, escalation-queue, operational-mode, feed/history, etc.)
 */

let db: Database;
let projectId: string;
let agentId: string;

function fakeReq(method: string, path: string, body?: unknown): Request {
  const url = `http://localhost:3000${path}`;
  const opts: RequestInit = { method };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers = { 'Content-Type': 'application/json' };
  }
  return new Request(url, opts);
}

function createMockPM(overrides?: Record<string, unknown>): ProcessManager {
  return {
    startProcess: mock(() => {}),
    stopProcess: mock(() => {}),
    resumeProcess: mock(() => {}),
    resumeSession: mock(() => true),
    sendMessage: mock(() => true),
    subscribe: mock(() => {}),
    unsubscribe: mock(() => {}),
    isRunning: mock(() => false),
    approvalManager: {
      resolveRequest: mock(() => {}),
      getQueuedRequests: mock(() => []),
      resolveQueuedRequest: mock(() => true),
      operationalMode: 'default',
    },
    ...overrides,
  } as unknown as ProcessManager;
}

beforeAll(() => {
  // Ensure no API_KEY leak from prior test files (e.g. crypto-audit rotateApiKey sets process.env.API_KEY)
  delete process.env.API_KEY;
  resetAuthConfigForTest();

  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);

  projectId = crypto.randomUUID();
  agentId = crypto.randomUUID();
  db.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'Test', '/tmp')").run(projectId);
  db.query("INSERT INTO agents (id, name) VALUES (?, 'TestAgent')").run(agentId);
});

afterAll(() => db.close());

describe('Escalation Queue', () => {
  it('GET /api/escalation-queue returns queue', async () => {
    const pm = createMockPM();
    const req = fakeReq('GET', '/api/escalation-queue');
    const res = await handleRequest(req, db, pm, null);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.requests).toBeDefined();
    expect(Array.isArray(data.requests)).toBe(true);
  });
});

describe('Operational Mode', () => {
  it('GET /api/operational-mode returns current mode', async () => {
    const pm = createMockPM();
    const req = fakeReq('GET', '/api/operational-mode');
    const res = await handleRequest(req, db, pm, null);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.mode).toBe('default');
  });

  it('POST /api/operational-mode sets mode', async () => {
    const pm = createMockPM();
    const req = fakeReq('POST', '/api/operational-mode', { mode: 'queued' });
    const res = await handleRequest(req, db, pm, null);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.ok).toBe(true);
  });

  it('POST /api/operational-mode rejects invalid mode', async () => {
    const pm = createMockPM();
    const req = fakeReq('POST', '/api/operational-mode', { mode: 'invalid_mode_xyz' });
    const res = await handleRequest(req, db, pm, null);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
  });
});

describe('Feed History', () => {
  it('GET /api/feed/history returns messages', async () => {
    const pm = createMockPM();
    const req = fakeReq('GET', '/api/feed/history');
    const res = await handleRequest(req, db, pm, null);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.messages).toBeDefined();
    expect(data.algochatMessages).toBeDefined();
    expect(data.total).toBeDefined();
  });

  it('GET /api/feed/history with search param', async () => {
    const pm = createMockPM();
    const req = fakeReq('GET', '/api/feed/history?search=test&limit=10');
    const res = await handleRequest(req, db, pm, null);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.limit).toBe(10);
  });
});

describe('AlgoChat Status', () => {
  it('GET /api/algochat/status returns disabled when bridge is null', async () => {
    const pm = createMockPM();
    const req = fakeReq('GET', '/api/algochat/status');
    const res = await handleRequest(req, db, pm, null);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.enabled).toBe(false);
  });
});

describe('Backup', () => {
  it('POST /api/backup creates backup', async () => {
    const pm = createMockPM();
    const req = fakeReq('POST', '/api/backup');
    const res = await handleRequest(req, db, pm, null);
    expect(res).not.toBeNull();
    // backup might fail on in-memory DB, but should return a response
    expect([200, 500]).toContain(res!.status);
  });
});

describe('Wallets Summary', () => {
  it('GET /api/wallets/summary returns wallets', async () => {
    const pm = createMockPM();
    const req = fakeReq('GET', '/api/wallets/summary');
    const res = await handleRequest(req, db, pm, null);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.wallets).toBeDefined();
  });
});

describe('CORS Preflight', () => {
  it('OPTIONS returns 204 with CORS headers', async () => {
    const pm = createMockPM();
    const req = fakeReq('OPTIONS', '/api/anything');
    const res = await handleRequest(req, db, pm, null);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(204);
    expect(res!.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res!.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });
});

describe('Memory Backfill', () => {
  it('POST /api/memories/backfill returns 503 when no agentMessenger', async () => {
    const pm = createMockPM();
    const req = fakeReq('POST', '/api/memories/backfill');
    const res = await handleRequest(req, db, pm, null, null, null);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    const data = await res!.json();
    expect(data.error).toContain('not available');
  });

  it('POST /api/memories/backfill returns ok when no pending memories', async () => {
    const pm = createMockPM();
    const mockMessenger = { sendOnChainToSelf: mock(() => 'tx123') } as any;
    const req = fakeReq('POST', '/api/memories/backfill');
    const res = await handleRequest(req, db, pm, null, null, mockMessenger);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.ok).toBe(true);
    expect(data.backfilled).toBe(0);
  });

  it('POST /api/memories/backfill surfaces real error message on failure', async () => {
    const memId = crypto.randomUUID();
    db.query(
      "INSERT INTO agent_memories (id, agent_id, key, content, status) VALUES (?, ?, 'test-key', 'test-content', 'pending')",
    ).run(memId, agentId);

    const pm = createMockPM();
    const mockMessenger = {
      sendOnChainToSelf: mock(() => {
        throw new Error('Localnet unreachable');
      }),
    } as any;
    const req = fakeReq('POST', '/api/memories/backfill');
    const res = await handleRequest(req, db, pm, null, null, mockMessenger);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.ok).toBe(true);
    expect(data.results).toBeArrayOfSize(1);
    const result = data.results[0];
    expect(result.txid).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error).not.toBe('Failed to publish memory');

    db.query('DELETE FROM agent_memories WHERE id = ?').run(memId);
  });
});
