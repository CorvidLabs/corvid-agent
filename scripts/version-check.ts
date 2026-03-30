/**
 * version-check.ts — Ensures version strings stay aligned across the project.
 *
 * Checks that deploy/helm/Chart.yaml version + appVersion match package.json version.
 *
 * Usage: bun scripts/version-check.ts
 * Exit code 0 = aligned, 1 = drift detected
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');

// ─── Read package.json version (source of truth) ─────────────────────────

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const appVersion: string = pkg.version;

console.log(`package.json version: ${appVersion}`);

// ─── Check Helm Chart.yaml ───────────────────────────────────────────────

const chartPath = join(ROOT, 'deploy/helm/Chart.yaml');
const chartContent = readFileSync(chartPath, 'utf-8');

const versionMatch = chartContent.match(/^version:\s*(.+)$/m);
const appVersionMatch = chartContent.match(/^appVersion:\s*"?([^"\n]+)"?$/m);

const chartVersion = versionMatch?.[1]?.trim();
const chartAppVersion = appVersionMatch?.[1]?.trim();

let errors = 0;

if (chartVersion !== appVersion) {
  console.error(`FAIL: Chart.yaml version (${chartVersion}) != package.json (${appVersion})`);
  errors++;
} else {
  console.log(`Chart.yaml version: ${chartVersion} ✓`);
}

if (chartAppVersion !== appVersion) {
  console.error(`FAIL: Chart.yaml appVersion (${chartAppVersion}) != package.json (${appVersion})`);
  errors++;
} else {
  console.log(`Chart.yaml appVersion: ${chartAppVersion} ✓`);
}

// ─── Summary ─────────────────────────────────────────────────────────────

if (errors > 0) {
  console.error(`\n${errors} version drift(s) detected. Update deploy/helm/Chart.yaml to match package.json.`);
  process.exit(1);
} else {
  console.log('\nAll versions aligned.');
}
