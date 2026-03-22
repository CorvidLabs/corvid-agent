import type { Database } from 'bun:sqlite';
import type { Persona, CreatePersonaInput, UpdatePersonaInput, PersonaArchetype } from '../../shared/types';

interface PersonaRow {
    id: string;
    name: string;
    archetype: string;
    traits: string;
    voice_guidelines: string;
    background: string;
    example_messages: string;
    created_at: string;
    updated_at: string;
}

function rowToPersona(row: PersonaRow): Persona {
    return {
        id: row.id,
        name: row.name,
        archetype: row.archetype as PersonaArchetype,
        traits: JSON.parse(row.traits),
        voiceGuidelines: row.voice_guidelines,
        background: row.background,
        exampleMessages: JSON.parse(row.example_messages),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// ─── Persona CRUD ────────────────────────────────────────────────────────────

export function listPersonas(db: Database): Persona[] {
    const rows = db.query('SELECT * FROM personas ORDER BY name ASC').all() as PersonaRow[];
    return rows.map(rowToPersona);
}

export function getPersona(db: Database, personaId: string): Persona | null {
    const row = db.query('SELECT * FROM personas WHERE id = ?').get(personaId) as PersonaRow | null;
    return row ? rowToPersona(row) : null;
}

export function createPersona(db: Database, input: CreatePersonaInput): Persona {
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO personas (id, name, archetype, traits, voice_guidelines, background, example_messages)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
        id,
        input.name,
        input.archetype ?? 'custom',
        JSON.stringify(input.traits ?? []),
        input.voiceGuidelines ?? '',
        input.background ?? '',
        JSON.stringify(input.exampleMessages ?? []),
    );
    return getPersona(db, id)!;
}

export function updatePersona(db: Database, personaId: string, input: UpdatePersonaInput): Persona | null {
    const existing = getPersona(db, personaId);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
        fields.push('name = ?');
        values.push(input.name);
    }
    if (input.archetype !== undefined) {
        fields.push('archetype = ?');
        values.push(input.archetype);
    }
    if (input.traits !== undefined) {
        fields.push('traits = ?');
        values.push(JSON.stringify(input.traits));
    }
    if (input.voiceGuidelines !== undefined) {
        fields.push('voice_guidelines = ?');
        values.push(input.voiceGuidelines);
    }
    if (input.background !== undefined) {
        fields.push('background = ?');
        values.push(input.background);
    }
    if (input.exampleMessages !== undefined) {
        fields.push('example_messages = ?');
        values.push(JSON.stringify(input.exampleMessages));
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(personaId);
    db.query(`UPDATE personas SET ${fields.join(', ')} WHERE id = ?`).run(...(values as string[]));
    return getPersona(db, personaId);
}

export function deletePersona(db: Database, personaId: string): boolean {
    const result = db.query('DELETE FROM personas WHERE id = ?').run(personaId);
    return result.changes > 0;
}

// ─── Agent-Persona Assignments ───────────────────────────────────────────────

export function getAgentPersonas(db: Database, agentId: string): Persona[] {
    const rows = db.query(
        `SELECT p.* FROM personas p
         INNER JOIN agent_persona_assignments apa ON p.id = apa.persona_id
         WHERE apa.agent_id = ?
         ORDER BY apa.sort_order ASC`
    ).all(agentId) as PersonaRow[];
    return rows.map(rowToPersona);
}

export function assignPersona(db: Database, agentId: string, personaId: string, sortOrder: number = 0): boolean {
    const persona = getPersona(db, personaId);
    if (!persona) return false;

    db.query(
        `INSERT OR REPLACE INTO agent_persona_assignments (agent_id, persona_id, sort_order) VALUES (?, ?, ?)`
    ).run(agentId, personaId, sortOrder);
    return true;
}

export function unassignPersona(db: Database, agentId: string, personaId: string): boolean {
    const result = db.query(
        'DELETE FROM agent_persona_assignments WHERE agent_id = ? AND persona_id = ?'
    ).run(agentId, personaId);
    return result.changes > 0;
}

// ─── Persona Prompt Composition ──────────────────────────────────────────────

/**
 * Compose a system prompt section from an array of personas.
 * Merges traits (deduplicated), concatenates guidelines/backgrounds/examples.
 * Returns empty string if the array is empty.
 */
export function composePersonaPrompt(personas: Persona[]): string {
    if (personas.length === 0) return '';

    const parts: string[] = [];
    parts.push('## Persona');

    // Use first non-custom archetype (by sort_order, which is array order)
    const archetype = personas.find(p => p.archetype !== 'custom')?.archetype;
    if (archetype) {
        parts.push(`Archetype: ${archetype}`);
    }

    // Union all traits, deduplicated
    const allTraits = new Set<string>();
    for (const p of personas) {
        for (const t of p.traits) allTraits.add(t);
    }
    if (allTraits.size > 0) {
        parts.push(`Personality traits: ${[...allTraits].join(', ')}`);
    }

    // Concatenate backgrounds
    const backgrounds = personas.map(p => p.background).filter(Boolean);
    if (backgrounds.length > 0) {
        parts.push(`Background: ${backgrounds.join('\n')}`);
    }

    // Concatenate voice guidelines
    const guidelines = personas.map(p => p.voiceGuidelines).filter(Boolean);
    if (guidelines.length > 0) {
        parts.push(`Communication style: ${guidelines.join('\n')}`);
    }

    // Concatenate example messages
    const examples = personas.flatMap(p => p.exampleMessages);
    if (examples.length > 0) {
        parts.push('');
        parts.push('Example messages (match this tone and style):');
        for (const msg of examples) {
            parts.push(`- "${msg}"`);
        }
    }

    return parts.join('\n');
}
