import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import type { AgentMemory } from '../../shared/types';
import { expireShortTermMemories, purgeOldArchivedMemories, recallMemory, saveMemory } from '../db/agent-memories';
import { up as upMemoryDecay } from '../db/migrations/113_memory_decay';
import { applyDecay, computeDecayMultiplier } from '../memory/decay';
import type { ScoredMemory } from '../memory/semantic-search';

/** Create a minimal AgentMemory with a given updatedAt timestamp. */
function makeMemory(updatedAt: string): AgentMemory {
  return {
    id: 'mem-1',
    agentId: 'agent-1',
    key: 'test-key',
    content: 'test content',
    txid: null,
    asaId: null,
    status: 'confirmed',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt,
    expiresAt: null,
    accessCount: 0,
  };
}

const DB_AGENT = 'agent-decay-test';

function createTestDb(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY)`);
  db.prepare('INSERT INTO agents (id) VALUES (?)').run(DB_AGENT);
  db.exec(`
        CREATE TABLE IF NOT EXISTS agent_memories (
            id         TEXT PRIMARY KEY,
            agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            key        TEXT NOT NULL,
            content    TEXT NOT NULL,
            txid       TEXT DEFAULT NULL,
            asa_id     INTEGER DEFAULT NULL,
            status     TEXT NOT NULL DEFAULT 'short_term',
            archived   INTEGER NOT NULL DEFAULT 0,
            book       TEXT DEFAULT NULL,
            page       INTEGER DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(agent_id, key)
        )
    `);
  upMemoryDecay(db);
  return db;
}

/** Pin "now" for deterministic date arithmetic. */
const NOW = new Date('2026-03-16T12:00:00.000Z');

/** Return an ISO date string N days before NOW. */
function daysAgo(days: number): string {
  const d = new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

describe('computeDecayMultiplier', () => {
  test('returns 1.0 for memory updated today (0 days)', () => {
    expect(computeDecayMultiplier(daysAgo(0), NOW)).toBe(1.0);
  });

  test('returns 1.0 for memory updated 6 days ago (boundary)', () => {
    expect(computeDecayMultiplier(daysAgo(6), NOW)).toBe(1.0);
  });

  test('returns 0.8 for memory updated 7 days ago (boundary)', () => {
    expect(computeDecayMultiplier(daysAgo(7), NOW)).toBe(0.8);
  });

  test('returns 0.8 for memory updated 29 days ago', () => {
    expect(computeDecayMultiplier(daysAgo(29), NOW)).toBe(0.8);
  });

  test('returns 0.6 for memory updated 30 days ago (boundary)', () => {
    expect(computeDecayMultiplier(daysAgo(30), NOW)).toBe(0.6);
  });

  test('returns 0.6 for memory updated 89 days ago', () => {
    expect(computeDecayMultiplier(daysAgo(89), NOW)).toBe(0.6);
  });

  test('returns 0.4 for memory updated 90 days ago (boundary)', () => {
    expect(computeDecayMultiplier(daysAgo(90), NOW)).toBe(0.4);
  });

  test('returns 0.4 for memory updated 365 days ago', () => {
    expect(computeDecayMultiplier(daysAgo(365), NOW)).toBe(0.4);
  });
});

describe('applyDecay', () => {
  test('re-sorts results by decayed score', () => {
    // Old memory with high raw score vs recent memory with lower raw score
    const oldHighScore: ScoredMemory = {
      memory: makeMemory(daysAgo(100)), // 90+ days -> 0.4 multiplier
      score: 1.0,
      source: 'fts5',
    };
    const recentLowScore: ScoredMemory = {
      memory: makeMemory(daysAgo(1)), // <7 days -> 1.0 multiplier
      score: 0.5,
      source: 'tfidf',
    };

    // Before decay: oldHighScore (1.0) > recentLowScore (0.5)
    // After decay: recentLowScore (0.5 * 1.0 = 0.5) > oldHighScore (1.0 * 0.4 = 0.4)
    const result = applyDecay([oldHighScore, recentLowScore], NOW);

    expect(result).toHaveLength(2);
    expect(result[0].score).toBe(0.5);
    expect(result[0].memory.updatedAt).toBe(recentLowScore.memory.updatedAt);
    expect(result[1].score).toBeCloseTo(0.4, 10);
    expect(result[1].memory.updatedAt).toBe(oldHighScore.memory.updatedAt);
  });

  test('empty array returns empty array', () => {
    const result = applyDecay([], NOW);
    expect(result).toEqual([]);
  });

  test('preserves all other fields on ScoredMemory', () => {
    const original: ScoredMemory = {
      memory: makeMemory(daysAgo(0)),
      score: 0.9,
      source: 'combined',
    };

    const result = applyDecay([original], NOW);

    expect(result).toHaveLength(1);
    expect(result[0].memory.id).toBe('mem-1');
    expect(result[0].memory.agentId).toBe('agent-1');
    expect(result[0].memory.key).toBe('test-key');
    expect(result[0].memory.content).toBe('test content');
    expect(result[0].memory.txid).toBeNull();
    expect(result[0].memory.status).toBe('confirmed');
    expect(result[0].source).toBe('combined');
    // Score should remain unchanged (multiplier is 1.0 for today)
    expect(result[0].score).toBe(0.9);
  });
});

// ─── DB-level decay tests ─────────────────────────────────────────────────────

describe('saveMemory() — expires_at', () => {
  let db: Database;
  beforeEach(() => {
    db = createTestDb();
  });

  test('sets expires_at to approximately +7 days', () => {
    saveMemory(db, { agentId: DB_AGENT, key: 'k1', content: 'data' });
    const row = db
      .query('SELECT expires_at, access_count FROM agent_memories WHERE agent_id = ? AND key = ?')
      .get(DB_AGENT, 'k1') as { expires_at: string; access_count: number };
    expect(row.expires_at).toBeTruthy();
    const diffDays = (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(diffDays).toBeGreaterThan(6);
    expect(diffDays).toBeLessThan(8);
    expect(row.access_count).toBe(0);
  });

  test('custom ttlDays is respected', () => {
    saveMemory(db, { agentId: DB_AGENT, key: 'k2', content: 'data', ttlDays: 14 });
    const row = db.query('SELECT expires_at FROM agent_memories WHERE key = ?').get('k2') as { expires_at: string };
    const diffDays = (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(diffDays).toBeGreaterThan(13);
    expect(diffDays).toBeLessThan(15);
  });

  test('upsert resets access_count to 0', () => {
    saveMemory(db, { agentId: DB_AGENT, key: 'k3', content: 'v1' });
    db.exec(`UPDATE agent_memories SET access_count = 5 WHERE key = 'k3'`);
    saveMemory(db, { agentId: DB_AGENT, key: 'k3', content: 'v2' });
    const row = db.query('SELECT access_count FROM agent_memories WHERE key = ?').get('k3') as { access_count: number };
    expect(row.access_count).toBe(0);
  });
});

describe('recallMemory() — access tracking', () => {
  let db: Database;
  beforeEach(() => {
    db = createTestDb();
  });

  test('increments access_count on each recall', () => {
    saveMemory(db, { agentId: DB_AGENT, key: 'r1', content: 'data' });
    recallMemory(db, DB_AGENT, 'r1');
    recallMemory(db, DB_AGENT, 'r1');
    const row = db.query('SELECT access_count FROM agent_memories WHERE key = ?').get('r1') as { access_count: number };
    expect(row.access_count).toBe(2);
  });

  test('extends TTL on 3rd access', () => {
    saveMemory(db, { agentId: DB_AGENT, key: 'r2', content: 'data' });
    db.exec(`UPDATE agent_memories SET expires_at = datetime('now', '+1 day') WHERE key = 'r2'`);
    recallMemory(db, DB_AGENT, 'r2');
    recallMemory(db, DB_AGENT, 'r2');
    recallMemory(db, DB_AGENT, 'r2'); // 3rd — triggers extension
    const row = db.query('SELECT expires_at FROM agent_memories WHERE key = ?').get('r2') as { expires_at: string };
    const diffDays = (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(diffDays).toBeGreaterThan(13);
  });

  test('returns null for unknown key', () => {
    expect(recallMemory(db, DB_AGENT, 'missing')).toBeNull();
  });

  test('does not increment access_count for confirmed status', () => {
    saveMemory(db, { agentId: DB_AGENT, key: 'r3', content: 'data' });
    db.exec(`UPDATE agent_memories SET status = 'confirmed' WHERE key = 'r3'`);
    recallMemory(db, DB_AGENT, 'r3');
    const row = db.query('SELECT access_count FROM agent_memories WHERE key = ?').get('r3') as { access_count: number };
    expect(row.access_count).toBe(0);
  });
});

describe('expireShortTermMemories()', () => {
  let db: Database;
  beforeEach(() => {
    db = createTestDb();
  });

  test('archives expired short_term memories', () => {
    saveMemory(db, { agentId: DB_AGENT, key: 'e1', content: 'stale' });
    db.exec(`UPDATE agent_memories SET expires_at = datetime('now', '-1 day') WHERE key = 'e1'`);
    expect(expireShortTermMemories(db)).toBe(1);
    const row = db.query('SELECT archived FROM agent_memories WHERE key = ?').get('e1') as { archived: number };
    expect(row.archived).toBe(1);
  });

  test('does not archive non-expired memories', () => {
    saveMemory(db, { agentId: DB_AGENT, key: 'e2', content: 'fresh' });
    expect(expireShortTermMemories(db)).toBe(0);
  });

  test('does not archive confirmed memories with past expires_at', () => {
    saveMemory(db, { agentId: DB_AGENT, key: 'e3', content: 'conf' });
    db.exec(`UPDATE agent_memories SET status = 'confirmed', expires_at = datetime('now', '-1 day') WHERE key = 'e3'`);
    expect(expireShortTermMemories(db)).toBe(0);
  });

  test('skips already-archived memories', () => {
    saveMemory(db, { agentId: DB_AGENT, key: 'e4', content: 'arch' });
    db.exec(`UPDATE agent_memories SET expires_at = datetime('now', '-1 day'), archived = 1 WHERE key = 'e4'`);
    expect(expireShortTermMemories(db)).toBe(0);
  });

  test('skips memories with NULL expires_at', () => {
    saveMemory(db, { agentId: DB_AGENT, key: 'e5', content: 'no-ttl' });
    db.exec(`UPDATE agent_memories SET expires_at = NULL WHERE key = 'e5'`);
    expect(expireShortTermMemories(db)).toBe(0);
  });
});

describe('purgeOldArchivedMemories()', () => {
  let db: Database;
  beforeEach(() => {
    db = createTestDb();
  });

  test('deletes archived short_term memories past retention', () => {
    saveMemory(db, { agentId: DB_AGENT, key: 'p1', content: 'old' });
    db.exec(`UPDATE agent_memories SET archived = 1, updated_at = datetime('now', '-31 days') WHERE key = 'p1'`);
    expect(purgeOldArchivedMemories(db, 30)).toBe(1);
    expect(db.query('SELECT * FROM agent_memories WHERE key = ?').get('p1')).toBeNull();
  });

  test('keeps recently archived memories', () => {
    saveMemory(db, { agentId: DB_AGENT, key: 'p2', content: 'new' });
    db.exec(`UPDATE agent_memories SET archived = 1 WHERE key = 'p2'`);
    expect(purgeOldArchivedMemories(db, 30)).toBe(0);
    expect(db.query('SELECT * FROM agent_memories WHERE key = ?').get('p2')).toBeTruthy();
  });

  test('does not purge archived confirmed memories', () => {
    saveMemory(db, { agentId: DB_AGENT, key: 'p3', content: 'conf' });
    db.exec(
      `UPDATE agent_memories SET status = 'confirmed', archived = 1, updated_at = datetime('now', '-60 days') WHERE key = 'p3'`,
    );
    expect(purgeOldArchivedMemories(db, 30)).toBe(0);
  });

  test('uses default 30-day retention when not specified', () => {
    saveMemory(db, { agentId: DB_AGENT, key: 'p4', content: 'old' });
    db.exec(`UPDATE agent_memories SET archived = 1, updated_at = datetime('now', '-31 days') WHERE key = 'p4'`);
    expect(purgeOldArchivedMemories(db)).toBe(1);
  });
});
