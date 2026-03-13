import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    createProject,
    getProject,
    listProjects,
    updateProject,
    deleteProject,
} from '../db/projects';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

function makeProject(overrides: Record<string, unknown> = {}) {
    return createProject(db, {
        name: 'TestProject',
        workingDir: '/tmp/test',
        ...overrides,
    });
}

// ── createProject ────────────────────────────────────────────────────

describe('createProject', () => {
    test('creates with defaults', () => {
        const project = makeProject();
        expect(project.id).toBeTruthy();
        expect(project.name).toBe('TestProject');
        expect(project.workingDir).toBe('/tmp/test');
        expect(project.description).toBe('');
        expect(project.claudeMd).toBe('');
        expect(project.envVars).toEqual({});
        expect(project.gitUrl).toBeNull();
        expect(project.dirStrategy).toBe('persistent');
        expect(project.baseClonePath).toBeNull();
    });

    test('creates with all fields', () => {
        const project = makeProject({
            description: 'A test project',
            claudeMd: '# Instructions',
            envVars: { API_KEY: 'secret' },
        });
        expect(project.description).toBe('A test project');
        expect(project.claudeMd).toBe('# Instructions');
        expect(project.envVars).toEqual({ API_KEY: 'secret' });
    });

    test('creates with dir strategy fields', () => {
        const project = makeProject({
            gitUrl: 'https://github.com/example/repo.git',
            dirStrategy: 'clone_on_demand',
            baseClonePath: '/tmp/my-clones',
        });
        expect(project.gitUrl).toBe('https://github.com/example/repo.git');
        expect(project.dirStrategy).toBe('clone_on_demand');
        expect(project.baseClonePath).toBe('/tmp/my-clones');
    });

    test('creates with ephemeral strategy', () => {
        const project = makeProject({
            gitUrl: 'https://github.com/example/repo.git',
            dirStrategy: 'ephemeral',
        });
        expect(project.dirStrategy).toBe('ephemeral');
        expect(project.baseClonePath).toBeNull();
    });

    test('creates with worktree strategy', () => {
        const project = makeProject({ dirStrategy: 'worktree' });
        expect(project.dirStrategy).toBe('worktree');
    });

    test('invalid dirStrategy falls back to persistent', () => {
        const project = makeProject({ dirStrategy: 'invalid_strategy' });
        expect(project.dirStrategy).toBe('persistent');
    });
});

// ── getProject / listProjects ────────────────────────────────────────

describe('getProject and listProjects', () => {
    test('getProject by id', () => {
        const project = makeProject();
        const fetched = getProject(db, project.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.id).toBe(project.id);
    });

    test('getProject returns null for unknown id', () => {
        expect(getProject(db, 'nonexistent')).toBeNull();
    });

    test('listProjects returns all', () => {
        makeProject({ name: 'P1' });
        makeProject({ name: 'P2' });
        expect(listProjects(db)).toHaveLength(2);
    });
});

// ── updateProject ────────────────────────────────────────────────────

describe('updateProject', () => {
    test('updates name', () => {
        const project = makeProject();
        const updated = updateProject(db, project.id, { name: 'Renamed' });
        expect(updated!.name).toBe('Renamed');
    });

    test('updates multiple fields', () => {
        const project = makeProject();
        const updated = updateProject(db, project.id, {
            description: 'New desc',
            workingDir: '/new/path',
            claudeMd: '# Updated',
            envVars: { NEW_KEY: 'value' },
        });
        expect(updated!.description).toBe('New desc');
        expect(updated!.workingDir).toBe('/new/path');
        expect(updated!.claudeMd).toBe('# Updated');
        expect(updated!.envVars).toEqual({ NEW_KEY: 'value' });
    });

    test('returns existing when no fields provided', () => {
        const project = makeProject();
        const updated = updateProject(db, project.id, {});
        expect(updated!.name).toBe('TestProject');
    });

    test('returns null for unknown id', () => {
        expect(updateProject(db, 'nonexistent', { name: 'X' })).toBeNull();
    });

    test('updates gitUrl', () => {
        const project = makeProject();
        const updated = updateProject(db, project.id, { gitUrl: 'https://github.com/test/repo.git' });
        expect(updated!.gitUrl).toBe('https://github.com/test/repo.git');
    });

    test('updates dirStrategy', () => {
        const project = makeProject();
        const updated = updateProject(db, project.id, { dirStrategy: 'clone_on_demand' });
        expect(updated!.dirStrategy).toBe('clone_on_demand');
    });

    test('updates baseClonePath', () => {
        const project = makeProject();
        const updated = updateProject(db, project.id, { baseClonePath: '/tmp/clones' });
        expect(updated!.baseClonePath).toBe('/tmp/clones');
    });

    test('clears gitUrl with null', () => {
        const project = makeProject({ gitUrl: 'https://github.com/test/repo.git' });
        const updated = updateProject(db, project.id, { gitUrl: null });
        expect(updated!.gitUrl).toBeNull();
    });

    test('rejects invalid dirStrategy on update', () => {
        const project = makeProject({ dirStrategy: 'clone_on_demand' });
        // Invalid strategy is silently ignored (no update applied for that field)
        const updated = updateProject(db, project.id, { dirStrategy: 'bogus' as any });
        expect(updated!.dirStrategy).toBe('clone_on_demand');
    });
});

// ── deleteProject ────────────────────────────────────────────────────

describe('deleteProject', () => {
    test('deletes project', () => {
        const project = makeProject();
        expect(deleteProject(db, project.id)).toBe(true);
        expect(getProject(db, project.id)).toBeNull();
    });

    test('returns false for unknown id', () => {
        expect(deleteProject(db, 'nonexistent')).toBe(false);
    });

    test('cascade deletes sessions and messages', () => {
        const project = makeProject();
        db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES ('a1', 'A', 'test', 'test')`).run();
        db.query(`INSERT INTO sessions (id, project_id, agent_id, name, status, source) VALUES ('s1', ?, 'a1', 'S', 'idle', 'web')`).run(project.id);
        db.query(`INSERT INTO session_messages (session_id, role, content) VALUES ('s1', 'user', 'Hello')`).run();

        expect(deleteProject(db, project.id)).toBe(true);

        // Sessions and messages should be gone
        const sessions = db.query('SELECT * FROM sessions WHERE project_id = ?').all(project.id);
        expect(sessions).toHaveLength(0);
        const messages = db.query("SELECT * FROM session_messages WHERE session_id = 's1'").all();
        expect(messages).toHaveLength(0);
    });
});
