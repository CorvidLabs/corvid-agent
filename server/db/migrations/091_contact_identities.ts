import type { Database } from 'bun:sqlite';

/**
 * Migration 091: Add cross-platform contact identity mapping.
 *
 * - contacts: Core identity records with display name and notes
 * - contact_platform_links: Maps contacts to platform-specific identifiers
 *   (Discord IDs, AlgoChat addresses, GitHub handles)
 */

export function up(db: Database): void {
  db.exec(`
        CREATE TABLE IF NOT EXISTS contacts (
            id           TEXT PRIMARY KEY,
            tenant_id    TEXT NOT NULL DEFAULT '',
            display_name TEXT NOT NULL,
            notes        TEXT DEFAULT NULL,
            created_at   TEXT DEFAULT (datetime('now')),
            updated_at   TEXT DEFAULT (datetime('now'))
        )
    `);

  db.exec(`
        CREATE TABLE IF NOT EXISTS contact_platform_links (
            id          TEXT PRIMARY KEY,
            tenant_id   TEXT NOT NULL DEFAULT '',
            contact_id  TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
            platform    TEXT NOT NULL,
            platform_id TEXT NOT NULL,
            verified    INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now'))
        )
    `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_contacts_tenant_name ON contacts(tenant_id, display_name)`);
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_platform_links_unique ON contact_platform_links(tenant_id, platform, platform_id)`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_contact_platform_links_contact ON contact_platform_links(contact_id)`);
}

export function down(db: Database): void {
  db.exec(`DROP TABLE IF EXISTS contact_platform_links`);
  db.exec(`DROP TABLE IF EXISTS contacts`);
}
