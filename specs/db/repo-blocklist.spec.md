---
module: repo-blocklist-db
version: 1
status: draft
files:
  - server/db/repo-blocklist.ts
db_tables:
  - repo_blocklist
depends_on: []
---

# Repo Blocklist DB

## Purpose

CRUD operations for the repo blocklist. Prevents the agent from contributing to repositories that don't want its help. Supports exact repo matches (`owner/name`) and org-level wildcards (`owner/*`). Entries are scoped by tenant.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `listRepoBlocklist` | `(db: Database, tenantId?: string)` | `RepoBlocklistEntry[]` | Lists all blocked repos for a tenant, ordered by `created_at DESC`. Defaults `tenantId` to `''` |
| `addToRepoBlocklist` | `(db: Database, repo: string, opts?: { reason?: string; source?: BlocklistSource; prUrl?: string; tenantId?: string })` | `RepoBlocklistEntry` | Adds or updates a repo in the blocklist. Normalizes repo to lowercase. Uses `INSERT ... ON CONFLICT DO UPDATE` for upsert |
| `getRepoBlocklistEntry` | `(db: Database, repo: string, tenantId?: string)` | `RepoBlocklistEntry \| null` | Fetches a single blocklist entry by repo name (case-insensitive). Returns `null` if not found |
| `removeFromRepoBlocklist` | `(db: Database, repo: string, tenantId?: string)` | `boolean` | Removes a repo from the blocklist. Returns `true` if a row was deleted |
| `isRepoBlocked` | `(db: Database, repo: string, tenantId?: string)` | `boolean` | Checks if a repo is blocked by exact match or org wildcard (e.g. `vapor/*` blocks `vapor/vapor`) |

### Exported Types

| Type | Description |
|------|-------------|
| `BlocklistSource` | `'manual' \| 'pr_rejection' \| 'daily_review'` -- how the repo was added to the blocklist |
| `RepoBlocklistEntry` | `{ repo: string; reason: string; source: BlocklistSource; prUrl: string; tenantId: string; createdAt: string }` |

## Invariants

1. **Case normalization**: All repo names are lowercased before storage and lookup
2. **Upsert semantics**: `addToRepoBlocklist` updates `reason`, `source`, and `prUrl` on conflict (keyed on `repo + tenant_id`)
3. **Org wildcard matching**: `isRepoBlocked` checks both exact `owner/name` and `owner/*` patterns
4. **Tenant scoping**: All queries filter by `tenant_id` (default `''`)
5. **Default values**: `reason`, `source`, `prUrl`, and `tenantId` default to `''`, `'manual'`, `''`, and `''` respectively

## Behavioral Examples

### Scenario: Block a repo and check

- **Given** an empty blocklist
- **When** `addToRepoBlocklist(db, 'Vapor/Vapor', { reason: 'PR rejected', source: 'pr_rejection' })` is called
- **Then** the entry is stored with repo `vapor/vapor` (lowercased)
- **And** `isRepoBlocked(db, 'vapor/vapor')` returns `true`

### Scenario: Org wildcard blocks all repos

- **Given** `owner/*` is in the blocklist
- **When** `isRepoBlocked(db, 'owner/any-repo')` is called
- **Then** returns `true` even though `owner/any-repo` is not explicitly listed

### Scenario: Upsert updates existing entry

- **Given** `owner/repo` is blocked with reason `'old reason'`
- **When** `addToRepoBlocklist(db, 'owner/repo', { reason: 'new reason' })` is called
- **Then** the entry's reason is updated to `'new reason'`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Get non-existent entry | Returns `null` |
| Remove non-existent entry | Returns `false` |
| Check unblocked repo | `isRepoBlocked` returns `false` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/repo-blocklist.ts` | All CRUD functions for the admin API |
| `server/scheduler/service.ts` | `isRepoBlocked` to skip blocked repos during schedule execution |

## Database Tables

### repo_blocklist

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `repo` | TEXT | NOT NULL, part of composite PK | Repo identifier (lowercased `owner/name` or `owner/*`) |
| `reason` | TEXT | DEFAULT `''` | Why the repo was blocked |
| `source` | TEXT | DEFAULT `'manual'` | How it was added: `manual`, `pr_rejection`, or `daily_review` |
| `pr_url` | TEXT | DEFAULT `''` | URL of the rejected PR, if applicable |
| `tenant_id` | TEXT | NOT NULL, part of composite PK | Tenant scope |
| `created_at` | TEXT | DEFAULT `datetime('now')` | When the entry was created |

**Primary Key:** `(repo, tenant_id)`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | corvid-agent | Initial spec |
