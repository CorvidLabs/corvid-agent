import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import {
    listBundles, getBundle, createBundle, updateBundle, deleteBundle,
    getAgentBundles, assignBundle, unassignBundle,
    resolveAgentTools, resolveAgentPromptAdditions,
    getProjectBundles, assignProjectBundle, unassignProjectBundle,
    resolveProjectPromptAdditions, resolveProjectTools,
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
    test('list includes all 9 preset bundles', () => {
        const bundles = listBundles(db);
        const presets = bundles.filter(b => b.preset);
        expect(presets.length).toBe(9);
        const names = presets.map(b => b.name);
        expect(names).toContain('Code Reviewer');
        expect(names).toContain('DevOps');
        expect(names).toContain('Researcher');
        expect(names).toContain('Communicator');
        expect(names).toContain('Analyst');
        expect(names).toContain('Coder');
        expect(names).toContain('GitHub Ops');
        expect(names).toContain('Full Stack');
        expect(names).toContain('Memory Manager');
    });

    test('preset bundles have correct fields', () => {
        const reviewer = listBundles(db).find(b => b.name === 'Code Reviewer');
        expect(reviewer).toBeDefined();
        expect(reviewer!.preset).toBe(true);
        expect(reviewer!.tools.length).toBeGreaterThan(0);
        expect(reviewer!.promptAdditions).toBeTruthy();
    });

    test('new preset bundles have correct tools', () => {
        const coder = getBundle(db, 'preset-coder');
        expect(coder).not.toBeNull();
        expect(coder!.tools).toEqual(['read_file', 'write_file', 'edit_file', 'run_command', 'list_files', 'search_files']);

        const githubOps = getBundle(db, 'preset-github-ops');
        expect(githubOps).not.toBeNull();
        expect(githubOps!.tools).toContain('corvid_github_list_prs');
        expect(githubOps!.tools).toContain('corvid_github_repo_info');

        const fullStack = getBundle(db, 'preset-full-stack');
        expect(fullStack).not.toBeNull();
        expect(fullStack!.tools).toContain('read_file');
        expect(fullStack!.tools).toContain('corvid_github_create_pr');
        expect(fullStack!.tools).toContain('corvid_web_search');

        const memMgr = getBundle(db, 'preset-memory-manager');
        expect(memMgr).not.toBeNull();
        expect(memMgr!.tools).toContain('corvid_save_memory');
        expect(memMgr!.tools).toContain('corvid_deep_research');
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

describe('Project-Bundle Assignment', () => {
    test('assign and get project bundles', () => {
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
        const bundle = createBundle(db, { name: 'Test' });

        const assigned = assignProjectBundle(db, project.id, bundle.id);
        expect(assigned).toBe(true);

        const bundles = getProjectBundles(db, project.id);
        expect(bundles).toHaveLength(1);
        expect(bundles[0].id).toBe(bundle.id);
    });

    test('assign multiple bundles with sort order', () => {
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
        const b1 = createBundle(db, { name: 'Bundle A' });
        const b2 = createBundle(db, { name: 'Bundle B' });

        assignProjectBundle(db, project.id, b1.id, 1);
        assignProjectBundle(db, project.id, b2.id, 0);

        const bundles = getProjectBundles(db, project.id);
        expect(bundles).toHaveLength(2);
        expect(bundles[0].name).toBe('Bundle B');
        expect(bundles[1].name).toBe('Bundle A');
    });

    test('assign preset bundle to project', () => {
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
        const assigned = assignProjectBundle(db, project.id, 'preset-coder');
        expect(assigned).toBe(true);

        const bundles = getProjectBundles(db, project.id);
        expect(bundles).toHaveLength(1);
        expect(bundles[0].name).toBe('Coder');
    });

    test('unassign bundle from project', () => {
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
        const bundle = createBundle(db, { name: 'Test' });
        assignProjectBundle(db, project.id, bundle.id);

        const removed = unassignProjectBundle(db, project.id, bundle.id);
        expect(removed).toBe(true);
        expect(getProjectBundles(db, project.id)).toHaveLength(0);
    });

    test('unassign non-existent returns false', () => {
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
        const removed = unassignProjectBundle(db, project.id, 'nonexistent');
        expect(removed).toBe(false);
    });

    test('assign non-existent bundle to project returns false', () => {
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
        const assigned = assignProjectBundle(db, project.id, 'nonexistent');
        expect(assigned).toBe(false);
    });

    test('cascade delete: removing project deletes assignments', () => {
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
        assignProjectBundle(db, project.id, 'preset-coder');
        assignProjectBundle(db, project.id, 'preset-github-ops');

        // Delete the project
        db.query('DELETE FROM projects WHERE id = ?').run(project.id);

        // Verify assignments are gone
        const rows = db.query('SELECT * FROM project_skills WHERE project_id = ?').all(project.id);
        expect(rows).toHaveLength(0);
    });

    test('cascade delete: removing bundle deletes assignments', () => {
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
        const bundle = createBundle(db, { name: 'Custom' });
        assignProjectBundle(db, project.id, bundle.id);

        // Delete the bundle
        db.query('DELETE FROM skill_bundles WHERE id = ?').run(bundle.id);

        const bundles = getProjectBundles(db, project.id);
        expect(bundles).toHaveLength(0);
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

    test('resolveAgentTools deduplicates overlapping tools', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const b1 = createBundle(db, { name: 'B1', tools: ['read_file', 'write_file'] });
        const b2 = createBundle(db, { name: 'B2', tools: ['read_file', 'edit_file'] });
        assignBundle(db, agent.id, b1.id, 0);
        assignBundle(db, agent.id, b2.id, 1);

        const result = resolveAgentTools(db, agent.id, ['read_file']);
        // read_file appears in base + both bundles but should only appear once
        const readCount = result!.filter(t => t === 'read_file').length;
        expect(readCount).toBe(1);
        expect(result).toContain('write_file');
        expect(result).toContain('edit_file');
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

describe('Project Tool and Prompt Resolution', () => {
    test('resolveProjectTools with no bundles returns base', () => {
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
        const result = resolveProjectTools(db, project.id, ['corvid_send_message']);
        expect(result).toEqual(['corvid_send_message']);
    });

    test('resolveProjectTools merges bundle tools', () => {
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
        assignProjectBundle(db, project.id, 'preset-coder');

        const result = resolveProjectTools(db, project.id, ['corvid_send_message']);
        expect(result).toContain('corvid_send_message');
        expect(result).toContain('read_file');
        expect(result).toContain('write_file');
        expect(result).toContain('edit_file');
        expect(result).toContain('run_command');
    });

    test('resolveProjectTools with null base returns bundle tools', () => {
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
        assignProjectBundle(db, project.id, 'preset-coder');

        const result = resolveProjectTools(db, project.id, null);
        expect(result).toContain('read_file');
        expect(result).toContain('write_file');
        expect(result!.length).toBe(6); // Coder has exactly 6 tools
    });

    test('resolveProjectPromptAdditions with no bundles returns empty', () => {
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
        const result = resolveProjectPromptAdditions(db, project.id);
        expect(result).toBe('');
    });

    test('resolveProjectPromptAdditions concatenates bundle prompts', () => {
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
        assignProjectBundle(db, project.id, 'preset-coder', 0);
        assignProjectBundle(db, project.id, 'preset-github-ops', 1);

        const result = resolveProjectPromptAdditions(db, project.id);
        expect(result).toContain('expert coder');
        expect(result).toContain('GitHub operations');
    });

    test('agent + project tools merge together', () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        // Agent has GitHub Ops skills
        assignBundle(db, agent.id, 'preset-github-ops');
        // Project has Coder skills
        assignProjectBundle(db, project.id, 'preset-coder');

        // Resolve agent tools first
        const agentTools = resolveAgentTools(db, agent.id, null);
        expect(agentTools).toContain('corvid_github_list_prs');
        expect(agentTools).not.toContain('read_file');

        // Then merge project tools on top
        const merged = resolveProjectTools(db, project.id, agentTools);
        expect(merged).toContain('corvid_github_list_prs'); // from agent
        expect(merged).toContain('read_file'); // from project
        expect(merged).toContain('edit_file'); // from project
    });
});
