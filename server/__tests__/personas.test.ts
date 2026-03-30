import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createAgent } from '../db/agents';
import {
  assignPersona,
  composePersonaPrompt,
  createPersona,
  deletePersona,
  getAgentPersonas,
  getPersona,
  updatePersona,
} from '../db/personas';
import { runMigrations } from '../db/schema';

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe('Persona CRUD', () => {
  test('returns null for nonexistent persona', () => {
    const persona = getPersona(db, 'nonexistent');
    expect(persona).toBeNull();
  });

  test('create persona', () => {
    const persona = createPersona(db, {
      name: 'Professional Engineer',
      archetype: 'professional',
      traits: ['analytical', 'precise'],
      voiceGuidelines: 'Speak in a formal tone.',
      background: 'A senior engineer with 20 years of experience.',
      exampleMessages: ['I have analyzed the data and found...'],
    });

    expect(persona.id).toBeDefined();
    expect(persona.name).toBe('Professional Engineer');
    expect(persona.archetype).toBe('professional');
    expect(persona.traits).toEqual(['analytical', 'precise']);
    expect(persona.voiceGuidelines).toBe('Speak in a formal tone.');
    expect(persona.background).toBe('A senior engineer with 20 years of experience.');
    expect(persona.exampleMessages).toEqual(['I have analyzed the data and found...']);
  });

  test('update persona', () => {
    const persona = createPersona(db, { name: 'Test', archetype: 'friendly', traits: ['warm'] });

    const updated = updatePersona(db, persona.id, { archetype: 'technical', traits: ['precise', 'detail-oriented'] });
    expect(updated).not.toBeNull();
    expect(updated!.archetype).toBe('technical');
    expect(updated!.traits).toEqual(['precise', 'detail-oriented']);
  });

  test('get persona returns stored persona', () => {
    const created = createPersona(db, { name: 'Creative Bot', archetype: 'creative' });

    const persona = getPersona(db, created.id);
    expect(persona).not.toBeNull();
    expect(persona!.archetype).toBe('creative');
  });

  test('delete persona', () => {
    const persona = createPersona(db, { name: 'Formal Bot', archetype: 'formal' });
    expect(getPersona(db, persona.id)).not.toBeNull();

    const deleted = deletePersona(db, persona.id);
    expect(deleted).toBe(true);
    expect(getPersona(db, persona.id)).toBeNull();
  });

  test('delete non-existent persona returns false', () => {
    const deleted = deletePersona(db, 'nonexistent-id');
    expect(deleted).toBe(false);
  });

  test('assignments are cascade deleted when persona is deleted', () => {
    const agent = createAgent(db, { name: 'TestAgent' });
    const persona = createPersona(db, { name: 'Cascade Test', archetype: 'friendly' });
    assignPersona(db, agent.id, persona.id);
    expect(getAgentPersonas(db, agent.id)).toHaveLength(1);

    deletePersona(db, persona.id);
    expect(getAgentPersonas(db, agent.id)).toHaveLength(0);
  });

  test('assignments are cascade deleted when agent is deleted', () => {
    const agent = createAgent(db, { name: 'TestAgent' });
    const persona = createPersona(db, { name: 'Agent Cascade', archetype: 'friendly' });
    assignPersona(db, agent.id, persona.id);

    db.query('DELETE FROM agents WHERE id = ?').run(agent.id);
    // Persona itself still exists, just the assignment is gone
    expect(getPersona(db, persona.id)).not.toBeNull();
  });
});

describe('Agent-Persona Assignments', () => {
  test('assign and retrieve persona for agent', () => {
    const agent = createAgent(db, { name: 'TestAgent' });
    const persona = createPersona(db, { name: 'Helper', archetype: 'friendly' });
    assignPersona(db, agent.id, persona.id);

    const personas = getAgentPersonas(db, agent.id);
    expect(personas).toHaveLength(1);
    expect(personas[0].id).toBe(persona.id);
  });

  test('multiple personas assigned in sort order', () => {
    const agent = createAgent(db, { name: 'TestAgent' });
    const p1 = createPersona(db, { name: 'First', archetype: 'professional' });
    const p2 = createPersona(db, { name: 'Second', archetype: 'friendly' });
    assignPersona(db, agent.id, p1.id, 1);
    assignPersona(db, agent.id, p2.id, 0);

    const personas = getAgentPersonas(db, agent.id);
    expect(personas).toHaveLength(2);
    expect(personas[0].name).toBe('Second');
    expect(personas[1].name).toBe('First');
  });

  test('assign returns false for nonexistent persona', () => {
    const agent = createAgent(db, { name: 'TestAgent' });
    const result = assignPersona(db, agent.id, 'nonexistent');
    expect(result).toBe(false);
  });
});

describe('Persona Prompt Composition', () => {
  test('null persona returns empty string', () => {
    expect(composePersonaPrompt(null)).toBe('');
  });

  test('empty array returns empty string', () => {
    expect(composePersonaPrompt([])).toBe('');
  });

  test('composes full persona prompt', () => {
    const persona = createPersona(db, {
      name: 'Composed',
      archetype: 'professional',
      traits: ['analytical', 'precise'],
      voiceGuidelines: 'Use formal language.',
      background: 'Expert engineer.',
      exampleMessages: ['Based on my analysis...'],
    });

    const prompt = composePersonaPrompt(persona);
    expect(prompt).toContain('## Persona');
    expect(prompt).toContain('Archetype: professional');
    expect(prompt).toContain('analytical, precise');
    expect(prompt).toContain('Use formal language.');
    expect(prompt).toContain('Expert engineer.');
    expect(prompt).toContain('Based on my analysis...');
  });

  test('custom archetype is not included in prompt', () => {
    const persona = createPersona(db, {
      name: 'Custom Bot',
      archetype: 'custom',
      traits: ['friendly'],
    });

    const prompt = composePersonaPrompt(persona);
    expect(prompt).not.toContain('Archetype: custom');
    expect(prompt).toContain('friendly');
  });

  test('empty persona still returns header', () => {
    const persona = createPersona(db, { name: 'Empty Persona' });

    const prompt = composePersonaPrompt(persona);
    expect(prompt).toContain('## Persona');
  });

  test('composes multiple personas with merged fields', () => {
    const p1 = createPersona(db, {
      name: 'Tech',
      archetype: 'technical',
      traits: ['precise'],
      background: 'Engineer.',
    });
    const p2 = createPersona(db, {
      name: 'Friendly',
      archetype: 'custom',
      traits: ['warm', 'precise'],
      voiceGuidelines: 'Be approachable.',
    });

    const prompt = composePersonaPrompt([p1, p2]);
    expect(prompt).toContain('Archetype: technical');
    // Traits should be deduplicated
    expect(prompt).toContain('precise');
    expect(prompt).toContain('warm');
    expect(prompt).toContain('Engineer.');
    expect(prompt).toContain('Be approachable.');
  });
});
