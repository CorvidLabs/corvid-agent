/**
 * Repo blocklist — CRUD operations for the repo_blocklist table.
 *
 * Prevents the agent from contributing to repos that don't want its help.
 * Supports exact repos (owner/name) and org wildcards (owner/*).
 */

import type { Database } from 'bun:sqlite';

export type BlocklistSource = 'manual' | 'pr_rejection' | 'daily_review';

export interface RepoBlocklistEntry {
  repo: string;
  reason: string;
  source: BlocklistSource;
  prUrl: string;
  tenantId: string;
  createdAt: string;
}

interface RepoBlocklistRow {
  repo: string;
  reason: string;
  source: string;
  pr_url: string;
  tenant_id: string;
  created_at: string;
}

function rowToEntry(row: RepoBlocklistRow): RepoBlocklistEntry {
  return {
    repo: row.repo,
    reason: row.reason,
    source: row.source as BlocklistSource,
    prUrl: row.pr_url,
    tenantId: row.tenant_id,
    createdAt: row.created_at,
  };
}

export function listRepoBlocklist(db: Database, tenantId = ''): RepoBlocklistEntry[] {
  const rows = db
    .query('SELECT * FROM repo_blocklist WHERE tenant_id = ? ORDER BY created_at DESC')
    .all(tenantId) as RepoBlocklistRow[];
  return rows.map(rowToEntry);
}

export function addToRepoBlocklist(
  db: Database,
  repo: string,
  opts?: { reason?: string; source?: BlocklistSource; prUrl?: string; tenantId?: string },
): RepoBlocklistEntry {
  const normalized = repo.toLowerCase();
  const tenantId = opts?.tenantId ?? '';
  db.query(
    `INSERT INTO repo_blocklist (repo, reason, source, pr_url, tenant_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(repo, tenant_id) DO UPDATE SET
           reason = excluded.reason,
           source = excluded.source,
           pr_url = excluded.pr_url`,
  ).run(normalized, opts?.reason ?? '', opts?.source ?? 'manual', opts?.prUrl ?? '', tenantId);
  return getRepoBlocklistEntry(db, normalized, tenantId)!;
}

export function getRepoBlocklistEntry(db: Database, repo: string, tenantId = ''): RepoBlocklistEntry | null {
  const row = db
    .query('SELECT * FROM repo_blocklist WHERE repo = ? AND tenant_id = ?')
    .get(repo.toLowerCase(), tenantId) as RepoBlocklistRow | null;
  return row ? rowToEntry(row) : null;
}

export function removeFromRepoBlocklist(db: Database, repo: string, tenantId = ''): boolean {
  const result = db
    .query('DELETE FROM repo_blocklist WHERE repo = ? AND tenant_id = ?')
    .run(repo.toLowerCase(), tenantId);
  return result.changes > 0;
}

/**
 * Check if a repo is blocked. Checks both exact match and org wildcard (owner/*).
 */
export function isRepoBlocked(db: Database, repo: string, tenantId = ''): boolean {
  const normalized = repo.toLowerCase();
  // Check exact match
  const exact = db
    .query('SELECT 1 FROM repo_blocklist WHERE repo = ? AND tenant_id = ? LIMIT 1')
    .get(normalized, tenantId);
  if (exact) return true;

  // Check org wildcard (e.g. "vapor/*" matches "vapor/vapor")
  const org = normalized.split('/')[0];
  if (org) {
    const wildcard = db
      .query('SELECT 1 FROM repo_blocklist WHERE repo = ? AND tenant_id = ? LIMIT 1')
      .get(`${org}/*`, tenantId);
    if (wildcard) return true;
  }

  return false;
}
