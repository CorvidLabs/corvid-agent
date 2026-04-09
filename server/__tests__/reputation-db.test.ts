import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  deleteReputationRecord,
  getReputationEvents,
  getReputationRecord,
  listReputationRecords,
} from '../db/reputation';
import { runMigrations } from '../db/schema';

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

function insertReputationRecord(agentId: string, overallScore: number = 50, trustLevel: string = 'medium'): void {
  db.query(
    `INSERT INTO agent_reputation (agent_id, overall_score, trust_level, task_completion, peer_rating, credit_pattern, security_compliance, activity_level)
         VALUES (?, ?, ?, 60, 50, 40, 70, 30)`,
  ).run(agentId, overallScore, trustLevel);
}

function insertReputationEvent(agentId: string, eventType: string, scoreImpact: number = 5): void {
  const id = crypto.randomUUID();
  db.query(
    `INSERT INTO reputation_events (id, agent_id, event_type, score_impact, metadata)
         VALUES (?, ?, ?, ?, '{}')`,
  ).run(id, agentId, eventType, scoreImpact);
}

// ── getReputationRecord ──────────────────────────────────────────────

describe('getReputationRecord', () => {
  test('returns null for unknown agent', () => {
    expect(getReputationRecord(db, 'nobody')).toBeNull();
  });

  test('returns record with correct fields', () => {
    insertReputationRecord('agent-1', 75, 'high');
    const record = getReputationRecord(db, 'agent-1');
    expect(record).not.toBeNull();
    expect(record!.agent_id).toBe('agent-1');
    expect(record!.overall_score).toBe(75);
    expect(record!.trust_level).toBe('high');
    expect(record!.task_completion).toBe(60);
    expect(record!.peer_rating).toBe(50);
    expect(record!.computed_at).toBeTruthy();
  });
});

// ── listReputationRecords ────────────────────────────────────────────

describe('listReputationRecords', () => {
  test('returns empty on fresh db', () => {
    expect(listReputationRecords(db)).toEqual([]);
  });

  test('returns records ordered by overall_score DESC', () => {
    insertReputationRecord('low-agent', 20);
    insertReputationRecord('high-agent', 90);
    insertReputationRecord('mid-agent', 50);

    const records = listReputationRecords(db);
    expect(records).toHaveLength(3);
    expect(records[0].agent_id).toBe('high-agent');
    expect(records[1].agent_id).toBe('mid-agent');
    expect(records[2].agent_id).toBe('low-agent');
  });
});

// ── getReputationEvents ──────────────────────────────────────────────

describe('getReputationEvents', () => {
  test('returns empty for agent with no events', () => {
    expect(getReputationEvents(db, 'nobody')).toEqual([]);
  });

  test('returns events for specific agent', () => {
    insertReputationEvent('agent-1', 'task_completed', 10);
    insertReputationEvent('agent-1', 'peer_review_positive', 5);
    insertReputationEvent('agent-2', 'task_failed', -5);

    const events = getReputationEvents(db, 'agent-1');
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.agent_id === 'agent-1')).toBe(true);
  });

  test('respects limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      insertReputationEvent('agent-1', `event_${i}`, i);
    }

    const events = getReputationEvents(db, 'agent-1', 3);
    expect(events).toHaveLength(3);
  });

  test('returns events with correct fields', () => {
    insertReputationEvent('agent-1', 'task_completed', 10);
    const events = getReputationEvents(db, 'agent-1');
    expect(events[0].id).toBeTruthy();
    expect(events[0].event_type).toBe('task_completed');
    expect(events[0].score_impact).toBe(10);
    expect(events[0].created_at).toBeTruthy();
  });
});

// ── deleteReputationRecord ───────────────────────────────────────────

describe('deleteReputationRecord', () => {
  test('deletes existing record', () => {
    insertReputationRecord('agent-1');
    expect(deleteReputationRecord(db, 'agent-1')).toBe(true);
    expect(getReputationRecord(db, 'agent-1')).toBeNull();
  });

  test('returns false for nonexistent agent', () => {
    expect(deleteReputationRecord(db, 'nobody')).toBe(false);
  });

  test('does not delete events when deleting record', () => {
    insertReputationRecord('agent-1');
    insertReputationEvent('agent-1', 'task_completed');

    deleteReputationRecord(db, 'agent-1');

    // Events are independent — not cascade-deleted
    const events = getReputationEvents(db, 'agent-1');
    expect(events).toHaveLength(1);
  });
});
