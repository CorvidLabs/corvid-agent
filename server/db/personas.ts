import type { Database } from 'bun:sqlite';
import type { AgentPersona, UpsertPersonaInput, PersonaArchetype } from '../../shared/types';

interface PersonaRow {
    agent_id: string;
    archetype: string;
    traits: string;
    voice_guidelines: string;
    background: string;
    example_messages: string;
    created_at: string;
    updated_at: string;
}

function rowToPersona(row: PersonaRow): AgentPersona {
    return {
        agentId: row.agent_id,
        archetype: row.archetype as PersonaArchetype,
        traits: JSON.parse(row.traits),
        voiceGuidelines: row.voice_guidelines,
        background: row.background,
        exampleMessages: JSON.parse(row.example_messages),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function getPersona(db: Database, agentId: string): AgentPersona | null {
    const row = db.query('SELECT * FROM agent_personas WHERE agent_id = ?').get(agentId) as PersonaRow | null;
    return row ? rowToPersona(row) : null;
}

export function upsertPersona(db: Database, agentId: string, input: UpsertPersonaInput): AgentPersona {
    const existing = getPersona(db, agentId);

    if (existing) {
        const fields: string[] = [];
        const values: unknown[] = [];

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

        if (fields.length > 0) {
            fields.push("updated_at = datetime('now')");
            values.push(agentId);
            db.query(`UPDATE agent_personas SET ${fields.join(', ')} WHERE agent_id = ?`).run(...(values as string[]));
        }
    } else {
        db.query(
            `INSERT INTO agent_personas (agent_id, archetype, traits, voice_guidelines, background, example_messages)
             VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
            agentId,
            input.archetype ?? 'custom',
            JSON.stringify(input.traits ?? []),
            input.voiceGuidelines ?? '',
            input.background ?? '',
            JSON.stringify(input.exampleMessages ?? []),
        );
    }

    return getPersona(db, agentId)!;
}

export function deletePersona(db: Database, agentId: string): boolean {
    const result = db.query('DELETE FROM agent_personas WHERE agent_id = ?').run(agentId);
    return result.changes > 0;
}

/**
 * Compose a system prompt section from persona fields.
 * Returns empty string if no persona is set.
 */
export function composePersonaPrompt(persona: AgentPersona | null): string {
    if (!persona) return '';

    const parts: string[] = [];

    parts.push('## Persona');

    if (persona.archetype !== 'custom') {
        parts.push(`Archetype: ${persona.archetype}`);
    }

    if (persona.traits.length > 0) {
        parts.push(`Personality traits: ${persona.traits.join(', ')}`);
    }

    if (persona.background) {
        parts.push(`Background: ${persona.background}`);
    }

    if (persona.voiceGuidelines) {
        parts.push(`Communication style: ${persona.voiceGuidelines}`);
    }

    if (persona.exampleMessages.length > 0) {
        parts.push('');
        parts.push('Example messages (match this tone and style):');
        for (const msg of persona.exampleMessages) {
            parts.push(`- "${msg}"`);
        }
    }

    return parts.join('\n');
}
