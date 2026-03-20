---
name: database
description: Database operations — SQLite migrations, bun:sqlite queries, schema patterns. Trigger keywords: database, sqlite, migration, schema, query, table, db.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Database — SQLite & Migrations

Database patterns for corvid-agent using bun:sqlite.

## Architecture

- **Engine:** SQLite via `bun:sqlite`
- **Database file:** `corvid-agent.db` (protected — agents cannot modify directly)
- **Schema:** `server/db/schema.ts` — contains all migrations
- **Migration count:** 62+ (auto-applied on startup)

## Adding a Migration

Add a new entry to the `MIGRATIONS` object in `server/db/schema.ts`:

```typescript
const MIGRATIONS: Record<number, string> = {
  // ... existing migrations ...
  63: `
    CREATE TABLE IF NOT EXISTS my_new_table (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `,
};
```

### Migration Rules

- **Migrations are append-only** — never modify existing migration numbers
- **Use `IF NOT EXISTS`** for table creation
- **Use `ALTER TABLE`** for adding columns to existing tables
- **Never drop columns** in SQLite (not supported cleanly — create new table + migrate data if needed)
- **Always include a default** for new non-null columns in ALTER TABLE

## Query Patterns

```typescript
import { db } from '../db/schema';

// Select one
const row = db.query('SELECT * FROM agents WHERE id = ?').get(agentId);

// Select many
const rows = db.query('SELECT * FROM sessions WHERE agent_id = ?').all(agentId);

// Insert
db.run('INSERT INTO agents (id, name) VALUES (?, ?)', [id, name]);

// Update
db.run('UPDATE agents SET name = ? WHERE id = ?', [name, id]);

// Transaction
db.transaction(() => {
  db.run('INSERT INTO ...');
  db.run('UPDATE ...');
})();
```

## Conventions

- Use parameterized queries (`?` placeholders) — never string concatenation
- Use `TEXT` for IDs (UUIDs), timestamps (ISO 8601), and JSON blobs
- Use `INTEGER` for counts, booleans (0/1), and numeric values
- Use `REAL` for floating-point values
- Always include `created_at TEXT NOT NULL DEFAULT (datetime('now'))` on new tables
- Use transactions for multi-statement operations
