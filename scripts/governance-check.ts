#!/usr/bin/env bun
/**
 * CI governance tier check — blocks automated PRs from modifying Layer 0
 * (Constitutional) paths and warns on Layer 1 (Structural) paths.
 *
 * Issue: https://github.com/CorvidLabs/corvid-agent/issues/1038 (#D)
 *
 * Usage:
 *   bun scripts/governance-check.ts          # in CI or locally
 *   bun run governance:check                 # via package.json
 *
 * Environment variables (set by GitHub Actions):
 *   GITHUB_BASE_REF  — base branch for PR diff (e.g. "main")
 *   GITHUB_HEAD_REF  — head branch of the PR (e.g. "agent/corvid-agent/fix-bug")
 *   GITHUB_ACTOR     — user/bot that triggered the workflow
 *
 * Exit codes:
 *   0 — all clear (no Layer 0/1 violations, or human-authored PR)
 *   1 — automated PR touches Layer 0 paths (hard block)
 */

// ─── Fail-closed import ─────────────────────────────────────────────────────
// If the governance module itself is corrupted or missing, we MUST fail the check.
// A missing governance module means we cannot verify path safety → block everything.

let classifyPath: typeof import('../server/councils/governance').classifyPath;
let _assessImpact: typeof import('../server/councils/governance').assessImpact;
let _GOVERNANCE_TIERS: typeof import('../server/councils/governance').GOVERNANCE_TIERS;

try {
  const governance = await import('../server/councils/governance');
  classifyPath = governance.classifyPath;
  _assessImpact = governance.assessImpact;
  _GOVERNANCE_TIERS = governance.GOVERNANCE_TIERS;
} catch (err) {
  console.error(
    '✗ FATAL: Failed to load governance module — fail-closed.\n' +
      '  Cannot verify path safety without governance tier definitions.\n' +
      '  Error:',
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
}

// ─── Known automated actors ─────────────────────────────────────────────────

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

// ─── Automated branch prefix detection ──────────────────────────────────────

/** Branch prefixes that indicate automated (non-human) PRs. */
const AUTOMATED_BRANCH_PREFIXES = ['agent/', 'chat/'];

function isAutomatedBranch(headRef: string | undefined): boolean {
  if (!headRef) return false;
  return AUTOMATED_BRANCH_PREFIXES.some((prefix) => headRef.startsWith(prefix));
}

// ─── Extract changed files from diff ─────────────────────────────────────────

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

// ─── Main ────────────────────────────────────────────────────────────────────

const baseRef = process.env.GITHUB_BASE_REF;
const actor = process.env.GITHUB_ACTOR;
const headRef = process.env.GITHUB_HEAD_REF;
const _isCI = !!process.env.CI;
const isAutomatedByActor = isAutomatedActor(actor);
const isAutomatedByBranch = isAutomatedBranch(headRef);
const isAutomated = isAutomatedByActor || isAutomatedByBranch;

// Get diff
const diffArgs = baseRef ? ['git', 'diff', `origin/${baseRef}...HEAD`] : ['git', 'diff', 'HEAD~1'];

let diffOutput = '';
try {
  const diffProc = Bun.spawn(diffArgs, { stdout: 'pipe', stderr: 'pipe' });
  diffOutput = await new Response(diffProc.stdout).text();
  const exitCode = await diffProc.exited;

  if (exitCode !== 0) {
    const fallbackProc = Bun.spawn(['git', 'diff', '--cached'], { stdout: 'pipe', stderr: 'pipe' });
    diffOutput = await new Response(fallbackProc.stdout).text();
    await fallbackProc.exited;
  }
} catch (err) {
  console.error('Failed to get diff:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}

if (!diffOutput.trim()) {
  console.log('✓ No changes detected — governance check passed');
  process.exit(0);
}

const changedFiles = extractChangedFiles(diffOutput);
if (changedFiles.length === 0) {
  console.log('✓ No file changes detected — governance check passed');
  process.exit(0);
}

// Classify all changed files
const classified = changedFiles.map((path) => ({
  path,
  tier: classifyPath(path),
}));

const layer0Files = classified.filter((f) => f.tier === 0);
const layer1Files = classified.filter((f) => f.tier === 1);
const layer2Files = classified.filter((f) => f.tier === 2);

// Report
console.log(`Governance Tier Check — ${changedFiles.length} file(s) changed`);
console.log(`  Actor: ${actor ?? '(local)'} ${isAutomatedByActor ? '(automated)' : '(human)'}`);
console.log(`  Branch: ${headRef ?? '(unknown)'} ${isAutomatedByBranch ? '(automated prefix)' : '(manual)'}`);
console.log(
  `  Automated: ${isAutomated ? 'YES' : 'no'}${isAutomated ? ` (${[isAutomatedByActor && 'actor', isAutomatedByBranch && 'branch'].filter(Boolean).join(' + ')})` : ''}`,
);
console.log(`  Layer 0 (Constitutional): ${layer0Files.length}`);
console.log(`  Layer 1 (Structural):     ${layer1Files.length}`);
console.log(`  Layer 2 (Operational):    ${layer2Files.length}`);

if (layer0Files.length > 0) {
  console.log('\nLayer 0 (Constitutional) paths — NO council jurisdiction, human-only commits:');
  for (const f of layer0Files) {
    console.log(`  ✗ ${f.path}`);
  }
}

if (layer1Files.length > 0) {
  console.log('\nLayer 1 (Structural) paths — supermajority + human approval required:');
  for (const f of layer1Files) {
    console.log(`  ⚠ ${f.path}`);
  }
}

// Enforcement
let exitCode = 0;

if (layer0Files.length > 0 && isAutomated) {
  const signals = [isAutomatedByActor && `actor "${actor}"`, isAutomatedByBranch && `branch "${headRef}"`]
    .filter(Boolean)
    .join(' + ');
  console.error(
    `\n✗ BLOCKED: Automated workflow (${signals}) cannot modify Layer 0 (Constitutional) paths.` +
      '\n  These paths require human-only commits to main.' +
      '\n  See: https://github.com/CorvidLabs/corvid-agent/issues/1357',
  );
  exitCode = 1;
} else if (layer0Files.length > 0 && !isAutomated) {
  console.log(
    `\n⚠ WARNING: PR modifies Layer 0 (Constitutional) paths.` +
      '\n  These changes require careful human review — no council jurisdiction.',
  );
}

if (layer1Files.length > 0 && isAutomated) {
  const signals = [isAutomatedByActor && `actor "${actor}"`, isAutomatedByBranch && `branch "${headRef}"`]
    .filter(Boolean)
    .join(' + ');
  console.log(
    `\n⚠ WARNING: Automated workflow (${signals}) is modifying Layer 1 (Structural) paths.` +
      '\n  These changes require supermajority council vote + human approval.',
  );
}

if (exitCode === 0) {
  console.log('\n✓ Governance check passed');
}

process.exit(exitCode);
