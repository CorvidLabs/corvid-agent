import type { Database } from 'bun:sqlite';

/**
 * Migration 083: Unique constraint on project names per tenant.
 *
 * Fixes #991 — duplicate project names within the same tenant cause
 * ambiguous resolution when looking up projects by name.
 *
 * Steps:
 *   1. Delete duplicate projects, keeping the most-recently-updated entry.
 *   2. Add a unique index on (tenant_id, LOWER(name)) so duplicates
 *      cannot be re-introduced at the database level.
 */

export function up(db: Database): void {
  // Step 1: Remove duplicates — keep the row with the latest updated_at per (tenant_id, lower(name))
  db.exec(`
        DELETE FROM projects
        WHERE id NOT IN (
            SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY tenant_id, LOWER(name)
                           ORDER BY updated_at DESC
                       ) AS rn
                FROM projects
            )
            WHERE rn = 1
        )
    `);

  // Step 2: Add unique index (case-insensitive name per tenant)
  db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_tenant_name
        ON projects(tenant_id, name COLLATE NOCASE)
    `);
}

export function down(db: Database): void {
  db.exec('DROP INDEX IF EXISTS idx_projects_tenant_name');
}
