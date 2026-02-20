/**
 * spec-check.ts — Validates module specification files in specs/
 *
 * Three validation levels:
 *   1. Structural:   YAML frontmatter, file existence, table existence, required sections
 *   2. API Surface:  Exported symbols match spec's Public API tables
 *   3. Dependencies: Referenced specs and consumed-by files exist
 *
 * Usage: bun scripts/spec-check.ts
 * Exit code 0 = all passed (warnings OK), 1 = errors found
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
    const regex = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
        tables.add(match[1]);
    }
    return tables;
}

// ─── Export Extraction ───────────────────────────────────────────────────

function getExportedSymbols(filePath: string): string[] {
    if (!existsSync(filePath)) return [];
    const content = readFileSync(filePath, 'utf-8');
    const symbols: string[] = [];

    // Match: export function name, export class name, export interface name,
    //        export type name, export const name, export enum name
    const regex = /export\s+(?:async\s+)?(?:function|class|interface|type|const|enum)\s+(\w+)/g;
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
        const names = match[1].split(',').map((n) => n.trim().split(/\s+as\s+/).pop()!.trim());
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
        specPath: specPath.replace(ROOT + '/', ''),
        errors: [],
        warnings: [],
    };

    const content = readFileSync(specPath, 'utf-8');
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
        const allExports: string[] = [];
        for (const file of fm.files) {
            const fullPath = join(ROOT, file);
            allExports.push(...getExportedSymbols(fullPath));
        }

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

        // Summary line
        const documented = specSymbols.filter((s) => exportSet.has(s)).length;
        if (allExports.length > 0) {
            result.warnings.unshift(`${documented}/${allExports.length} exports documented`);
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

// ─── Main ────────────────────────────────────────────────────────────────

function main(): void {
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

    // Summary
    const total = realSpecs.length;
    const failed = total - passed;
    console.log(
        `\n${total} specs checked: ${passed} passed, ${totalWarnings} warning(s), ${failed} failed`,
    );

    if (totalErrors > 0) {
        process.exit(1);
    }
}

main();
