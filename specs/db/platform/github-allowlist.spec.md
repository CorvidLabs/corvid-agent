---
module: github-allowlist
version: 1
status: draft
files:
  - server/db/github-allowlist.ts
db_tables:
  - github_allowlist
depends_on:
  - specs/db/connection.spec.md
---

# GitHub Allowlist

## Purpose
Manages a GitHub username allowlist that controls which users are permitted to trigger agents via GitHub mentions. Provides CRUD operations on the `github_allowlist` table and an authorization check with configurable open-mode fallback.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `listGitHubAllowlist` | `db: Database` | `GitHubAllowlistEntry[]` | Returns all allowlist entries ordered by created_at descending |
| `getGitHubAllowlistEntry` | `db: Database, username: string` | `GitHubAllowlistEntry \| null` | Looks up a single entry by username (case-insensitive) |
| `addToGitHubAllowlist` | `db: Database, username: string, label?: string` | `GitHubAllowlistEntry` | Inserts or upserts a username into the allowlist with an optional label |
| `updateGitHubAllowlistEntry` | `db: Database, username: string, label: string` | `GitHubAllowlistEntry \| null` | Updates the label for an existing entry; returns null if not found |
| `removeFromGitHubAllowlist` | `db: Database, username: string` | `boolean` | Deletes a username from the allowlist; returns true if a row was removed |
| `isGitHubUserAllowed` | `db: Database, username: string` | `boolean` | Authorization check: returns true if the user is allowed to trigger agents |

### Exported Types
| Type | Description |
|------|-------------|
| `GitHubAllowlistEntry` | `{ username: string; label: string; createdAt: string }` — Public-facing allowlist entry with camelCase fields |

## Invariants
1. All usernames are normalized to lowercase before storage and lookup.
2. The `username` column is the primary key; duplicate inserts upsert the label via `ON CONFLICT`.
3. When the allowlist table is empty and `GITHUB_ALLOWLIST_OPEN_MODE` is not `"true"`, `isGitHubUserAllowed` returns `false` (deny by default).
4. When the allowlist table is empty and `GITHUB_ALLOWLIST_OPEN_MODE` is `"true"`, `isGitHubUserAllowed` returns `true` for any username.
5. When the allowlist has entries, only listed usernames are allowed regardless of `GITHUB_ALLOWLIST_OPEN_MODE`.
6. `addToGitHubAllowlist` always returns a valid entry (never null) because it re-reads after upsert.

## Behavioral Examples
### Scenario: Adding a user to an empty allowlist
- **Given** the `github_allowlist` table is empty
- **When** `addToGitHubAllowlist(db, "OctoUser", "maintainer")` is called
- **Then** a row with `username = "octouser"` and `label = "maintainer"` is inserted, and the entry is returned

### Scenario: Checking authorization with an empty allowlist in open mode
- **Given** the `github_allowlist` table is empty and `GITHUB_ALLOWLIST_OPEN_MODE=true`
- **When** `isGitHubUserAllowed(db, "anyone")` is called
- **Then** `true` is returned

### Scenario: Checking authorization with an empty allowlist in default mode
- **Given** the `github_allowlist` table is empty and `GITHUB_ALLOWLIST_OPEN_MODE` is unset
- **When** `isGitHubUserAllowed(db, "anyone")` is called
- **Then** `false` is returned

### Scenario: Upserting an existing entry
- **Given** `octouser` already exists with label `"old"`
- **When** `addToGitHubAllowlist(db, "OctoUser", "new")` is called
- **Then** the label is updated to `"new"` and the entry is returned

## Error Cases
| Condition | Behavior |
|-----------|----------|
| `getGitHubAllowlistEntry` for non-existent username | Returns `null` |
| `updateGitHubAllowlistEntry` for non-existent username | Returns `null` (no rows changed) |
| `removeFromGitHubAllowlist` for non-existent username | Returns `false` |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type for all DB operations |
| `db/types` | `queryCount` helper for counting rows in `isGitHubUserAllowed` |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/routes/github-allowlist.ts` | All CRUD functions and `GitHubAllowlistEntry` type |
| `server/webhooks/service.ts` | `isGitHubUserAllowed` for webhook authorization |
| `server/polling/service.ts` | `isGitHubUserAllowed` for polling authorization |

## Database Tables
### github_allowlist
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| username | TEXT | PRIMARY KEY | GitHub username, stored lowercase |
| label | TEXT | DEFAULT '' | Human-readable label for the entry |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO 8601 timestamp of when the entry was created |

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
