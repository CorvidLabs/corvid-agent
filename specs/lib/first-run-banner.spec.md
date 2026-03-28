---
module: first-run-banner
version: 1
status: draft
files:
  - server/lib/first-run-banner.ts
db_tables: []
depends_on: []
---

# First-Run Banner

## Purpose

Displays a one-time welcome banner when the server boots with no agents configured. Guides new users through initial setup steps after `corvid-agent init`.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `printFirstRunBanner` | `(db: Database, host: string, port: number)` | `void` | Checks if this is a fresh install (no agents in DB) and prints a welcome banner with quick-start instructions. No-ops if agents already exist. |

## Invariants

- Banner is only shown when the agents table is empty (zero rows).
- If the agents table does not exist (pre-migration), treats as first run.
- Never modifies the database.

## Behavioral Examples

- Fresh install with empty DB: prints welcome banner with dashboard URL and CLI commands.
- Existing install with agents: no output.

## Error Cases

- Database query failure (e.g., table not yet created): silently treats as first run.

## Dependencies

- `bun:sqlite` — database access
- `server/lib/logger.ts` — structured logging

## Change Log

| Version | Change |
|---------|--------|
| 1 | Initial spec |
