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
 *   GITHUB_ACTOR     — user/bot that triggered the workflow
 *
 * Exit codes:
 *   0 — all clear (no Layer 0/1 violations, or human-authored PR)
 *   1 — automated PR touches Layer 0 paths (hard block)
 */

import { classifyPath, assessImpact, GOVERNANCE_TIERS, type GovernanceTier } from '../server/councils/governance';

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
const isCI = !!process.env.CI;
const isAutomated = isAutomatedActor(actor);

// Get diff
const diffArgs = baseRef
    ? ['git', 'diff', `origin/${baseRef}...HEAD`]
    : ['git', 'diff', 'HEAD~1'];

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
console.log(`  Actor: ${actor ?? '(local)'} ${isAutomated ? '(automated)' : '(human)'}`);
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
    console.error(
        `\n✗ BLOCKED: Automated actor "${actor}" cannot modify Layer 0 (Constitutional) paths.` +
        '\n  These paths require human-only commits to main.' +
        '\n  See: https://github.com/CorvidLabs/corvid-agent/issues/1038',
    );
    exitCode = 1;
} else if (layer0Files.length > 0 && !isAutomated) {
    console.log(
        `\n⚠ WARNING: PR modifies Layer 0 (Constitutional) paths.` +
        '\n  These changes require careful human review — no council jurisdiction.',
    );
}

if (layer1Files.length > 0 && isAutomated) {
    console.log(
        `\n⚠ WARNING: Automated actor "${actor}" is modifying Layer 1 (Structural) paths.` +
        '\n  These changes require supermajority council vote + human approval.',
    );
}

if (exitCode === 0) {
    console.log('\n✓ Governance check passed');
}

process.exit(exitCode);
