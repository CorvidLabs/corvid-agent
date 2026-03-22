import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import {
    listPersonas, getPersona, createPersona, updatePersona, deletePersona,
    getAgentPersonas, assignPersona, unassignPersona, composePersonaPrompt,
} from '../db/personas';

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
    test('listPersonas returns empty initially', () => {
        expect(listPersonas(db)).toEqual([]);
    });

    test('createPersona creates a standalone persona', () => {
        const persona = createPersona(db, {
            name: 'Professional',
            archetype: 'professional',
            traits: ['analytical', 'precise'],
            voiceGuidelines: 'Speak in a formal tone.',
            background: 'A senior engineer with 20 years of experience.',
            exampleMessages: ['I have analyzed the data and found...'],
        });

        expect(persona.id).toBeDefined();
        expect(persona.name).toBe('Professional');
        expect(persona.archetype).toBe('professional');
        expect(persona.traits).toEqual(['analytical', 'precise']);
        expect(persona.voiceGuidelines).toBe('Speak in a formal tone.');
        expect(persona.background).toBe('A senior engineer with 20 years of experience.');
        expect(persona.exampleMessages).toEqual(['I have analyzed the data and found...']);
    });

    test('getPersona returns persona by ID', () => {
        const created = createPersona(db, { name: 'Test', archetype: 'creative' });
        const persona = getPersona(db, created.id);
        expect(persona).not.toBeNull();
        expect(persona!.archetype).toBe('creative');
    });

    test('getPersona returns null for non-existent ID', () => {
        expect(getPersona(db, 'nonexistent')).toBeNull();
    });

    test('updatePersona updates fields', () => {
        const created = createPersona(db, { name: 'Original', archetype: 'friendly', traits: ['warm'] });
        const updated = updatePersona(db, created.id, { archetype: 'technical', traits: ['precise', 'detail-oriented'] });
        expect(updated).not.toBeNull();
        expect(updated!.archetype).toBe('technical');
        expect(updated!.traits).toEqual(['precise', 'detail-oriented']);
        expect(updated!.name).toBe('Original');
    });

    test('updatePersona returns null for non-existent', () => {
        expect(updatePersona(db, 'nonexistent', { name: 'x' })).toBeNull();
    });

    test('deletePersona removes persona', () => {
        const created = createPersona(db, { name: 'ToDelete' });
        expect(deletePersona(db, created.id)).toBe(true);
        expect(getPersona(db, created.id)).toBeNull();
    });

    test('deletePersona returns false for non-existent', () => {
        expect(deletePersona(db, 'nonexistent')).toBe(false);
    });

    test('listPersonas returns all personas', () => {
        createPersona(db, { name: 'A Persona' });
        createPersona(db, { name: 'B Persona' });
        const all = listPersonas(db);
        expect(all.length).toBe(2);
        expect(all[0].name).toBe('A Persona');
        expect(all[1].name).toBe('B Persona');
    });
});

describe('Agent-Persona Assignments', () => {
    test('getAgentPersonas returns empty for agent without personas', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        expect(getAgentPersonas(db, agent.id)).toEqual([]);
    });

    test('assignPersona and getAgentPersonas', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const persona = createPersona(db, { name: 'P1', archetype: 'professional' });
        expect(assignPersona(db, agent.id, persona.id)).toBe(true);

        const assigned = getAgentPersonas(db, agent.id);
        expect(assigned.length).toBe(1);
        expect(assigned[0].id).toBe(persona.id);
    });

    test('assignPersona returns false for non-existent persona', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        expect(assignPersona(db, agent.id, 'nonexistent')).toBe(false);
    });

    test('multiple personas ordered by sort_order', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const p1 = createPersona(db, { name: 'Second', archetype: 'technical' });
        const p2 = createPersona(db, { name: 'First', archetype: 'friendly' });
        assignPersona(db, agent.id, p1.id, 2);
        assignPersona(db, agent.id, p2.id, 1);

        const assigned = getAgentPersonas(db, agent.id);
        expect(assigned.length).toBe(2);
        expect(assigned[0].name).toBe('First');
        expect(assigned[1].name).toBe('Second');
    });

    test('unassignPersona removes assignment', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const persona = createPersona(db, { name: 'P1' });
        assignPersona(db, agent.id, persona.id);
        expect(unassignPersona(db, agent.id, persona.id)).toBe(true);
        expect(getAgentPersonas(db, agent.id)).toEqual([]);
        // Persona still exists
        expect(getPersona(db, persona.id)).not.toBeNull();
    });

    test('unassignPersona returns false when not assigned', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        expect(unassignPersona(db, agent.id, 'nonexistent')).toBe(false);
    });

    test('persona shared between agents (many-to-many)', () => {
        const agent1 = createAgent(db, { name: 'Agent1' });
        const agent2 = createAgent(db, { name: 'Agent2' });
        const persona = createPersona(db, { name: 'Shared' });

        assignPersona(db, agent1.id, persona.id);
        assignPersona(db, agent2.id, persona.id);

        expect(getAgentPersonas(db, agent1.id).length).toBe(1);
        expect(getAgentPersonas(db, agent2.id).length).toBe(1);
    });

    test('assignments cascade when agent is deleted', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const persona = createPersona(db, { name: 'P1' });
        assignPersona(db, agent.id, persona.id);
        db.query('DELETE FROM agents WHERE id = ?').run(agent.id);
        // Persona still exists, assignment is gone
        expect(getPersona(db, persona.id)).not.toBeNull();
    });

    test('assignments cascade when persona is deleted', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const persona = createPersona(db, { name: 'P1' });
        assignPersona(db, agent.id, persona.id);
        deletePersona(db, persona.id);
        expect(getAgentPersonas(db, agent.id)).toEqual([]);
    });
});

describe('Persona Prompt Composition', () => {
    test('empty array returns empty string', () => {
        expect(composePersonaPrompt([])).toBe('');
    });

    test('composes prompt from single persona', () => {
        const persona = createPersona(db, {
            name: 'Professional',
            archetype: 'professional',
            traits: ['analytical', 'precise'],
            voiceGuidelines: 'Use formal language.',
            background: 'Expert engineer.',
            exampleMessages: ['Based on my analysis...'],
        });

        const prompt = composePersonaPrompt([persona]);
        expect(prompt).toContain('## Persona');
        expect(prompt).toContain('Archetype: professional');
        expect(prompt).toContain('analytical, precise');
        expect(prompt).toContain('Use formal language.');
        expect(prompt).toContain('Expert engineer.');
        expect(prompt).toContain('Based on my analysis...');
    });

    test('custom archetype is not included in prompt', () => {
        const persona = createPersona(db, {
            name: 'Custom',
            archetype: 'custom',
            traits: ['friendly'],
        });

        const prompt = composePersonaPrompt([persona]);
        expect(prompt).not.toContain('Archetype: custom');
        expect(prompt).toContain('friendly');
    });

    test('merges multiple personas: deduplicates traits', () => {
        const p1 = createPersona(db, { name: 'P1', traits: ['precise', 'analytical'] });
        const p2 = createPersona(db, { name: 'P2', traits: ['analytical', 'creative'] });

        const prompt = composePersonaPrompt([p1, p2]);
        // 'analytical' should appear only once
        const traitsLine = prompt.split('\n').find(l => l.includes('Personality traits:'))!;
        expect(traitsLine.match(/analytical/g)?.length).toBe(1);
        expect(traitsLine).toContain('precise');
        expect(traitsLine).toContain('creative');
    });

    test('merges multiple personas: uses first non-custom archetype', () => {
        const p1 = createPersona(db, { name: 'P1', archetype: 'custom' });
        const p2 = createPersona(db, { name: 'P2', archetype: 'technical' });
        const p3 = createPersona(db, { name: 'P3', archetype: 'friendly' });

        const prompt = composePersonaPrompt([p1, p2, p3]);
        expect(prompt).toContain('Archetype: technical');
        expect(prompt).not.toContain('friendly');
    });

    test('merges multiple personas: concatenates backgrounds and guidelines', () => {
        const p1 = createPersona(db, { name: 'P1', voiceGuidelines: 'Be formal.', background: 'Engineer.' });
        const p2 = createPersona(db, { name: 'P2', voiceGuidelines: 'Be concise.', background: 'Researcher.' });

        const prompt = composePersonaPrompt([p1, p2]);
        expect(prompt).toContain('Be formal.');
        expect(prompt).toContain('Be concise.');
        expect(prompt).toContain('Engineer.');
        expect(prompt).toContain('Researcher.');
    });

    test('merges multiple personas: concatenates example messages', () => {
        const p1 = createPersona(db, { name: 'P1', exampleMessages: ['Hello.'] });
        const p2 = createPersona(db, { name: 'P2', exampleMessages: ['Hi there.'] });

        const prompt = composePersonaPrompt([p1, p2]);
        expect(prompt).toContain('Hello.');
        expect(prompt).toContain('Hi there.');
    });
});
