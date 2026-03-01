import type { Database } from 'bun:sqlite';

export interface GitHubAllowlistEntry {
    username: string;
    label: string;
    createdAt: string;
}

interface GitHubAllowlistRow {
    username: string;
    label: string;
    created_at: string;
}

function rowToEntry(row: GitHubAllowlistRow): GitHubAllowlistEntry {
    return {
        username: row.username,
        label: row.label,
        createdAt: row.created_at,
    };
}

export function listGitHubAllowlist(db: Database): GitHubAllowlistEntry[] {
    const rows = db.query('SELECT * FROM github_allowlist ORDER BY created_at DESC').all() as GitHubAllowlistRow[];
    return rows.map(rowToEntry);
}

export function getGitHubAllowlistEntry(db: Database, username: string): GitHubAllowlistEntry | null {
    const row = db.query('SELECT * FROM github_allowlist WHERE username = ?').get(username.toLowerCase()) as GitHubAllowlistRow | null;
    return row ? rowToEntry(row) : null;
}

export function addToGitHubAllowlist(db: Database, username: string, label?: string): GitHubAllowlistEntry {
    const normalized = username.toLowerCase();
    db.query(
        `INSERT INTO github_allowlist (username, label) VALUES (?, ?)
         ON CONFLICT(username) DO UPDATE SET label = excluded.label`
    ).run(normalized, label ?? '');
    return getGitHubAllowlistEntry(db, normalized) as GitHubAllowlistEntry;
}

export function updateGitHubAllowlistEntry(db: Database, username: string, label: string): GitHubAllowlistEntry | null {
    const normalized = username.toLowerCase();
    const result = db.query('UPDATE github_allowlist SET label = ? WHERE username = ?').run(label, normalized);
    if (result.changes === 0) return null;
    return getGitHubAllowlistEntry(db, normalized);
}

export function removeFromGitHubAllowlist(db: Database, username: string): boolean {
    const result = db.query('DELETE FROM github_allowlist WHERE username = ?').run(username.toLowerCase());
    return result.changes > 0;
}

/**
 * Returns true if the GitHub user is allowed to trigger agents.
 *
 * When the allowlist is empty:
 *   - Default: deny all (secure by default)
 *   - Set GITHUB_ALLOWLIST_OPEN_MODE=true to allow all users (open mode)
 *
 * When the allowlist has entries: only listed users are allowed.
 */
export function isGitHubUserAllowed(db: Database, username: string): boolean {
    const row = db.query('SELECT 1 FROM github_allowlist WHERE username = ? LIMIT 1').get(username.toLowerCase());
    if (row != null) return true;
    const count = db.query('SELECT COUNT(*) as cnt FROM github_allowlist').get() as { cnt: number };
    if (count.cnt === 0) {
        return process.env.GITHUB_ALLOWLIST_OPEN_MODE === 'true';
    }
    return false;
}
