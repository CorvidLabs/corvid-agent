import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import {
    listBundles, getBundle, createBundle, updateBundle, deleteBundle,
    getAgentBundles, assignBundle, unassignBundle,
    resolveAgentTools, resolveAgentPromptAdditions,
} from '../db/skill-bundles';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

describe('Skill Bundle CRUD', () => {
    test('list includes preset bundles', () => {
        const bundles = listBundles(db);
        expect(bundles.length).toBeGreaterThanOrEqual(5);
        const names = bundles.map(b => b.name);
        expect(names).toContain('Code Reviewer');
        expect(names).toContain('DevOps');
        expect(names).toContain('Researcher');
        expect(names).toContain('Communicator');
        expect(names).toContain('Analyst');
    });

    test('preset bundles have correct fields', () => {
        const reviewer = listBundles(db).find(b => b.name === 'Code Reviewer');
        expect(reviewer).toBeDefined();
        expect(reviewer!.preset).toBe(true);
        expect(reviewer!.tools.length).toBeGreaterThan(0);
        expect(reviewer!.promptAdditions).toBeTruthy();
    });

    test('create custom bundle', () => {
        const bundle = createBundle(db, {
            name: 'My Custom Bundle',
            description: 'A custom bundle',
            tools: ['corvid_web_search', 'corvid_save_memory'],
            promptAdditions: 'Always search before answering.',
        });

        expect(bundle.name).toBe('My Custom Bundle');
        expect(bundle.description).toBe('A custom bundle');
        expect(bundle.tools).toEqual(['corvid_web_search', 'corvid_save_memory']);
        expect(bundle.promptAdditions).toBe('Always search before answering.');
        expect(bundle.preset).toBe(false);
    });

    test('get bundle by id', () => {
        const created = createBundle(db, { name: 'Test Bundle' });
        const found = getBundle(db, created.id);
        expect(found).not.toBeNull();
        expect(found!.name).toBe('Test Bundle');
    });

    test('update bundle', () => {
        const bundle = createBundle(db, { name: 'Original' });
        const updated = updateBundle(db, bundle.id, { name: 'Updated', tools: ['corvid_web_search'] });
        expect(updated).not.toBeNull();
        expect(updated!.name).toBe('Updated');
        expect(updated!.tools).toEqual(['corvid_web_search']);
    });

    test('delete custom bundle', () => {
        const bundle = createBundle(db, { name: 'ToDelete' });
        const deleted = deleteBundle(db, bundle.id);
        expect(deleted).toBe(true);
        expect(getBundle(db, bundle.id)).toBeNull();
    });

    test('cannot delete preset bundle', () => {
        const presets = listBundles(db).filter(b => b.preset);
        expect(presets.length).toBeGreaterThan(0);
        const deleted = deleteBundle(db, presets[0].id);
        expect(deleted).toBe(false);
        expect(getBundle(db, presets[0].id)).not.toBeNull();
    });
});

describe('Agent-Bundle Assignment', () => {
    test('assign and get agent bundles', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const bundle = createBundle(db, { name: 'Test' });

        const assigned = assignBundle(db, agent.id, bundle.id);
        expect(assigned).toBe(true);

        const bundles = getAgentBundles(db, agent.id);
        expect(bundles).toHaveLength(1);
        expect(bundles[0].id).toBe(bundle.id);
    });

    test('assign multiple bundles with sort order', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const b1 = createBundle(db, { name: 'Bundle A' });
        const b2 = createBundle(db, { name: 'Bundle B' });

        assignBundle(db, agent.id, b1.id, 1);
        assignBundle(db, agent.id, b2.id, 0);

        const bundles = getAgentBundles(db, agent.id);
        expect(bundles).toHaveLength(2);
        // Sorted by sort_order ASC
        expect(bundles[0].name).toBe('Bundle B');
        expect(bundles[1].name).toBe('Bundle A');
    });

    test('unassign bundle', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const bundle = createBundle(db, { name: 'Test' });
        assignBundle(db, agent.id, bundle.id);

        const removed = unassignBundle(db, agent.id, bundle.id);
        expect(removed).toBe(true);
        expect(getAgentBundles(db, agent.id)).toHaveLength(0);
    });

    test('unassign non-existent returns false', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const removed = unassignBundle(db, agent.id, 'nonexistent');
        expect(removed).toBe(false);
    });

    test('assign non-existent bundle returns false', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const assigned = assignBundle(db, agent.id, 'nonexistent');
        expect(assigned).toBe(false);
    });
});

describe('Tool and Prompt Resolution', () => {
    test('resolveAgentTools with no bundles returns base', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const result = resolveAgentTools(db, agent.id, ['corvid_send_message']);
        expect(result).toEqual(['corvid_send_message']);
    });

    test('resolveAgentTools merges bundle tools', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const bundle = createBundle(db, { name: 'Test', tools: ['corvid_web_search', 'corvid_deep_research'] });
        assignBundle(db, agent.id, bundle.id);

        const result = resolveAgentTools(db, agent.id, ['corvid_send_message']);
        expect(result).toContain('corvid_send_message');
        expect(result).toContain('corvid_web_search');
        expect(result).toContain('corvid_deep_research');
    });

    test('resolveAgentTools with null base returns bundle tools', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const bundle = createBundle(db, { name: 'Test', tools: ['corvid_web_search'] });
        assignBundle(db, agent.id, bundle.id);

        const result = resolveAgentTools(db, agent.id, null);
        expect(result).toEqual(['corvid_web_search']);
    });

    test('resolveAgentPromptAdditions with no bundles returns empty', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const result = resolveAgentPromptAdditions(db, agent.id);
        expect(result).toBe('');
    });

    test('resolveAgentPromptAdditions concatenates bundle prompts', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const b1 = createBundle(db, { name: 'B1', promptAdditions: 'Be concise.' });
        const b2 = createBundle(db, { name: 'B2', promptAdditions: 'Be thorough.' });
        assignBundle(db, agent.id, b1.id, 0);
        assignBundle(db, agent.id, b2.id, 1);

        const result = resolveAgentPromptAdditions(db, agent.id);
        expect(result).toContain('Be concise.');
        expect(result).toContain('Be thorough.');
    });
});
