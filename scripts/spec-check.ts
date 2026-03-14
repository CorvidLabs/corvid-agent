/**
 * spec-check.ts — Validates module specification files in specs/
 *
 * Three validation levels:
 *   1. Structural:   YAML frontmatter, file existence, table existence, required sections
 *   2. API Surface:  Exported symbols match spec's Public API tables
 *   3. Dependencies: Referenced specs and consumed-by files exist
 *
 * Usage: bun scripts/spec-check.ts
 *        bun scripts/spec-check.ts --strict     # warnings also fail
 *        bun scripts/spec-check.ts --coverage   # show file/module coverage report
 *        bun scripts/spec-check.ts --generate   # scaffold specs for unspecced modules
 *        bun scripts/spec-check.ts --require-coverage 100  # fail if coverage < threshold
 * Exit code 0 = all passed (warnings OK unless --strict), 1 = errors found
 */

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const SPECS_DIR = join(ROOT, 'specs');
const SCHEMA_FILE = join(ROOT, 'server/db/schema.ts');

// ─── Types ───────────────────────────────────────────────────────────────

interface Frontmatter {
    module?: string;
    version?: string;
    status?: string;
    files?: string[];
    db_tables?: string[];
    depends_on?: string[];
}

interface ValidationResult {
    specPath: string;
    errors: string[];
    warnings: string[];
    exportSummary?: string;
}

// ─── YAML Frontmatter Parser (simple regex, no deps) ────────────────────

function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } | null {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;

    const yamlBlock = match[1];
    const body = match[2];
    const fm: Frontmatter = {};

    let currentKey: string | null = null;
    let currentList: string[] | null = null;

    for (const line of yamlBlock.split('\n')) {
        // List item: "  - value"
        const listMatch = line.match(/^\s+-\s+(.+)$/);
        if (listMatch && currentKey && currentList) {
            currentList.push(listMatch[1].trim());
            continue;
        }

        // Key-value: "key: value" or "key:"
        const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
        if (kvMatch) {
            // Save previous list if any
            if (currentKey && currentList) {
                (fm as Record<string, unknown>)[currentKey] = currentList;
            }

            const key = kvMatch[1];
            const value = kvMatch[2].trim();

            if (value === '' || value === '[]') {
                // Start of a list (or empty list)
                currentKey = key;
                currentList = [];
            } else {
                // Scalar value
                if (currentKey && currentList) {
                    (fm as Record<string, unknown>)[currentKey] = currentList;
                }
                (fm as Record<string, unknown>)[key] = value;
                currentKey = null;
                currentList = null;
            }
            continue;
        }

        // Blank or comment line — finalize any open list
        if (line.trim() === '' || line.trim().startsWith('#')) {
            if (currentKey && currentList) {
                (fm as Record<string, unknown>)[currentKey] = currentList;
                currentKey = null;
                currentList = null;
            }
        }
    }

    // Finalize any trailing list
    if (currentKey && currentList) {
        (fm as Record<string, unknown>)[currentKey] = currentList;
    }

    return { frontmatter: fm, body };
}

// ─── Table Name Extraction ───────────────────────────────────────────────

function getSchemaTableNames(): Set<string> {
    const tables = new Set<string>();
    if (!existsSync(SCHEMA_FILE)) return tables;

    const content = readFileSync(SCHEMA_FILE, 'utf-8');
    const regex = /CREATE (?:VIRTUAL )?TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
        tables.add(match[1]);
    }
    return tables;
}

// ─── Export Extraction ───────────────────────────────────────────────────

function stripComments(src: string): string {
    // Remove single-line comments (// ...) and multi-line comments (/* ... */)
    // Preserve strings to avoid stripping inside them
    return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function getExportedSymbols(filePath: string): string[] {
    if (!existsSync(filePath)) return [];
    const content = stripComments(readFileSync(filePath, 'utf-8'));
    const symbols: string[] = [];

    // Match: export function name, export class name, export abstract class name,
    //        export interface name, export type name, export const name, export enum name
    const regex = /export\s+(?:async\s+)?(?:abstract\s+)?(?:function|class|interface|type|const|enum)\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
        symbols.push(match[1]);
    }

    // Also match: export type { Name } (re-exports)
    const reExportRegex = /export\s+type\s*\{\s*([^}]+)\}/g;
    while ((match = reExportRegex.exec(content)) !== null) {
        const names = match[1].split(',').map((n) => n.trim().split(/\s+as\s+/).pop()!.trim());
        symbols.push(...names.filter(Boolean));
    }

    // Also match: export { Name } (re-exports)
    const reExportRegex2 = /export\s*\{\s*([^}]+)\}/g;
    while ((match = reExportRegex2.exec(content)) !== null) {
        // Skip if it's "export type { ... }" — already handled above
        const full = match[0];
        if (full.includes('export type')) continue;
        const names = match[1].split(',').map((n) => {
            let name = n.trim().split(/\s+as\s+/).pop()!.trim();
            // Strip inline `type` modifier (e.g. `export { type Foo }`)
            if (name.startsWith('type ')) name = name.slice(5).trim();
            return name;
        });
        symbols.push(...names.filter(Boolean));
    }

    return [...new Set(symbols)];
}

// ─── Spec Symbol Extraction ──────────────────────────────────────────────

/**
 * Extract symbol names from the spec's Public API section.
 * Only extracts the FIRST backtick-quoted word in each table row,
 * which is the function/class/type name. Ignores subsequent columns
 * (parameters, return types) to avoid false matches on `void`, `boolean`, etc.
 *
 * Also skips class method sub-tables — those are not top-level exports.
 */
function getSpecSymbols(body: string): string[] {
    const symbols: string[] = [];

    // Look in Public API section
    const publicApiMatch = body.match(/## Public API\s*\n([\s\S]*?)(?=\n## (?!.*Public API))/);
    if (!publicApiMatch) return symbols;

    const apiSection = publicApiMatch[1];

    // Split into sub-sections by ### headers
    const subSections = apiSection.split(/(?=^### )/m);

    for (const sub of subSections) {
        const headerMatch = sub.match(/^### (.+)/);
        if (!headerMatch) continue;
        const header = headerMatch[1].trim();

        // Skip class method tables — method names are not top-level exports
        // Method tables have headers like "ExampleService Methods" or "#### Methods"
        if (/Methods$/.test(header)) continue;

        // Also skip headers that look like "ClassName Constructor"
        if (/Constructor$/.test(header)) continue;

        // Only extract from: "Exported Functions", "Exported Types", "Exported Classes"
        // Also handle "#### ... Methods" sub-sub-sections (skip those)
        const lines = sub.split('\n');
        let inMethodSubSection = false;

        for (const line of lines) {
            // Detect method/constructor sub-sub-sections
            if (/^####\s+.*(?:Methods|Constructor|Properties)/.test(line)) {
                inMethodSubSection = true;
                continue;
            }
            // New ### resets
            if (/^###\s+/.test(line) && !line.startsWith('### ')) {
                inMethodSubSection = false;
            }
            if (inMethodSubSection) continue;

            // Match first backtick-quoted word in a table row
            const rowMatch = line.match(/^\|\s*`(\w+)`/);
            if (rowMatch) {
                symbols.push(rowMatch[1]);
            }
        }
    }

    return [...new Set(symbols)];
}

// ─── Required Sections ──────────────────────────────────────────────────

const REQUIRED_SECTIONS = [
    'Purpose',
    'Public API',
    'Invariants',
    'Behavioral Examples',
    'Error Cases',
    'Dependencies',
    'Change Log',
];

function getMissingSections(body: string): string[] {
    const missing: string[] = [];
    for (const section of REQUIRED_SECTIONS) {
        // Match "## Section Name" (allowing for slight variations)
        const pattern = new RegExp(`^## ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
        if (!pattern.test(body)) {
            missing.push(section);
        }
    }
    return missing;
}

// ─── Find All Spec Files ─────────────────────────────────────────────────

function findSpecFiles(dir: string): string[] {
    const results: string[] = [];
    if (!existsSync(dir)) return results;

    for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            results.push(...findSpecFiles(fullPath));
        } else if (entry.endsWith('.spec.md')) {
            results.push(fullPath);
        }
    }
    return results;
}

// ─── Validate One Spec ───────────────────────────────────────────────────

function validateSpec(specPath: string, schemaTables: Set<string>): ValidationResult {
    const result: ValidationResult = {
        specPath: specPath.replace(ROOT + '/', '').replace(ROOT + '\\', ''),
        errors: [],
        warnings: [],
    };

    const content = readFileSync(specPath, 'utf-8').replace(/\r\n/g, '\n');
    const parsed = parseFrontmatter(content);

    if (!parsed) {
        result.errors.push('Missing or malformed YAML frontmatter (expected --- delimiters)');
        return result;
    }

    const { frontmatter: fm, body } = parsed;

    // ─── Level 1: Structural ─────────────────────────────────────────────

    // Required frontmatter fields
    if (!fm.module) result.errors.push('Frontmatter missing required field: module');
    if (!fm.version) result.errors.push('Frontmatter missing required field: version');
    if (!fm.status) result.errors.push('Frontmatter missing required field: status');
    if (!fm.files || !Array.isArray(fm.files) || fm.files.length === 0) {
        result.errors.push('Frontmatter missing required field: files (must be a non-empty list)');
    }

    // Check files exist
    if (fm.files && Array.isArray(fm.files)) {
        for (const file of fm.files) {
            const fullPath = join(ROOT, file);
            if (!existsSync(fullPath)) {
                result.errors.push(`Source file not found: ${file}`);
            }
        }
    }

    // Check db_tables exist in schema
    if (fm.db_tables && Array.isArray(fm.db_tables)) {
        for (const table of fm.db_tables) {
            if (!schemaTables.has(table)) {
                result.errors.push(`DB table not found in schema.ts: ${table}`);
            }
        }
    }

    // Required markdown sections
    const missingSections = getMissingSections(body);
    for (const section of missingSections) {
        result.errors.push(`Missing required section: ## ${section}`);
    }

    // ─── Level 2: API Surface ────────────────────────────────────────────

    if (fm.files && Array.isArray(fm.files)) {
        const rawExports: string[] = [];
        for (const file of fm.files) {
            const fullPath = join(ROOT, file);
            rawExports.push(...getExportedSymbols(fullPath));
        }
        // Deduplicate: a symbol re-exported from index.ts should count once
        const allExports = [...new Set(rawExports)];

        const specSymbols = getSpecSymbols(body);
        const specSet = new Set(specSymbols);
        const exportSet = new Set(allExports);

        // Spec describes something that doesn't exist in code = ERROR
        for (const sym of specSymbols) {
            if (!exportSet.has(sym)) {
                result.errors.push(`Spec documents '${sym}' but no matching export found in source`);
            }
        }

        // Code exports something not in spec = WARNING
        for (const sym of allExports) {
            if (!specSet.has(sym)) {
                result.warnings.push(`Export '${sym}' not in spec (undocumented)`);
            }
        }

        // Summary line (informational — only a warning when coverage is incomplete)
        const documented = specSymbols.filter((s) => exportSet.has(s)).length;
        if (allExports.length > 0) {
            const summary = `${documented}/${allExports.length} exports documented`;
            if (documented < allExports.length) {
                result.warnings.unshift(summary);
            } else {
                // Full coverage — store as informational, not a warning
                result.exportSummary = summary;
            }
        }
    }

    // ─── Level 3: Dependencies ───────────────────────────────────────────

    if (fm.depends_on && Array.isArray(fm.depends_on)) {
        for (const dep of fm.depends_on) {
            const fullPath = join(ROOT, dep);
            if (!existsSync(fullPath)) {
                result.errors.push(`Dependency spec not found: ${dep}`);
            }
        }
    }

    // Check Consumed By section references
    const consumedByMatch = body.match(/### Consumed By\s*\n([\s\S]*?)(?=\n## |\n### |$)/);
    if (consumedByMatch) {
        const section = consumedByMatch[1];
        const fileRefRegex = /\|\s*`([^`]+\.ts)`\s*\|/g;
        let match: RegExpExecArray | null;
        while ((match = fileRefRegex.exec(section)) !== null) {
            const filePath = join(ROOT, match[1]);
            if (!existsSync(filePath)) {
                result.warnings.push(`Consumed By references missing file: ${match[1]}`);
            }
        }
    }

    return result;
}

// ─── Level 4: Coverage ───────────────────────────────────────────────────

/** Directories inside server/ that are excluded from spec coverage requirements */
const COVERAGE_EXCLUDE_DIRS = new Set(['__tests__', 'public']);

/** File patterns excluded from coverage (test files, standalone entry points) */
function isExcludedFile(filePath: string): boolean {
    return (
        filePath.includes('__tests__') ||
        filePath.endsWith('.test.ts') ||
        filePath.endsWith('.spec.ts') ||
        filePath === 'server/index.ts' ||
        filePath === 'server/bootstrap.ts'
    );
}

/** Collect all files referenced by specs' files: frontmatter */
function collectSpeccedFiles(specFiles: string[]): Set<string> {
    const speccedFiles = new Set<string>();
    for (const specFile of specFiles) {
        const content = readFileSync(specFile, 'utf-8').replace(/\r\n/g, '\n');
        const parsed = parseFrontmatter(content);
        if (!parsed) continue;
        const { frontmatter: fm } = parsed;
        if (fm.files && Array.isArray(fm.files)) {
            for (const f of fm.files) {
                speccedFiles.add(f);
            }
        }
    }
    return speccedFiles;
}

/** Find all .ts files in server/ recursively */
function findServerFiles(dir: string): string[] {
    const results: string[] = [];
    if (!existsSync(dir)) return results;
    for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            results.push(...findServerFiles(fullPath));
        } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
            results.push(fullPath);
        }
    }
    return results;
}

/** Get server module directories (top-level dirs inside server/) */
function getServerModuleDirs(): string[] {
    const serverDir = join(ROOT, 'server');
    if (!existsSync(serverDir)) return [];
    return readdirSync(serverDir)
        .filter((entry) => {
            const fullPath = join(serverDir, entry);
            return statSync(fullPath).isDirectory() && !COVERAGE_EXCLUDE_DIRS.has(entry);
        })
        .sort();
}

/** Get spec module directories (top-level dirs inside specs/) */
function getSpecModuleDirs(): string[] {
    if (!existsSync(SPECS_DIR)) return [];
    return readdirSync(SPECS_DIR)
        .filter((entry) => {
            const fullPath = join(SPECS_DIR, entry);
            return statSync(fullPath).isDirectory();
        })
        .sort();
}

interface CoverageReport {
    totalServerFiles: number;
    speccedFileCount: number;
    unspeccedFiles: string[];
    unspeccedModules: string[];
    coveragePercent: number;
}

function computeCoverage(specFiles: string[]): CoverageReport {
    const speccedFiles = collectSpeccedFiles(specFiles);
    const serverDir = join(ROOT, 'server');
    const allServerFiles = findServerFiles(serverDir)
        .map((f) => relative(ROOT, f).replace(/\\/g, '/'))
        .filter((f) => !isExcludedFile(f));

    const unspeccedFiles = allServerFiles.filter((f) => !speccedFiles.has(f)).sort();

    const serverModules = getServerModuleDirs();
    const specModules = new Set(getSpecModuleDirs());
    const unspeccedModules = serverModules.filter((m) => !specModules.has(m));

    const speccedFileCount = allServerFiles.length - unspeccedFiles.length;
    const coveragePercent =
        allServerFiles.length > 0 ? Math.round((speccedFileCount / allServerFiles.length) * 100) : 100;

    return {
        totalServerFiles: allServerFiles.length,
        speccedFileCount,
        unspeccedFiles,
        unspeccedModules,
        coveragePercent,
    };
}

// ─── Spec Generation ─────────────────────────────────────────────────────

function generateSpec(moduleName: string, serverFiles: string[]): string {
    const templatePath = join(SPECS_DIR, '_template.spec.md');
    let template = existsSync(templatePath)
        ? readFileSync(templatePath, 'utf-8')
        : '';

    if (!template) {
        // Minimal fallback template
        template = `---
module: module-name
version: 1
status: draft
files: []
db_tables: []
depends_on: []
---

# Module Name

## Purpose

<!-- TODO: describe what this module does -->

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|

## Invariants

1. <!-- TODO -->

## Behavioral Examples

### Scenario: TODO

- **Given** precondition
- **When** action
- **Then** result

## Error Cases

| Condition | Behavior |
|-----------|----------|

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|

### Consumed By

| Module | What is used |
|--------|-------------|

## Change Log

| Date | Author | Change |
|------|--------|--------|
`;
    }

    // Populate from template
    const titleCase = moduleName
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

    const filesYaml = serverFiles.map((f) => `  - ${f}`).join('\n');

    // Replace frontmatter values
    let spec = template
        .replace(/^module:\s*.+$/m, `module: ${moduleName}`)
        .replace(/^status:\s*.+$/m, 'status: draft')
        .replace(/^version:\s*.+$/m, 'version: 1');

    // Replace files list
    spec = spec.replace(
        /^files:\n(?:\s+-\s+.+\n?)*/m,
        `files:\n${filesYaml}\n`,
    );

    // Replace title
    spec = spec.replace(/^# .+$/m, `# ${titleCase}`);

    // Clear db_tables placeholder
    spec = spec.replace(
        /^db_tables:\n(?:\s+-\s+.+\n?)*/m,
        'db_tables: []\n',
    );

    return spec;
}

function generateSpecsForUnspeccedModules(report: CoverageReport): number {
    let generated = 0;
    for (const moduleName of report.unspeccedModules) {
        const specDir = join(SPECS_DIR, moduleName);
        const specFile = join(specDir, `${moduleName}.spec.md`);

        if (existsSync(specFile)) continue;

        // Find server files for this module
        const moduleDir = join(ROOT, 'server', moduleName);
        const moduleFiles = findServerFiles(moduleDir)
            .map((f) => relative(ROOT, f).replace(/\\/g, '/'))
            .filter((f) => !isExcludedFile(f));

        if (moduleFiles.length === 0) continue;

        mkdirSync(specDir, { recursive: true });
        writeFileSync(specFile, generateSpec(moduleName, moduleFiles));
        console.log(`  \u2713 Generated ${relative(ROOT, specFile)} (${moduleFiles.length} files)`);
        generated++;
    }

    // Also generate for unspecced files in existing modules
    // Group unspecced files by module
    const byModule = new Map<string, string[]>();
    for (const file of report.unspeccedFiles) {
        const parts = file.split('/');
        if (parts.length >= 3 && parts[0] === 'server') {
            const mod = parts[1];
            if (!byModule.has(mod)) byModule.set(mod, []);
            byModule.get(mod)!.push(file);
        }
    }

    // For modules that have a spec dir but files aren't covered, log them
    for (const [mod, files] of byModule) {
        if (report.unspeccedModules.includes(mod)) continue; // already handled
        if (files.length > 0) {
            console.log(`  \u26A0 ${mod}: ${files.length} file(s) not in any spec's files: frontmatter`);
            for (const f of files) {
                console.log(`    - ${f}`);
            }
        }
    }

    return generated;
}

// ─── Main ────────────────────────────────────────────────────────────────

function main(): void {
    const strict = process.argv.includes('--strict');
    const showCoverage = process.argv.includes('--coverage');
    const generate = process.argv.includes('--generate');

    // --require-coverage <N>: fail if file coverage % < N
    let requiredCoverage: number | null = null;
    const rcIdx = process.argv.indexOf('--require-coverage');
    if (rcIdx !== -1 && process.argv[rcIdx + 1]) {
        requiredCoverage = parseInt(process.argv[rcIdx + 1], 10);
        if (isNaN(requiredCoverage) || requiredCoverage < 0 || requiredCoverage > 100) {
            console.error('--require-coverage must be a number between 0 and 100');
            process.exit(1);
        }
    }
    const specFiles = findSpecFiles(SPECS_DIR);

    if (specFiles.length === 0) {
        console.log('No spec files found in specs/');
        process.exit(0);
    }

    // Skip template file — it has placeholder values
    const realSpecs = specFiles.filter((f) => !f.endsWith('_template.spec.md'));

    if (realSpecs.length === 0) {
        console.log('No spec files found in specs/ (excluding template)');
        process.exit(0);
    }

    const schemaTables = getSchemaTableNames();
    let totalErrors = 0;
    let totalWarnings = 0;
    let passed = 0;

    for (const specFile of realSpecs) {
        const result = validateSpec(specFile, schemaTables);

        console.log(`\n${result.specPath}`);

        // Print frontmatter check
        const hasFmErrors = result.errors.some(
            (e) => e.startsWith('Frontmatter') || e.startsWith('Missing or malformed'),
        );
        console.log(`  ${hasFmErrors ? '\u2717' : '\u2713'} Frontmatter valid`);

        // Print file existence
        const fileErrors = result.errors.filter((e) => e.startsWith('Source file'));
        const fileCount = fileErrors.length === 0
            ? result.errors.some((e) => e.includes('files (must be'))
                ? 0
                : 'all'
            : 'some missing';
        if (typeof fileCount === 'string' && fileCount === 'all') {
            console.log(`  \u2713 All source files exist`);
        } else if (fileErrors.length > 0) {
            for (const e of fileErrors) console.log(`  \u2717 ${e}`);
        }

        // Print table check
        const tableErrors = result.errors.filter((e) => e.startsWith('DB table'));
        if (tableErrors.length > 0) {
            for (const e of tableErrors) console.log(`  \u2717 ${e}`);
        } else {
            console.log(`  \u2713 All DB tables exist in schema`);
        }

        // Print section check
        const sectionErrors = result.errors.filter((e) => e.startsWith('Missing required section'));
        if (sectionErrors.length > 0) {
            for (const e of sectionErrors) console.log(`  \u2717 ${e}`);
        } else {
            console.log(`  \u2713 All required sections present`);
        }

        // Print API surface
        const apiExportLine = result.warnings.find((w) => w.match(/^\d+\/\d+ exports documented$/));
        if (apiExportLine) {
            console.log(`  \u2713 ${apiExportLine}`);
        } else if (result.exportSummary) {
            console.log(`  \u2713 ${result.exportSummary}`);
        }
        const specDescribesNonexistent = result.errors.filter((e) => e.startsWith('Spec documents'));
        for (const e of specDescribesNonexistent) console.log(`  \u2717 ${e}`);

        const undocumented = result.warnings.filter((w) => w.startsWith("Export '"));
        for (const w of undocumented) console.log(`  \u26A0 ${w}`);

        // Print dependency check
        const depErrors = result.errors.filter((e) => e.startsWith('Dependency spec'));
        if (depErrors.length > 0) {
            for (const e of depErrors) console.log(`  \u2717 ${e}`);
        } else {
            console.log(`  \u2713 All dependency specs exist`);
        }

        // Print consumed-by warnings
        const consumedByWarnings = result.warnings.filter((w) => w.startsWith('Consumed By'));
        for (const w of consumedByWarnings) console.log(`  \u26A0 ${w}`);

        totalErrors += result.errors.length;
        totalWarnings += result.warnings.length;
        if (result.errors.length === 0) passed++;
    }

    // ─── Level 4: Coverage ──────────────────────────────────────────────
    const coverage = computeCoverage(realSpecs);
    let coverageWarnings = 0;

    if (showCoverage || generate) {
        console.log('\n─── Coverage Report ────────────────────────────────────');

        if (coverage.unspeccedModules.length > 0) {
            console.log(`\n  Modules without specs (${coverage.unspeccedModules.length}):`);
            for (const mod of coverage.unspeccedModules) {
                console.log(`    \u26A0 server/${mod}/`);
                coverageWarnings++;
            }
        } else {
            console.log('\n  \u2713 All server modules have spec directories');
        }

        if (coverage.unspeccedFiles.length > 0) {
            console.log(`\n  Files not in any spec (${coverage.unspeccedFiles.length}):`);
            for (const file of coverage.unspeccedFiles) {
                console.log(`    \u26A0 ${file}`);
                coverageWarnings++;
            }
        } else {
            console.log('  \u2713 All server files referenced by specs');
        }
    }

    if (generate) {
        console.log('\n─── Generating Specs ───────────────────────────────────');
        const generated = generateSpecsForUnspeccedModules(coverage);
        if (generated === 0 && coverage.unspeccedModules.length === 0) {
            console.log('  \u2713 No specs to generate — full module coverage');
        } else if (generated > 0) {
            console.log(`\n  Generated ${generated} spec file(s) — edit them to fill in details`);
        }
    }

    // Summary
    const total = realSpecs.length;
    const failed = total - passed;
    const allWarnings = totalWarnings + coverageWarnings;
    console.log(
        `\n${total} specs checked: ${passed} passed, ${allWarnings} warning(s), ${failed} failed`,
    );
    console.log(
        `File coverage: ${coverage.speccedFileCount}/${coverage.totalServerFiles} (${coverage.coveragePercent}%)`,
    );

    if (totalErrors > 0) {
        process.exit(1);
    }

    if (strict && allWarnings > 0) {
        console.log(`\n--strict mode: ${allWarnings} warning(s) treated as errors`);
        process.exit(1);
    }

    if (requiredCoverage !== null && coverage.coveragePercent < requiredCoverage) {
        console.log(
            `\n--require-coverage ${requiredCoverage}%: actual coverage is ${coverage.coveragePercent}% (${coverage.unspeccedFiles.length} file(s) missing specs)`,
        );
        if (coverage.unspeccedFiles.length > 0) {
            for (const f of coverage.unspeccedFiles) {
                console.log(`  ✗ ${f}`);
            }
        }
        process.exit(1);
    }
}

main();
