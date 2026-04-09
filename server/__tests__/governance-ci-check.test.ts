import { describe, expect, test } from 'bun:test';
import { assessImpact, checkAutomationAllowed, classifyPath } from '../councils/governance';

/**
 * Tests for the governance CI check logic (scripts/governance-check.ts).
 * The script uses classifyPath + assessImpact from councils/governance.ts,
 * so we test the enforcement logic here:
 *   - Correct Layer 0/1 detection from git diff file paths
 *   - Automated actor identification
 *   - Block/allow decisions matching the CI script's behavior
 */

// ─── Diff file extraction (same logic as governance-check.ts) ────────────────

function extractChangedFiles(diffOutput: string): string[] {
  return diffOutput
    .split('\n')
    .filter((line) => line.startsWith('diff --git'))
    .map((line) => {
      const match = line.match(/b\/(.+)$/);
      return match?.[1] ?? '';
    })
    .filter(Boolean);
}

const AUTOMATED_ACTORS = new Set([
  'corvid-agent',
  'corvid-agent[bot]',
  'github-actions[bot]',
  'dependabot[bot]',
  'renovate[bot]',
]);

function isAutomatedActor(actor: string | undefined): boolean {
  if (!actor) return false;
  return AUTOMATED_ACTORS.has(actor) || actor.endsWith('[bot]');
}

// ─── Branch prefix detection (same logic as governance-check.ts) ────────────

const AUTOMATED_BRANCH_PREFIXES = ['agent/', 'chat/'];

function isAutomatedBranch(headRef: string | undefined): boolean {
  if (!headRef) return false;
  return AUTOMATED_BRANCH_PREFIXES.some((prefix) => headRef.startsWith(prefix));
}

// ─── extractChangedFiles ─────────────────────────────────────────────────────

describe('governance CI check — extractChangedFiles', () => {
  test('extracts file paths from standard git diff output', () => {
    const diff = [
      'diff --git a/server/routes/agents.ts b/server/routes/agents.ts',
      'index abc123..def456 100644',
      '--- a/server/routes/agents.ts',
      '+++ b/server/routes/agents.ts',
      '@@ -1,3 +1,4 @@',
      '+// new line',
      'diff --git a/server/councils/governance.ts b/server/councils/governance.ts',
      'index 111..222 100644',
    ].join('\n');

    const files = extractChangedFiles(diff);
    expect(files).toEqual(['server/routes/agents.ts', 'server/councils/governance.ts']);
  });

  test('returns empty array for empty diff', () => {
    expect(extractChangedFiles('')).toEqual([]);
  });

  test('handles renamed files', () => {
    const diff = 'diff --git a/old-name.ts b/new-name.ts\n';
    expect(extractChangedFiles(diff)).toEqual(['new-name.ts']);
  });
});

// ─── isAutomatedActor ────────────────────────────────────────────────────────

describe('governance CI check — isAutomatedActor', () => {
  test('identifies known automated actors', () => {
    expect(isAutomatedActor('corvid-agent')).toBe(true);
    expect(isAutomatedActor('corvid-agent[bot]')).toBe(true);
    expect(isAutomatedActor('github-actions[bot]')).toBe(true);
    expect(isAutomatedActor('dependabot[bot]')).toBe(true);
    expect(isAutomatedActor('renovate[bot]')).toBe(true);
  });

  test('identifies unknown bots by [bot] suffix', () => {
    expect(isAutomatedActor('some-new-bot[bot]')).toBe(true);
  });

  test('treats human actors as non-automated', () => {
    expect(isAutomatedActor('0xLeif')).toBe(false);
    expect(isAutomatedActor('some-developer')).toBe(false);
  });

  test('treats undefined/empty as non-automated', () => {
    expect(isAutomatedActor(undefined)).toBe(false);
    expect(isAutomatedActor('')).toBe(false);
  });
});

// ─── isAutomatedBranch ────────────────────────────────────────────────────────

describe('governance CI check — isAutomatedBranch', () => {
  test('identifies agent/ prefix as automated', () => {
    expect(isAutomatedBranch('agent/corvid-agent/fix-bug-18f5k3c-abc123')).toBe(true);
    expect(isAutomatedBranch('agent/some-agent/task-name')).toBe(true);
  });

  test('identifies chat/ prefix as automated', () => {
    expect(isAutomatedBranch('chat/corvid-agent/a1b2c3d4e5f6')).toBe(true);
  });

  test('treats feature branches as non-automated', () => {
    expect(isAutomatedBranch('feat/new-feature')).toBe(false);
    expect(isAutomatedBranch('fix/bug-fix')).toBe(false);
    expect(isAutomatedBranch('main')).toBe(false);
  });

  test('treats undefined/empty as non-automated', () => {
    expect(isAutomatedBranch(undefined)).toBe(false);
    expect(isAutomatedBranch('')).toBe(false);
  });

  test('does not match partial prefix (e.g. "agents/" or "chatbot/")', () => {
    expect(isAutomatedBranch('agents/something')).toBe(false);
    expect(isAutomatedBranch('chatbot/session')).toBe(false);
  });
});

// ─── Enforcement logic ───────────────────────────────────────────────────────

describe('governance CI check — enforcement decisions', () => {
  test('automated actor + Layer 0 change = blocked', () => {
    const files = ['server/councils/governance.ts', 'server/routes/agents.ts'];
    const impact = assessImpact(files);
    const actor = 'corvid-agent';

    expect(impact.tier).toBe(0);
    expect(impact.blockedFromAutomation).toBe(true);
    expect(isAutomatedActor(actor)).toBe(true);
    // CI script would exit(1)
  });

  test('automated actor + Layer 2 only = allowed', () => {
    const files = ['server/routes/agents.ts', 'shared/types/agents.ts'];
    const result = checkAutomationAllowed(files);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe(2);
  });

  test('human actor + Layer 0 change = warning only (allowed)', () => {
    const files = ['server/councils/governance.ts'];
    const impact = assessImpact(files);
    const actor = '0xLeif';

    expect(impact.tier).toBe(0);
    expect(isAutomatedActor(actor)).toBe(false);
    // CI script would warn but exit(0)
  });

  test('automated actor + Layer 1 change = warning (not hard block)', () => {
    const files = ['package.json', 'server/routes/agents.ts'];
    const impact = assessImpact(files);
    const actor = 'dependabot[bot]';

    expect(impact.tier).toBe(1);
    expect(isAutomatedActor(actor)).toBe(true);
    // CI script warns but does NOT exit(1) for Layer 1 — only Layer 0 is hard-blocked
  });

  test('mixed Layer 0 + Layer 2 files from automated actor = blocked', () => {
    const files = [
      'server/routes/agents.ts', // Layer 2
      'server/process/protected-paths.ts', // Layer 0
    ];
    const impact = assessImpact(files);

    expect(impact.tier).toBe(0);
    expect(impact.blockedFromAutomation).toBe(true);
    expect(impact.affectedPaths.some((p) => p.tier === 0)).toBe(true);
  });

  test('automated branch + Layer 0 change = blocked (even with human actor)', () => {
    const files = ['server/councils/governance.ts', 'server/routes/agents.ts'];
    const impact = assessImpact(files);
    const actor = '0xLeif'; // human actor
    const branch = 'agent/corvid-agent/fix-governance-18f5k3c-abc123';

    expect(impact.tier).toBe(0);
    expect(impact.blockedFromAutomation).toBe(true);
    // Actor is human, but branch is automated — should still block
    expect(isAutomatedActor(actor)).toBe(false);
    expect(isAutomatedBranch(branch)).toBe(true);
    const isAutomated = isAutomatedActor(actor) || isAutomatedBranch(branch);
    expect(isAutomated).toBe(true);
  });

  test('human actor + manual branch + Layer 0 = allowed (warning only)', () => {
    const impact = assessImpact(['server/councils/governance.ts']);
    const actor = '0xLeif';
    const branch = 'feat/governance-update';

    expect(impact.tier).toBe(0);
    const isAutomated = isAutomatedActor(actor) || isAutomatedBranch(branch);
    expect(isAutomated).toBe(false);
    // CI script would warn but exit(0)
  });

  test('chat/ branch + Layer 0 = blocked', () => {
    const files = ['server/process/protected-paths.ts'];
    const impact = assessImpact(files);
    const branch = 'chat/corvid-agent/a1b2c3d4e5f6';

    expect(impact.tier).toBe(0);
    expect(isAutomatedBranch(branch)).toBe(true);
  });

  test('classifies all constitutional paths correctly for CI enforcement', () => {
    // Verify key Layer 0 paths that CI should block
    const constitutionalPaths = [
      'server/councils/governance.ts',
      'server/councils/discussion.ts',
      'server/process/protected-paths.ts',
      'server/process/sdk-process.ts',
      'server/permissions/broker.ts',
      'server/middleware/guards.ts',
      'server/algochat/spending.ts',
      '.env',
    ];
    for (const path of constitutionalPaths) {
      expect(classifyPath(path)).toBe(0);
    }
  });
});
