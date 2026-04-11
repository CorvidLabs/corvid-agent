import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { runMigrations } from '../db/schema';
import { ensureMemorySchema } from '../memory/schema';
import { handleBrainViewerRoutes } from '../routes/brain-viewer';

let db: Database;

function fakeReq(method: string, path: string): { req: Request; url: URL } {
  const url = new URL(`http://localhost:3000${path}`);
  return { req: new Request(url.toString(), { method }), url };
}

/** Resolve the potentially-async result from handleBrainViewerRoutes */
async function callRoutes(method: string, path: string): Promise<Response | null> {
  const { req, url } = fakeReq(method, path);
  const result = handleBrainViewerRoutes(req, url, db);
  return result instanceof Promise ? await result : result;
}

const agentId1 = crypto.randomUUID();
const agentId2 = crypto.randomUUID();
const memoryIds = {
  confirmed1: crypto.randomUUID(),
  confirmed2: crypto.randomUUID(),
  pending1: crypto.randomUUID(),
  pending2: crypto.randomUUID(),
  failed1: crypto.randomUUID(),
};

beforeAll(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  ensureMemorySchema(db);

  // Seed agents
  db.query("INSERT INTO agents (id, name) VALUES (?, 'Agent Alpha')").run(agentId1);
  db.query("INSERT INTO agents (id, name) VALUES (?, 'Agent Beta')").run(agentId2);

  // Seed memories for agent 1
  // 2 confirmed (longterm) with txids
  db.query(
    `INSERT INTO agent_memories (id, agent_id, key, content, status, txid) VALUES (?, ?, 'api-preferences', 'prefers REST over GraphQL', 'confirmed', 'TXID_AAA')`,
  ).run(memoryIds.confirmed1, agentId1);
  db.query(
    `INSERT INTO agent_memories (id, agent_id, key, content, status, txid) VALUES (?, ?, 'deploy-process', 'always run tests before deploy', 'confirmed', 'TXID_BBB')`,
  ).run(memoryIds.confirmed2, agentId1);

  // 2 pending (shortterm)
  db.query(
    `INSERT INTO agent_memories (id, agent_id, key, content, status) VALUES (?, ?, 'team-contacts', 'Leif is the lead', 'pending')`,
  ).run(memoryIds.pending1, agentId1);
  db.query(
    `INSERT INTO agent_memories (id, agent_id, key, content, status) VALUES (?, ?, 'project-notes', 'v1.0.0 target date TBD', 'pending')`,
  ).run(memoryIds.pending2, agentId1);

  // 1 failed (shortterm)
  db.query(
    `INSERT INTO agent_memories (id, agent_id, key, content, status) VALUES (?, ?, 'old-config', 'deprecated settings', 'failed')`,
  ).run(memoryIds.failed1, agentId1);

  // Seed memory for agent 2
  const mem2Id = crypto.randomUUID();
  db.query(
    `INSERT INTO agent_memories (id, agent_id, key, content, status, txid) VALUES (?, ?, 'greeting', 'hello world', 'confirmed', 'TXID_CCC')`,
  ).run(mem2Id, agentId2);

  // Seed categories for some memories
  db.query(`INSERT INTO memory_categories (memory_id, category, confidence) VALUES (?, 'config', 0.8)`).run(
    memoryIds.confirmed1,
  );
  db.query(`INSERT INTO memory_categories (memory_id, category, confidence) VALUES (?, 'project', 0.9)`).run(
    memoryIds.confirmed2,
  );
  db.query(`INSERT INTO memory_categories (memory_id, category, confidence) VALUES (?, 'person', 0.7)`).run(
    memoryIds.pending1,
  );
});

afterAll(() => db.close());

describe('Brain Viewer Routes', () => {
  // ── Route matching ──────────────────────────────────────────────────

  it('returns null for non-matching paths', async () => {
    expect(await callRoutes('GET', '/api/other')).toBeNull();
  });

  it('returns null for non-GET/POST methods', async () => {
    expect(await callRoutes('PUT', '/api/dashboard/memories')).toBeNull();
  });

  // ── GET /api/dashboard/memories ─────────────────────────────────────

  describe('GET /api/dashboard/memories', () => {
    it('returns all memories with correct tier derivation', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories?agentId=${agentId1}`);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(data.total).toBe(5);
      expect(data.entries.length).toBe(5);
      expect(data.limit).toBe(50);
      expect(data.offset).toBe(0);

      // Check tier derivation
      const longterm = data.entries.filter((e: { tier: string }) => e.tier === 'longterm');
      const shortterm = data.entries.filter((e: { tier: string }) => e.tier === 'shortterm');
      expect(longterm.length).toBe(2);
      expect(shortterm.length).toBe(3);
    });

    it('filters by tier=longterm', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories?agentId=${agentId1}&tier=longterm`);
      const data = await res!.json();
      expect(data.total).toBe(2);
      expect(data.entries.every((e: { tier: string }) => e.tier === 'longterm')).toBe(true);
    });

    it('filters by tier=shortterm', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories?agentId=${agentId1}&tier=shortterm`);
      const data = await res!.json();
      expect(data.total).toBe(3);
      expect(data.entries.every((e: { tier: string }) => e.tier === 'shortterm')).toBe(true);
    });

    it('filters by status', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories?agentId=${agentId1}&status=pending`);
      const data = await res!.json();
      expect(data.total).toBe(2);
      expect(data.entries.every((e: { status: string }) => e.status === 'pending')).toBe(true);
    });

    it('filters by category', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories?agentId=${agentId1}&category=config`);
      const data = await res!.json();
      expect(data.total).toBe(1);
      expect(data.entries[0].category).toBe('config');
    });

    it('paginates correctly', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories?agentId=${agentId1}&limit=2&offset=0`);
      const data = await res!.json();
      expect(data.entries.length).toBe(2);
      expect(data.total).toBe(5);
      expect(data.limit).toBe(2);
      expect(data.offset).toBe(0);
    });

    it('clamps limit to MAX_LIMIT (200)', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories?limit=999`);
      const data = await res!.json();
      expect(data.limit).toBe(200);
    });

    it('rejects invalid tier', async () => {
      const res = await callRoutes('GET', '/api/dashboard/memories?tier=invalid');
      expect(res!.status).toBe(400);
    });

    it('rejects invalid status', async () => {
      const res = await callRoutes('GET', '/api/dashboard/memories?status=bogus');
      expect(res!.status).toBe(400);
    });

    it('returns empty array for agent with no memories', async () => {
      const noMemAgent = crypto.randomUUID();
      const res = await callRoutes('GET', `/api/dashboard/memories?agentId=${noMemAgent}`);
      const data = await res!.json();
      expect(data.entries).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('enriches entries with category and decay score', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories?agentId=${agentId1}`);
      const data = await res!.json();

      const configEntry = data.entries.find((e: { key: string }) => e.key === 'api-preferences');
      expect(configEntry.category).toBe('config');
      expect(configEntry.categoryConfidence).toBe(0.8);
      expect(typeof configEntry.decayScore).toBe('number');
      expect(configEntry.decayScore).toBeGreaterThan(0);
      expect(configEntry.decayScore).toBeLessThanOrEqual(1.0);

      // Entry without category should have null
      const failedEntry = data.entries.find((e: { key: string }) => e.key === 'old-config');
      expect(failedEntry.category).toBeNull();
      expect(failedEntry.categoryConfidence).toBeNull();
    });

    it('searches with LIKE fallback', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories?search=deploy`);
      const data = await res!.json();
      expect(data.entries.length).toBeGreaterThanOrEqual(1);
      const keys = data.entries.map((e: { key: string }) => e.key);
      expect(keys).toContain('deploy-process');
    });

    it('returns all agents memories when no agentId', async () => {
      const res = await callRoutes('GET', '/api/dashboard/memories');
      const data = await res!.json();
      // 5 from agent1 + 1 from agent2 = 6
      expect(data.total).toBe(6);
    });
  });

  // ── GET /api/dashboard/memories/stats ────────────────────────────────

  describe('GET /api/dashboard/memories/stats', () => {
    it('returns aggregate stats across all agents', async () => {
      const res = await callRoutes('GET', '/api/dashboard/memories/stats');
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(data.totalMemories).toBe(6);
      expect(data.byTier.longterm).toBe(3); // 2 from agent1 + 1 from agent2
      expect(data.byTier.shortterm).toBe(3);
      expect(data.byStatus.confirmed).toBe(3);
      expect(data.byStatus.pending).toBe(2);
      expect(data.byStatus.failed).toBe(1);
      expect(typeof data.averageDecayScore).toBe('number');
      expect(data.oldestMemory).not.toBeNull();
      expect(data.newestMemory).not.toBeNull();
    });

    it('returns per-agent breakdown', async () => {
      const res = await callRoutes('GET', '/api/dashboard/memories/stats');
      const data = await res!.json();

      expect(data.byAgent.length).toBe(2);
      const agent1Stats = data.byAgent.find((a: { agentId: string }) => a.agentId === agentId1);
      expect(agent1Stats.total).toBe(5);
      expect(agent1Stats.longterm).toBe(2);
      expect(agent1Stats.shortterm).toBe(3);
      expect(agent1Stats.agentName).toBe('Agent Alpha');
    });

    it('returns category breakdown', async () => {
      const res = await callRoutes('GET', '/api/dashboard/memories/stats');
      const data = await res!.json();

      expect(data.byCategory.config).toBe(1);
      expect(data.byCategory.project).toBe(1);
      expect(data.byCategory.person).toBe(1);
    });

    it('filters by agentId', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories/stats?agentId=${agentId1}`);
      const data = await res!.json();

      expect(data.totalMemories).toBe(5);
      expect(data.byTier.longterm).toBe(2);
      expect(data.byTier.shortterm).toBe(3);
      // byAgent should be empty when filtered to single agent
      expect(data.byAgent.length).toBe(0);
    });
  });

  // ── GET /api/dashboard/memories/:id ──────────────────────────────────

  describe('GET /api/dashboard/memories/:id', () => {
    it('returns a single memory with full metadata', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories/${memoryIds.confirmed1}`);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(data.id).toBe(memoryIds.confirmed1);
      expect(data.key).toBe('api-preferences');
      expect(data.tier).toBe('longterm');
      expect(data.storageType).toBe('plain-txn');
      expect(data.status).toBe('confirmed');
      expect(data.txid).toBe('TXID_AAA');
      expect(data.category).toBe('config');
      expect(data.categoryConfidence).toBe(0.8);
      expect(typeof data.decayScore).toBe('number');
    });

    it('returns 404 for nonexistent memory', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories/${crypto.randomUUID()}`);
      expect(res!.status).toBe(404);
    });

    it('shows failed memory as shortterm tier', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories/${memoryIds.failed1}`);
      const data = await res!.json();
      expect(data.tier).toBe('shortterm');
      expect(data.storageType).toBe('pending');
      expect(data.status).toBe('failed');
    });
  });

  // ── GET /api/dashboard/memories/sync-status ─────────────────────────

  describe('GET /api/dashboard/memories/sync-status', () => {
    it('returns sync service health metrics', async () => {
      const res = await callRoutes('GET', '/api/dashboard/memories/sync-status');
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(typeof data.isRunning).toBe('boolean');
      expect(data.pendingCount).toBe(2);
      expect(data.failedCount).toBe(1);
      expect(data.syncIntervalMs).toBe(60000);
      expect(typeof data.lastSyncAt).toBe('string');
      expect(Array.isArray(data.recentErrors)).toBe(true);
    });

    it('includes failed memories in recentErrors', async () => {
      const res = await callRoutes('GET', '/api/dashboard/memories/sync-status');
      const data = await res!.json();

      expect(data.recentErrors.length).toBe(1);
      expect(data.recentErrors[0].key).toBe('old-config');
      expect(data.recentErrors[0].memoryId).toBe(memoryIds.failed1);
      expect(typeof data.recentErrors[0].failedAt).toBe('string');
    });

    it('filters by agentId', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories/sync-status?agentId=${agentId2}`);
      const data = await res!.json();

      expect(data.pendingCount).toBe(0);
      expect(data.failedCount).toBe(0);
      expect(data.recentErrors.length).toBe(0);
    });
  });

  // ── GET /api/dashboard/memories/export ──────────────────────────────

  describe('GET /api/dashboard/memories/export', () => {
    it('returns JSON export with all memories by default', async () => {
      const res = await callRoutes('GET', '/api/dashboard/memories/export');
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);
      expect(res!.headers.get('Content-Type')).toBe('application/json');
      expect(res!.headers.get('Content-Disposition')).toContain('attachment');
      expect(res!.headers.get('Content-Disposition')).toContain('.json');

      const data = await res!.json();
      expect(data.exportedAt).toBeDefined();
      expect(data.count).toBe(6);
      expect(data.entries.length).toBe(6);
    });

    it('returns CSV export when format=csv', async () => {
      const res = await callRoutes('GET', '/api/dashboard/memories/export?format=csv');
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);
      expect(res!.headers.get('Content-Type')).toBe('text/csv');
      expect(res!.headers.get('Content-Disposition')).toContain('.csv');

      const text = await res!.text();
      const lines = text.split('\n');
      // Header + 6 data rows
      expect(lines[0]).toBe('key,content,tier,category,agent,created_at,updated_at,decay_score');
      expect(lines.length).toBe(7);
    });

    it('rejects invalid format', async () => {
      const res = await callRoutes('GET', '/api/dashboard/memories/export?format=xml');
      expect(res!.status).toBe(400);
    });

    it('rejects invalid tier', async () => {
      const res = await callRoutes('GET', '/api/dashboard/memories/export?tier=bogus');
      expect(res!.status).toBe(400);
    });

    it('filters by tier=long-term', async () => {
      const res = await callRoutes('GET', '/api/dashboard/memories/export?format=json&tier=long-term');
      const data = await res!.json();
      // 3 confirmed with txid (2 agent1 + 1 agent2)
      expect(data.count).toBe(3);
    });

    it('filters by tier=short-term', async () => {
      const res = await callRoutes('GET', '/api/dashboard/memories/export?format=json&tier=short-term');
      const data = await res!.json();
      // 3 short-term (2 pending + 1 failed)
      expect(data.count).toBe(3);
    });

    it('filters by agent_id', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories/export?agent_id=${agentId1}`);
      const data = await res!.json();
      expect(data.count).toBe(5);
    });

    it('filters by category', async () => {
      const res = await callRoutes('GET', '/api/dashboard/memories/export?category=config');
      const data = await res!.json();
      expect(data.count).toBe(1);
      expect(data.entries[0].key).toBe('api-preferences');
    });

    it('returns empty export when no matches', async () => {
      const res = await callRoutes('GET', `/api/dashboard/memories/export?agent_id=${crypto.randomUUID()}`);
      const data = await res!.json();
      expect(data.count).toBe(0);
      expect(data.entries).toEqual([]);
    });

    it('CSV escapes values with commas and quotes', async () => {
      // Insert a memory with special characters
      const specialId = crypto.randomUUID();
      db.query(
        `INSERT INTO agent_memories (id, agent_id, key, content, status) VALUES (?, ?, 'csv-test', 'value with, comma and "quotes"', 'pending')`,
      ).run(specialId, agentId1);

      const res = await callRoutes('GET', `/api/dashboard/memories/export?format=csv&agent_id=${agentId1}`);
      const text = await res!.text();
      // The content field should be escaped
      expect(text).toContain('"value with, comma and ""quotes"""');

      // Clean up
      db.query('DELETE FROM agent_memories WHERE id = ?').run(specialId);
    });

    it('does not route export id to memory detail', async () => {
      // Ensure /export is not treated as a memory ID
      const res = await callRoutes('GET', '/api/dashboard/memories/export?format=json');
      expect(res!.status).toBe(200);
      const data = await res!.json();
      expect(data.entries).toBeDefined();
    });
  });
});
