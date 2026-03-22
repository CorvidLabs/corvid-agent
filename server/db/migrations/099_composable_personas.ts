import { Database } from 'bun:sqlite';

/**
 * Migration 099: Composable personas — many-to-many agent↔persona relationship.
 *
 * - Creates standalone `personas` table (personas are reusable entities)
 * - Creates `agent_persona_assignments` junction table
 * - Migrates existing data from `agent_personas` into the new tables
 * - Drops the old `agent_personas` table
 */

function tableExists(db: Database, name: string): boolean {
    const row = db.query(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name) as { name: string } | null;
    return !!row;
}

export function down(db: Database): void {
    // Reverse migration: recreate agent_personas from personas + assignments
    if (!tableExists(db, 'agent_personas')) {
        db.exec(`
            CREATE TABLE agent_personas (
                agent_id         TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
                archetype        TEXT DEFAULT 'custom',
                traits           TEXT NOT NULL DEFAULT '[]',
                voice_guidelines TEXT DEFAULT '',
                background       TEXT DEFAULT '',
                example_messages TEXT DEFAULT '[]',
                created_at       TEXT DEFAULT (datetime('now')),
                updated_at       TEXT DEFAULT (datetime('now'))
            )
        `);
    }

    // Migrate data back: take the first persona per agent
    if (tableExists(db, 'agent_persona_assignments') && tableExists(db, 'personas')) {
        const assignments = db.query(`
            SELECT apa.agent_id, p.archetype, p.traits, p.voice_guidelines, p.background, p.example_messages, p.created_at, p.updated_at
            FROM agent_persona_assignments apa
            INNER JOIN personas p ON apa.persona_id = p.id
            ORDER BY apa.sort_order ASC
        `).all() as Array<{
            agent_id: string; archetype: string; traits: string;
            voice_guidelines: string; background: string; example_messages: string;
            created_at: string; updated_at: string;
        }>;

        const seen = new Set<string>();
        for (const row of assignments) {
            if (seen.has(row.agent_id)) continue;
            seen.add(row.agent_id);
            db.query(
                `INSERT OR IGNORE INTO agent_personas (agent_id, archetype, traits, voice_guidelines, background, example_messages, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(row.agent_id, row.archetype, row.traits, row.voice_guidelines, row.background, row.example_messages, row.created_at, row.updated_at);
        }

        db.exec('DROP TABLE IF EXISTS agent_persona_assignments');
        db.exec('DROP TABLE IF EXISTS personas');
    }
}

export function up(db: Database): void {
    // Create the new standalone personas table
    if (!tableExists(db, 'personas')) {
        db.exec(`
            CREATE TABLE personas (
                id               TEXT PRIMARY KEY,
                name             TEXT NOT NULL,
                archetype        TEXT DEFAULT 'custom',
                traits           TEXT NOT NULL DEFAULT '[]',
                voice_guidelines TEXT DEFAULT '',
                background       TEXT DEFAULT '',
                example_messages TEXT DEFAULT '[]',
                created_at       TEXT DEFAULT (datetime('now')),
                updated_at       TEXT DEFAULT (datetime('now'))
            )
        `);
    }

    // Create the junction table
    if (!tableExists(db, 'agent_persona_assignments')) {
        db.exec(`
            CREATE TABLE agent_persona_assignments (
                agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
                sort_order INTEGER DEFAULT 0,
                PRIMARY KEY (agent_id, persona_id)
            )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_persona_assignments_agent ON agent_persona_assignments(agent_id)`);
    }

    // Migrate existing data from agent_personas → personas + assignments
    if (tableExists(db, 'agent_personas')) {
        const existing = db.query('SELECT * FROM agent_personas').all() as Array<{
            agent_id: string;
            archetype: string;
            traits: string;
            voice_guidelines: string;
            background: string;
            example_messages: string;
            created_at: string;
            updated_at: string;
        }>;

        for (const row of existing) {
            const id = crypto.randomUUID();
            // Use a name derived from archetype + agent_id prefix
            const name = `${row.archetype}-${row.agent_id.slice(0, 8)}`;

            db.query(
                `INSERT INTO personas (id, name, archetype, traits, voice_guidelines, background, example_messages, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(id, name, row.archetype, row.traits, row.voice_guidelines, row.background, row.example_messages, row.created_at, row.updated_at);

            db.query(
                `INSERT INTO agent_persona_assignments (agent_id, persona_id, sort_order) VALUES (?, ?, 0)`
            ).run(row.agent_id, id);
        }

        db.exec('DROP TABLE agent_personas');
    }
}
