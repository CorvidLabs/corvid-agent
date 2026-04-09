/**
 * Tests for the Flock Directory service:
 * - Agent registration, deregistration
 * - Heartbeat and stale sweep
 * - Search and filtering
 * - Lookup by ID and address
 */

import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { FlockDirectoryService } from '../flock-directory/service';

// ─── DB Setup ────────────────────────────────────────────────────────────────

let db: Database;
let svc: FlockDirectoryService;

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
  svc = new FlockDirectoryService(db);
});

// ─── Registration ────────────────────────────────────────────────────────────

describe('register', () => {
  test('creates an agent and returns it', async () => {
    const agent = await svc.register({
      address: 'ALGO123456789',
      name: 'TestAgent',
      description: 'A test agent',
      capabilities: ['coding', 'research'],
    });

    expect(agent.id).toBeTruthy();
    expect(agent.address).toBe('ALGO123456789');
    expect(agent.name).toBe('TestAgent');
    expect(agent.description).toBe('A test agent');
    expect(agent.capabilities).toEqual(['coding', 'research']);
    expect(agent.status).toBe('active');
    expect(agent.reputationScore).toBe(0);
    expect(agent.lastHeartbeat).toBeTruthy();
  });

  test('re-registration with same address updates existing record', async () => {
    const first = await svc.register({ address: 'ALGO_UNIQUE', name: 'Agent1' });
    const second = await svc.register({ address: 'ALGO_UNIQUE', name: 'Agent2' });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Agent2');
  });

  test('defaults capabilities to empty array', async () => {
    const agent = await svc.register({ address: 'ALGO_EMPTY', name: 'EmptyAgent' });
    expect(agent.capabilities).toEqual([]);
  });
});

// ─── Deregistration ──────────────────────────────────────────────────────────

describe('deregister', () => {
  test('soft-deletes an agent', async () => {
    const agent = await svc.register({ address: 'ALGO_DEL', name: 'ToDelete' });
    const ok = await svc.deregister(agent.id);
    expect(ok).toBe(true);

    const found = svc.getById(agent.id);
    expect(found).not.toBeNull();
    expect(found!.status).toBe('deregistered');
  });

  test('returns false for non-existent agent', async () => {
    expect(await svc.deregister('nonexistent-id')).toBe(false);
  });

  test('returns false for already deregistered agent', async () => {
    const agent = await svc.register({ address: 'ALGO_ALREADY', name: 'Already' });
    await svc.deregister(agent.id);
    expect(await svc.deregister(agent.id)).toBe(false);
  });
});

// ─── Heartbeat ───────────────────────────────────────────────────────────────

describe('heartbeat', () => {
  test('updates last heartbeat', async () => {
    const agent = await svc.register({ address: 'ALGO_HB', name: 'HeartbeatAgent' });

    const ok = await svc.heartbeat(agent.id);
    expect(ok).toBe(true);

    const updated = svc.getById(agent.id)!;
    expect(updated.lastHeartbeat).toBeTruthy();
    expect(updated.status).toBe('active');
  });

  test('returns false for deregistered agent', async () => {
    const agent = await svc.register({ address: 'ALGO_HB2', name: 'Dead' });
    await svc.deregister(agent.id);
    expect(await svc.heartbeat(agent.id)).toBe(false);
  });
});

// ─── Update ──────────────────────────────────────────────────────────────────

describe('update', () => {
  test('updates agent metadata', async () => {
    const agent = await svc.register({ address: 'ALGO_UPD', name: 'OldName' });
    const updated = svc.update(agent.id, {
      name: 'NewName',
      description: 'Updated description',
      capabilities: ['security'],
      reputationScore: 85,
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('NewName');
    expect(updated!.description).toBe('Updated description');
    expect(updated!.capabilities).toEqual(['security']);
    expect(updated!.reputationScore).toBe(85);
  });

  test('returns null for deregistered agent', async () => {
    const agent = await svc.register({ address: 'ALGO_UPD2', name: 'Gone' });
    await svc.deregister(agent.id);
    expect(svc.update(agent.id, { name: 'Nope' })).toBeNull();
  });

  test('returns agent unchanged for empty update', async () => {
    const agent = await svc.register({ address: 'ALGO_UPD3', name: 'Unchanged' });
    const updated = svc.update(agent.id, {});
    expect(updated!.name).toBe('Unchanged');
  });
});

// ─── Lookup ──────────────────────────────────────────────────────────────────

describe('lookup', () => {
  test('getById returns agent by ID', async () => {
    const agent = await svc.register({ address: 'ALGO_LOOK', name: 'LookupAgent' });
    const found = svc.getById(agent.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('LookupAgent');
  });

  test('getByAddress returns agent by address', async () => {
    await svc.register({ address: 'ALGO_ADDR_LOOK', name: 'AddrAgent' });
    const found = svc.getByAddress('ALGO_ADDR_LOOK');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('AddrAgent');
  });

  test('returns null for non-existent ID', () => {
    expect(svc.getById('nonexistent')).toBeNull();
  });

  test('returns null for non-existent address', () => {
    expect(svc.getByAddress('ALGO_NOPE')).toBeNull();
  });
});

// ─── List & Search ───────────────────────────────────────────────────────────

describe('listActive', () => {
  test('returns only active agents sorted by reputation', async () => {
    await svc.register({ address: 'ALGO_A1', name: 'Agent1' });
    const a2 = await svc.register({ address: 'ALGO_A2', name: 'Agent2' });
    svc.update(a2.id, { reputationScore: 90 });
    await svc.register({ address: 'ALGO_A3', name: 'Agent3' });
    const a4 = await svc.register({ address: 'ALGO_A4', name: 'Agent4' });
    await svc.deregister(a4.id);

    const active = svc.listActive();
    expect(active.length).toBe(3);
    expect(active[0].name).toBe('Agent2'); // highest rep
  });

  test('respects limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await svc.register({ address: `ALGO_PAGE_${i}`, name: `Agent${i}` });
    }
    const page = svc.listActive(2, 1);
    expect(page.length).toBe(2);
  });
});

describe('search', () => {
  test('searches by query', async () => {
    await svc.register({ address: 'ALGO_S1', name: 'CodeBot', description: 'A coding assistant' });
    await svc.register({ address: 'ALGO_S2', name: 'ResearchBot', description: 'A research tool' });

    const result = svc.search({ query: 'coding' });
    expect(result.total).toBe(1);
    expect(result.agents[0].name).toBe('CodeBot');
  });

  test('searches by capability', async () => {
    await svc.register({ address: 'ALGO_C1', name: 'SecBot', capabilities: ['security', 'audit'] });
    await svc.register({ address: 'ALGO_C2', name: 'DevBot', capabilities: ['coding', 'devops'] });

    const result = svc.search({ capability: 'security' });
    expect(result.total).toBe(1);
    expect(result.agents[0].name).toBe('SecBot');
  });

  test('filters by minimum reputation', async () => {
    const a1 = await svc.register({ address: 'ALGO_R1', name: 'HighRep' });
    svc.update(a1.id, { reputationScore: 90 });
    await svc.register({ address: 'ALGO_R2', name: 'LowRep' });

    const result = svc.search({ minReputation: 50 });
    expect(result.total).toBe(1);
    expect(result.agents[0].name).toBe('HighRep');
  });

  test('excludes deregistered agents by default', async () => {
    await svc.register({ address: 'ALGO_EX1', name: 'Active' });
    const a2 = await svc.register({ address: 'ALGO_EX2', name: 'Gone' });
    await svc.deregister(a2.id);

    const result = svc.search({});
    expect(result.total).toBe(1);
  });

  test('filters by status when specified', async () => {
    await svc.register({ address: 'ALGO_ST1', name: 'Active' });
    const a2 = await svc.register({ address: 'ALGO_ST2', name: 'Dereg' });
    await svc.deregister(a2.id);

    const result = svc.search({ status: 'deregistered' });
    expect(result.total).toBe(1);
    expect(result.agents[0].name).toBe('Dereg');
  });
});

// ─── Stats ───────────────────────────────────────────────────────────────────

describe('getStats', () => {
  test('returns correct counts', async () => {
    await svc.register({ address: 'ALGO_STAT1', name: 'Active1' });
    await svc.register({ address: 'ALGO_STAT2', name: 'Active2' });
    const a3 = await svc.register({ address: 'ALGO_STAT3', name: 'Dereg' });
    await svc.deregister(a3.id);

    const stats = svc.getStats();
    expect(stats.total).toBe(2); // excludes deregistered
    expect(stats.active).toBe(2);
    expect(stats.inactive).toBe(0);
  });
});

// ─── Stale Sweep ─────────────────────────────────────────────────────────────

describe('sweepStaleAgents', () => {
  test('marks agents with old heartbeats as inactive', async () => {
    const agent = await svc.register({ address: 'ALGO_STALE', name: 'Stale' });

    // Manually set heartbeat to the past
    db.query(`UPDATE flock_agents SET last_heartbeat = datetime('now', '-25 hours') WHERE id = ?`).run(agent.id);

    const count = svc.sweepStaleAgents();
    expect(count).toBe(1);

    const updated = svc.getById(agent.id)!;
    expect(updated.status).toBe('inactive');
  });

  test('does not touch agents with recent heartbeats', async () => {
    await svc.register({ address: 'ALGO_RECENT', name: 'Recent' });

    const count = svc.sweepStaleAgents();
    expect(count).toBe(0);
  });
});

// ─── Search Sorting ─────────────────────────────────────────────────────────

describe('search sorting', () => {
  test('sorts by name ascending', async () => {
    await svc.register({ address: 'ALGO_SORT1', name: 'Zebra' });
    await svc.register({ address: 'ALGO_SORT2', name: 'Alpha' });
    await svc.register({ address: 'ALGO_SORT3', name: 'Middle' });

    const result = svc.search({ sortBy: 'name', sortOrder: 'asc' });
    expect(result.agents[0].name).toBe('Alpha');
    expect(result.agents[1].name).toBe('Middle');
    expect(result.agents[2].name).toBe('Zebra');
  });

  test('sorts by name descending', async () => {
    await svc.register({ address: 'ALGO_SORTD1', name: 'Zebra' });
    await svc.register({ address: 'ALGO_SORTD2', name: 'Alpha' });

    const result = svc.search({ sortBy: 'name', sortOrder: 'desc' });
    expect(result.agents[0].name).toBe('Zebra');
    expect(result.agents[1].name).toBe('Alpha');
  });

  test('sorts by uptime descending', async () => {
    const a1 = await svc.register({ address: 'ALGO_UP1', name: 'LowUp' });
    const a2 = await svc.register({ address: 'ALGO_UP2', name: 'HighUp' });
    svc.update(a1.id, { uptimePct: 50 });
    svc.update(a2.id, { uptimePct: 99 });

    const result = svc.search({ sortBy: 'uptime', sortOrder: 'desc' });
    expect(result.agents[0].name).toBe('HighUp');
    expect(result.agents[1].name).toBe('LowUp');
  });

  test('sorts by registered date ascending', async () => {
    const a1 = await svc.register({ address: 'ALGO_REG1', name: 'First' });
    // Manually backdate the first agent
    db.query(`UPDATE flock_agents SET registered_at = datetime('now', '-1 day') WHERE id = ?`).run(a1.id);
    await svc.register({ address: 'ALGO_REG2', name: 'Second' });

    const result = svc.search({ sortBy: 'registered', sortOrder: 'asc' });
    expect(result.agents[0].name).toBe('First');
    expect(result.agents[1].name).toBe('Second');
  });

  test('sorts by attestations descending', async () => {
    const a1 = await svc.register({ address: 'ALGO_ATT1', name: 'FewAttest' });
    const a2 = await svc.register({ address: 'ALGO_ATT2', name: 'ManyAttest' });
    svc.update(a1.id, { attestationCount: 2 });
    svc.update(a2.id, { attestationCount: 15 });

    const result = svc.search({ sortBy: 'attestations', sortOrder: 'desc' });
    expect(result.agents[0].name).toBe('ManyAttest');
    expect(result.agents[1].name).toBe('FewAttest');
  });

  test('defaults to reputation desc when no sort specified', async () => {
    const a1 = await svc.register({ address: 'ALGO_DEF1', name: 'LowRep' });
    const a2 = await svc.register({ address: 'ALGO_DEF2', name: 'HighRep' });
    svc.update(a1.id, { reputationScore: 10 });
    svc.update(a2.id, { reputationScore: 90 });

    const result = svc.search({});
    expect(result.agents[0].name).toBe('HighRep');
  });
});

// ─── Reputation Computation ─────────────────────────────────────────────────

describe('computeReputation', () => {
  test('computes score from component metrics', async () => {
    const agent = await svc.register({ address: 'ALGO_REP1', name: 'RepAgent' });
    svc.update(agent.id, {
      uptimePct: 95,
      attestationCount: 10,
      councilParticipations: 5,
    });

    const updated = svc.computeReputation(agent.id);
    expect(updated).not.toBeNull();
    // Score should be > 0 and <= 100
    expect(updated!.reputationScore).toBeGreaterThan(0);
    expect(updated!.reputationScore).toBeLessThanOrEqual(100);
  });

  test('returns 0-based score for brand new agent', async () => {
    const agent = await svc.register({ address: 'ALGO_REP_NEW', name: 'NewAgent' });

    const updated = svc.computeReputation(agent.id);
    expect(updated).not.toBeNull();
    // New agent with 0 uptime, 0 attestations, 0 council: only heartbeat score
    expect(updated!.reputationScore).toBe(20); // active heartbeat = 20 points
  });

  test('returns null for deregistered agent', async () => {
    const agent = await svc.register({ address: 'ALGO_REP_DEREG', name: 'DeregAgent' });
    await svc.deregister(agent.id);

    expect(svc.computeReputation(agent.id)).toBeNull();
  });

  test('returns null for non-existent agent', () => {
    expect(svc.computeReputation('nonexistent')).toBeNull();
  });

  test('higher uptime increases score', async () => {
    const a1 = await svc.register({ address: 'ALGO_REP_LOW', name: 'LowUptime' });
    const a2 = await svc.register({ address: 'ALGO_REP_HIGH', name: 'HighUptime' });
    svc.update(a1.id, { uptimePct: 20 });
    svc.update(a2.id, { uptimePct: 95 });

    const s1 = svc.computeReputation(a1.id)!;
    const s2 = svc.computeReputation(a2.id)!;
    expect(s2.reputationScore).toBeGreaterThan(s1.reputationScore);
  });

  test('inactive agent gets lower heartbeat score', async () => {
    const agent = await svc.register({ address: 'ALGO_REP_INACTIVE', name: 'InactiveAgent' });
    svc.update(agent.id, { uptimePct: 50, attestationCount: 5 });

    // Compute while active
    const activeScore = svc.computeReputation(agent.id)!.reputationScore;

    // Mark inactive via stale heartbeat
    db.query(`UPDATE flock_agents SET last_heartbeat = datetime('now', '-25 hours') WHERE id = ?`).run(agent.id);
    svc.sweepStaleAgents();

    const inactiveScore = svc.computeReputation(agent.id)!.reputationScore;
    expect(inactiveScore).toBeLessThan(activeScore);
  });

  test('score is clamped to 0-100 range', async () => {
    const agent = await svc.register({ address: 'ALGO_REP_MAX', name: 'MaxAgent' });
    svc.update(agent.id, {
      uptimePct: 100,
      attestationCount: 20,
      councilParticipations: 10,
    });

    const updated = svc.computeReputation(agent.id)!;
    expect(updated.reputationScore).toBeLessThanOrEqual(100);
    expect(updated.reputationScore).toBeGreaterThanOrEqual(0);
  });
});

// ─── Recompute All Reputations ──────────────────────────────────────────────

describe('recomputeAllReputations', () => {
  test('updates all non-deregistered agents', async () => {
    const a1 = await svc.register({ address: 'ALGO_RECOMP1', name: 'Agent1' });
    const a2 = await svc.register({ address: 'ALGO_RECOMP2', name: 'Agent2' });
    const a3 = await svc.register({ address: 'ALGO_RECOMP3', name: 'Agent3' });
    await svc.deregister(a3.id);

    svc.update(a1.id, { uptimePct: 80 });
    svc.update(a2.id, { uptimePct: 60, attestationCount: 5 });

    const count = svc.recomputeAllReputations();
    expect(count).toBe(2); // excludes deregistered

    // Verify scores were actually updated
    const updated1 = svc.getById(a1.id)!;
    const updated2 = svc.getById(a2.id)!;
    expect(updated1.reputationScore).toBeGreaterThan(0);
    expect(updated2.reputationScore).toBeGreaterThan(0);
  });
});
