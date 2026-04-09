/**
 * Tests for server/db/usdc-revenue.ts — CRUD and summary functions
 * for the agent_usdc_revenue table.
 *
 * Covers:
 * - recordRevenue: insert, idempotent on duplicate txid
 * - markForwarded: sets forward_txid and status
 * - markForwardFailed: sets status to failed
 * - getPendingRevenue: returns only pending entries, ordered by created_at
 * - getAgentRevenue: filters by agent
 * - getAgentRevenueSummary: aggregated totals for empty and populated agents
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createAgent } from '../db/agents';
import { runMigrations } from '../db/schema';
import {
  getAgentRevenue,
  getAgentRevenueSummary,
  getPendingRevenue,
  markForwarded,
  markForwardFailed,
  recordRevenue,
} from '../db/usdc-revenue';

let db: Database;
let agentId: string;
let agentId2: string;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);

  const agent = createAgent(db, { name: 'Test Agent' });
  agentId = agent.id;

  const agent2 = createAgent(db, { name: 'Test Agent 2' });
  agentId2 = agent2.id;
});

afterEach(() => {
  db.close();
});

// ── recordRevenue ─────────────────────────────────────────────────────────────

describe('recordRevenue', () => {
  it('inserts a new revenue record and returns true', () => {
    const ok = recordRevenue(db, agentId, 1_000_000, 'SENDER123', 'txid-001');
    expect(ok).toBe(true);
  });

  it('returns false on duplicate txid (idempotent)', () => {
    recordRevenue(db, agentId, 1_000_000, 'SENDER123', 'txid-dup');
    const second = recordRevenue(db, agentId, 2_000_000, 'SENDER456', 'txid-dup');
    expect(second).toBe(false);
  });

  it('allows multiple records for the same agent with different txids', () => {
    const a = recordRevenue(db, agentId, 500_000, 'ADDR1', 'tx-a');
    const b = recordRevenue(db, agentId, 750_000, 'ADDR2', 'tx-b');
    expect(a).toBe(true);
    expect(b).toBe(true);

    const rows = getAgentRevenue(db, agentId);
    expect(rows.length).toBe(2);
  });

  it('allows same txid for different agents — no, txid is globally unique', () => {
    recordRevenue(db, agentId, 1_000_000, 'ADDR1', 'tx-shared');
    const second = recordRevenue(db, agentId2, 1_000_000, 'ADDR1', 'tx-shared');
    expect(second).toBe(false); // UNIQUE constraint on txid is global
  });
});

// ── markForwarded ─────────────────────────────────────────────────────────────

describe('markForwarded', () => {
  it('sets forward_txid and forward_status to forwarded', () => {
    recordRevenue(db, agentId, 1_000_000, 'SENDER', 'txid-fwd');
    const rows = getAgentRevenue(db, agentId);
    const id = rows[0].id;

    markForwarded(db, id, 'fwd-txid-xyz');

    const updated = getAgentRevenue(db, agentId);
    expect(updated[0].forward_txid).toBe('fwd-txid-xyz');
    expect(updated[0].forward_status).toBe('forwarded');
  });

  it('forwarded records do not appear in getPendingRevenue', () => {
    recordRevenue(db, agentId, 1_000_000, 'SENDER', 'txid-forwarded');
    const [row] = getAgentRevenue(db, agentId);
    markForwarded(db, row.id, 'fwd-tx');

    expect(getPendingRevenue(db).length).toBe(0);
  });
});

// ── markForwardFailed ─────────────────────────────────────────────────────────

describe('markForwardFailed', () => {
  it('sets forward_status to failed', () => {
    recordRevenue(db, agentId, 500_000, 'SENDER', 'txid-fail');
    const [row] = getAgentRevenue(db, agentId);
    markForwardFailed(db, row.id);

    const updated = getAgentRevenue(db, agentId);
    expect(updated[0].forward_status).toBe('failed');
    expect(updated[0].forward_txid).toBeNull();
  });

  it('failed records do not appear in getPendingRevenue', () => {
    recordRevenue(db, agentId, 500_000, 'SENDER', 'txid-fail2');
    const [row] = getAgentRevenue(db, agentId);
    markForwardFailed(db, row.id);

    expect(getPendingRevenue(db).length).toBe(0);
  });
});

// ── getPendingRevenue ─────────────────────────────────────────────────────────

describe('getPendingRevenue', () => {
  it('returns empty array when no records exist', () => {
    expect(getPendingRevenue(db)).toEqual([]);
  });

  it('returns only pending records', () => {
    recordRevenue(db, agentId, 1_000_000, 'ADDR1', 'tx-p1');
    recordRevenue(db, agentId, 2_000_000, 'ADDR2', 'tx-p2');
    recordRevenue(db, agentId, 3_000_000, 'ADDR3', 'tx-fwd');

    const rows = getAgentRevenue(db, agentId);
    const fwdRow = rows.find((r) => r.txid === 'tx-fwd')!;
    markForwarded(db, fwdRow.id, 'some-fwd-tx');

    const pending = getPendingRevenue(db);
    expect(pending.length).toBe(2);
    expect(pending.every((r) => r.forward_status === 'pending')).toBe(true);
  });

  it('returns records from multiple agents', () => {
    recordRevenue(db, agentId, 1_000_000, 'ADDR1', 'tx-multi-1');
    recordRevenue(db, agentId2, 2_000_000, 'ADDR2', 'tx-multi-2');

    const pending = getPendingRevenue(db);
    expect(pending.length).toBe(2);
  });
});

// ── getAgentRevenue ───────────────────────────────────────────────────────────

describe('getAgentRevenue', () => {
  it('returns empty array for agent with no records', () => {
    expect(getAgentRevenue(db, agentId)).toEqual([]);
  });

  it('returns only records for the specified agent', () => {
    recordRevenue(db, agentId, 1_000_000, 'ADDR1', 'tx-agent1');
    recordRevenue(db, agentId2, 2_000_000, 'ADDR2', 'tx-agent2');

    const rows = getAgentRevenue(db, agentId);
    expect(rows.length).toBe(1);
    expect(rows[0].agent_id).toBe(agentId);
    expect(rows[0].txid).toBe('tx-agent1');
  });

  it('includes all fields', () => {
    recordRevenue(db, agentId, 1_500_000, 'SENDER_ADDR', 'tx-fields');
    const [row] = getAgentRevenue(db, agentId);

    expect(row.agent_id).toBe(agentId);
    expect(row.amount_micro).toBe(1_500_000);
    expect(row.from_address).toBe('SENDER_ADDR');
    expect(row.txid).toBe('tx-fields');
    expect(row.forward_status).toBe('pending');
    expect(row.forward_txid).toBeNull();
    expect(row.created_at).toBeDefined();
  });
});

// ── getAgentRevenueSummary ────────────────────────────────────────────────────

describe('getAgentRevenueSummary', () => {
  it('returns zero summary for agent with no records', () => {
    const summary = getAgentRevenueSummary(db, agentId);
    expect(summary.totalEarnedMicro).toBe(0);
    expect(summary.totalForwardedMicro).toBe(0);
    expect(summary.pendingMicro).toBe(0);
    expect(summary.entryCount).toBe(0);
  });

  it('totals earned correctly across multiple records', () => {
    recordRevenue(db, agentId, 1_000_000, 'A1', 'tx-sum-1');
    recordRevenue(db, agentId, 2_000_000, 'A2', 'tx-sum-2');

    const summary = getAgentRevenueSummary(db, agentId);
    expect(summary.totalEarnedMicro).toBe(3_000_000);
    expect(summary.entryCount).toBe(2);
  });

  it('correctly splits pending vs forwarded', () => {
    recordRevenue(db, agentId, 1_000_000, 'A1', 'tx-split-1');
    recordRevenue(db, agentId, 2_000_000, 'A2', 'tx-split-2');

    const rows = getAgentRevenue(db, agentId);
    const toForward = rows.find((r) => r.txid === 'tx-split-1')!;
    markForwarded(db, toForward.id, 'fwd-tx-123');

    const summary = getAgentRevenueSummary(db, agentId);
    expect(summary.totalEarnedMicro).toBe(3_000_000);
    expect(summary.totalForwardedMicro).toBe(1_000_000);
    expect(summary.pendingMicro).toBe(2_000_000);
    expect(summary.entryCount).toBe(2);
  });

  it('failed entries count as earned but not forwarded or pending', () => {
    recordRevenue(db, agentId, 1_000_000, 'A1', 'tx-failed-summary');
    const [row] = getAgentRevenue(db, agentId);
    markForwardFailed(db, row.id);

    const summary = getAgentRevenueSummary(db, agentId);
    expect(summary.totalEarnedMicro).toBe(1_000_000);
    expect(summary.totalForwardedMicro).toBe(0);
    expect(summary.pendingMicro).toBe(0);
    expect(summary.entryCount).toBe(1);
  });

  it('isolates summaries per agent', () => {
    recordRevenue(db, agentId, 5_000_000, 'A1', 'tx-iso-1');
    recordRevenue(db, agentId2, 1_000_000, 'A2', 'tx-iso-2');

    const s1 = getAgentRevenueSummary(db, agentId);
    const s2 = getAgentRevenueSummary(db, agentId2);

    expect(s1.totalEarnedMicro).toBe(5_000_000);
    expect(s2.totalEarnedMicro).toBe(1_000_000);
  });
});
