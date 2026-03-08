#!/usr/bin/env bun
/**
 * collect-stats.ts — Collects codebase stats and checks README drift.
 *
 * Counts module specs, MCP tools, route modules, migrations, E2E specs,
 * and server test files, then compares against the "At a Glance" table
 * in README.md.
 *
 * Usage:
 *   bun scripts/collect-stats.ts          # print current stats
 *   bun scripts/collect-stats.ts --check  # compare against README, exit 1 on drift
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const CHECK_MODE = process.argv.includes('--check');

// ─── Collection ──────────────────────────────────────────────────────────

interface Stats {
    moduleSpecs: number;
    mcpTools: number;
    routeModules: number;
    migrations: number;
    e2eSpecs: number;
    serverTestFiles: number;
}

function walkFiles(dir: string, pattern: RegExp, ignore?: RegExp): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (ignore?.test(full)) continue;
        if (statSync(full).isDirectory()) {
            results.push(...walkFiles(full, pattern, ignore));
        } else if (pattern.test(entry)) {
            results.push(full);
        }
    }
    return results;
}

function collectStats(): Stats {
    // Module specs — *.spec.md in specs/, excluding template
    const specFiles = walkFiles(join(ROOT, 'specs'), /\.spec\.md$/)
        .filter(f => !f.includes('_template'));
    const moduleSpecs = specFiles.length;

    // MCP tools — count corvid_* tool definitions in direct-tools.ts
    const directTools = readFileSync(join(ROOT, 'server/mcp/direct-tools.ts'), 'utf8');
    const mcpTools = (directTools.match(/name:\s*['"]corvid_/g) || []).length;

    // Route modules — .ts files in server/routes/ excluding index
    const routeFiles = readdirSync(join(ROOT, 'server/routes'))
        .filter(f => f.endsWith('.ts') && f !== 'index.ts');
    const routeModules = routeFiles.length;

    // Migrations — highest migration number from filenames
    const migrationFiles = readdirSync(join(ROOT, 'server/db/migrations'))
        .filter(f => f.endsWith('.ts'));
    const migrations = Math.max(
        0,
        ...migrationFiles.map(f => parseInt(f.split('_')[0]) || 0),
    );

    // E2E specs — *.spec.ts in e2e/
    const e2eSpecs = walkFiles(join(ROOT, 'e2e'), /\.spec\.ts$/).length;

    // Server test files — *.test.ts excluding node_modules and client
    const ignore = /node_modules|\/client\//;
    const serverTestFiles = walkFiles(ROOT, /\.test\.ts$/, ignore).length;

    return { moduleSpecs, mcpTools, routeModules, migrations, e2eSpecs, serverTestFiles };
}

// ─── README Parsing ──────────────────────────────────────────────────────

interface ReadmeStats {
    moduleSpecs?: number;
    mcpTools?: number;
    routeModules?: number;
    migrations?: number;
    e2eSpecs?: number;
}

function parseReadmeStats(): ReadmeStats {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const stats: ReadmeStats = {};

    const specMatch = readme.match(/Module specs\s*\|\s*\*\*(\d+)\*\*/);
    if (specMatch) stats.moduleSpecs = parseInt(specMatch[1]);

    const mcpMatch = readme.match(/MCP tools\s*\|\s*\*\*(\d+)\*\*/);
    if (mcpMatch) stats.mcpTools = parseInt(mcpMatch[1]);

    const routeMatch = readme.match(/across (\d+) route modules/);
    if (routeMatch) stats.routeModules = parseInt(routeMatch[1]);

    const migrationMatch = readme.match(/DB migrations\s*\|\s*\*\*(\d+)\*\*/);
    if (migrationMatch) stats.migrations = parseInt(migrationMatch[1]);

    const e2eMatch = readme.match(/across (\d+) Playwright specs/);
    if (e2eMatch) stats.e2eSpecs = parseInt(e2eMatch[1]);

    return stats;
}

// ─── Main ────────────────────────────────────────────────────────────────

const actual = collectStats();

console.log('Codebase stats:');
console.log(`  Module specs:      ${actual.moduleSpecs}`);
console.log(`  MCP tools:         ${actual.mcpTools}`);
console.log(`  Route modules:     ${actual.routeModules}`);
console.log(`  DB migrations:     ${actual.migrations}`);
console.log(`  E2E specs:         ${actual.e2eSpecs}`);
console.log(`  Server test files: ${actual.serverTestFiles}`);

if (!CHECK_MODE) {
    process.exit(0);
}

// ─── Drift Check ─────────────────────────────────────────────────────────

console.log('\nChecking README drift...');
const readme = parseReadmeStats();
let drifts = 0;

const checks: Array<{ label: string; actual: number; readme: number | undefined }> = [
    { label: 'Module specs', actual: actual.moduleSpecs, readme: readme.moduleSpecs },
    { label: 'MCP tools', actual: actual.mcpTools, readme: readme.mcpTools },
    { label: 'Route modules', actual: actual.routeModules, readme: readme.routeModules },
    { label: 'DB migrations', actual: actual.migrations, readme: readme.migrations },
    { label: 'E2E specs', actual: actual.e2eSpecs, readme: readme.e2eSpecs },
];

for (const { label, actual: a, readme: r } of checks) {
    if (r === undefined) {
        console.log(`  [SKIP] ${label}: not found in README`);
        continue;
    }
    if (a !== r) {
        console.log(`  [DRIFT] ${label}: README says ${r}, actual is ${a}`);
        drifts++;
    } else {
        console.log(`  [OK]   ${label}: ${a}`);
    }
}

if (drifts > 0) {
    console.log(`\n${drifts} stat(s) have drifted. Update README.md "At a Glance" table.`);
    process.exit(1);
}

console.log('\nAll stats match README.');
