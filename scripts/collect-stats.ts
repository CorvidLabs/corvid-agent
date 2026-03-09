/**
 * collect-stats.ts — Collect and verify codebase statistics
 *
 * Collects live stats from the codebase and compares them against values
 * documented in README.md and docs/deep-dive.md. Exits non-zero when
 * documented stats have drifted beyond allowed thresholds.
 *
 * Usage:
 *   bun scripts/collect-stats.ts           # verify stats (CI mode)
 *   bun scripts/collect-stats.ts --update   # update docs in-place
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve(import.meta.dir, '..');

// ─── Stat Collectors ────────────────────────────────────────────────────

function countFiles(dir: string, pattern: RegExp): number {
    let count = 0;
    function walk(d: string) {
        for (const entry of readdirSync(d)) {
            const full = join(d, entry);
            if (entry === 'node_modules' || entry === '.git') continue;
            const stat = statSync(full);
            if (stat.isDirectory()) walk(full);
            else if (pattern.test(entry)) count++;
        }
    }
    walk(dir);
    return count;
}

function countTestFiles(): number {
    return countFiles(ROOT, /\.test\.ts$/);
}

function countSpecFiles(): number {
    return countFiles(join(ROOT, 'specs'), /\.spec\.md$/);
}

function countMigrations(): number {
    return readdirSync(join(ROOT, 'server/db/migrations'))
        .filter(f => f.endsWith('.ts'))
        .length;
}

function countRouteModules(): number {
    return readdirSync(join(ROOT, 'server/routes'))
        .filter(f => f.endsWith('.ts'))
        .length;
}

function countApiEndpoints(): number {
    const registry = readFileSync(join(ROOT, 'server/openapi/route-registry.ts'), 'utf-8');
    return (registry.match(/method:/g) || []).length;
}

function countDbTables(): number {
    const schema = readFileSync(join(ROOT, 'server/db/schema.ts'), 'utf-8');
    return (schema.match(/CREATE TABLE/g) || []).length;
}

function countE2eSpecFiles(): number {
    try {
        return readdirSync(join(ROOT, 'e2e'))
            .filter(f => f.endsWith('.spec.ts'))
            .length;
    } catch {
        return 0;
    }
}

function countMcpTools(): number {
    // Count unique corvid_* tool names across direct-tools and sdk-tools
    const tools = new Set<string>();
    for (const file of ['server/mcp/direct-tools.ts', 'server/mcp/sdk-tools.ts']) {
        try {
            const content = readFileSync(join(ROOT, file), 'utf-8');
            const matches = content.matchAll(/['"]corvid_(\w+)['"]/g);
            for (const m of matches) tools.add(m[1]);
        } catch { /* file may not exist */ }
    }
    return tools.size;
}

// ─── Run bun test to get counts ─────────────────────────────────────────

interface TestResults {
    pass: number;
    files: number;
    assertions: number;
}

function getTestResults(): TestResults {
    try {
        const output = execSync('bun test 2>&1', {
            cwd: ROOT,
            timeout: 300_000,
            encoding: 'utf-8',
        });
        const passMatch = output.match(/(\d+)\s+pass/);
        const filesMatch = output.match(/Ran\s+\d+\s+tests\s+across\s+(\d+)\s+files/);
        const assertMatch = output.match(/([\d,]+)\s+expect\(\)\s+calls/);
        return {
            pass: passMatch ? parseInt(passMatch[1]) : 0,
            files: filesMatch ? parseInt(filesMatch[1]) : 0,
            assertions: assertMatch ? parseInt(assertMatch[1].replace(/,/g, '')) : 0,
        };
    } catch {
        return { pass: 0, files: 0, assertions: 0 };
    }
}

// ─── Stats Definition ───────────────────────────────────────────────────

interface Stat {
    name: string;
    collect: () => number;
    /** Maximum allowed drift percentage before flagging (default 0 = exact) */
    driftPct?: number;
}

const STATS: Stat[] = [
    { name: 'test_files', collect: countTestFiles },
    { name: 'spec_files', collect: countSpecFiles },
    { name: 'migration_files', collect: countMigrations },
    { name: 'route_modules', collect: countRouteModules },
    { name: 'api_endpoints', collect: countApiEndpoints },
    { name: 'db_tables', collect: countDbTables },
    { name: 'e2e_spec_files', collect: countE2eSpecFiles },
    { name: 'mcp_tools', collect: countMcpTools },
];

// ─── Document Patterns ──────────────────────────────────────────────────

interface DocStat {
    file: string;
    /** Regex with a capture group for the number */
    pattern: RegExp;
    statName: string;
    format: (n: number) => string;
}

const fmtNum = (n: number) => n.toLocaleString('en-US');

const DOC_STATS: DocStat[] = [
    // README.md
    {
        file: 'README.md',
        pattern: /Unit tests\s*\|\s*\*\*([0-9,]+)\*\*\s*across\s+(\d+)\s+files/,
        statName: 'unit_tests_readme',
        format: (n) => n.toString(),
    },
    {
        file: 'README.md',
        pattern: /Module specs\s*\|\s*\*\*(\d+)\*\*/,
        statName: 'spec_files',
        format: fmtNum,
    },
    {
        file: 'README.md',
        pattern: /MCP tools\s*\|\s*\*\*(\d+)\*\*/,
        statName: 'mcp_tools',
        format: fmtNum,
    },
    {
        file: 'README.md',
        pattern: /DB migrations\s*\|\s*\*\*(\d+)\*\*/,
        statName: 'migration_files',
        format: fmtNum,
    },
    {
        file: 'README.md',
        pattern: /tests-([\d]+)%20unit/,
        statName: 'badge_unit_tests',
        format: (n) => n.toString(),
    },
    // docs/deep-dive.md
    {
        file: 'docs/deep-dive.md',
        pattern: /Unit tests\s*\|\s*([0-9,]+)\s+across\s+(\d+)\s+files/,
        statName: 'unit_tests_deepdive',
        format: fmtNum,
    },
    {
        file: 'docs/deep-dive.md',
        pattern: /Module specs\s*\|\s*(\d+)/,
        statName: 'spec_files',
        format: fmtNum,
    },
    {
        file: 'docs/deep-dive.md',
        pattern: /Database tables\s*\|\s*(\d+)/,
        statName: 'db_tables',
        format: fmtNum,
    },
    {
        file: 'docs/deep-dive.md',
        pattern: /Database migrations\s*\|\s*(\d+)/,
        statName: 'migration_files',
        format: fmtNum,
    },
    {
        file: 'docs/deep-dive.md',
        pattern: /MCP tools\s*\|\s*(\d+)/,
        statName: 'mcp_tools',
        format: fmtNum,
    },
];

// ─── Main ───────────────────────────────────────────────────────────────

const updateMode = process.argv.includes('--update');

console.log('Collecting codebase stats...\n');

// Collect filesystem stats
const collected: Record<string, number> = {};
for (const stat of STATS) {
    const value = stat.collect();
    collected[stat.name] = value;
    console.log(`  ${stat.name}: ${value}`);
}

// Run tests if not in --update mode (tests are slow)
const skipTests = process.argv.includes('--skip-tests');
let testResults: TestResults | null = null;
if (!skipTests) {
    console.log('\nRunning tests to collect counts...');
    testResults = getTestResults();
    collected['unit_tests'] = testResults.pass;
    collected['test_file_count'] = testResults.files;
    collected['assertions'] = testResults.assertions;
    console.log(`  unit_tests: ${testResults.pass}`);
    console.log(`  test_files_from_runner: ${testResults.files}`);
    console.log(`  assertions: ${testResults.assertions}`);
}

// Check documented values
console.log('\nChecking documented stats...\n');
let drifts: string[] = [];

for (const doc of DOC_STATS) {
    const filePath = join(ROOT, doc.file);
    const content = readFileSync(filePath, 'utf-8');
    const match = content.match(doc.pattern);

    if (!match) {
        console.log(`  ⚠ ${doc.file}: pattern not found for ${doc.statName}`);
        continue;
    }

    const documented = parseInt(match[1].replace(/,/g, ''));
    let actual: number | undefined;

    // Map doc stat to collected values
    if (doc.statName === 'unit_tests_readme' || doc.statName === 'unit_tests_deepdive') {
        actual = collected['unit_tests'];
    } else if (doc.statName === 'badge_unit_tests') {
        actual = collected['unit_tests'];
    } else {
        actual = collected[doc.statName];
    }

    if (actual === undefined) {
        if (skipTests && (doc.statName.includes('unit_tests') || doc.statName === 'badge_unit_tests')) {
            console.log(`  ⏭ ${doc.file} ${doc.statName}: skipped (--skip-tests)`);
            continue;
        }
        console.log(`  ⚠ ${doc.file} ${doc.statName}: no collected value`);
        continue;
    }

    if (documented === actual) {
        console.log(`  ✓ ${doc.file} ${doc.statName}: ${actual}`);
    } else {
        const drift = `${doc.file} ${doc.statName}: documented=${documented}, actual=${actual}`;
        console.log(`  ✗ ${drift}`);
        drifts.push(drift);
    }
}

// Update mode
if (updateMode && drifts.length > 0) {
    console.log('\nUpdating documented stats...\n');

    // Update README badge
    if (collected['unit_tests']) {
        updateFile('README.md', /tests-[\d]+%20unit/, `tests-${collected['unit_tests']}%20unit`);
    }

    // Update README table
    if (collected['unit_tests'] && collected['test_file_count'] && collected['assertions']) {
        updateFile(
            'README.md',
            /Unit tests\s*\|\s*\*\*[0-9,]+\*\*\s*across\s+\d+\s+files\s*\([0-9,]+\s+assertions\)/,
            `Unit tests | **${fmtNum(collected['unit_tests'])}** across ${collected['test_file_count']} files (${fmtNum(collected['assertions'])} assertions)`,
        );
    }
    if (collected['spec_files']) {
        updateFile(
            'README.md',
            /Module specs\s*\|\s*\*\*\d+\*\*/,
            `Module specs | **${collected['spec_files']}**`,
        );
    }
    if (collected['mcp_tools']) {
        updateFile(
            'README.md',
            /MCP tools\s*\|\s*\*\*\d+\*\*/,
            `MCP tools | **${collected['mcp_tools']}**`,
        );
    }
    if (collected['migration_files']) {
        updateFile(
            'README.md',
            /DB migrations\s*\|\s*\*\*\d+\*\*/,
            `DB migrations | **${collected['migration_files']}**`,
        );
    }
    if (collected['db_tables']) {
        updateFile(
            'README.md',
            /DB migrations\s*\|\s*\*\*\d+\*\*\s*\(squashed baseline,\s*\d+\s*tables\)/,
            `DB migrations | **${collected['migration_files']}** (squashed baseline, ${collected['db_tables']} tables)`,
        );
    }

    // Update deep-dive.md
    if (collected['unit_tests'] && collected['test_file_count']) {
        updateFile(
            'docs/deep-dive.md',
            /Unit tests\s*\|\s*[0-9,]+\s+across\s+\d+\s+files/,
            `Unit tests | ${fmtNum(collected['unit_tests'])} across ${collected['test_file_count']} files`,
        );
    }
    if (collected['spec_files']) {
        updateFile(
            'docs/deep-dive.md',
            /Module specs\s*\|\s*\d+\s/,
            `Module specs | ${collected['spec_files']} `,
        );
    }
    if (collected['db_tables']) {
        updateFile(
            'docs/deep-dive.md',
            /Database tables\s*\|\s*\d+/,
            `Database tables | ${collected['db_tables']}`,
        );
    }
    if (collected['migration_files']) {
        updateFile(
            'docs/deep-dive.md',
            /Database migrations\s*\|\s*\d+/,
            `Database migrations | ${collected['migration_files']}`,
        );
    }
    if (collected['mcp_tools']) {
        updateFile(
            'docs/deep-dive.md',
            /MCP tools\s*\|\s*\d+/,
            `MCP tools | ${collected['mcp_tools']}`,
        );
    }

    console.log('Done. Re-run without --update to verify.\n');
} else if (drifts.length > 0) {
    console.log(`\n✗ ${drifts.length} stat(s) have drifted. Run with --update to fix.\n`);
    process.exit(1);
} else {
    console.log('\n✓ All documented stats are up to date.\n');
}

function updateFile(relPath: string, pattern: RegExp, replacement: string) {
    const filePath = join(ROOT, relPath);
    const content = readFileSync(filePath, 'utf-8');
    const updated = content.replace(pattern, replacement);
    if (updated !== content) {
        writeFileSync(filePath, updated);
        console.log(`  Updated ${relPath}`);
    }
}
