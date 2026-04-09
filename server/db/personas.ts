import type { Database } from 'bun:sqlite';
import type { CreatePersonaInput, Persona, PersonaArchetype, UpdatePersonaInput } from '../../shared/types';

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

// ─── Persona CRUD ─────────────────────────────────────────────────────────────

export function listPersonas(db: Database): Persona[] {
  const rows = db.query('SELECT * FROM personas ORDER BY name ASC').all() as PersonaRow[];
  return rows.map(rowToPersona);
}

export function getPersona(db: Database, id: string): Persona | null {
  const row = db.query('SELECT * FROM personas WHERE id = ?').get(id) as PersonaRow | null;
  return row ? rowToPersona(row) : null;
}

export function createPersona(db: Database, input: CreatePersonaInput): Persona {
  const id = crypto.randomUUID();
  db.query(
    `INSERT INTO personas (id, name, archetype, traits, voice_guidelines, background, example_messages)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
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

export function updatePersona(db: Database, id: string, input: UpdatePersonaInput): Persona | null {
  const existing = getPersona(db, id);
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
  values.push(id);
  db.query(`UPDATE personas SET ${fields.join(', ')} WHERE id = ?`).run(...(values as string[]));
  return getPersona(db, id);
}

export function deletePersona(db: Database, id: string): boolean {
  const result = db.query('DELETE FROM personas WHERE id = ?').run(id);
  return result.changes > 0;
}

// ─── Agent-Persona Assignments ────────────────────────────────────────────────

export function getAgentPersonas(db: Database, agentId: string): Persona[] {
  const rows = db
    .query(
      `SELECT p.* FROM personas p
         INNER JOIN agent_persona_assignments apa ON p.id = apa.persona_id
         WHERE apa.agent_id = ?
         ORDER BY apa.sort_order ASC`,
    )
    .all(agentId) as PersonaRow[];
  return rows.map(rowToPersona);
}

export function assignPersona(db: Database, agentId: string, personaId: string, sortOrder: number = 0): boolean {
  const persona = getPersona(db, personaId);
  if (!persona) return false;

  db.query(`INSERT OR REPLACE INTO agent_persona_assignments (agent_id, persona_id, sort_order) VALUES (?, ?, ?)`).run(
    agentId,
    personaId,
    sortOrder,
  );
  return true;
}

export function unassignPersona(db: Database, agentId: string, personaId: string): boolean {
  const result = db
    .query('DELETE FROM agent_persona_assignments WHERE agent_id = ? AND persona_id = ?')
    .run(agentId, personaId);
  return result.changes > 0;
}

// ─── Prompt Composition ───────────────────────────────────────────────────────

/**
 * Compose a system prompt section from one or more personas.
 * When multiple personas are provided, their fields are merged:
 * - Archetype: first non-custom archetype (by sort order)
 * - Traits: union (deduplicated)
 * - Backgrounds: concatenated
 * - Voice guidelines: concatenated
 * - Example messages: concatenated
 */
export function composePersonaPrompt(personas: Persona | Persona[] | null): string {
  if (!personas) return '';

  const list = Array.isArray(personas) ? personas : [personas];
  if (list.length === 0) return '';

  const parts: string[] = [];
  parts.push('## Persona');

  // Archetype: first non-custom
  const archetype = list.find((p) => p.archetype !== 'custom')?.archetype;
  if (archetype) {
    parts.push(`Archetype: ${archetype}`);
  }

  // Traits: deduplicated union
  const traits = [...new Set(list.flatMap((p) => p.traits))];
  if (traits.length > 0) {
    parts.push(`Personality traits: ${traits.join(', ')}`);
  }

  // Background: concatenated
  const backgrounds = list.map((p) => p.background).filter(Boolean);
  if (backgrounds.length > 0) {
    parts.push(`Background: ${backgrounds.join('\n')}`);
  }

  // Voice guidelines: concatenated
  const guidelines = list.map((p) => p.voiceGuidelines).filter(Boolean);
  if (guidelines.length > 0) {
    parts.push(`Communication style: ${guidelines.join('\n')}`);
  }

  // Example messages: concatenated
  const examples = list.flatMap((p) => p.exampleMessages);
  if (examples.length > 0) {
    parts.push('');
    parts.push('Example messages (match this tone and style):');
    for (const msg of examples) {
      parts.push(`- "${msg}"`);
    }
  }

  return parts.join('\n');
}
