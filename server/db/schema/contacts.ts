/**
 * Schema definitions for the contacts domain.
 *
 * Tables: contacts, contact_platform_links
 * Migration: v91
 */

export const tables: string[] = [];

export const indexes: string[] = [];

/** v91 — Cross-platform contact identity mapping (issue #1069) */
export const migrationV91: string[] = [
    `CREATE TABLE IF NOT EXISTS contacts (
        id           TEXT PRIMARY KEY,
        tenant_id    TEXT NOT NULL DEFAULT '',
        display_name TEXT NOT NULL,
        notes        TEXT DEFAULT NULL,
        created_at   TEXT DEFAULT (datetime('now')),
        updated_at   TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS contact_platform_links (
        id          TEXT PRIMARY KEY,
        tenant_id   TEXT NOT NULL DEFAULT '',
        contact_id  TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        platform    TEXT NOT NULL,
        platform_id TEXT NOT NULL,
        verified    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_contacts_tenant_name ON contacts(tenant_id, display_name)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_platform_links_unique ON contact_platform_links(tenant_id, platform, platform_id)`,
    `CREATE INDEX IF NOT EXISTS idx_contact_platform_links_contact ON contact_platform_links(contact_id)`,
];
