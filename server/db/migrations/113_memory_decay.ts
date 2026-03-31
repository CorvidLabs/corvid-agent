import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
    const cols = db.query('PRAGMA table_info(agent_memories)').all() as Array<{ name: string }>;

    if (!cols.some((c) => c.name === 'expires_at')) {
        db.run(`ALTER TABLE agent_memories ADD COLUMN expires_at TEXT DEFAULT NULL`);
        // Backfill: short_term memories get a 7-day TTL from their updated_at
        db.run(`
            UPDATE agent_memories
            SET expires_at = datetime(updated_at, '+7 days')
            WHERE status = 'short_term'
        `);
        db.run(
            `CREATE INDEX IF NOT EXISTS idx_agent_memories_expires
             ON agent_memories(expires_at)
             WHERE expires_at IS NOT NULL`,
        );
    }

    if (!cols.some((c) => c.name === 'access_count')) {
        db.run(`ALTER TABLE agent_memories ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0`);
    }
}

export function down(db: Database): void {
    db.run(`DROP INDEX IF EXISTS idx_agent_memories_expires`);
    const cols = db.query('PRAGMA table_info(agent_memories)').all() as Array<{ name: string }>;
    if (cols.some((c) => c.name === 'expires_at')) {
        db.run(`ALTER TABLE agent_memories DROP COLUMN expires_at`);
    }
    if (cols.some((c) => c.name === 'access_count')) {
        db.run(`ALTER TABLE agent_memories DROP COLUMN access_count`);
    }
}
