/**
 * Tests for buddy mode DB helpers (pairings, sessions, messages CRUD).
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createAgent } from '../db/agents';
import {
  addBuddyMessage,
  createBuddyPairing,
  createBuddySession,
  deleteBuddyPairing,
  getBuddyPairing,
  getBuddySession,
  getDefaultBuddyForAgent,
  listBuddyMessages,
  listBuddyPairings,
  listBuddySessions,
  updateBuddyPairing,
  updateBuddySessionStatus,
} from '../db/buddy';
import { runMigrations } from '../db/schema';

let db: Database;
let leadId: string;
let buddyId: string;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);

  const lead = createAgent(db, { name: 'LeadAgent', model: 'test-model' });
  const buddy = createAgent(db, { name: 'BuddyAgent', model: 'test-model' });
  leadId = lead.id;
  buddyId = buddy.id;
});

afterEach(() => {
  db.close();
});

// ── Pairings ─────────────────────────────────────────────────────────

describe('createBuddyPairing', () => {
  test('creates with defaults', () => {
    const pairing = createBuddyPairing(db, leadId, buddyId);
    expect(pairing.id).toBeTruthy();
    expect(pairing.agentId).toBe(leadId);
    expect(pairing.buddyAgentId).toBe(buddyId);
    expect(pairing.enabled).toBe(true);
    expect(pairing.maxRounds).toBe(5);
    expect(pairing.buddyRole).toBe('reviewer');
    expect(pairing.createdAt).toBeTruthy();
    expect(pairing.updatedAt).toBeTruthy();
  });

  test('creates with custom options', () => {
    const pairing = createBuddyPairing(db, leadId, buddyId, {
      maxRounds: 8,
      buddyRole: 'validator',
    });
    expect(pairing.maxRounds).toBe(8);
    expect(pairing.buddyRole).toBe('validator');
  });

  test('rejects duplicate agent-buddy pair', () => {
    createBuddyPairing(db, leadId, buddyId);
    expect(() => createBuddyPairing(db, leadId, buddyId)).toThrow();
  });
});

describe('getBuddyPairing', () => {
  test('returns null for nonexistent id', () => {
    expect(getBuddyPairing(db, 'nonexistent')).toBeNull();
  });

  test('returns pairing by id', () => {
    const created = createBuddyPairing(db, leadId, buddyId);
    const fetched = getBuddyPairing(db, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });
});

describe('listBuddyPairings', () => {
  test('returns empty for agent with no pairings', () => {
    expect(listBuddyPairings(db, leadId)).toEqual([]);
  });

  test('returns pairings for agent', () => {
    const extra = createAgent(db, { name: 'ExtraBuddy', model: 'test-model' });
    createBuddyPairing(db, leadId, buddyId);
    createBuddyPairing(db, leadId, extra.id);
    const pairings = listBuddyPairings(db, leadId);
    expect(pairings).toHaveLength(2);
  });
});

describe('getDefaultBuddyForAgent', () => {
  test('returns null when no enabled pairing', () => {
    expect(getDefaultBuddyForAgent(db, leadId)).toBeNull();
  });

  test('returns earliest enabled pairing', () => {
    const pairing = createBuddyPairing(db, leadId, buddyId);
    const result = getDefaultBuddyForAgent(db, leadId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(pairing.id);
  });

  test('skips disabled pairings', () => {
    const pairing = createBuddyPairing(db, leadId, buddyId);
    updateBuddyPairing(db, pairing.id, { enabled: false });
    expect(getDefaultBuddyForAgent(db, leadId)).toBeNull();
  });
});

describe('updateBuddyPairing', () => {
  test('updates enabled flag', () => {
    const pairing = createBuddyPairing(db, leadId, buddyId);
    updateBuddyPairing(db, pairing.id, { enabled: false });
    const updated = getBuddyPairing(db, pairing.id)!;
    expect(updated.enabled).toBe(false);
  });

  test('updates maxRounds', () => {
    const pairing = createBuddyPairing(db, leadId, buddyId);
    updateBuddyPairing(db, pairing.id, { maxRounds: 10 });
    const updated = getBuddyPairing(db, pairing.id)!;
    expect(updated.maxRounds).toBe(10);
  });

  test('updates buddyRole', () => {
    const pairing = createBuddyPairing(db, leadId, buddyId);
    updateBuddyPairing(db, pairing.id, { buddyRole: 'collaborator' });
    const updated = getBuddyPairing(db, pairing.id)!;
    expect(updated.buddyRole).toBe('collaborator');
  });

  test('no-op when no updates provided', () => {
    const pairing = createBuddyPairing(db, leadId, buddyId);
    updateBuddyPairing(db, pairing.id, {});
    const unchanged = getBuddyPairing(db, pairing.id)!;
    expect(unchanged.maxRounds).toBe(pairing.maxRounds);
  });
});

describe('deleteBuddyPairing', () => {
  test('deletes a pairing', () => {
    const pairing = createBuddyPairing(db, leadId, buddyId);
    deleteBuddyPairing(db, pairing.id);
    expect(getBuddyPairing(db, pairing.id)).toBeNull();
  });

  test('no-op for nonexistent id', () => {
    expect(() => deleteBuddyPairing(db, 'nonexistent')).not.toThrow();
  });
});

// ── Sessions ─────────────────────────────────────────────────────────

describe('createBuddySession', () => {
  test('creates with defaults', () => {
    const session = createBuddySession(db, {
      leadAgentId: leadId,
      buddyAgentId: buddyId,
      prompt: 'Review this code',
      source: 'web',
    });
    expect(session.id).toBeTruthy();
    expect(session.leadAgentId).toBe(leadId);
    expect(session.buddyAgentId).toBe(buddyId);
    expect(session.prompt).toBe('Review this code');
    expect(session.source).toBe('web');
    expect(session.status).toBe('active');
    expect(session.currentRound).toBe(0);
    expect(session.maxRounds).toBe(5);
    expect(session.completedAt).toBeNull();
  });

  test('creates with custom maxRounds and source', () => {
    const session = createBuddySession(db, {
      leadAgentId: leadId,
      buddyAgentId: buddyId,
      prompt: 'Test',
      source: 'discord',
      sourceId: 'channel-123',
      maxRounds: 3,
    });
    expect(session.maxRounds).toBe(3);
    expect(session.source).toBe('discord');
    expect(session.sourceId).toBe('channel-123');
  });
});

describe('getBuddySession', () => {
  test('returns null for nonexistent id', () => {
    expect(getBuddySession(db, 'nope')).toBeNull();
  });
});

describe('listBuddySessions', () => {
  test('returns empty when none exist', () => {
    expect(listBuddySessions(db)).toEqual([]);
  });

  test('filters by leadAgentId', () => {
    createBuddySession(db, { leadAgentId: leadId, buddyAgentId: buddyId, prompt: 'A', source: 'web' });
    createBuddySession(db, { leadAgentId: buddyId, buddyAgentId: leadId, prompt: 'B', source: 'web' });
    const sessions = listBuddySessions(db, { leadAgentId: leadId });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].prompt).toBe('A');
  });

  test('filters by status', () => {
    const s = createBuddySession(db, { leadAgentId: leadId, buddyAgentId: buddyId, prompt: 'A', source: 'web' });
    updateBuddySessionStatus(db, s.id, 'completed');
    const active = listBuddySessions(db, { status: 'active' });
    const completed = listBuddySessions(db, { status: 'completed' });
    expect(active).toHaveLength(0);
    expect(completed).toHaveLength(1);
  });

  test('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      createBuddySession(db, { leadAgentId: leadId, buddyAgentId: buddyId, prompt: `P${i}`, source: 'web' });
    }
    const limited = listBuddySessions(db, { limit: 2 });
    expect(limited).toHaveLength(2);
  });
});

describe('updateBuddySessionStatus', () => {
  test('marks completed with timestamp', () => {
    const session = createBuddySession(db, { leadAgentId: leadId, buddyAgentId: buddyId, prompt: 'T', source: 'web' });
    updateBuddySessionStatus(db, session.id, 'completed', 3);
    const updated = getBuddySession(db, session.id)!;
    expect(updated.status).toBe('completed');
    expect(updated.completedAt).toBeTruthy();
    expect(updated.currentRound).toBe(3);
  });

  test('marks failed with timestamp', () => {
    const session = createBuddySession(db, { leadAgentId: leadId, buddyAgentId: buddyId, prompt: 'T', source: 'web' });
    updateBuddySessionStatus(db, session.id, 'failed');
    const updated = getBuddySession(db, session.id)!;
    expect(updated.status).toBe('failed');
    expect(updated.completedAt).toBeTruthy();
  });

  test('updates active status without completed_at', () => {
    const session = createBuddySession(db, { leadAgentId: leadId, buddyAgentId: buddyId, prompt: 'T', source: 'web' });
    updateBuddySessionStatus(db, session.id, 'active', 2);
    const updated = getBuddySession(db, session.id)!;
    expect(updated.status).toBe('active');
    expect(updated.completedAt).toBeNull();
    expect(updated.currentRound).toBe(2);
  });
});

// ── Messages ─────────────────────────────────────────────────────────

describe('addBuddyMessage', () => {
  test('creates a message', () => {
    const session = createBuddySession(db, { leadAgentId: leadId, buddyAgentId: buddyId, prompt: 'T', source: 'web' });
    const msg = addBuddyMessage(db, session.id, leadId, 1, 'lead', 'Here is my output');
    expect(msg.id).toBeTruthy();
    expect(msg.buddySessionId).toBe(session.id);
    expect(msg.agentId).toBe(leadId);
    expect(msg.round).toBe(1);
    expect(msg.role).toBe('lead');
    expect(msg.content).toBe('Here is my output');
  });
});

describe('listBuddyMessages', () => {
  test('returns messages ordered by round', () => {
    const session = createBuddySession(db, { leadAgentId: leadId, buddyAgentId: buddyId, prompt: 'T', source: 'web' });
    addBuddyMessage(db, session.id, leadId, 1, 'lead', 'Round 1 lead');
    addBuddyMessage(db, session.id, buddyId, 1, 'buddy', 'Round 1 review');
    addBuddyMessage(db, session.id, leadId, 2, 'lead', 'Round 2 lead');

    const messages = listBuddyMessages(db, session.id);
    expect(messages).toHaveLength(3);
    expect(messages[0].round).toBe(1);
    expect(messages[0].role).toBe('lead');
    expect(messages[1].round).toBe(1);
    expect(messages[1].role).toBe('buddy');
    expect(messages[2].round).toBe(2);
  });

  test('returns empty for unknown session', () => {
    expect(listBuddyMessages(db, 'nonexistent')).toEqual([]);
  });
});

// ── Cascade ──────────────────────────────────────────────────────────

describe('cascade deletes', () => {
  test('deleting agent cascades buddy pairings', () => {
    createBuddyPairing(db, leadId, buddyId);
    db.prepare('DELETE FROM agents WHERE id = ?').run(leadId);
    expect(listBuddyPairings(db, leadId)).toEqual([]);
  });

  test('deleting session cascades buddy messages', () => {
    const session = createBuddySession(db, { leadAgentId: leadId, buddyAgentId: buddyId, prompt: 'T', source: 'web' });
    addBuddyMessage(db, session.id, leadId, 1, 'lead', 'msg');
    db.prepare('DELETE FROM buddy_sessions WHERE id = ?').run(session.id);
    expect(listBuddyMessages(db, session.id)).toEqual([]);
  });
});
