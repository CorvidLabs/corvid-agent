import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { runMigrations } from '../db/schema';
import { ensureMemorySchema } from '../memory/schema';
import { handleBrainViewerRoutes } from '../routes/brain-viewer';

let db: Database;

async function callRoutes(method: string, path: string, body?: unknown): Promise<Response | null> {
  const url = new URL(`http://localhost:3000${path}`);
  const options: RequestInit = { method };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
    options.headers = { 'Content-Type': 'application/json' };
  }
  const req = new Request(url.toString(), options);
  const result = handleBrainViewerRoutes(req, url, db);
  return result instanceof Promise ? await result : result;
}

const agentId = crypto.randomUUID();

beforeAll(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  ensureMemorySchema(db);

  // Seed agent
  db.query("INSERT INTO agents (id, name) VALUES (?, 'Test Agent')").run(agentId);

  // Seed near-duplicate memories
  db.query(
    `INSERT INTO agent_memories (id, agent_id, key, content, status)
       VALUES (?, ?, 'api-prefs', 'prefers REST API over GraphQL for external endpoints', 'confirmed')`,
  ).run(crypto.randomUUID(), agentId);

  db.query(
    `INSERT INTO agent_memories (id, agent_id, key, content, status, txid)
       VALUES (?, ?, 'api-preferences', 'prefer REST over GraphQL external API design', 'confirmed', 'TXID_1')`,
  ).run(crypto.randomUUID(), agentId);

  db.query(
    `INSERT INTO agent_memories (id, agent_id, key, content, status)
       VALUES (?, ?, 'deploy-notes', 'always run lint and tests before deploying code', 'pending')`,
  ).run(crypto.randomUUID(), agentId);

  db.query(
    `INSERT INTO agent_memories (id, agent_id, key, content, status)
       VALUES (?, ?, 'deploy-process', 'run tests before deploy, lint first', 'pending')`,
  ).run(crypto.randomUUID(), agentId);

  // Unique memory (no duplicate)
  db.query(
    `INSERT INTO agent_memories (id, agent_id, key, content, status)
       VALUES (?, ?, 'personal-bio', 'I am Jackdaw, a builder at CorvidLabs', 'confirmed')`,
  ).run(crypto.randomUUID(), agentId);
});

afterAll(() => db.close());

describe('Consolidation Routes', () => {
  // ── Route matching ──────────────────────────────────────────────

  it('returns null for non-matching paths', async () => {
    expect(await callRoutes('GET', '/api/brain/other')).toBeNull();
  });

  it('returns null for non-matching consolidation sub-path', async () => {
    expect(await callRoutes('GET', '/api/brain/consolidation/unknown')).toBeNull();
  });

  // ── GET /api/brain/consolidation/suggestions ────────────────────

  describe('GET /api/brain/consolidation/suggestions', () => {
    it('returns suggestions and duplicates', async () => {
      const res = await callRoutes('GET', `/api/brain/consolidation/suggestions?agentId=${agentId}&threshold=40`);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);

      const data = await res!.json();
      expect(Array.isArray(data.suggestions)).toBe(true);
      expect(Array.isArray(data.duplicates)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(data.threshold).toBe(40);
    });

    it('returns duplicate pairs for highly similar memories', async () => {
      // Low threshold to ensure we find the near-duplicate api-prefs / api-preferences
      const res = await callRoutes('GET', `/api/brain/consolidation/suggestions?agentId=${agentId}&threshold=30`);
      const data = await res!.json();

      // Should find at least one duplicate pair (api-prefs vs api-preferences)
      expect(data.duplicates.length + data.suggestions.length).toBeGreaterThan(0);
    });

    it('returns no results at very high threshold', async () => {
      const res = await callRoutes('GET', `/api/brain/consolidation/suggestions?agentId=${agentId}&threshold=99`);
      const data = await res!.json();
      expect(data.suggestions.length).toBe(0);
      expect(data.duplicates.length).toBe(0);
    });

    it('rejects invalid threshold', async () => {
      const res = await callRoutes('GET', '/api/brain/consolidation/suggestions?threshold=150');
      expect(res!.status).toBe(400);
    });

    it('works without agentId (scans all)', async () => {
      const res = await callRoutes('GET', '/api/brain/consolidation/suggestions?threshold=30');
      expect(res!.status).toBe(200);
      const data = await res!.json();
      expect(Array.isArray(data.suggestions)).toBe(true);
    });
  });

  // ── POST /api/brain/consolidation/merge ─────────────────────────

  describe('POST /api/brain/consolidation/merge', () => {
    it('returns 400 for missing primaryId', async () => {
      const res = await callRoutes('POST', '/api/brain/consolidation/merge', { duplicateIds: [] });
      expect(res!.status).toBe(400);
    });

    it('returns 400 for empty duplicateIds', async () => {
      const res = await callRoutes('POST', '/api/brain/consolidation/merge', {
        primaryId: crypto.randomUUID(),
        duplicateIds: [],
      });
      expect(res!.status).toBe(400);
    });

    it('returns 404 for nonexistent primary', async () => {
      const res = await callRoutes('POST', '/api/brain/consolidation/merge', {
        primaryId: crypto.randomUUID(),
        duplicateIds: [crypto.randomUUID()],
      });
      expect(res!.status).toBe(404);
    });

    it('merges two memories successfully', async () => {
      // Create two memories to merge
      const primaryId = crypto.randomUUID();
      const dupId = crypto.randomUUID();

      db.query(
        `INSERT INTO agent_memories (id, agent_id, key, content, status)
           VALUES (?, ?, 'merge-test-primary', 'primary content here', 'pending')`,
      ).run(primaryId, agentId);

      db.query(
        `INSERT INTO agent_memories (id, agent_id, key, content, status)
           VALUES (?, ?, 'merge-test-dup', 'duplicate content here, same topic', 'pending')`,
      ).run(dupId, agentId);

      const res = await callRoutes('POST', '/api/brain/consolidation/merge', {
        primaryId,
        duplicateIds: [dupId],
        mergedContent: 'merged content combining both memories',
      });

      expect(res!.status).toBe(200);
      const data = await res!.json();
      expect(data.success).toBe(true);
      expect(data.primaryKey).toBe('merge-test-primary');
      expect(data.archivedCount).toBe(1);
      expect(data.archivedKeys).toContain('merge-test-dup');
      expect(data.mergedContent).toBe('merged content combining both memories');

      // Verify primary content was updated
      const row = db.query('SELECT content FROM agent_memories WHERE id = ?').get(primaryId) as {
        content: string;
      } | null;
      expect(row?.content).toBe('merged content combining both memories');

      // Verify duplicate was archived
      const dupRow = db.query('SELECT archived FROM agent_memories WHERE id = ?').get(dupId) as {
        archived: number;
      } | null;
      expect(dupRow?.archived).toBe(1);
    });

    it('returns 400 for invalid JSON', async () => {
      const url = new URL('http://localhost:3000/api/brain/consolidation/merge');
      const req = new Request(url.toString(), {
        method: 'POST',
        body: 'not json',
        headers: { 'Content-Type': 'application/json' },
      });
      const res = handleBrainViewerRoutes(req, url, db);
      const resolved = res instanceof Promise ? await res : res;
      expect(resolved!.status).toBe(400);
    });
  });

  // ── POST /api/brain/consolidation/archive ───────────────────────

  describe('POST /api/brain/consolidation/archive', () => {
    it('archives short_term memories matching filter', async () => {
      // Create a short_term memory
      const stId = crypto.randomUUID();
      db.query(
        `INSERT INTO agent_memories (id, agent_id, key, content, status, created_at, updated_at)
           VALUES (?, ?, 'stale-mem', 'some stale content', 'short_term', datetime('now', '-40 days'), datetime('now', '-40 days'))`,
      ).run(stId, agentId);

      const res = await callRoutes('POST', '/api/brain/consolidation/archive', {
        agentId,
        olderThanDays: 30,
        statuses: ['short_term'],
      });

      expect(res!.status).toBe(200);
      const data = await res!.json();
      expect(typeof data.archivedCount).toBe('number');
      expect(Array.isArray(data.archivedKeys)).toBe(true);
      // Our stale-mem should be archived
      expect(data.archivedKeys).toContain('stale-mem');
    });

    it('returns 400 for invalid statuses', async () => {
      const res = await callRoutes('POST', '/api/brain/consolidation/archive', {
        statuses: ['invalid_status'],
      });
      expect(res!.status).toBe(400);
    });

    it('returns 400 for out-of-range maxDecayScore', async () => {
      const res = await callRoutes('POST', '/api/brain/consolidation/archive', {
        maxDecayScore: 1.5,
      });
      expect(res!.status).toBe(400);
    });

    it('returns 400 for negative olderThanDays', async () => {
      const res = await callRoutes('POST', '/api/brain/consolidation/archive', {
        olderThanDays: -1,
      });
      expect(res!.status).toBe(400);
    });

    it('archives nothing when filter matches nothing', async () => {
      const res = await callRoutes('POST', '/api/brain/consolidation/archive', {
        agentId: crypto.randomUUID(), // different agent with no memories
        statuses: ['short_term'],
      });
      expect(res!.status).toBe(200);
      const data = await res!.json();
      expect(data.archivedCount).toBe(0);
    });

    it('returns 400 for invalid JSON', async () => {
      const url = new URL('http://localhost:3000/api/brain/consolidation/archive');
      const req = new Request(url.toString(), {
        method: 'POST',
        body: 'not json',
        headers: { 'Content-Type': 'application/json' },
      });
      const res = handleBrainViewerRoutes(req, url, db);
      const resolved = res instanceof Promise ? await res : res;
      expect(resolved!.status).toBe(400);
    });
  });
});
