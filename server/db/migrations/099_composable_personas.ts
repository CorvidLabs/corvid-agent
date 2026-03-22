import { Database } from 'bun:sqlite';

/**
 * Migration 099: Composable agent personas (many-to-many).
 *
 * - Creates standalone `personas` table (no longer keyed by agent_id).
 * - Creates `agent_persona_assignments` junction table.
 * - Migrates existing data from `agent_personas` into the new tables.
 * - Drops the old `agent_personas` table.
 */

function tableExists(db: Database, table: string): boolean {
    const row = db.query(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table) as { name: string } | null;
    return row !== null;
}

export function up(db: Database): void {
    // Create standalone personas table
    if (!tableExists(db, 'personas')) {
        db.exec(`CREATE TABLE personas (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            archetype TEXT DEFAULT 'custom',
            traits TEXT NOT NULL DEFAULT '[]',
            voice_guidelines TEXT DEFAULT '',
            background TEXT DEFAULT '',
            example_messages TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`);
    }

    // Create junction table
    if (!tableExists(db, 'agent_persona_assignments')) {
        db.exec(`CREATE TABLE agent_persona_assignments (
            agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
            sort_order INTEGER DEFAULT 0,
            PRIMARY KEY (agent_id, persona_id)
        )`);

        db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_persona_assignments_agent ON agent_persona_assignments(agent_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_persona_assignments_persona ON agent_persona_assignments(persona_id)`);
    }

    // Migrate existing data from agent_personas
    if (tableExists(db, 'agent_personas')) {
        const rows = db.query('SELECT * FROM agent_personas').all() as Array<{
            agent_id: string;
            archetype: string;
            traits: string;
            voice_guidelines: string;
            background: string;
            example_messages: string;
            created_at: string;
            updated_at: string;
        }>;

        const insertPersona = db.prepare(
            `INSERT INTO personas (id, name, archetype, traits, voice_guidelines, background, example_messages, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        const insertAssignment = db.prepare(
            `INSERT INTO agent_persona_assignments (agent_id, persona_id, sort_order) VALUES (?, ?, 0)`
        );

        for (const row of rows) {
            const id = crypto.randomUUID();
            // Use the archetype as the name, or 'Migrated Persona' for custom
            const name = row.archetype !== 'custom' ? `${row.archetype} persona` : 'Migrated Persona';
            insertPersona.run(
                id,
                name,
                row.archetype,
                row.traits,
                row.voice_guidelines,
                row.background,
                row.example_messages,
                row.created_at,
                row.updated_at,
            );
            insertAssignment.run(row.agent_id, id);
        }

        db.exec('DROP TABLE agent_personas');
    }
}

export function down(db: Database): void {
    // Recreate old table
    db.exec(`CREATE TABLE IF NOT EXISTS agent_personas (
        agent_id         TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
        archetype        TEXT DEFAULT 'custom',
        traits           TEXT NOT NULL DEFAULT '[]',
        voice_guidelines TEXT DEFAULT '',
        background       TEXT DEFAULT '',
        example_messages TEXT DEFAULT '[]',
        created_at       TEXT DEFAULT (datetime('now')),
        updated_at       TEXT DEFAULT (datetime('now'))
    )`);

    // Migrate back: take first assigned persona per agent
    const rows = db.query(
        `SELECT apa.agent_id, p.* FROM agent_persona_assignments apa
         JOIN personas p ON p.id = apa.persona_id
         ORDER BY apa.sort_order ASC`
    ).all() as Array<{
        agent_id: string;
        archetype: string;
        traits: string;
        voice_guidelines: string;
        background: string;
        example_messages: string;
        created_at: string;
        updated_at: string;
    }>;

    const seen = new Set<string>();
    for (const row of rows) {
        if (seen.has(row.agent_id)) continue;
        seen.add(row.agent_id);
        db.query(
            `INSERT INTO agent_personas (agent_id, archetype, traits, voice_guidelines, background, example_messages, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(row.agent_id, row.archetype, row.traits, row.voice_guidelines, row.background, row.example_messages, row.created_at, row.updated_at);
    }

    db.exec('DROP TABLE IF EXISTS agent_persona_assignments');
    db.exec('DROP TABLE IF EXISTS personas');
}
