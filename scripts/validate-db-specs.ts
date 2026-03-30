#!/usr/bin/env bun

/**
 * scripts/validate-db-specs.ts
 *
 * Validates that Database Tables sections in spec files match the actual
 * schema defined in migration files.
 *
 * Usage:
 *   bun run spec:validate-db           — run checks, exit 1 on errors
 *   bun run spec:validate-db --strict  — treat warnings as errors too
 *   bun run spec:validate-db --json    — machine-readable output
 *
 * Checks performed:
 *   1. Column presence — columns in spec but not in migrations (or vice versa)
 *   2. Column types — documented type doesn't match migration type
 *   3. Tables in db_tables: frontmatter but no Database Tables section
 *   4. New tables in migrations not covered by any spec
 *
 * Resolves #1700: feat(spec-sync): add DB schema column validation
 */

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

// ── Types ──────────────────────────────────────────────────────────────────

interface SpecColumn {
  name: string;
  type: string;
  constraints: string;
}

interface SpecTable {
  name: string;
  columns: SpecColumn[];
  hasIndexSection: boolean;
}

interface SpecFile {
  path: string;
  module: string;
  dbTables: string[];
  documentedTables: Map<string, SpecTable>;
}

interface MigrationColumn {
  name: string;
  type: string;
  constraints: string;
  migration: string;
}

interface MigrationTable {
  name: string;
  columns: Map<string, MigrationColumn>;
  indexes: string[];
  source: string; // migration file(s)
}

interface Issue {
  level: 'error' | 'warning';
  spec: string;
  table: string;
  message: string;
}

interface ValidationResult {
  issues: Issue[];
  stats: {
    specsChecked: number;
    tablesChecked: number;
    columnsChecked: number;
    uncoveredTables: string[];
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeType(raw: string): string {
  return (
    raw
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ')
      // Strip common inline constraints so type comparison is clean
      .replace(/\s*(NOT NULL|DEFAULT\s+\S+|PRIMARY KEY|UNIQUE|REFERENCES\s+\S+|ON DELETE\s+\S+)/gi, '')
      .trim()
  );
}

/** Extract the module name and db_tables from YAML-like frontmatter. */
function parseFrontmatter(content: string): { module: string; dbTables: string[] } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fm = match[1];
  const moduleMatch = fm.match(/^module:\s*(.+)$/m);
  const module = moduleMatch ? moduleMatch[1].trim() : '';

  const dbTablesMatch = fm.match(/^db_tables:\s*\n((?:\s+-\s*.+\n?)*)/m);
  let dbTables: string[] = [];
  if (dbTablesMatch) {
    dbTables = dbTablesMatch[1]
      .split('\n')
      .map((l) => l.replace(/^\s+-\s*/, '').trim())
      .filter(Boolean);
  }

  return { module, dbTables };
}

/** Parse "## Database Tables" section from a spec file. */
function parseDbTablesSection(content: string): Map<string, SpecTable> {
  const tables = new Map<string, SpecTable>();

  // Find the Database Tables section
  const sectionMatch = content.match(/^##\s+Database Tables\s*$([\s\S]*?)(?=^##\s+|Z)/m);
  if (!sectionMatch) return tables;

  const section = sectionMatch[1];

  // Split into per-table subsections (### table_name)
  const tableBlocks = section.split(/^###\s+/m).slice(1);

  for (const block of tableBlocks) {
    const lines = block.split('\n');
    const tableName = lines[0].trim().replace(/^`|`$/g, '');
    if (!tableName) continue;

    const columns: SpecColumn[] = [];
    let inTable = false;
    let hasIndexSection = false;

    for (const line of lines.slice(1)) {
      // Detect index line (e.g. **Indexes:** or **Index:**)
      if (/\*\*Indexes?\*\*:/i.test(line)) {
        hasIndexSection = true;
        continue;
      }

      // Detect markdown table rows
      if (/^\s*\|/.test(line)) {
        // Skip header and separator rows
        if (/^[\s|:-]+$/.test(line.replace(/\|/g, ''))) continue;
        if (/Column\s*\|.*Type/i.test(line)) continue;

        const cells = line
          .split('|')
          .map((c) => c.trim().replace(/^`|`$/g, ''))
          .filter(Boolean);

        if (cells.length >= 2) {
          inTable = true;
          const colName = cells[0].toLowerCase();
          // Skip rows that are constraint documentation, not actual columns:
          // - Compound keys: "PRIMARY KEY (col1, col2)", "UNIQUE (col1, col2)"
          // - Index names: "idx_foo_bar"
          // - Separator lines like "---"
          if (/^(primary\s+key|foreign\s+key|unique\s*\(|check\s*\(|index\s+name)/i.test(colName)) continue;
          if (/\(/.test(colName)) continue; // any parens = constraint syntax
          if (/^idx_/.test(colName)) continue; // index name rows
          columns.push({
            name: colName,
            type: cells[1].toUpperCase(),
            constraints: cells[2] ?? '',
          });
        }
      } else if (inTable && line.trim() === '') {
        // Blank line ends table
      }
    }

    if (tableName !== tableName.replace(/[^a-z0-9_]/gi, '')) continue; // skip invalid names
    tables.set(tableName, { name: tableName, columns, hasIndexSection });
  }

  return tables;
}

/**
 * Extract the body of a CREATE TABLE statement using bracket counting,
 * which correctly handles nested parentheses like REFERENCES foo(id).
 */
function extractCreateTableBody(sql: string): { tableName: string; body: string; isVirtual: boolean } | null {
  const headerMatch = sql.match(/CREATE\s+(VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*/i);
  if (!headerMatch) return null;

  const isVirtual = Boolean(headerMatch[1]);
  const tableName = headerMatch[2].toLowerCase();

  // Find the opening paren after the table name
  const headerEnd = sql.indexOf('(', headerMatch.index! + headerMatch[0].length);
  if (headerEnd === -1) return null;

  // Count brackets to find the matching close paren
  let depth = 0;
  let start = -1;
  let end = -1;
  for (let i = headerEnd; i < sql.length; i++) {
    if (sql[i] === '(') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (sql[i] === ')') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (start === -1 || end === -1) return null;
  return { tableName, body: sql.slice(start, end), isVirtual };
}

/** Parse CREATE TABLE and ALTER TABLE ADD COLUMN from migration TypeScript source. */
function parseMigrationSql(source: string, filename: string): Map<string, MigrationTable> {
  const tables = new Map<string, MigrationTable>();

  // Extract all SQL strings — both template literals and single-quoted strings
  const sqlStrings: string[] = [];

  // Template literals (backtick strings)
  for (const match of source.matchAll(/`([\s\S]*?)`/g)) {
    sqlStrings.push(match[1]);
  }

  // Single-quoted strings (commonly used in db.exec('ALTER TABLE ...'))
  // Match balanced single-quoted strings, handling escaped quotes
  for (const match of source.matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
    const s = match[1];
    // Only include strings that look like SQL statements
    if (/^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|SELECT)/i.test(s)) {
      sqlStrings.push(s);
    }
  }

  for (const sql of sqlStrings) {
    parseCreateTable(sql, filename, tables);
    parseAlterTable(sql, filename, tables);
    parseIndex(sql, filename, tables);
  }

  return tables;
}

function parseCreateTable(sql: string, filename: string, tables: Map<string, MigrationTable>): void {
  // Skip FTS5 virtual tables — they have non-standard column syntax
  if (/USING\s+fts5/i.test(sql)) {
    const ftsMatch = sql.match(/CREATE\s+VIRTUAL\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    if (ftsMatch) {
      const tableName = ftsMatch[1].toLowerCase();
      if (!tables.has(tableName)) {
        tables.set(tableName, { name: tableName, columns: new Map(), indexes: [], source: filename });
      }
    }
    return;
  }

  const parsed = extractCreateTableBody(sql);
  if (!parsed) return;

  const { tableName, body } = parsed;
  const columns = new Map<string, MigrationColumn>();

  // Split body into column/constraint definitions
  // We need to split by commas, but only at depth 0 (not inside parens)
  const defs: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      defs.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) defs.push(current.trim());

  for (const def of defs) {
    const line = def.trim();
    if (!line) continue;

    // Skip table-level constraints
    if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE\s*\(|CHECK\s*\(|CONSTRAINT\s+)/i.test(line)) continue;

    // Column: name TYPE [constraints...]
    const colMatch = line.match(/^(\w+)\s+(\w+)(.*)/s);
    if (!colMatch) continue;

    const colName = colMatch[1].toLowerCase();
    const colType = colMatch[2].toUpperCase();
    const rest = colMatch[3].trim();

    // Skip if name looks like a constraint keyword
    if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)$/i.test(colName)) continue;

    columns.set(colName, {
      name: colName,
      type: colType,
      constraints: rest,
      migration: filename,
    });
  }

  if (tables.has(tableName)) {
    const existing = tables.get(tableName)!;
    for (const [k, v] of columns) existing.columns.set(k, v);
    existing.source += `, ${filename}`;
  } else {
    tables.set(tableName, { name: tableName, columns, indexes: [], source: filename });
  }
}

function parseAlterTable(sql: string, filename: string, tables: Map<string, MigrationTable>): void {
  const alterMatch = sql.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)\s+(\w+)(.*)/i);
  if (!alterMatch) return;

  const tableName = alterMatch[1].toLowerCase();
  const colName = alterMatch[2].toLowerCase();
  const colType = alterMatch[3].toUpperCase();
  const rest = alterMatch[4].replace(/;?\s*$/, '').trim();

  if (!tables.has(tableName)) {
    tables.set(tableName, { name: tableName, columns: new Map(), indexes: [], source: filename });
  }

  tables.get(tableName)!.columns.set(colName, {
    name: colName,
    type: colType,
    constraints: rest,
    migration: filename,
  });
}

function parseIndex(sql: string, filename: string, tables: Map<string, MigrationTable>): void {
  const indexMatch = sql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?\w+\s+ON\s+(\w+)/i);
  if (!indexMatch) return;

  const tableName = indexMatch[1].toLowerCase();
  if (!tables.has(tableName)) {
    tables.set(tableName, { name: tableName, columns: new Map(), indexes: [], source: filename });
  }
  tables.get(tableName)!.indexes.push(sql.trim());
}

// ── Main ───────────────────────────────────────────────────────────────────

async function loadMigrations(migrationsDir: string): Promise<Map<string, MigrationTable>> {
  const allTables = new Map<string, MigrationTable>();

  if (!existsSync(migrationsDir)) return allTables;

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.sql'))
    .sort(); // process in order

  for (const file of files) {
    const content = await readFile(join(migrationsDir, file), 'utf-8');
    const tables = parseMigrationSql(content, file);
    for (const [name, table] of tables) {
      if (allTables.has(name)) {
        const existing = allTables.get(name)!;
        for (const [k, v] of table.columns) existing.columns.set(k, v);
        for (const idx of table.indexes) existing.indexes.push(idx);
        existing.source += `, ${file}`;
      } else {
        allTables.set(name, table);
      }
    }
  }

  return allTables;
}

async function loadSpecs(specsDir: string): Promise<SpecFile[]> {
  const specs: SpecFile[] = [];

  if (!existsSync(specsDir)) return specs;

  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.spec.md')) files.push(full);
    }
  }

  await walk(specsDir);

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const fm = parseFrontmatter(content);
    if (!fm) continue;

    const documentedTables = parseDbTablesSection(content);

    specs.push({
      path: file,
      module: fm.module,
      dbTables: fm.dbTables,
      documentedTables,
    });
  }

  return specs;
}

async function validate(
  specsDir: string,
  migrationsDir: string,
  _opts: { strict: boolean },
): Promise<ValidationResult> {
  const issues: Issue[] = [];
  const [specs, migrations] = await Promise.all([loadSpecs(specsDir), loadMigrations(migrationsDir)]);

  let tablesChecked = 0;
  let columnsChecked = 0;

  // Track which migration tables have spec coverage
  const coveredTables = new Set<string>();

  for (const spec of specs) {
    const specLabel = relative(specsDir, spec.path);

    // Check: tables listed in db_tables frontmatter but no Database Tables section
    for (const tableName of spec.dbTables) {
      coveredTables.add(tableName);

      if (!spec.documentedTables.has(tableName)) {
        issues.push({
          level: 'warning',
          spec: specLabel,
          table: tableName,
          message: `Listed in db_tables frontmatter but no "### ${tableName}" section in "## Database Tables"`,
        });
        continue;
      }

      const specTable = spec.documentedTables.get(tableName)!;
      const migTable = migrations.get(tableName);

      if (!migTable) {
        issues.push({
          level: 'warning',
          spec: specLabel,
          table: tableName,
          message: `Table "${tableName}" is documented in spec but not found in any migration file`,
        });
        continue;
      }

      tablesChecked++;

      // Check columns in spec vs migration
      const migCols = migTable.columns;
      const specCols = new Map(specTable.columns.map((c) => [c.name.toLowerCase(), c]));

      // Columns in spec but not in migration
      for (const [colName, specCol] of specCols) {
        columnsChecked++;
        if (!migCols.has(colName)) {
          issues.push({
            level: 'error',
            spec: specLabel,
            table: tableName,
            message: `Column "${colName}" is documented in spec but not found in migration (migration source: ${migTable.source})`,
          });
          continue;
        }

        // Type check (best-effort)
        const migCol = migCols.get(colName)!;
        const specType = normalizeType(specCol.type);
        const migType = normalizeType(migCol.type);

        if (specType && migType && specType !== migType) {
          // Some common aliases are acceptable
          const compatible = isTypeCompatible(specType, migType);
          if (!compatible) {
            issues.push({
              level: 'warning',
              spec: specLabel,
              table: tableName,
              message: `Column "${colName}": spec says type "${specCol.type}" but migration has "${migCol.type}" (in ${migCol.migration})`,
            });
          }
        }
      }

      // Columns in migration but not in spec
      for (const [colName] of migCols) {
        if (!specCols.has(colName)) {
          issues.push({
            level: 'warning',
            spec: specLabel,
            table: tableName,
            message: `Column "${colName}" exists in migration (${migTable.source}) but is not documented in spec`,
          });
        }
      }
    }

    // Also check tables documented in DB Tables section but not in frontmatter
    for (const [tableName] of spec.documentedTables) {
      coveredTables.add(tableName);
      if (!spec.dbTables.includes(tableName)) {
        issues.push({
          level: 'warning',
          spec: specLabel,
          table: tableName,
          message: `Table "${tableName}" has a documented section but is not listed in db_tables frontmatter`,
        });
      }
    }
  }

  // Find migration tables with no spec coverage
  const uncoveredTables: string[] = [];
  for (const [tableName, table] of migrations) {
    if (!coveredTables.has(tableName) && table.columns.size > 0) {
      uncoveredTables.push(tableName);
    }
  }

  return {
    issues,
    stats: {
      specsChecked: specs.length,
      tablesChecked,
      columnsChecked,
      uncoveredTables,
    },
  };
}

function isTypeCompatible(a: string, b: string): boolean {
  // Common SQLite type aliases
  const groups: string[][] = [
    ['INTEGER', 'INT', 'BIGINT', 'SMALLINT', 'TINYINT'],
    ['TEXT', 'VARCHAR', 'CHAR', 'CLOB', 'STRING'],
    ['REAL', 'FLOAT', 'DOUBLE', 'NUMERIC', 'DECIMAL'],
    ['BLOB'],
    ['BOOLEAN', 'BOOL'],
  ];
  for (const group of groups) {
    if (group.includes(a) && group.includes(b)) return true;
  }
  return false;
}

// ── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const jsonOutput = args.includes('--json');

const root = new URL('..', import.meta.url).pathname;
const specsDir = join(root, 'specs');
const migrationsDir = join(root, 'server', 'db', 'migrations');

const result = await validate(specsDir, migrationsDir, { strict });

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  const errors = result.issues.filter((i) => i.level === 'error');
  const warnings = result.issues.filter((i) => i.level === 'warning');

  if (result.issues.length === 0) {
    console.log(
      `✅  DB spec validation passed — ${result.stats.specsChecked} specs, ${result.stats.tablesChecked} tables, ${result.stats.columnsChecked} columns checked`,
    );
  } else {
    for (const issue of errors) {
      console.error(`❌  [ERROR] ${issue.spec} — ${issue.table}: ${issue.message}`);
    }
    for (const issue of warnings) {
      console.warn(`⚠️   [WARN]  ${issue.spec} — ${issue.table}: ${issue.message}`);
    }
    console.log(`\n${result.stats.specsChecked} specs checked, ${errors.length} errors, ${warnings.length} warnings`);
  }

  if (result.stats.uncoveredTables.length > 0) {
    console.warn(`\n⚠️   Tables in migrations with no spec coverage (${result.stats.uncoveredTables.length}):`);
    for (const t of result.stats.uncoveredTables.sort()) {
      console.warn(`     - ${t}`);
    }
  }
}

const hasErrors = result.issues.some((i) => i.level === 'error');
const hasWarnings = result.issues.some((i) => i.level === 'warning');
if (hasErrors || (strict && hasWarnings)) {
  process.exit(1);
}
