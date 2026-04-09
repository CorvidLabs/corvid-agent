import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { runMigrations } from '../db/schema';
import type { RequestContext } from '../middleware/guards';
import { handleBuddyRoutes } from '../routes/buddy';

let db: Database;
let agent1Id: string;
let agent2Id: string;

const ctx: RequestContext = {
  tenantId: 'default',
  authenticated: true,
  tenantRole: 'owner',
};

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
  const url = new URL(`http://localhost:3000${path}`);
  const opts: RequestInit = { method };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers = { 'Content-Type': 'application/json' };
  }
  return { req: new Request(url.toString(), opts), url };
}

beforeAll(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);

  agent1Id = crypto.randomUUID();
  agent2Id = crypto.randomUUID();
  db.query("INSERT INTO agents (id, name, tenant_id) VALUES (?, 'Lead Agent', 'default')").run(agent1Id);
  db.query("INSERT INTO agents (id, name, tenant_id) VALUES (?, 'Buddy Agent', 'default')").run(agent2Id);
});

afterAll(() => db.close());

describe('Buddy Routes', () => {
  it('GET /api/agents/:id/buddy-pairings returns empty list for new agent', async () => {
    const { req, url } = fakeReq('GET', `/api/agents/${agent1Id}/buddy-pairings`);
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it('GET /api/agents/nonexistent/buddy-pairings returns 404', async () => {
    const { req, url } = fakeReq('GET', '/api/agents/nonexistent-id/buddy-pairings');
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res!.status).toBe(404);
  });

  let pairingId: string;

  it('POST /api/agents/:id/buddy-pairings creates a pairing', async () => {
    const { req, url } = fakeReq('POST', `/api/agents/${agent1Id}/buddy-pairings`, {
      buddyAgentId: agent2Id,
      buddyRole: 'reviewer',
      maxRounds: 3,
    });
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(201);
    const data = await res!.json();
    expect(data.agentId).toBe(agent1Id);
    expect(data.buddyAgentId).toBe(agent2Id);
    expect(data.buddyRole).toBe('reviewer');
    expect(data.maxRounds).toBe(3);
    expect(data.id).toBeDefined();
    pairingId = data.id;
  });

  it('POST /api/agents/:id/buddy-pairings with self returns 400', async () => {
    const { req, url } = fakeReq('POST', `/api/agents/${agent1Id}/buddy-pairings`, {
      buddyAgentId: agent1Id,
    });
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res!.status).toBe(400);
  });

  it('POST /api/agents/:id/buddy-pairings with nonexistent buddy returns 404', async () => {
    const { req, url } = fakeReq('POST', `/api/agents/${agent1Id}/buddy-pairings`, {
      buddyAgentId: 'nonexistent-buddy',
    });
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res!.status).toBe(404);
  });

  it('POST /api/agents/:id/buddy-pairings with invalid buddyRole returns 400', async () => {
    const agent3Id = crypto.randomUUID();
    db.query("INSERT INTO agents (id, name, tenant_id) VALUES (?, 'Extra Agent', 'default')").run(agent3Id);
    const { req, url } = fakeReq('POST', `/api/agents/${agent1Id}/buddy-pairings`, {
      buddyAgentId: agent3Id,
      buddyRole: 'invalid-role',
    });
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res!.status).toBe(400);
  });

  it('GET /api/buddy-pairings/:id returns the pairing', async () => {
    const { req, url } = fakeReq('GET', `/api/buddy-pairings/${pairingId}`);
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.id).toBe(pairingId);
  });

  it('GET /api/buddy-pairings/:id returns 404 for missing pairing', async () => {
    const { req, url } = fakeReq('GET', '/api/buddy-pairings/nonexistent-id');
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res!.status).toBe(404);
  });

  it('PUT /api/buddy-pairings/:id updates the pairing', async () => {
    const { req, url } = fakeReq('PUT', `/api/buddy-pairings/${pairingId}`, {
      buddyRole: 'collaborator',
      maxRounds: 5,
    });
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.buddyRole).toBe('collaborator');
    expect(data.maxRounds).toBe(5);
  });

  it('PUT /api/buddy-pairings/:id with invalid buddyRole returns 400', async () => {
    const { req, url } = fakeReq('PUT', `/api/buddy-pairings/${pairingId}`, {
      buddyRole: 'not-a-role',
    });
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res!.status).toBe(400);
  });

  it('GET /api/buddy-sessions returns list (initially empty)', async () => {
    const { req, url } = fakeReq('GET', '/api/buddy-sessions');
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /api/buddy-sessions?leadAgentId= filters by agent', async () => {
    const { req, url } = fakeReq('GET', `/api/buddy-sessions?leadAgentId=${agent1Id}`);
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /api/buddy-sessions/:id returns 404 for nonexistent session', async () => {
    const { req, url } = fakeReq('GET', '/api/buddy-sessions/nonexistent-id');
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res!.status).toBe(404);
  });

  it('GET /api/buddy-sessions/:id/messages returns 404 for nonexistent session', async () => {
    const { req, url } = fakeReq('GET', '/api/buddy-sessions/nonexistent-id/messages');
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res!.status).toBe(404);
  });

  it('DELETE /api/buddy-pairings/:id removes the pairing', async () => {
    const { req, url } = fakeReq('DELETE', `/api/buddy-pairings/${pairingId}`);
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.ok).toBe(true);
  });

  it('GET /api/buddy-pairings/:id returns 404 after deletion', async () => {
    const { req, url } = fakeReq('GET', `/api/buddy-pairings/${pairingId}`);
    const res = await handleBuddyRoutes(req, url, db, ctx);
    expect(res!.status).toBe(404);
  });

  it('GET /api/agents/:id/buddy-pairings returns empty after deletion', async () => {
    const { req, url } = fakeReq('GET', `/api/agents/${agent1Id}/buddy-pairings`);
    const res = await handleBuddyRoutes(req, url, db, ctx);
    const data = await res!.json();
    expect(data.length).toBe(0);
  });

  it('returns null for unmatched routes', () => {
    const { req, url } = fakeReq('POST', '/api/buddy-pairings/abc');
    const res = handleBuddyRoutes(req, url, db, ctx);
    expect(res).toBeNull();
  });
});
