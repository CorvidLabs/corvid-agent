import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS flock_agents (
            id TEXT PRIMARY KEY,
            address TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            instance_url TEXT,
            capabilities TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'active',
            reputation_score INTEGER NOT NULL DEFAULT 0,
            attestation_count INTEGER NOT NULL DEFAULT 0,
            council_participations INTEGER NOT NULL DEFAULT 0,
            uptime_pct REAL NOT NULL DEFAULT 0.0,
            last_heartbeat TEXT,
            registered_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_flock_agents_status ON flock_agents(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_flock_agents_address ON flock_agents(address)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_flock_agents_name ON flock_agents(name)`);
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS flock_agents');
}
