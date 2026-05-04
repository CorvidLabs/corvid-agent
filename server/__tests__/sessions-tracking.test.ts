import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { runMigrations } from '../db/schema';
import {
  createSession,
  getSession,
  getSessionCumulativeTurns,
  incrementSessionCumulativeTurns,
  updateSessionContextTokens,
} from '../db/sessions';

let db: Database;

beforeAll(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterAll(() => db.close());

describe('getSessionCumulativeTurns', () => {
  it('returns 0 for a non-existent session', () => {
    expect(getSessionCumulativeTurns(db, 'nonexistent-id')).toBe(0);
  });

  it('returns 0 for a newly created session', () => {
    const session = createSession(db, { name: 'Turn baseline' });
    expect(getSessionCumulativeTurns(db, session.id)).toBe(0);
  });
});

describe('incrementSessionCumulativeTurns', () => {
  it('increments from 0 to 1', () => {
    const session = createSession(db, { name: 'Single increment' });
    incrementSessionCumulativeTurns(db, session.id);
    expect(getSessionCumulativeTurns(db, session.id)).toBe(1);
  });

  it('accumulates across multiple calls', () => {
    const session = createSession(db, { name: 'Multi increment' });
    incrementSessionCumulativeTurns(db, session.id);
    incrementSessionCumulativeTurns(db, session.id);
    incrementSessionCumulativeTurns(db, session.id);
    expect(getSessionCumulativeTurns(db, session.id)).toBe(3);
  });

  it('increments independently per session', () => {
    const s1 = createSession(db, { name: 'Session A' });
    const s2 = createSession(db, { name: 'Session B' });
    incrementSessionCumulativeTurns(db, s1.id);
    incrementSessionCumulativeTurns(db, s1.id);
    incrementSessionCumulativeTurns(db, s2.id);
    expect(getSessionCumulativeTurns(db, s1.id)).toBe(2);
    expect(getSessionCumulativeTurns(db, s2.id)).toBe(1);
  });
});

describe('updateSessionContextTokens', () => {
  it('newly created session has null context token fields', () => {
    const session = createSession(db, { name: 'Token null baseline' });
    expect(session.lastContextTokens).toBeNull();
    expect(session.lastContextWindow).toBeNull();
  });

  it('persists context tokens and window size via getSession', () => {
    const session = createSession(db, { name: 'Token persist' });
    updateSessionContextTokens(db, session.id, 8192, 200000);
    const updated = getSession(db, session.id);
    expect(updated?.lastContextTokens).toBe(8192);
    expect(updated?.lastContextWindow).toBe(200000);
  });

  it('overwrites previous values on subsequent update', () => {
    const session = createSession(db, { name: 'Token overwrite' });
    updateSessionContextTokens(db, session.id, 5000, 100000);
    updateSessionContextTokens(db, session.id, 9000, 200000);
    const updated = getSession(db, session.id);
    expect(updated?.lastContextTokens).toBe(9000);
    expect(updated?.lastContextWindow).toBe(200000);
  });
});
