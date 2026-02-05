import type { Database } from 'bun:sqlite';

export interface AllowlistEntry {
    address: string;
    label: string;
    createdAt: string;
}

interface AllowlistRow {
    address: string;
    label: string;
    created_at: string;
}

function rowToEntry(row: AllowlistRow): AllowlistEntry {
    return {
        address: row.address,
        label: row.label,
        createdAt: row.created_at,
    };
}

export function listAllowlist(db: Database): AllowlistEntry[] {
    const rows = db.query('SELECT * FROM algochat_allowlist ORDER BY created_at DESC').all() as AllowlistRow[];
    return rows.map(rowToEntry);
}

export function getAllowlistEntry(db: Database, address: string): AllowlistEntry | null {
    const row = db.query('SELECT * FROM algochat_allowlist WHERE address = ?').get(address) as AllowlistRow | null;
    return row ? rowToEntry(row) : null;
}

export function addToAllowlist(db: Database, address: string, label?: string): AllowlistEntry {
    db.query(
        `INSERT INTO algochat_allowlist (address, label) VALUES (?, ?)
         ON CONFLICT(address) DO UPDATE SET label = excluded.label`
    ).run(address, label ?? '');
    return getAllowlistEntry(db, address) as AllowlistEntry;
}

export function updateAllowlistEntry(db: Database, address: string, label: string): AllowlistEntry | null {
    const result = db.query('UPDATE algochat_allowlist SET label = ? WHERE address = ?').run(label, address);
    if (result.changes === 0) return null;
    return getAllowlistEntry(db, address);
}

export function removeFromAllowlist(db: Database, address: string): boolean {
    const result = db.query('DELETE FROM algochat_allowlist WHERE address = ?').run(address);
    return result.changes > 0;
}

/** Returns true if the address is allowed to message agents.
 *  If the allowlist is empty, all addresses are allowed (open mode). */
export function isAllowed(db: Database, address: string): boolean {
    const row = db.query('SELECT 1 FROM algochat_allowlist WHERE address = ? LIMIT 1').get(address);
    if (row != null) return true;
    const count = db.query('SELECT COUNT(*) as cnt FROM algochat_allowlist').get() as { cnt: number };
    return count.cnt === 0;
}
