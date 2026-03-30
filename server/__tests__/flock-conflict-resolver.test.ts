/**
 * Tests for FlockConflictResolver:
 * - Claim creation and release
 * - Conflict detection (same issue, same branch, same repo)
 * - Expired claim override
 * - Stats and listing
 */

import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { FlockConflictResolver } from '../flock-directory/conflict-resolver';
import { FlockDirectoryService } from '../flock-directory/service';

let db: Database;
let flockService: FlockDirectoryService;
let resolver: FlockConflictResolver;

const AGENT_A_ID = 'agent-aaa-111';
const AGENT_B_ID = 'agent-bbb-222';

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
  flockService = new FlockDirectoryService(db);
  resolver = new FlockConflictResolver(db, flockService, {
    selfAgentId: AGENT_A_ID,
    selfAgentName: 'AgentA',
  });
  resolver.ensureSchema();
});

// ─── Claim Creation ─────────────────────────────────────────────────────────

describe('checkAndClaim', () => {
  test('creates a claim when no conflicts exist', () => {
    const result = resolver.checkAndClaim({
      repo: 'CorvidLabs/corvid-agent',
      issueNumber: 42,
      description: 'Fix the bug',
    });

    expect(result.allowed).toBe(true);
    expect(result.claim).toBeTruthy();
    expect(result.claim!.repo).toBe('CorvidLabs/corvid-agent');
    expect(result.claim!.issueNumber).toBe(42);
    expect(result.claim!.agentId).toBe(AGENT_A_ID);
    expect(result.claim!.agentName).toBe('AgentA');
    expect(result.claim!.status).toBe('active');
    expect(result.conflicts).toHaveLength(0);
  });

  test('allows same agent to claim different issues on same repo', () => {
    resolver.checkAndClaim({
      repo: 'CorvidLabs/corvid-agent',
      issueNumber: 1,
      description: 'First issue',
    });

    const result = resolver.checkAndClaim({
      repo: 'CorvidLabs/corvid-agent',
      issueNumber: 2,
      description: 'Second issue',
    });

    // Same agent, different issue — own claims are not conflicts
    expect(result.allowed).toBe(true);
  });

  test('allows claim without issue number', () => {
    const result = resolver.checkAndClaim({
      repo: 'CorvidLabs/corvid-agent',
      description: 'General maintenance',
    });

    expect(result.allowed).toBe(true);
    expect(result.claim!.issueNumber).toBeNull();
  });
});

// ─── Conflict Detection ─────────────────────────────────────────────────────

describe('conflict detection', () => {
  test('blocks when another agent claims the same issue', () => {
    // Simulate Agent B's claim by inserting directly
    db.query(`
            INSERT INTO work_claims (id, agent_id, agent_name, repo, issue_number, description, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+1 hour'))
        `).run('claim-b', AGENT_B_ID, 'AgentB', 'CorvidLabs/corvid-agent', 42, 'Working on it');

    const result = resolver.checkAndClaim({
      repo: 'CorvidLabs/corvid-agent',
      issueNumber: 42,
      description: 'Also want to work on it',
    });

    expect(result.allowed).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].reason).toBe('same_issue');
    expect(result.conflicts[0].existingClaim.agentName).toBe('AgentB');
    expect(result.conflicts[0].overridable).toBe(false);
  });

  test('blocks when another agent claims the same branch', () => {
    db.query(`
            INSERT INTO work_claims (id, agent_id, agent_name, repo, branch, description, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+1 hour'))
        `).run('claim-b', AGENT_B_ID, 'AgentB', 'CorvidLabs/corvid-agent', 'fix/bug-123', 'Working');

    const result = resolver.checkAndClaim({
      repo: 'CorvidLabs/corvid-agent',
      branch: 'fix/bug-123',
      description: 'Also on this branch',
    });

    expect(result.allowed).toBe(false);
    expect(result.conflicts[0].reason).toBe('same_branch');
  });

  test('does not block on same repo with different issue by default', () => {
    db.query(`
            INSERT INTO work_claims (id, agent_id, agent_name, repo, issue_number, description, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+1 hour'))
        `).run('claim-b', AGENT_B_ID, 'AgentB', 'CorvidLabs/corvid-agent', 99, 'Different issue');

    const result = resolver.checkAndClaim({
      repo: 'CorvidLabs/corvid-agent',
      issueNumber: 42,
      description: 'My issue',
    });

    // Different issue, same repo — allowed by default (blockOnSameRepo=false)
    expect(result.allowed).toBe(true);
  });

  test('blocks on same repo when blockOnSameRepo is enabled', () => {
    const strictResolver = new FlockConflictResolver(db, flockService, {
      selfAgentId: AGENT_A_ID,
      selfAgentName: 'AgentA',
      blockOnSameRepo: true,
    });

    db.query(`
            INSERT INTO work_claims (id, agent_id, agent_name, repo, issue_number, description, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+1 hour'))
        `).run('claim-b', AGENT_B_ID, 'AgentB', 'CorvidLabs/corvid-agent', 99, 'Different issue');

    const result = strictResolver.checkAndClaim({
      repo: 'CorvidLabs/corvid-agent',
      issueNumber: 42,
      description: 'My issue',
    });

    expect(result.allowed).toBe(false);
    expect(result.conflicts[0].reason).toBe('same_repo');
  });
});

// ─── Expired Claims ─────────────────────────────────────────────────────────

describe('expired claim handling', () => {
  test('overrides expired claims and allows new claim', () => {
    // Insert an expired claim from Agent B
    db.query(`
            INSERT INTO work_claims (id, agent_id, agent_name, repo, issue_number, description, expires_at, status)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-1 hour'), 'active')
        `).run('claim-expired', AGENT_B_ID, 'AgentB', 'CorvidLabs/corvid-agent', 42, 'Was working');

    const result = resolver.checkAndClaim({
      repo: 'CorvidLabs/corvid-agent',
      issueNumber: 42,
      description: 'Taking over',
    });

    expect(result.allowed).toBe(true);
    expect(result.claim).toBeTruthy();

    // The expired claim should be superseded
    const oldClaim = resolver.getClaim('claim-expired');
    expect(oldClaim).toBeTruthy();
    // It should be marked as expired or superseded (cleaned by cleanExpired)
    expect(['expired', 'superseded']).toContain(oldClaim!.status);
  });
});

// ─── Claim Release ──────────────────────────────────────────────────────────

describe('releaseClaim', () => {
  test('releases an active claim', () => {
    const { claim } = resolver.checkAndClaim({
      repo: 'CorvidLabs/corvid-agent',
      issueNumber: 42,
      description: 'Working',
    });

    const released = resolver.releaseClaim(claim!.id, 'completed');
    expect(released).toBe(true);

    const after = resolver.getClaim(claim!.id);
    expect(after!.status).toBe('released');
  });

  test('returns false for non-existent claim', () => {
    expect(resolver.releaseClaim('nonexistent')).toBe(false);
  });

  test('releaseAllClaims releases all claims for this agent', () => {
    resolver.checkAndClaim({ repo: 'repo1', description: 'Task 1' });
    resolver.checkAndClaim({ repo: 'repo2', description: 'Task 2' });

    expect(resolver.listActiveClaims()).toHaveLength(2);

    const count = resolver.releaseAllClaims('shutdown');
    expect(count).toBe(2);
    expect(resolver.listActiveClaims()).toHaveLength(0);
  });
});

// ─── Listing and Stats ──────────────────────────────────────────────────────

describe('listing and stats', () => {
  test('listActiveClaims returns only active claims', () => {
    const { claim } = resolver.checkAndClaim({
      repo: 'CorvidLabs/corvid-agent',
      issueNumber: 1,
      description: 'Active task',
    });
    resolver.checkAndClaim({
      repo: 'CorvidLabs/other-repo',
      description: 'Another task',
    });

    // Release one
    resolver.releaseClaim(claim!.id);

    const active = resolver.listActiveClaims();
    expect(active).toHaveLength(1);
    expect(active[0].repo).toBe('CorvidLabs/other-repo');
  });

  test('listActiveClaims filters by repo', () => {
    resolver.checkAndClaim({ repo: 'repo-a', description: 'A' });
    resolver.checkAndClaim({ repo: 'repo-b', description: 'B' });

    expect(resolver.listActiveClaims('repo-a')).toHaveLength(1);
    expect(resolver.listActiveClaims('repo-b')).toHaveLength(1);
    expect(resolver.listActiveClaims('repo-c')).toHaveLength(0);
  });

  test('getAgentClaims returns claims for a specific agent', () => {
    resolver.checkAndClaim({ repo: 'repo1', description: 'My task' });

    const claims = resolver.getAgentClaims(AGENT_A_ID);
    expect(claims).toHaveLength(1);
    expect(claims[0].agentId).toBe(AGENT_A_ID);
  });

  test('getStats returns correct counts', () => {
    resolver.checkAndClaim({ repo: 'repo1', description: 'Task 1' });
    const { claim } = resolver.checkAndClaim({ repo: 'repo2', description: 'Task 2' });
    resolver.releaseClaim(claim!.id);

    const stats = resolver.getStats();
    expect(stats.activeClaims).toBe(1);
    expect(stats.totalClaims).toBe(2);
  });
});

// ─── Schema Idempotency ─────────────────────────────────────────────────────

describe('schema', () => {
  test('ensureSchema is idempotent', () => {
    // Should not throw on second call
    resolver.ensureSchema();
    resolver.ensureSchema();
  });
});
