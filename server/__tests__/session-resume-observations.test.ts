/**
 * Tests for the session-resume observation injection pattern (#1751).
 *
 * `buildResumePrompt` in server/process/manager.ts is Layer 0 (Constitutional)
 * and cannot be modified directly. These tests verify the DB-layer contract
 * that the implementation will rely on:
 *
 *   1. listObservations fetches the top active observations for the agent
 *   2. boostObservation with scoreBoost=0 increments access_count without
 *      changing relevance_score (passive read)
 *   3. Only 'active' observations are returned — 'graduated' and 'dismissed'
 *      are excluded
 *   4. The limit=5 constraint is honoured
 */

import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { up as upObservations } from '../db/migrations/095_memory_observations';
import {
  boostObservation,
  dismissObservation,
  getObservation,
  listObservations,
  markGraduated,
  recordObservation,
} from '../db/observations';

const AGENT_ID = 'agent-resume-test-001';
const SESSION_ID = 'session-resume-test-001';

function createTestDb(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  // Minimal stub tables to satisfy FK constraints
  db.exec(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY)`);
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, agent_id TEXT REFERENCES agents(id))`);
  db.prepare('INSERT INTO agents (id) VALUES (?)').run(AGENT_ID);
  db.prepare('INSERT INTO sessions (id, agent_id) VALUES (?, ?)').run(SESSION_ID, AGENT_ID);
  upObservations(db);
  return db;
}

// ─── Helper: simulate the observation-injection logic from buildResumePrompt ──

/**
 * Mirrors the logic that will be added to buildResumePrompt:
 *   1. fetch top 5 active observations for the agent
 *   2. boost each (scoreBoost=0) to record passive access
 *   3. return the list for prompt assembly
 */
function simulateResumeObservationFetch(db: Database, agentId: string | null): ReturnType<typeof listObservations> {
  if (!agentId) return [];
  const observations = listObservations(db, agentId, { status: 'active', limit: 5 });
  for (const obs of observations) {
    boostObservation(db, obs.id, 0);
  }
  return observations;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('session resume — observation fetch', () => {
  let db: Database;
  beforeEach(() => {
    db = createTestDb();
  });

  test('returns active observations for the agent', () => {
    recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'User prefers verbose output' });
    recordObservation(db, { agentId: AGENT_ID, source: 'feedback', content: 'Never mock the database' });
    recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'Leif uses dark mode' });

    const obs = simulateResumeObservationFetch(db, AGENT_ID);
    expect(obs).toHaveLength(3);
  });

  test('returns empty array when agentId is null', () => {
    recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'Should not appear' });
    const obs = simulateResumeObservationFetch(db, null);
    expect(obs).toHaveLength(0);
  });

  test('respects limit of 5', () => {
    for (let i = 0; i < 8; i++) {
      recordObservation(db, {
        agentId: AGENT_ID,
        source: 'session',
        content: `observation ${i}`,
        relevanceScore: i * 0.1,
      });
    }

    const obs = simulateResumeObservationFetch(db, AGENT_ID);
    expect(obs).toHaveLength(5);
  });

  test('returns observations ordered by relevance_score descending', () => {
    recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'low relevance', relevanceScore: 0.5 });
    recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'high relevance', relevanceScore: 4.0 });
    recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'mid relevance', relevanceScore: 2.0 });

    const obs = simulateResumeObservationFetch(db, AGENT_ID);
    expect(obs[0].content).toBe('high relevance');
    expect(obs[1].content).toBe('mid relevance');
    expect(obs[2].content).toBe('low relevance');
  });
});

describe('session resume — access_count increment (passive read)', () => {
  let db: Database;
  beforeEach(() => {
    db = createTestDb();
  });

  test('increments access_count for each retrieved observation', () => {
    const obs1 = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'obs one' });
    const obs2 = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'obs two' });
    const obs3 = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'obs three' });

    expect(obs1.accessCount).toBe(0);
    expect(obs2.accessCount).toBe(0);
    expect(obs3.accessCount).toBe(0);

    simulateResumeObservationFetch(db, AGENT_ID);

    expect(getObservation(db, obs1.id)!.accessCount).toBe(1);
    expect(getObservation(db, obs2.id)!.accessCount).toBe(1);
    expect(getObservation(db, obs3.id)!.accessCount).toBe(1);
  });

  test('does NOT change relevance_score (scoreBoost=0 is a passive read)', () => {
    const obs = recordObservation(db, {
      agentId: AGENT_ID,
      source: 'session',
      content: 'relevance should not change',
      relevanceScore: 2.5,
    });

    simulateResumeObservationFetch(db, AGENT_ID);

    const updated = getObservation(db, obs.id)!;
    expect(updated.relevanceScore).toBe(2.5);
    expect(updated.accessCount).toBe(1);
  });

  test('accumulates access_count across multiple resume calls', () => {
    const obs = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'repeated access' });

    simulateResumeObservationFetch(db, AGENT_ID);
    simulateResumeObservationFetch(db, AGENT_ID);
    simulateResumeObservationFetch(db, AGENT_ID);

    expect(getObservation(db, obs.id)!.accessCount).toBe(3);
  });
});

describe('session resume — status filtering', () => {
  let db: Database;
  beforeEach(() => {
    db = createTestDb();
  });

  test('excludes graduated observations', () => {
    const graduated = recordObservation(db, {
      agentId: AGENT_ID,
      source: 'session',
      content: 'I was graduated',
      relevanceScore: 5.0,
    });
    markGraduated(db, graduated.id, 'feedback-style-key');

    recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'still active' });

    const obs = simulateResumeObservationFetch(db, AGENT_ID);
    expect(obs).toHaveLength(1);
    expect(obs[0].content).toBe('still active');
  });

  test('excludes dismissed observations', () => {
    const dismissed = recordObservation(db, {
      agentId: AGENT_ID,
      source: 'session',
      content: 'I was dismissed',
    });
    dismissObservation(db, dismissed.id);

    recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'still active' });

    const obs = simulateResumeObservationFetch(db, AGENT_ID);
    expect(obs).toHaveLength(1);
    expect(obs[0].content).toBe('still active');
  });

  test('excludes both graduated and dismissed — returns only active', () => {
    const g = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'graduated' });
    const d = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'dismissed' });
    const active1 = recordObservation(db, { agentId: AGENT_ID, source: 'feedback', content: 'active-1' });
    const active2 = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'active-2' });

    markGraduated(db, g.id, 'some-key');
    dismissObservation(db, d.id);

    const obs = simulateResumeObservationFetch(db, AGENT_ID);
    expect(obs).toHaveLength(2);
    const ids = obs.map((o) => o.id);
    expect(ids).toContain(active1.id);
    expect(ids).toContain(active2.id);
  });

  test('returns empty array when agent has no active observations', () => {
    const g = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'graduated' });
    const d = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'dismissed' });
    markGraduated(db, g.id, 'k');
    dismissObservation(db, d.id);

    const obs = simulateResumeObservationFetch(db, AGENT_ID);
    expect(obs).toHaveLength(0);
  });
});

describe('session resume — prompt block construction', () => {
  let db: Database;
  beforeEach(() => {
    db = createTestDb();
  });

  /**
   * Mirrors the parts[] construction from the planned buildResumePrompt changes.
   * Verifies the format of the <recent_observations> block.
   */
  function buildObservationBlock(observations: ReturnType<typeof listObservations>): string[] {
    if (observations.length === 0) return [];
    const obsLines = observations.map((o) => `- [${o.source}] (score: ${o.relevanceScore.toFixed(1)}) ${o.content}`);
    return [
      '<recent_observations>',
      'Relevant observations from past sessions with this agent:',
      '',
      ...obsLines,
      '</recent_observations>',
      '',
    ];
  }

  test('produces correct XML block format', () => {
    recordObservation(db, {
      agentId: AGENT_ID,
      source: 'feedback',
      content: 'User dislikes emojis',
      relevanceScore: 2.0,
    });

    const obs = simulateResumeObservationFetch(db, AGENT_ID);
    const block = buildObservationBlock(obs);

    expect(block[0]).toBe('<recent_observations>');
    expect(block[1]).toBe('Relevant observations from past sessions with this agent:');
    expect(block[2]).toBe('');
    expect(block[3]).toBe('- [feedback] (score: 2.0) User dislikes emojis');
    expect(block[4]).toBe('</recent_observations>');
    expect(block[5]).toBe('');
  });

  test('returns empty array (no block) when there are no observations', () => {
    const obs = simulateResumeObservationFetch(db, AGENT_ID);
    const block = buildObservationBlock(obs);
    expect(block).toHaveLength(0);
  });

  test('formats multiple observations as separate bullet lines', () => {
    recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'First obs', relevanceScore: 3.0 });
    recordObservation(db, { agentId: AGENT_ID, source: 'feedback', content: 'Second obs', relevanceScore: 1.5 });

    const obs = simulateResumeObservationFetch(db, AGENT_ID);
    const block = buildObservationBlock(obs);

    // Two content lines (after the header and empty line)
    const bulletLines = block.filter((l) => l.startsWith('- '));
    expect(bulletLines).toHaveLength(2);
    expect(bulletLines[0]).toContain('First obs');
    expect(bulletLines[1]).toContain('Second obs');
  });
});
