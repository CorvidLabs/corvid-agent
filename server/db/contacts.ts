/**
 * Contact identity mapping — CRUD operations for cross-platform identity resolution.
 *
 * Links Discord IDs, AlgoChat addresses, and GitHub handles to a unified contact
 * record so the agent can resolve identities across platforms.
 */

import type { Database } from 'bun:sqlite';

// ─── Types ────────────────────────────────────────────────────────────────

export type ContactPlatform = 'discord' | 'algochat' | 'github';

export interface Contact {
    id: string;
    tenantId: string;
    displayName: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    links?: PlatformLink[];
}

export interface PlatformLink {
    id: string;
    tenantId: string;
    contactId: string;
    platform: ContactPlatform;
    platformId: string;
    verified: boolean;
    createdAt: string;
}

interface ContactRow {
    id: string;
    tenant_id: string;
    display_name: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

interface PlatformLinkRow {
    id: string;
    tenant_id: string;
    contact_id: string;
    platform: string;
    platform_id: string;
    verified: number;
    created_at: string;
}

function rowToContact(row: ContactRow): Contact {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        displayName: row.display_name,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function rowToLink(row: PlatformLinkRow): PlatformLink {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        contactId: row.contact_id,
        platform: row.platform as ContactPlatform,
        platformId: row.platform_id,
        verified: row.verified === 1,
        createdAt: row.created_at,
    };
}

// ─── Contact CRUD ─────────────────────────────────────────────────────────

export function createContact(
    db: Database,
    tenantId: string,
    displayName: string,
    notes?: string | null,
): Contact {
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO contacts (id, tenant_id, display_name, notes)
         VALUES (?, ?, ?, ?)`,
    ).run(id, tenantId, displayName, notes ?? null);
    return getContact(db, tenantId, id)!;
}

export function getContact(db: Database, tenantId: string, contactId: string): Contact | null {
    const row = db.query(
        'SELECT * FROM contacts WHERE id = ? AND tenant_id = ?',
    ).get(contactId, tenantId) as ContactRow | null;
    if (!row) return null;

    const contact = rowToContact(row);
    contact.links = getLinksForContact(db, tenantId, contactId);
    return contact;
}

export function listContacts(
    db: Database,
    tenantId: string,
    opts?: { search?: string; limit?: number; offset?: number },
): { contacts: Contact[]; total: number } {
    const limit = Math.min(opts?.limit ?? 50, 500);
    const offset = opts?.offset ?? 0;

    let whereClause = 'WHERE tenant_id = ?';
    const params: (string | number)[] = [tenantId];

    if (opts?.search) {
        whereClause += ' AND display_name LIKE ?';
        params.push(`%${opts.search}%`);
    }

    const countRow = db.query(
        `SELECT COUNT(*) as cnt FROM contacts ${whereClause}`,
    ).get(...params) as { cnt: number };

    const rows = db.query(
        `SELECT * FROM contacts ${whereClause} ORDER BY display_name ASC LIMIT ? OFFSET ?`,
    ).all(...params, limit, offset) as ContactRow[];

    return {
        contacts: rows.map(rowToContact),
        total: countRow.cnt,
    };
}

export function updateContact(
    db: Database,
    tenantId: string,
    contactId: string,
    updates: { displayName?: string; notes?: string | null },
): Contact | null {
    const existing = getContact(db, tenantId, contactId);
    if (!existing) return null;

    const displayName = updates.displayName ?? existing.displayName;
    const notes = updates.notes !== undefined ? updates.notes : existing.notes;

    db.query(
        `UPDATE contacts SET display_name = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ? AND tenant_id = ?`,
    ).run(displayName, notes, contactId, tenantId);

    return getContact(db, tenantId, contactId);
}

export function deleteContact(db: Database, tenantId: string, contactId: string): boolean {
    const result = db.query(
        'DELETE FROM contacts WHERE id = ? AND tenant_id = ?',
    ).run(contactId, tenantId);
    return result.changes > 0;
}

// ─── Platform Links ───────────────────────────────────────────────────────

function getLinksForContact(db: Database, tenantId: string, contactId: string): PlatformLink[] {
    const rows = db.query(
        'SELECT * FROM contact_platform_links WHERE contact_id = ? AND tenant_id = ? ORDER BY platform ASC',
    ).all(contactId, tenantId) as PlatformLinkRow[];
    return rows.map(rowToLink);
}

export function addPlatformLink(
    db: Database,
    tenantId: string,
    contactId: string,
    platform: ContactPlatform,
    platformId: string,
): PlatformLink {
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO contact_platform_links (id, tenant_id, contact_id, platform, platform_id)
         VALUES (?, ?, ?, ?, ?)`,
    ).run(id, tenantId, contactId, platform, platformId);

    const row = db.query(
        'SELECT * FROM contact_platform_links WHERE id = ?',
    ).get(id) as PlatformLinkRow;
    return rowToLink(row);
}

export function removePlatformLink(db: Database, tenantId: string, linkId: string): boolean {
    const result = db.query(
        'DELETE FROM contact_platform_links WHERE id = ? AND tenant_id = ?',
    ).run(linkId, tenantId);
    return result.changes > 0;
}

export function verifyPlatformLink(db: Database, tenantId: string, linkId: string): boolean {
    const result = db.query(
        'UPDATE contact_platform_links SET verified = 1 WHERE id = ? AND tenant_id = ?',
    ).run(linkId, tenantId);
    return result.changes > 0;
}

// ─── Lookups ──────────────────────────────────────────────────────────────

export function findContactByPlatformId(
    db: Database,
    tenantId: string,
    platform: ContactPlatform,
    platformId: string,
): Contact | null {
    const linkRow = db.query(
        'SELECT contact_id FROM contact_platform_links WHERE tenant_id = ? AND platform = ? AND platform_id = ?',
    ).get(tenantId, platform, platformId) as { contact_id: string } | null;
    if (!linkRow) return null;
    return getContact(db, tenantId, linkRow.contact_id);
}

export function findContactByName(
    db: Database,
    tenantId: string,
    name: string,
): Contact | null {
    const row = db.query(
        'SELECT * FROM contacts WHERE tenant_id = ? AND display_name = ? COLLATE NOCASE',
    ).get(tenantId, name) as ContactRow | null;
    if (!row) return null;

    const contact = rowToContact(row);
    contact.links = getLinksForContact(db, tenantId, row.id);
    return contact;
}
