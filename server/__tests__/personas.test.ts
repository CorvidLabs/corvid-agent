import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { getPersona, upsertPersona, deletePersona, composePersonaPrompt } from '../db/personas';

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
    test('returns null for agent without persona', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const persona = getPersona(db, agent.id);
        expect(persona).toBeNull();
    });

    test('upsert creates a new persona', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const persona = upsertPersona(db, agent.id, {
            archetype: 'professional',
            traits: ['analytical', 'precise'],
            voiceGuidelines: 'Speak in a formal tone.',
            background: 'A senior engineer with 20 years of experience.',
            exampleMessages: ['I have analyzed the data and found...'],
        });

        expect(persona.agentId).toBe(agent.id);
        expect(persona.archetype).toBe('professional');
        expect(persona.traits).toEqual(['analytical', 'precise']);
        expect(persona.voiceGuidelines).toBe('Speak in a formal tone.');
        expect(persona.background).toBe('A senior engineer with 20 years of experience.');
        expect(persona.exampleMessages).toEqual(['I have analyzed the data and found...']);
    });

    test('upsert updates an existing persona', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        upsertPersona(db, agent.id, { archetype: 'friendly', traits: ['warm'] });

        const updated = upsertPersona(db, agent.id, { archetype: 'technical', traits: ['precise', 'detail-oriented'] });
        expect(updated.archetype).toBe('technical');
        expect(updated.traits).toEqual(['precise', 'detail-oriented']);
    });

    test('get persona returns stored persona', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        upsertPersona(db, agent.id, { archetype: 'creative' });

        const persona = getPersona(db, agent.id);
        expect(persona).not.toBeNull();
        expect(persona!.archetype).toBe('creative');
    });

    test('delete persona', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        upsertPersona(db, agent.id, { archetype: 'formal' });
        expect(getPersona(db, agent.id)).not.toBeNull();

        const deleted = deletePersona(db, agent.id);
        expect(deleted).toBe(true);
        expect(getPersona(db, agent.id)).toBeNull();
    });

    test('delete non-existent persona returns false', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const deleted = deletePersona(db, agent.id);
        expect(deleted).toBe(false);
    });

    test('persona is cascade deleted when agent is deleted', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        upsertPersona(db, agent.id, { archetype: 'friendly' });
        db.query('DELETE FROM agents WHERE id = ?').run(agent.id);
        const persona = getPersona(db, agent.id);
        expect(persona).toBeNull();
    });
});

describe('Persona Prompt Composition', () => {
    test('null persona returns empty string', () => {
        expect(composePersonaPrompt(null)).toBe('');
    });

    test('composes full persona prompt', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const persona = upsertPersona(db, agent.id, {
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
        const agent = createAgent(db, { name: 'TestAgent' });
        const persona = upsertPersona(db, agent.id, {
            archetype: 'custom',
            traits: ['friendly'],
        });

        const prompt = composePersonaPrompt(persona);
        expect(prompt).not.toContain('Archetype: custom');
        expect(prompt).toContain('friendly');
    });

    test('empty persona still returns header', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const persona = upsertPersona(db, agent.id, {});

        const prompt = composePersonaPrompt(persona);
        expect(prompt).toContain('## Persona');
    });
});
