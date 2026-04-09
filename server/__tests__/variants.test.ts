import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createAgent } from '../db/agents';
import { createPersona, getAgentPersonas } from '../db/personas';
import { runMigrations } from '../db/schema';
import {
  applyVariant,
  createVariant,
  deleteVariant,
  getAgentVariant,
  getAgentVariantAssignment,
  getVariant,
  listVariants,
  removeVariant,
  updateVariant,
} from '../db/variants';

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe('Variant CRUD', () => {
  test('list returns empty initially', () => {
    expect(listVariants(db)).toEqual([]);
  });

  test('create variant with defaults', () => {
    const variant = createVariant(db, { name: 'iOS Developer' });
    expect(variant.id).toBeDefined();
    expect(variant.name).toBe('iOS Developer');
    expect(variant.description).toBe('');
    expect(variant.skillBundleIds).toEqual([]);
    expect(variant.personaIds).toEqual([]);
    expect(variant.preset).toBe(false);
  });

  test('create variant with all fields', () => {
    const variant = createVariant(db, {
      name: 'Backend Engineer',
      description: 'Server-side development specialist',
      skillBundleIds: ['bundle-1', 'bundle-2'],
      personaIds: ['persona-1'],
      preset: true,
    });
    expect(variant.name).toBe('Backend Engineer');
    expect(variant.description).toBe('Server-side development specialist');
    expect(variant.skillBundleIds).toEqual(['bundle-1', 'bundle-2']);
    expect(variant.personaIds).toEqual(['persona-1']);
    expect(variant.preset).toBe(true);
  });

  test('get variant returns null for nonexistent', () => {
    expect(getVariant(db, 'nonexistent')).toBeNull();
  });

  test('get variant returns stored variant', () => {
    const created = createVariant(db, { name: 'Test Variant' });
    const fetched = getVariant(db, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('Test Variant');
  });

  test('update variant', () => {
    const variant = createVariant(db, { name: 'Old Name' });
    const updated = updateVariant(db, variant.id, {
      name: 'New Name',
      description: 'Updated description',
      skillBundleIds: ['new-bundle'],
    });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('New Name');
    expect(updated!.description).toBe('Updated description');
    expect(updated!.skillBundleIds).toEqual(['new-bundle']);
  });

  test('update nonexistent variant returns null', () => {
    expect(updateVariant(db, 'nonexistent', { name: 'Nope' })).toBeNull();
  });

  test('update with no fields returns existing', () => {
    const variant = createVariant(db, { name: 'Unchanged' });
    const updated = updateVariant(db, variant.id, {});
    expect(updated!.name).toBe('Unchanged');
  });

  test('delete variant', () => {
    const variant = createVariant(db, { name: 'To Delete' });
    expect(deleteVariant(db, variant.id)).toBe(true);
    expect(getVariant(db, variant.id)).toBeNull();
  });

  test('delete nonexistent variant returns false', () => {
    expect(deleteVariant(db, 'nonexistent')).toBe(false);
  });

  test('list returns all variants sorted by name', () => {
    createVariant(db, { name: 'Zebra' });
    createVariant(db, { name: 'Alpha' });
    createVariant(db, { name: 'Mid' });
    const list = listVariants(db);
    expect(list).toHaveLength(3);
    expect(list.map((v) => v.name)).toEqual(['Alpha', 'Mid', 'Zebra']);
  });

  test('unique name constraint', () => {
    createVariant(db, { name: 'Duplicate' });
    expect(() => createVariant(db, { name: 'Duplicate' })).toThrow();
  });
});

describe('Agent-Variant Assignments', () => {
  test('get returns null when no variant assigned', () => {
    const agent = createAgent(db, { name: 'TestAgent' });
    expect(getAgentVariant(db, agent.id)).toBeNull();
    expect(getAgentVariantAssignment(db, agent.id)).toBeNull();
  });

  test('apply variant assigns personas', () => {
    const agent = createAgent(db, { name: 'TestAgent' });
    const persona1 = createPersona(db, { name: 'P1', archetype: 'technical' });
    const persona2 = createPersona(db, { name: 'P2', archetype: 'friendly' });
    const variant = createVariant(db, {
      name: 'Full Stack',
      personaIds: [persona1.id, persona2.id],
    });

    const applied = applyVariant(db, agent.id, variant.id);
    expect(applied).toBe(true);

    // Variant is assigned
    const assigned = getAgentVariant(db, agent.id);
    expect(assigned).not.toBeNull();
    expect(assigned!.name).toBe('Full Stack');

    // Personas are assigned to agent
    const personas = getAgentPersonas(db, agent.id);
    expect(personas).toHaveLength(2);
    expect(personas[0].name).toBe('P1');
    expect(personas[1].name).toBe('P2');
  });

  test('apply variant returns false for nonexistent variant', () => {
    const agent = createAgent(db, { name: 'TestAgent' });
    expect(applyVariant(db, agent.id, 'nonexistent')).toBe(false);
  });

  test('applying new variant replaces old one', () => {
    const agent = createAgent(db, { name: 'TestAgent' });
    const persona1 = createPersona(db, { name: 'P1', archetype: 'technical' });
    const persona2 = createPersona(db, { name: 'P2', archetype: 'friendly' });

    const v1 = createVariant(db, { name: 'Variant A', personaIds: [persona1.id] });
    const v2 = createVariant(db, { name: 'Variant B', personaIds: [persona2.id] });

    applyVariant(db, agent.id, v1.id);
    expect(getAgentPersonas(db, agent.id)).toHaveLength(1);
    expect(getAgentPersonas(db, agent.id)[0].name).toBe('P1');

    applyVariant(db, agent.id, v2.id);
    expect(getAgentVariant(db, agent.id)!.name).toBe('Variant B');
    const personas = getAgentPersonas(db, agent.id);
    expect(personas).toHaveLength(1);
    expect(personas[0].name).toBe('P2');
  });

  test('remove variant clears personas', () => {
    const agent = createAgent(db, { name: 'TestAgent' });
    const persona = createPersona(db, { name: 'P1', archetype: 'technical' });
    const variant = createVariant(db, { name: 'Removable', personaIds: [persona.id] });

    applyVariant(db, agent.id, variant.id);
    expect(getAgentPersonas(db, agent.id)).toHaveLength(1);

    const removed = removeVariant(db, agent.id);
    expect(removed).toBe(true);
    expect(getAgentVariant(db, agent.id)).toBeNull();
    expect(getAgentPersonas(db, agent.id)).toHaveLength(0);
  });

  test('remove returns false when no variant assigned', () => {
    const agent = createAgent(db, { name: 'TestAgent' });
    expect(removeVariant(db, agent.id)).toBe(false);
  });

  test('assignment record has correct fields', () => {
    const agent = createAgent(db, { name: 'TestAgent' });
    const variant = createVariant(db, { name: 'Check Assignment' });

    applyVariant(db, agent.id, variant.id);
    const assignment = getAgentVariantAssignment(db, agent.id);
    expect(assignment).not.toBeNull();
    expect(assignment!.agentId).toBe(agent.id);
    expect(assignment!.variantId).toBe(variant.id);
    expect(assignment!.createdAt).toBeDefined();
  });

  test('cascade delete: deleting variant removes assignments', () => {
    const agent = createAgent(db, { name: 'TestAgent' });
    const variant = createVariant(db, { name: 'Cascade Test' });
    applyVariant(db, agent.id, variant.id);
    expect(getAgentVariantAssignment(db, agent.id)).not.toBeNull();

    deleteVariant(db, variant.id);
    expect(getAgentVariantAssignment(db, agent.id)).toBeNull();
  });
});
