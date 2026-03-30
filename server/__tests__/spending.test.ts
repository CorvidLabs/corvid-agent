import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import {
  checkAgentAlgoLimit,
  checkAlgoLimit,
  getAgentDailySpending,
  getAgentSpendingCap,
  getDailyTotals,
  getDefaultAgentDailyCap,
  getSpendingLimits,
  listAgentSpendingCaps,
  recordAgentAlgoSpend,
  recordAlgoSpend,
  recordApiCost,
  removeAgentSpendingCap,
  setAgentSpendingCap,
} from '../db/spending';
import { RateLimitError } from '../lib/errors';

let db: Database;
const AGENT_ID = 'agent-1';

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'test', 'test')`).run(AGENT_ID);
});

afterEach(() => {
  db.close();
});

// ── Global spending ──────────────────────────────────────────────────

describe('global spending', () => {
  test('getDailyTotals starts at zero', () => {
    const totals = getDailyTotals(db);
    expect(totals.algoMicro).toBe(0);
    expect(totals.apiCostUsd).toBe(0);
  });

  test('recordAlgoSpend accumulates', () => {
    recordAlgoSpend(db, 1000);
    recordAlgoSpend(db, 2000);
    const totals = getDailyTotals(db);
    expect(totals.algoMicro).toBe(3000);
  });

  test('recordApiCost accumulates', () => {
    recordApiCost(db, 0.5);
    recordApiCost(db, 0.25);
    const totals = getDailyTotals(db);
    expect(totals.apiCostUsd).toBeCloseTo(0.75);
  });

  test('getSpendingLimits returns configured limits', () => {
    const limits = getSpendingLimits();
    expect(limits.algoMicro).toBeGreaterThan(0);
  });
});

// ── checkAlgoLimit ───────────────────────────────────────────────────

describe('checkAlgoLimit', () => {
  test('does not throw when under limit', () => {
    expect(() => checkAlgoLimit(db, 100)).not.toThrow();
  });

  test('throws RateLimitError when limit exceeded', () => {
    // Spend up to the limit
    const limits = getSpendingLimits();
    recordAlgoSpend(db, limits.algoMicro);
    expect(() => checkAlgoLimit(db, 1)).toThrow(RateLimitError);
  });
});

// ── Per-agent spending caps ──────────────────────────────────────────

describe('agent spending caps', () => {
  test('getAgentSpendingCap returns null when not set', () => {
    expect(getAgentSpendingCap(db, AGENT_ID)).toBeNull();
  });

  test('setAgentSpendingCap creates cap', () => {
    const cap = setAgentSpendingCap(db, AGENT_ID, 5000000, 100);
    expect(cap.agentId).toBe(AGENT_ID);
    expect(cap.dailyLimitMicroalgos).toBe(5000000);
    expect(cap.dailyLimitUsdc).toBe(100);
  });

  test('setAgentSpendingCap upserts on conflict', () => {
    setAgentSpendingCap(db, AGENT_ID, 5000000);
    const updated = setAgentSpendingCap(db, AGENT_ID, 10000000);
    expect(updated.dailyLimitMicroalgos).toBe(10000000);
  });

  test('removeAgentSpendingCap', () => {
    setAgentSpendingCap(db, AGENT_ID, 5000000);
    expect(removeAgentSpendingCap(db, AGENT_ID)).toBe(true);
    expect(getAgentSpendingCap(db, AGENT_ID)).toBeNull();
  });

  test('removeAgentSpendingCap returns false when not set', () => {
    expect(removeAgentSpendingCap(db, AGENT_ID)).toBe(false);
  });

  test('listAgentSpendingCaps', () => {
    const agent2 = 'agent-2';
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'A2', 'test', 'test')`).run(agent2);

    setAgentSpendingCap(db, AGENT_ID, 5000000);
    setAgentSpendingCap(db, agent2, 3000000);
    expect(listAgentSpendingCaps(db)).toHaveLength(2);
  });
});

// ── Per-agent daily spending ─────────────────────────────────────────

describe('agent daily spending', () => {
  test('getAgentDailySpending starts at zero', () => {
    const spending = getAgentDailySpending(db, AGENT_ID);
    expect(spending.algoMicro).toBe(0);
    expect(spending.usdcMicro).toBe(0);
  });

  test('recordAgentAlgoSpend accumulates for agent and global', () => {
    recordAgentAlgoSpend(db, AGENT_ID, 1000);
    recordAgentAlgoSpend(db, AGENT_ID, 2000);

    const agentSpending = getAgentDailySpending(db, AGENT_ID);
    expect(agentSpending.algoMicro).toBe(3000);

    const globalTotals = getDailyTotals(db);
    expect(globalTotals.algoMicro).toBe(3000);
  });

  test('getDefaultAgentDailyCap returns configured default', () => {
    const cap = getDefaultAgentDailyCap();
    expect(cap.microalgos).toBeGreaterThan(0);
  });
});

// ── checkAgentAlgoLimit ──────────────────────────────────────────────

describe('checkAgentAlgoLimit', () => {
  test('does not throw when under both limits', () => {
    expect(() => checkAgentAlgoLimit(db, AGENT_ID, 100)).not.toThrow();
  });

  test('throws when agent cap exceeded', () => {
    setAgentSpendingCap(db, AGENT_ID, 1000); // 1000 micro ALGO cap
    recordAgentAlgoSpend(db, AGENT_ID, 900);
    expect(() => checkAgentAlgoLimit(db, AGENT_ID, 200)).toThrow(RateLimitError);
  });

  test('does not throw when under agent cap', () => {
    setAgentSpendingCap(db, AGENT_ID, 1000);
    recordAgentAlgoSpend(db, AGENT_ID, 500);
    expect(() => checkAgentAlgoLimit(db, AGENT_ID, 100)).not.toThrow();
  });

  test('throws when global limit exceeded', () => {
    const limits = getSpendingLimits();
    recordAlgoSpend(db, limits.algoMicro);
    expect(() => checkAgentAlgoLimit(db, AGENT_ID, 1)).toThrow(RateLimitError);
  });
});
